import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { vi, beforeEach, describe, it, expect } from 'vitest';
import { RequestsService } from './requests.service.js';
import { RenewalRequest, RequestStatus } from './renewal-request.entity.js';
import { SpaceRole } from '../spaces/user-space-role.entity.js';
import type { User } from '../users/user.entity.js';
import type { Resource } from '../resources/resource.entity.js';
import type { RequestHistory } from './request-history.entity.js';

const SPACE_ID   = '00000000-0000-0000-0000-000000000001';
const SPACE_SLUG = 'alpha';
const RES_ID     = '00000000-0000-0000-0002-000000000001';
const USER_A     = '00000000-0000-0000-0001-000000000001';
const USER_B     = '00000000-0000-0000-0001-000000000002';
const BETA_SPACE = '00000000-0000-0000-0000-000000000002';

function makeUser(opts: {
  id?: string;
  roles?: Array<{ spaceId: string; spaceSlug: string; role: SpaceRole }>;
} = {}): User {
  const id = opts.id ?? USER_A;
  const roles = opts.roles ?? [{ spaceId: SPACE_ID, spaceSlug: SPACE_SLUG, role: SpaceRole.INITIATOR }];
  return {
    id,
    username: `user-${id.slice(-4)}`,
    passwordHash: 'x',
    createdAt: new Date(),
    spaceRoles: roles.map((r) => ({
      id: `role-${r.spaceId}-${r.role}`,
      userId: id,
      spaceId: r.spaceId,
      role: r.role,
      space: { id: r.spaceId, slug: r.spaceSlug, displayName: r.spaceSlug } as any,
      user: null as any,
    })),
  } as User;
}

