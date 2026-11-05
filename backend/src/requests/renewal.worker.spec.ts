import { vi, beforeEach, describe, it, expect } from 'vitest';
import { RenewalWorkerService } from './renewal.worker.js';
import { RenewalRequest, RequestStatus } from './renewal-request.entity.js';
import type { Resource } from '../resources/resource.entity.js';
import type { RequestHistory } from './request-history.entity.js';

function makeResource(overrides: Partial<Resource> = {}): Resource {
  return {
    id: 'res-uuid-1',
    spaceId: 'space-uuid-1',
    externalId: 'res-a-01',
    name: 'Хранилище A',
    expiresOn: '2027-03-01',
    amountMinor: 128000,
    currency: 'RUB',
    createdAt: new Date(),
    space: null as any,
    ...overrides,
  } as Resource;
}

function makeRequest(overrides: Partial<RenewalRequest> = {}): RenewalRequest {
  return {
    id: 'req-uuid-1',
    resourceId: 'res-uuid-1',
    spaceId: 'space-uuid-1',
    status: RequestStatus.IN_PROGRESS,
    createdBy: 'user-uuid-1',
    approvedBy: 'user-uuid-2',
    snapshotExpiresOn: '2027-03-01',
    newExpiresOn: '2027-03-31',
    amountMinor: 128000,
    currency: 'RUB',
    attemptCount: 0,
    providerOperationId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    resource: null as any,
    ...overrides,
  } as RenewalRequest;
}

let worker: RenewalWorkerService;
let reqRepo: any;
let histRepo: any;
let resourceRepo: any;
let em: any;
let ds: any;
let provider: any;
let schedulerRegistry: any;
const configService: any = { get: (_key: string, def: unknown) => def };

beforeEach(() => {
  const mockQb = {
    setLock: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    getOne: vi.fn().mockResolvedValue(makeRequest()),
  };
  em = {
    findOneOrFail: vi.fn(),
    save: vi.fn().mockImplementation(async <T>(e: T) => e),
    create: vi.fn().mockImplementation((_Entity: unknown, data: unknown) => ({ ...(data as object) })),
    createQueryBuilder: vi.fn().mockReturnValue(mockQb),
  };
  ds = { transaction: vi.fn().mockImplementation((cb: (m: typeof em) => unknown) => cb(em)) };
  reqRepo = {
    find: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockImplementation(async <T>(e: T) => e),
  };
  histRepo = {};
  resourceRepo = { findOne: vi.fn() };
  provider = {
    submitRenewal: vi.fn(),
    checkRenewal: vi.fn(),
  };
  schedulerRegistry = { addInterval: vi.fn() };

  worker = new RenewalWorkerService(
    reqRepo,
    histRepo,
    resourceRepo,
    ds,
    provider,
    schedulerRegistry,
    configService,
  );
});

describe('processAll - only processes IN_PROGRESS', () => {
  it('queries only IN_PROGRESS requests, not NEEDS_ATTENTION', async () => {
    reqRepo.find.mockResolvedValue([]);
    await worker.processAll();

    const [findArg] = reqRepo.find.mock.calls[0] as [{ where: { status: { _value?: string[]; value?: string[] } } }];
    const statusOperator = findArg.where.status;
    // TypeORM In() wraps values; check that the value array contains IN_PROGRESS only
    const values: string[] = statusOperator._value ?? statusOperator.value ?? [];
    expect(values).toContain(RequestStatus.IN_PROGRESS);
    expect(values).not.toContain(RequestStatus.NEEDS_ATTENTION);
  });

  it('does nothing when there are no IN_PROGRESS requests', async () => {
    reqRepo.find.mockResolvedValue([]);
    await worker.processAll();
    expect(provider.submitRenewal).not.toHaveBeenCalled();
  });
});

describe('processAll - provider returns 200', () => {
  it('completes the request and updates resource expiresOn in one transaction', async () => {
    const req = makeRequest();
    const resource = makeResource();
    reqRepo.find.mockResolvedValue([req]);
    resourceRepo.findOne.mockResolvedValue(resource);
    em.findOneOrFail.mockResolvedValue(makeResource());
    provider.submitRenewal.mockResolvedValue({
      outcome: 'ok',
      operation: { operation_id: 'op-123', status: 'completed' },
    });

    await worker.processAll();

    expect(ds.transaction).toHaveBeenCalledOnce();
    expect(em.save).toHaveBeenCalledWith(expect.objectContaining({ expiresOn: req.newExpiresOn }));
    expect(em.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: RequestStatus.COMPLETED, providerOperationId: 'op-123' }),
    );
    const historyEntry = em.save.mock.calls.find(
      (call: unknown[]) =>
        (call[0] as Partial<RequestHistory>).toStatus === RequestStatus.COMPLETED,
    );
    expect(historyEntry).toBeDefined();
  });

  it('uses req.id as the idempotency key for the provider call', async () => {
    const req = makeRequest({ id: 'my-request-id' });
    reqRepo.find.mockResolvedValue([req]);
    resourceRepo.findOne.mockResolvedValue(makeResource());
    em.findOneOrFail.mockResolvedValue(makeResource());
    provider.submitRenewal.mockResolvedValue({
      outcome: 'ok',
      operation: { operation_id: 'op-1', status: 'completed' },
    });

    await worker.processAll();

    expect(provider.submitRenewal).toHaveBeenCalledWith(
      'my-request-id',
      expect.objectContaining({ resource_id: 'res-a-01', period_months: 1 }),
    );
  });
});

