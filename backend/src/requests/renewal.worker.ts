import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { ProviderService } from '../provider/provider.service.js';
import { Resource } from '../resources/resource.entity.js';
import { RequestHistory } from './request-history.entity.js';
import { RenewalRequest, RequestStatus } from './renewal-request.entity.js';

const MAX_ATTEMPTS = 3;
const DEFAULT_INTERVAL_MS = 60_000;

@Injectable()
export class RenewalWorkerService implements OnModuleInit {
  private readonly logger = new Logger(RenewalWorkerService.name);
  private readonly intervalMs: number;
  private isRunning = false;

  constructor(
    @InjectRepository(RenewalRequest)
    private readonly reqRepo: Repository<RenewalRequest>,
    @InjectRepository(RequestHistory)
    private readonly histRepo: Repository<RequestHistory>,
    @InjectRepository(Resource)
    private readonly resourceRepo: Repository<Resource>,
    @InjectDataSource()
    private readonly ds: DataSource,
    private readonly provider: ProviderService,
    private readonly schedulerRegistry: SchedulerRegistry,
    config: ConfigService,
  ) {
    this.intervalMs = Number(config.get('PROVIDER_RETRY_DELAY_MS', DEFAULT_INTERVAL_MS));
  }

  async onModuleInit(): Promise<void> {
    const handle = setInterval(() => void this.processAll(), this.intervalMs);
    this.schedulerRegistry.addInterval('renewal-worker', handle);
    await this.processAll();
  }

  async processAll(): Promise<void> {
    if (this.isRunning) {
      this.logger.debug('Worker tick skipped: previous run still in progress');
      return;
    }
    this.isRunning = true;
    try {
      const requests = await this.reqRepo.find({
        where: { status: In([RequestStatus.IN_PROGRESS]) },
      });
      if (requests.length === 0) return;
      this.logger.log(`Processing ${requests.length} pending renewal(s)`);
      for (const req of requests) {
        try {
          await this.processOne(req);
        } catch (err) {
          this.logger.error(
            `Error processing request ${req.id}`,
            err instanceof Error ? err.stack : String(err),
          );
        }
      }
    } finally {
      this.isRunning = false;
    }
  }

  private async processOne(req: RenewalRequest): Promise<void> {
    const resource = await this.resourceRepo.findOne({
      where: { id: req.resourceId },
    });
    if (!resource) {
      this.logger.warn(`Resource ${req.resourceId} not found for request ${req.id}`);
      return;
    }

    const payload = {
      resource_id: resource.externalId,
      period_months: 1,
      amount_minor: req.amountMinor,
      currency: req.currency,
    };

    const submit = await this.provider.submitRenewal(req.id, payload);

    if (submit.outcome === 'ok') {
      await this.completeRequest(req, submit.operation.operation_id);
      return;
    }

    // 503 ('lost') or other error: defer recovery to the next tick.
    // PROVIDER_RETRY_DELAY_MS provides the window to stop the app and test
    // the restart-idempotency scenario described in the spec (the provider
    // stores the operation on a 503 and returns 200 on the next POST with
    // the same idempotency key).
    await this.recordFailedAttempt(req);
  }

  private async completeRequest(
    req: RenewalRequest,
    operationId: string,
  ): Promise<void> {
    await this.ds.transaction(async (m) => {
      const locked = await m
        .createQueryBuilder(RenewalRequest, 'r')
        .setLock('pessimistic_write')
        .where('r.id = :id', { id: req.id })
        .getOne();
      if (!locked || locked.status === RequestStatus.COMPLETED) return;

      const resource = await m.findOneOrFail(Resource, {
        where: { id: req.resourceId },
      });
      resource.expiresOn = req.newExpiresOn;
      await m.save(resource);

      const prev = locked.status;
      locked.status = RequestStatus.COMPLETED;
      locked.providerOperationId = operationId;
      await m.save(locked);

      await m.save(
        m.create(RequestHistory, {
          requestId: locked.id,
          actorId: null,
          fromStatus: prev,
          toStatus: RequestStatus.COMPLETED,
        }),
      );
    });
    this.logger.log(`Request ${req.id} completed (op ${operationId})`);
  }

  private async recordFailedAttempt(req: RenewalRequest): Promise<void> {
    await this.ds.transaction(async (m) => {
      const locked = await m
        .createQueryBuilder(RenewalRequest, 'r')
        .setLock('pessimistic_write')
        .where('r.id = :id', { id: req.id })
        .getOne();

      // Skip if already completed or handled by a concurrent tick
      if (!locked || locked.status !== RequestStatus.IN_PROGRESS) return;

      const newCount = locked.attemptCount + 1;

      if (newCount >= MAX_ATTEMPTS) {
        const prev = locked.status;
        locked.status = RequestStatus.NEEDS_ATTENTION;
        locked.attemptCount = newCount;
        await m.save(locked);

        await m.save(
          m.create(RequestHistory, {
            requestId: locked.id,
            actorId: null,
            fromStatus: prev,
            toStatus: RequestStatus.NEEDS_ATTENTION,
          }),
        );
        this.logger.warn(`Request ${req.id} moved to needs_attention after ${newCount} attempts`);
      } else {
        locked.attemptCount = newCount;
        await m.save(locked);
        this.logger.warn(`Request ${req.id} attempt ${newCount}/${MAX_ATTEMPTS} failed`);
      }
    });
  }
}
