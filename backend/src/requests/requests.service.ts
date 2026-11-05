import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { SpaceRole } from '../spaces/user-space-role.entity.js';
import type { User } from '../users/user.entity.js';
import { Resource } from '../resources/resource.entity.js';
import { RequestHistory } from './request-history.entity.js';
import { ACTIVE_STATUSES, RenewalRequest, RequestStatus } from './renewal-request.entity.js';

@Injectable()
export class RequestsService {
  constructor(
    @InjectRepository(RenewalRequest)
    private readonly reqRepo: Repository<RenewalRequest>,
    @InjectRepository(RequestHistory)
    private readonly histRepo: Repository<RequestHistory>,
    @InjectDataSource()
    private readonly ds: DataSource,
  ) {}

  async createRequest(spaceSlug: string, resourceId: string, actor: User): Promise<RenewalRequest> {
    const hasInitiator = actor.spaceRoles?.some(
      (r) => r.space?.slug === spaceSlug && r.role === SpaceRole.INITIATOR,
    );
    if (!hasInitiator) throw new ForbiddenException('Initiator role required');

    return this.ds.transaction(async (m) => {
      // Pessimistic lock on the resource row prevents two concurrent creates
      // from both passing the active-request check below.
      const resource = await m
        .createQueryBuilder(Resource, 'r')
        .setLock('pessimistic_write')
        .innerJoin('r.space', 's')
        .where('r.id = :id AND s.slug = :slug', { id: resourceId, slug: spaceSlug })
        .getOne();
      if (!resource) throw new NotFoundException('Resource not found');

      const existing = await m.findOne(RenewalRequest, {
        where: { resourceId: resource.id, status: In(ACTIVE_STATUSES) },
      });
      if (existing) throw new ConflictException('Active request already exists for this resource');

      const req = m.create(RenewalRequest, {
        resourceId: resource.id,
        spaceId: resource.spaceId,
        status: RequestStatus.PENDING,
        createdBy: actor.id,
        snapshotExpiresOn: resource.expiresOn,
        newExpiresOn: addDays(resource.expiresOn, 30),
        amountMinor: resource.amountMinor,
        currency: resource.currency,
      });
      await m.save(req);

      await m.save(
        m.create(RequestHistory, {
          requestId: req.id,
          actorId: actor.id,
          fromStatus: null,
          toStatus: RequestStatus.PENDING,
        }),
      );

      return req;
    });
  }

  async listBySpace(spaceSlug: string): Promise<RenewalRequest[]> {
    return this.reqRepo
      .createQueryBuilder('req')
      .innerJoin('req.resource', 'res')
      .innerJoin('res.space', 's')
      .where('s.slug = :slug', { slug: spaceSlug })
      .orderBy('req.createdAt', 'DESC')
      .getMany();
  }

  async approveRequest(requestId: string, actor: User): Promise<RenewalRequest> {
    return this.ds.transaction(async (m) => {
      const req = await this.fetchForActor(m, requestId, actor);
      this.assertSpaceRole(actor, req.spaceId, SpaceRole.APPROVER);
      if (req.createdBy === actor.id) throw new ForbiddenException('Cannot approve own request');
      if (req.status !== RequestStatus.PENDING) {
        throw new ConflictException(`Cannot approve request with status: ${req.status}`);
      }

      const resource = await m.findOne(Resource, { where: { id: req.resourceId } });
      if (!resource) throw new NotFoundException('Resource not found');
      const toDateStr = (v: unknown) =>
        v instanceof Date ? (v as Date).toISOString().slice(0, 10) : String(v).slice(0, 10);
      if (
        toDateStr(resource.expiresOn) !== toDateStr(req.snapshotExpiresOn) ||
        resource.amountMinor !== req.amountMinor ||
        resource.currency !== req.currency
      ) {
        throw new ConflictException('Resource data changed since request was created');
      }

      const prev = req.status;
      req.status = RequestStatus.IN_PROGRESS;
      req.approvedBy = actor.id;
      await m.save(req);

      await m.save(
        m.create(RequestHistory, {
          requestId: req.id,
          actorId: actor.id,
          fromStatus: prev,
          toStatus: RequestStatus.IN_PROGRESS,
        }),
      );

      return req;
    });
  }

