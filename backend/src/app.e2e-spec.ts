/**
 * API integration tests - require a running PostgreSQL instance.
 *
 * The test runner connects to database "renewals_test" (override via TEST_DB_* env vars)
 * and uses dropSchema + synchronize to create a fresh schema for each run.
 *
 * Run: npm run test:e2e
 */

import { randomBytes } from 'node:crypto';

// Generate a fresh random secret per test run - nothing hardcoded in source.
process.env['JWT_SECRET'] = randomBytes(32).toString('hex');

import cookieParser from 'cookie-parser';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import supertest from 'supertest';
import type { DataSource, Repository } from 'typeorm';
import bcrypt from 'bcrypt';

import { AuthModule } from './auth/auth.module.js';
import { RequestsModule } from './requests/requests.module.js';
import { ResourcesModule } from './resources/resources.module.js';
import { SpacesModule } from './spaces/spaces.module.js';
import { UsersModule } from './users/users.module.js';
import { User } from './users/user.entity.js';
import { Space } from './spaces/space.entity.js';
import { UserSpaceRole, SpaceRole } from './spaces/user-space-role.entity.js';
import { Resource } from './resources/resource.entity.js';
import { RenewalRequest } from './requests/renewal-request.entity.js';
import { RequestHistory } from './requests/request-history.entity.js';
import { RenewalWorkerService } from './requests/renewal.worker.js';

function agent(app: INestApplication) {
  return supertest.agent(app.getHttpServer());
}

async function login(app: INestApplication, username: string, password = 'password') {
  const a = agent(app);
  await a.post('/auth/login').send({ username, password }).expect(201);
  return a;
}

let app: INestApplication;
let ds: DataSource;
let spaceId: string;
let resourceId: string;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      TypeOrmModule.forRoot({
        type: 'postgres',
        host: process.env.TEST_DB_HOST ?? 'localhost',
        port: +(process.env.TEST_DB_PORT ?? '5432'),
        database: process.env.TEST_DB_NAME ?? 'renewals_test',
        username: process.env.TEST_DB_USER ?? 'postgres',
        password: process.env.TEST_DB_PASSWORD ?? 'postgres',
        entities: [User, Space, UserSpaceRole, Resource, RenewalRequest, RequestHistory],
        // Drops and recreates the entire schema each run - test DB only!
        dropSchema: true,
        synchronize: true,
      }),
      ScheduleModule.forRoot(),
      UsersModule,
      SpacesModule,
      AuthModule,
      ResourcesModule,
      RequestsModule,
    ],
  })
    // Prevent the interval-based worker from starting during tests.
    .overrideProvider(RenewalWorkerService)
    .useValue({})
    .compile();

  app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  await app.init();

  ds = moduleRef.get<DataSource>(getDataSourceToken());

  const hash = await bcrypt.hash('password', 10);

  const spaceRepo: Repository<Space> = ds.getRepository(Space);
  const userRepo: Repository<User> = ds.getRepository(User);
  const roleRepo: Repository<UserSpaceRole> = ds.getRepository(UserSpaceRole);
  const resourceRepo: Repository<Resource> = ds.getRepository(Resource);

  const space = await spaceRepo.save({ slug: 'e2e', displayName: 'E2E Space' });
  spaceId = space.id;

  const initiator = await userRepo.save({ username: 'e2e-initiator', passwordHash: hash });
  const approver  = await userRepo.save({ username: 'e2e-approver',  passwordHash: hash });

  await roleRepo.save([
    { userId: initiator.id, spaceId: space.id, role: SpaceRole.INITIATOR },
    { userId: approver.id,  spaceId: space.id, role: SpaceRole.APPROVER  },
  ]);

  const resource = await resourceRepo.save({
    spaceId: space.id,
    externalId: 'e2e-res-01',
    name: 'E2E Resource',
    expiresOn: '2027-03-01',
    amountMinor: 128000,
    currency: 'RUB',
  });
  resourceId = resource.id;

  await resourceRepo.save({
    spaceId: space.id,
    externalId: 'e2e-res-02',
    name: 'E2E Resource 2',
    expiresOn: '2027-04-01',
    amountMinor: 64000,
    currency: 'RUB',
  });
}, 30_000);

afterAll(async () => {
  await app?.close();
});