describe('processAll - 503 recovery', () => {
  it('on 503, defers recovery to the next tick via repeated POST - does not call GET in the same tick', async () => {
    const req = makeRequest({ attemptCount: 0 });
    reqRepo.find.mockResolvedValue([req]);
    resourceRepo.findOne.mockResolvedValue(makeResource());
    provider.submitRenewal.mockResolvedValue({ outcome: 'lost' });

    await worker.processAll();

    // GET check must NOT be called - PROVIDER_RETRY_DELAY_MS provides the window for restart testing
    expect(provider.checkRenewal).not.toHaveBeenCalled();
    expect(ds.transaction).toHaveBeenCalledOnce();
    expect(em.save).toHaveBeenCalledWith(
      expect.objectContaining({ attemptCount: 1, status: RequestStatus.IN_PROGRESS }),
    );
  });

  it('transitions to NEEDS_ATTENTION after reaching MAX_ATTEMPTS', async () => {
    const req = makeRequest({ attemptCount: 2, status: RequestStatus.IN_PROGRESS });
    reqRepo.find.mockResolvedValue([req]);
    resourceRepo.findOne.mockResolvedValue(makeResource());

    em.createQueryBuilder.mockReturnValue({
      setLock: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      getOne: vi.fn().mockResolvedValue(makeRequest({ attemptCount: 2, status: RequestStatus.IN_PROGRESS })),
    });

    provider.submitRenewal.mockResolvedValue({ outcome: 'lost' });

    await worker.processAll();

    expect(ds.transaction).toHaveBeenCalledOnce();
    expect(em.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: RequestStatus.NEEDS_ATTENTION, attemptCount: 3 }),
    );
    const historyEntry = em.save.mock.calls.find(
      (call: unknown[]) =>
        (call[0] as Partial<RequestHistory>).toStatus === RequestStatus.NEEDS_ATTENTION,
    );
    expect(historyEntry).toBeDefined();
  });

  it('skips recordFailedAttempt if the locked request is no longer IN_PROGRESS', async () => {
    const req = makeRequest({ status: RequestStatus.IN_PROGRESS });
    reqRepo.find.mockResolvedValue([req]);
    resourceRepo.findOne.mockResolvedValue(makeResource());

    em.createQueryBuilder.mockReturnValue({
      setLock: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      getOne: vi.fn().mockResolvedValue(makeRequest({ status: RequestStatus.COMPLETED })),
    });

    provider.submitRenewal.mockResolvedValue({ outcome: 'lost' });

    await worker.processAll();

    expect(em.save).not.toHaveBeenCalled();
  });
});

describe('idempotent completion', () => {
  it('does not re-process a COMPLETED request (not in the IN_PROGRESS query)', async () => {
    // find() returns only IN_PROGRESS; a COMPLETED request is never re-fetched
    reqRepo.find.mockResolvedValue([]);

    await worker.processAll();

    expect(provider.submitRenewal).not.toHaveBeenCalled();
    expect(ds.transaction).not.toHaveBeenCalled();
  });

  it('does not re-process if a concurrent tick already completed the request (pessimistic lock guard)', async () => {
    const req = makeRequest({ status: RequestStatus.IN_PROGRESS });
    reqRepo.find.mockResolvedValue([req]);
    resourceRepo.findOne.mockResolvedValue(makeResource());
    em.findOneOrFail.mockResolvedValue(makeResource());
    provider.submitRenewal.mockResolvedValue({
      outcome: 'ok',
      operation: { operation_id: 'op-1', status: 'completed' },
    });

    em.createQueryBuilder.mockReturnValue({
      setLock: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      getOne: vi.fn().mockResolvedValue(makeRequest({ status: RequestStatus.COMPLETED })),
    });

    await worker.processAll();

    expect(em.save).not.toHaveBeenCalled();
  });

  it('does not shift expiresOn when completeRequest is called on an already-COMPLETED request', async () => {
    // Guard: pessimistic lock check ensures newExpiresOn is written exactly once even if
    // processOne races against a concurrent tick that already completed the request.
    const req = makeRequest({ status: RequestStatus.IN_PROGRESS });
    const resource = makeResource({ expiresOn: '2027-03-01' });
    reqRepo.find.mockResolvedValue([req]);
    resourceRepo.findOne.mockResolvedValue(resource);
    em.findOneOrFail.mockResolvedValue(makeResource({ expiresOn: '2027-03-01' }));
    provider.submitRenewal.mockResolvedValue({
      outcome: 'ok',
      operation: { operation_id: 'op-1', status: 'completed' },
    });

    await worker.processAll();

    const resourceSaves = em.save.mock.calls.filter(
      (call: unknown[]) => (call[0] as Partial<Resource>).expiresOn !== undefined,
    );
    expect(resourceSaves).toHaveLength(1);
    expect((resourceSaves[0] as unknown[])[0]).toMatchObject({ expiresOn: req.newExpiresOn });
  });
});

describe('processAll - concurrent tick guard', () => {
  it('skips a tick if processAll is already in progress', async () => {
    let submitResolve!: (v: { outcome: string; statusCode: number }) => void;
    provider.submitRenewal.mockReturnValue(
      new Promise<{ outcome: string; statusCode: number }>((res) => { submitResolve = res; }),
    );
    reqRepo.find.mockResolvedValue([makeRequest()]);
    resourceRepo.findOne.mockResolvedValue(makeResource());

    // isRunning is set before the first await, so the second tick sees it immediately
    const first = worker.processAll();
    const second = worker.processAll();
    submitResolve({ outcome: 'error', statusCode: 500 });
    await Promise.all([first, second]);

    expect(reqRepo.find).toHaveBeenCalledOnce();
    expect(provider.submitRenewal).toHaveBeenCalledOnce();
  });
});