  async rejectRequest(requestId: string, actor: User): Promise<RenewalRequest> {
    return this.ds.transaction(async (m) => {
      const req = await this.fetchForActor(m, requestId, actor);
      this.assertSpaceRole(actor, req.spaceId, SpaceRole.APPROVER);
      if (req.createdBy === actor.id) throw new ForbiddenException('Cannot reject own request');
      if (req.status !== RequestStatus.PENDING) {
        throw new ConflictException(`Cannot reject request with status: ${req.status}`);
      }

      const prev = req.status;
      req.status = RequestStatus.REJECTED;
      await m.save(req);

      await m.save(
        m.create(RequestHistory, {
          requestId: req.id,
          actorId: actor.id,
          fromStatus: prev,
          toStatus: RequestStatus.REJECTED,
        }),
      );

      return req;
    });
  }

  async retryRequest(requestId: string, actor: User): Promise<RenewalRequest> {
    return this.ds.transaction(async (m) => {
      const req = await this.fetchForActor(m, requestId, actor);
      this.assertSpaceRole(actor, req.spaceId, SpaceRole.APPROVER);
      if (req.status !== RequestStatus.NEEDS_ATTENTION) {
        throw new ConflictException(`Cannot retry request with status: ${req.status}`);
      }

      const prev = req.status;
      req.status = RequestStatus.IN_PROGRESS;
      req.attemptCount = 0;
      await m.save(req);

      await m.save(
        m.create(RequestHistory, {
          requestId: req.id,
          actorId: actor.id,
          fromStatus: prev,
          toStatus: RequestStatus.IN_PROGRESS,
        }),
      );

      return req;
    });
  }

  async getHistory(requestId: string, actor: User) {
    const spaceIds = this.actorSpaceIds(actor);
    if (spaceIds.length === 0) throw new NotFoundException();
    const req = await this.reqRepo
      .createQueryBuilder('r')
      .where('r.id = :id AND r.space_id IN (:...spaceIds)', { id: requestId, spaceIds })
      .getOne();
    if (!req) throw new NotFoundException();

    const entries = await this.histRepo.find({
      where: { requestId },
      relations: { actor: true },
      order: { createdAt: 'ASC' },
    });

    return entries.map((e) => ({
      id: e.id,
      requestId: e.requestId,
      actorId: e.actorId,
      actorUsername: e.actor?.username ?? null,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      createdAt: e.createdAt,
    }));
  }

  /**
   * Fetch a request by ID, scoped to the actor's spaces.
   * Returns 404 if the request doesn't exist OR belongs to a space the actor has no role in.
   * This prevents cross-space ID probing (Alpha user cannot distinguish 404-not-found
   * from 404-wrong-space for Beta request UUIDs).
   */
  private async fetchForActor(
    m: EntityManager,
    requestId: string,
    actor: User,
  ): Promise<RenewalRequest> {
    const spaceIds = this.actorSpaceIds(actor);
    if (spaceIds.length === 0) throw new NotFoundException();
    const req = await m
      .createQueryBuilder(RenewalRequest, 'r')
      .setLock('pessimistic_write')
      .where('r.id = :id AND r.space_id IN (:...spaceIds)', { id: requestId, spaceIds })
      .getOne();
    if (!req) throw new NotFoundException();
    return req;
  }

  private actorSpaceIds(actor: User): string[] {
    return (actor.spaceRoles ?? []).map((r) => r.spaceId);
  }

  private assertSpaceRole(actor: User, spaceId: string, role: SpaceRole): void {
    const ok = actor.spaceRoles?.some((r) => r.spaceId === spaceId && r.role === role);
    if (!ok) throw new ForbiddenException('Insufficient role');
  }
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0]!;
}