describe('POST /auth/login', () => {
  it('returns user data and sets an HttpOnly cookie on valid credentials', async () => {
    const res = await supertest(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'e2e-initiator', password: 'password' })
      .expect(201);

    expect(res.body).toMatchObject({ username: 'e2e-initiator' });
    expect(res.body.id).toBeDefined();
    expect(res.body).not.toHaveProperty('passwordHash');

    const cookies = (res.headers['set-cookie'] as unknown as string[]) ?? [];
    expect(cookies).toEqual(expect.arrayContaining([expect.stringContaining('access_token=')]));
    expect(cookies.find(c => c.startsWith('access_token='))).toContain('HttpOnly');
  });

  it('returns 401 on wrong password', async () => {
    await supertest(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'e2e-initiator', password: 'wrong' })
      .expect(401);
  });

  it('returns 400 when required fields are missing', async () => {
    await supertest(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'e2e-initiator' })
      .expect(400);
  });
});

describe('POST /auth/logout', () => {
  it('clears the access_token cookie', async () => {
    const a = await login(app, 'e2e-initiator');
    const res = await a.post('/auth/logout').expect(200);

    const cookies = (res.headers['set-cookie'] as unknown as string[]) ?? [];
    expect(cookies.find(c => c.startsWith('access_token='))).toContain('access_token=;');
  });
});

describe('GET /spaces/:slug/resources', () => {
  it('returns 401 without a session cookie', async () => {
    await supertest(app.getHttpServer())
      .get('/spaces/e2e/resources')
      .expect(401);
  });

  it('returns 403 when the user has no role in the space', async () => {
    // Create a second space that neither e2e user belongs to
    await ds.getRepository(Space).save({ slug: 'e2e-other', displayName: 'Other' });
    const a = await login(app, 'e2e-initiator');
    await a.get('/spaces/e2e-other/resources').expect(403);
  });

  it('returns resources with activeRequest: null when no active request exists', async () => {
    const a = await login(app, 'e2e-initiator');
    const res = await a.get('/spaces/e2e/resources').expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    const r = res.body.find((x: { externalId: string }) => x.externalId === 'e2e-res-01');
    expect(r).toBeDefined();
    expect(r.activeRequest).toBeNull();
  });
});

describe('Requests - lifecycle', () => {
  let requestId: string;

  it('POST creates a request with status pending', async () => {
    const a = await login(app, 'e2e-initiator');
    const res = await a
      .post(`/spaces/e2e/resources/${resourceId}/requests`)
      .expect(201);

    expect(res.body).toMatchObject({
      status: 'pending',
      resourceId,
      snapshotExpiresOn: '2027-03-01',
      newExpiresOn: '2027-03-31',
      amountMinor: 128000,
    });
    requestId = res.body.id;
  });

  it('POST returns 409 when an active request already exists for the resource', async () => {
    const a = await login(app, 'e2e-initiator');
    await a
      .post(`/spaces/e2e/resources/${resourceId}/requests`)
      .expect(409);
  });

  it('GET /spaces/:slug/requests lists the created request', async () => {
    const a = await login(app, 'e2e-initiator');
    const res = await a.get('/spaces/e2e/requests').expect(200);

    expect(res.body.some((r: { id: string }) => r.id === requestId)).toBe(true);
  });

  it('GET /spaces/:slug/resources shows the request as activeRequest', async () => {
    const a = await login(app, 'e2e-initiator');
    const res = await a.get('/spaces/e2e/resources').expect(200);

    const r = res.body.find((x: { externalId: string }) => x.externalId === 'e2e-res-01');
    expect(r.activeRequest).toMatchObject({ id: requestId, status: 'pending' });
  });

  it('PATCH /approve returns 403 when the initiator tries to approve their own request', async () => {
    const a = await login(app, 'e2e-initiator');
    await a.patch(`/requests/${requestId}/approve`).expect(403);
  });

  it('PATCH /approve transitions request to in_progress', async () => {
    const a = await login(app, 'e2e-approver');
    const res = await a.patch(`/requests/${requestId}/approve`).expect(200);

    expect(res.body.status).toBe('in_progress');
    expect(res.body.approvedBy).toBeDefined();
  });

  it('GET /history returns entries including the approve transition', async () => {
    const a = await login(app, 'e2e-approver');
    const res = await a.get(`/requests/${requestId}/history`).expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    const created  = res.body.find((e: { toStatus: string }) => e.toStatus === 'pending');
    const approved = res.body.find((e: { toStatus: string }) => e.toStatus === 'in_progress');
    expect(created).toBeDefined();
    expect(approved).toBeDefined();
    expect(approved.actorUsername).toBe('e2e-approver');
  });

  it('PATCH /reject returns 409 when request is already in_progress', async () => {
    const a = await login(app, 'e2e-approver');
    await a.patch(`/requests/${requestId}/reject`).expect(409);
  });
});