function makeResource(overrides: Partial<Resource> = {}): Resource {
  return {
    id: RES_ID,
    spaceId: SPACE_ID,
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
    resourceId: RES_ID,
    spaceId: SPACE_ID,
    status: RequestStatus.PENDING,
    createdBy: USER_A,
    approvedBy: null,
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

/** Returns a chainable query-builder mock whose getOne() resolves to `result`. */
function qb(result: unknown): any {
  const mock: Record<string, unknown> = {};
  const chain = () => mock;
  mock.innerJoin = chain;
  mock.addSelect = chain;
  mock.where     = chain;
  mock.andWhere  = chain;
  mock.orderBy   = chain;
  // setLock is a tracked spy so tests can assert it was called with 'pessimistic_write'
  mock.setLock   = vi.fn().mockReturnValue(mock);
  mock.getOne    = vi.fn().mockResolvedValue(result);
  mock.getMany   = vi.fn().mockResolvedValue(Array.isArray(result) ? result : []);
  return mock;
}

let service: RequestsService;
let em: ReturnType<typeof makeEm>;
let reqRepo: any;
let histRepo: any;
let ds: any;

function makeEm() {
  return {
    createQueryBuilder: vi.fn(),
    findOneOrFail: vi.fn(),
    findOne: vi.fn(),
    save: vi.fn().mockImplementation(async <T>(e: T) => e),
    create: vi.fn().mockImplementation((_Entity: unknown, data: unknown) => ({ ...(data as object) })),
  };
}

beforeEach(() => {
  em      = makeEm();
  ds      = { transaction: vi.fn().mockImplementation((cb: (m: typeof em) => unknown) => cb(em)) };
  reqRepo = { findOne: vi.fn(), find: vi.fn(), save: vi.fn(), createQueryBuilder: vi.fn() };
  histRepo = { find: vi.fn() };

  service = new RequestsService(reqRepo, histRepo, ds);
});

describe('createRequest', () => {
  it('throws ForbiddenException when actor has no INITIATOR role in the space', async () => {
    const actor = makeUser({ roles: [{ spaceId: SPACE_ID, spaceSlug: SPACE_SLUG, role: SpaceRole.APPROVER }] });
    await expect(service.createRequest(SPACE_SLUG, RES_ID, actor))
      .rejects.toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when actor belongs to a different space', async () => {
    const betaInitiator = makeUser({ roles: [{ spaceId: BETA_SPACE, spaceSlug: 'beta', role: SpaceRole.INITIATOR }] });
    await expect(service.createRequest(SPACE_SLUG, RES_ID, betaInitiator))
      .rejects.toThrow(ForbiddenException);
  });

  it('throws NotFoundException when resource not found in the space', async () => {
    const actor = makeUser();
    em.createQueryBuilder.mockReturnValue(qb(null));
    await expect(service.createRequest(SPACE_SLUG, RES_ID, actor))
      .rejects.toThrow(NotFoundException);
  });

  it('throws ConflictException when an active request already exists for the resource', async () => {
    const actor = makeUser();
    em.createQueryBuilder.mockReturnValue(qb(makeResource()));
    em.findOne.mockResolvedValue(makeRequest());
    await expect(service.createRequest(SPACE_SLUG, RES_ID, actor))
      .rejects.toThrow(ConflictException);
  });

  it('creates a request with snapshotExpiresOn from resource and +30-day extension', async () => {
    const actor = makeUser();
    em.createQueryBuilder.mockReturnValue(qb(makeResource({ expiresOn: '2027-03-01' })));
    em.findOne.mockResolvedValue(null);

    const result = await service.createRequest(SPACE_SLUG, RES_ID, actor) as RenewalRequest;

    expect(result.snapshotExpiresOn).toBe('2027-03-01');
    expect(result.newExpiresOn).toBe('2027-03-31');
    expect(result.status).toBe(RequestStatus.PENDING);
    expect(result.createdBy).toBe(actor.id);
  });

  it('records a history entry for the PENDING transition', async () => {
    const actor = makeUser();
    em.createQueryBuilder.mockReturnValue(qb(makeResource()));
    em.findOne.mockResolvedValue(null);

    await service.createRequest(SPACE_SLUG, RES_ID, actor);

    expect(em.save).toHaveBeenCalledTimes(2);
    const historySave = em.save.mock.calls[1][0] as Partial<RequestHistory>;
    expect(historySave.fromStatus).toBeNull();
    expect(historySave.toStatus).toBe(RequestStatus.PENDING);
  });

  it('runs inside a single transaction (pessimistic lock)', async () => {
    const actor = makeUser();
    em.createQueryBuilder.mockReturnValue(qb(makeResource()));
    em.findOne.mockResolvedValue(null);

    await service.createRequest(SPACE_SLUG, RES_ID, actor);

    expect(ds.transaction).toHaveBeenCalledOnce();
  });
});

describe('approveRequest', () => {
  it('throws NotFoundException when the request does not exist', async () => {
    const actor = makeUser({ roles: [{ spaceId: SPACE_ID, spaceSlug: SPACE_SLUG, role: SpaceRole.APPROVER }] });
    em.createQueryBuilder.mockReturnValue(qb(null));
    await expect(service.approveRequest('req-id', actor)).rejects.toThrow(NotFoundException);
  });

  it('throws ForbiddenException when actor has no APPROVER role', async () => {
    const actor = makeUser();
    const req = makeRequest({ createdBy: USER_B });
    em.createQueryBuilder.mockReturnValue(qb(req));
    await expect(service.approveRequest('req-id', actor)).rejects.toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when actor tries to approve their own request', async () => {
    const actor = makeUser({
      id: USER_A,
      roles: [
        { spaceId: SPACE_ID, spaceSlug: SPACE_SLUG, role: SpaceRole.INITIATOR },
        { spaceId: SPACE_ID, spaceSlug: SPACE_SLUG, role: SpaceRole.APPROVER },
      ],
    });
    const req = makeRequest({ createdBy: USER_A }); // own request
    em.createQueryBuilder.mockReturnValue(qb(req));
    await expect(service.approveRequest('req-id', actor)).rejects.toThrow(ForbiddenException);
  });

  it('throws ConflictException when request is not PENDING', async () => {
    const actor = makeUser({ roles: [{ spaceId: SPACE_ID, spaceSlug: SPACE_SLUG, role: SpaceRole.APPROVER }] });
    const req = makeRequest({ createdBy: USER_B, status: RequestStatus.IN_PROGRESS });
    em.createQueryBuilder.mockReturnValue(qb(req));
    em.findOne.mockResolvedValue(makeResource());
    await expect(service.approveRequest('req-id', actor)).rejects.toThrow(ConflictException);
  });

  it('throws ConflictException when resource expiresOn changed since snapshot', async () => {
    const actor = makeUser({ roles: [{ spaceId: SPACE_ID, spaceSlug: SPACE_SLUG, role: SpaceRole.APPROVER }] });
    const req = makeRequest({ createdBy: USER_B, snapshotExpiresOn: '2027-03-01' });
    em.createQueryBuilder.mockReturnValue(qb(req));
    em.findOne.mockResolvedValue(makeResource({ expiresOn: '2027-04-01' })); // changed
    await expect(service.approveRequest('req-id', actor)).rejects.toThrow(ConflictException);
  });

  it('throws ConflictException when resource amountMinor changed since snapshot', async () => {
    const actor = makeUser({ roles: [{ spaceId: SPACE_ID, spaceSlug: SPACE_SLUG, role: SpaceRole.APPROVER }] });
    const req = makeRequest({ createdBy: USER_B, amountMinor: 128000 });
    em.createQueryBuilder.mockReturnValue(qb(req));
    em.findOne.mockResolvedValue(makeResource({ amountMinor: 200000 })); // changed
    await expect(service.approveRequest('req-id', actor)).rejects.toThrow(ConflictException);
  });

  it('transitions PENDING → IN_PROGRESS, sets approvedBy, records history', async () => {
    const actor = makeUser({ roles: [{ spaceId: SPACE_ID, spaceSlug: SPACE_SLUG, role: SpaceRole.APPROVER }] });
    const req = makeRequest({ createdBy: USER_B });
    em.createQueryBuilder.mockReturnValue(qb(req));
    em.findOne.mockResolvedValue(makeResource());

    const result = await service.approveRequest('req-id', actor) as RenewalRequest;

    expect(result.status).toBe(RequestStatus.IN_PROGRESS);
    expect(result.approvedBy).toBe(actor.id);
    expect(em.save).toHaveBeenCalledTimes(2);
    const historySave = em.save.mock.calls[1][0] as Partial<RequestHistory>;
    expect(historySave.fromStatus).toBe(RequestStatus.PENDING);
    expect(historySave.toStatus).toBe(RequestStatus.IN_PROGRESS);
  });

  it('uses pessimistic write lock to prevent double-approval (409)', async () => {
    const actor = makeUser({ roles: [{ spaceId: SPACE_ID, spaceSlug: SPACE_SLUG, role: SpaceRole.APPROVER }] });
    const req = makeRequest({ createdBy: USER_B });
    const mockQb = qb(req);
    em.createQueryBuilder.mockReturnValue(mockQb);
    em.findOne.mockResolvedValue(makeResource());

    await service.approveRequest('req-id', actor);

    expect(mockQb.setLock).toHaveBeenCalledWith('pessimistic_write');
  });
});

describe('rejectRequest', () => {
  it('throws ForbiddenException when actor has no APPROVER role', async () => {
    const actor = makeUser();
    const req = makeRequest({ createdBy: USER_B });
    em.createQueryBuilder.mockReturnValue(qb(req));
    await expect(service.rejectRequest('req-id', actor)).rejects.toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when actor tries to reject their own request', async () => {
    const actor = makeUser({
      id: USER_A,
      roles: [{ spaceId: SPACE_ID, spaceSlug: SPACE_SLUG, role: SpaceRole.APPROVER }],
    });
    const req = makeRequest({ createdBy: USER_A });
    em.createQueryBuilder.mockReturnValue(qb(req));
    await expect(service.rejectRequest('req-id', actor)).rejects.toThrow(ForbiddenException);
  });

  it('throws ConflictException when request is not PENDING', async () => {
    const actor = makeUser({ roles: [{ spaceId: SPACE_ID, spaceSlug: SPACE_SLUG, role: SpaceRole.APPROVER }] });
    const req = makeRequest({ createdBy: USER_B, status: RequestStatus.COMPLETED });
    em.createQueryBuilder.mockReturnValue(qb(req));
    await expect(service.rejectRequest('req-id', actor)).rejects.toThrow(ConflictException);
  });

  it('transitions PENDING → REJECTED and records history without touching resource', async () => {
    const actor = makeUser({ roles: [{ spaceId: SPACE_ID, spaceSlug: SPACE_SLUG, role: SpaceRole.APPROVER }] });
    const req = makeRequest({ createdBy: USER_B });
    em.createQueryBuilder.mockReturnValue(qb(req));

    const result = await service.rejectRequest('req-id', actor) as RenewalRequest;

    expect(result.status).toBe(RequestStatus.REJECTED);
    expect(em.save).toHaveBeenCalledTimes(2);
    const historySave = em.save.mock.calls[1][0] as Partial<RequestHistory>;
    expect(historySave.toStatus).toBe(RequestStatus.REJECTED);
    expect(em.findOne).not.toHaveBeenCalled();
  });
});

describe('retryRequest', () => {
  it('throws NotFoundException if request is not found', async () => {
    const actor = makeUser({ roles: [{ spaceId: SPACE_ID, spaceSlug: SPACE_SLUG, role: SpaceRole.APPROVER }] });
    em.createQueryBuilder.mockReturnValue(qb(null));
    await expect(service.retryRequest('req-id', actor)).rejects.toThrow(NotFoundException);
  });

  it('throws ForbiddenException if actor has no APPROVER role', async () => {
    const actor = makeUser();
    em.createQueryBuilder.mockReturnValue(qb(makeRequest({ status: RequestStatus.NEEDS_ATTENTION })));
    await expect(service.retryRequest('req-id', actor)).rejects.toThrow(ForbiddenException);
  });

  it('throws ConflictException if request is not in NEEDS_ATTENTION status', async () => {
    const actor = makeUser({ roles: [{ spaceId: SPACE_ID, spaceSlug: SPACE_SLUG, role: SpaceRole.APPROVER }] });
    em.createQueryBuilder.mockReturnValue(qb(makeRequest({ status: RequestStatus.PENDING })));
    await expect(service.retryRequest('req-id', actor)).rejects.toThrow(ConflictException);
  });

  it('transitions NEEDS_ATTENTION → IN_PROGRESS and resets attempt count', async () => {
    const actor = makeUser({ roles: [{ spaceId: SPACE_ID, spaceSlug: SPACE_SLUG, role: SpaceRole.APPROVER }] });
    em.createQueryBuilder.mockReturnValue(qb(makeRequest({ status: RequestStatus.NEEDS_ATTENTION, attemptCount: 3 })));

    const result = await service.retryRequest('req-id', actor) as RenewalRequest;

    expect(result.status).toBe(RequestStatus.IN_PROGRESS);
    expect(result.attemptCount).toBe(0);
    const historySave = em.save.mock.calls[1][0] as Partial<RequestHistory>;
    expect(historySave.fromStatus).toBe(RequestStatus.NEEDS_ATTENTION);
    expect(historySave.toStatus).toBe(RequestStatus.IN_PROGRESS);
  });

  it('uses pessimistic write lock to prevent double-retry', async () => {
    const actor = makeUser({ roles: [{ spaceId: SPACE_ID, spaceSlug: SPACE_SLUG, role: SpaceRole.APPROVER }] });
    const mockQb = qb(makeRequest({ status: RequestStatus.NEEDS_ATTENTION }));
    em.createQueryBuilder.mockReturnValue(mockQb);

    await service.retryRequest('req-id', actor);

    expect(mockQb.setLock).toHaveBeenCalledWith('pessimistic_write');
  });
});

describe('getHistory', () => {
  it('throws NotFoundException if request does not exist', async () => {
    reqRepo.createQueryBuilder.mockReturnValue(qb(null));
    await expect(service.getHistory('req-id', makeUser())).rejects.toThrow(NotFoundException);
  });

  it('returns NotFoundException for a user with no role in the request space (security: no ID probing)', async () => {
    const betaUser = makeUser({ roles: [{ spaceId: BETA_SPACE, spaceSlug: 'beta', role: SpaceRole.INITIATOR }] });
    reqRepo.createQueryBuilder.mockReturnValue(qb(null)); // space_id filter excludes the alpha request
    await expect(service.getHistory('req-id', betaUser)).rejects.toThrow(NotFoundException);
  });

  it('returns history entries for a user with any role in the space', async () => {
    const actor = makeUser();
    const req = makeRequest();
    reqRepo.createQueryBuilder.mockReturnValue(qb(req));
    histRepo.find.mockResolvedValue([]);

    const result = await service.getHistory(req.id, actor);

    expect(Array.isArray(result)).toBe(true);
    expect(histRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { requestId: req.id } }),
    );
  });
});