describe('Requests - reject flow', () => {
  let requestId: string;
  let res02Id: string;

  beforeAll(async () => {
    const r = await ds
      .getRepository(Resource)
      .findOneByOrFail({ externalId: 'e2e-res-02' });
    res02Id = r.id;
  });

  it('POST creates a request on the second resource', async () => {
    const a = await login(app, 'e2e-initiator');
    const res = await a
      .post(`/spaces/e2e/resources/${res02Id}/requests`)
      .expect(201);
    requestId = res.body.id;
  });

  it('PATCH /reject transitions request to rejected', async () => {
    const a = await login(app, 'e2e-approver');
    const res = await a.patch(`/requests/${requestId}/reject`).expect(200);
    expect(res.body.status).toBe('rejected');
  });

  it('GET /history includes the reject transition with actorUsername', async () => {
    const a = await login(app, 'e2e-approver');
    const res = await a.get(`/requests/${requestId}/history`).expect(200);
    const rejected = res.body.find((e: { toStatus: string }) => e.toStatus === 'rejected');
    expect(rejected).toBeDefined();
    expect(rejected.actorUsername).toBe('e2e-approver');
  });
});

describe('Authorization', () => {
  it('protected endpoints return 401 when no cookie is present', async () => {
    await Promise.all([
      supertest(app.getHttpServer()).get('/spaces/e2e/requests').expect(401),
      supertest(app.getHttpServer()).get('/spaces/e2e/resources').expect(401),
    ]);
  });

  it('PATCH /approve returns 401 for unauthenticated requests', async () => {
    await supertest(app.getHttpServer())
      .patch('/requests/00000000-0000-0000-0000-000000000099/approve')
      .expect(401);
  });
});

describe('Requests - concurrent approval race', () => {
  let raceRequestId: string;

  beforeAll(async () => {
    const resource = await ds.getRepository(Resource).save({
      spaceId,
      externalId: 'e2e-res-race',
      name: 'Race Resource',
      expiresOn: '2028-01-01',
      amountMinor: 10000,
      currency: 'RUB',
    });

    const a = await login(app, 'e2e-initiator');
    const res = await a
      .post(`/spaces/e2e/resources/${resource.id}/requests`)
      .expect(201);
    raceRequestId = res.body.id;
  });

  it('only one of two simultaneous approve calls succeeds, the other gets 409', async () => {
    const [a1, a2] = await Promise.all([
      login(app, 'e2e-approver'),
      login(app, 'e2e-approver'),
    ]);

    const [res1, res2] = await Promise.all([
      a1.patch(`/requests/${raceRequestId}/approve`),
      a2.patch(`/requests/${raceRequestId}/approve`),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([200, 409]);
  });
});

describe('Requests - retry flow', () => {
  let retryRequestId: string;

  beforeAll(async () => {
    const resource = await ds.getRepository(Resource).save({
      spaceId,
      externalId: 'e2e-res-retry',
      name: 'Retry Resource',
      expiresOn: '2028-02-01',
      amountMinor: 20000,
      currency: 'RUB',
    });

    const a = await login(app, 'e2e-initiator');
    const created = await a
      .post(`/spaces/e2e/resources/${resource.id}/requests`)
      .expect(201);
    retryRequestId = created.body.id;

    const approver = await login(app, 'e2e-approver');
    await approver.patch(`/requests/${retryRequestId}/approve`).expect(200);

    await ds.query(
      `UPDATE renewal_requests SET status = 'needs_attention', attempt_count = 3 WHERE id = $1`,
      [retryRequestId],
    );
  });

  it('PATCH /retry transitions needs_attention → in_progress and resets attemptCount', async () => {
    const a = await login(app, 'e2e-approver');
    const res = await a.patch(`/requests/${retryRequestId}/retry`).expect(200);

    expect(res.body.status).toBe('in_progress');
    expect(res.body.attemptCount).toBe(0);
  });

  it('PATCH /retry returns 403 when an initiator (non-approver) tries to retry', async () => {
    await ds.query(
      `UPDATE renewal_requests SET status = 'needs_attention' WHERE id = $1`,
      [retryRequestId],
    );

    const a = await login(app, 'e2e-initiator');
    await a.patch(`/requests/${retryRequestId}/retry`).expect(403);
  });
});