describe('space isolation', () => {
  it('initiator of Beta cannot create a request in Alpha', async () => {
    const betaInitiator = makeUser({
      roles: [{ spaceId: BETA_SPACE, spaceSlug: 'beta', role: SpaceRole.INITIATOR }],
    });
    await expect(service.createRequest('alpha', RES_ID, betaInitiator))
      .rejects.toThrow(ForbiddenException);
  });

  it('approver of Beta cannot approve an Alpha request', async () => {
    const betaApprover = makeUser({
      roles: [{ spaceId: BETA_SPACE, spaceSlug: 'beta', role: SpaceRole.APPROVER }],
    });
    const alphaReq = makeRequest({ createdBy: USER_B, spaceId: SPACE_ID });
    em.createQueryBuilder.mockReturnValue(qb(alphaReq));
    await expect(service.approveRequest('req-id', betaApprover)).rejects.toThrow(ForbiddenException);
  });

  it('user without any space role cannot read request history', async () => {
    const noRoleUser = makeUser({ roles: [] });
    await expect(service.getHistory('req-id', noRoleUser)).rejects.toThrow(NotFoundException);
  });

  it('second concurrent create for the same resource sees the first request and throws ConflictException', async () => {
    const actor = makeUser();
    em.createQueryBuilder
      .mockReturnValueOnce(qb(makeResource()))
      .mockReturnValueOnce(qb(makeResource()));
    em.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeRequest());

    await service.createRequest(SPACE_SLUG, RES_ID, actor);
    await expect(service.createRequest(SPACE_SLUG, RES_ID, actor))
      .rejects.toThrow(ConflictException);
  });

  it('universal user (initiator + approver) cannot approve their own request', async () => {
    const universal = makeUser({
      id: USER_A,
      roles: [
        { spaceId: SPACE_ID, spaceSlug: SPACE_SLUG, role: SpaceRole.INITIATOR },
        { spaceId: SPACE_ID, spaceSlug: SPACE_SLUG, role: SpaceRole.APPROVER },
      ],
    });
    const ownReq = makeRequest({ createdBy: USER_A, spaceId: SPACE_ID });
    em.createQueryBuilder.mockReturnValue(qb(ownReq));
    await expect(service.approveRequest('req-id', universal)).rejects.toThrow(ForbiddenException);
  });
});
