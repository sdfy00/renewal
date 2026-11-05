import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ResourcesAndRequests1700000000001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE request_status AS ENUM (
        'pending',
        'rejected',
        'in_progress',
        'completed',
        'needs_attention'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE resources (
        id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
        space_id    UUID         NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
        external_id VARCHAR(100) NOT NULL UNIQUE,
        name        VARCHAR(200) NOT NULL,
        expires_on  DATE         NOT NULL,
        amount_minor INT         NOT NULL,
        currency    VARCHAR(3)   NOT NULL DEFAULT 'RUB',
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE renewal_requests (
        id                   UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
        resource_id          UUID           NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        space_id             UUID           NOT NULL REFERENCES spaces(id),
        status               request_status NOT NULL DEFAULT 'pending',
        created_by           UUID           NOT NULL REFERENCES users(id),
        approved_by          UUID           REFERENCES users(id),
        snapshot_expires_on  DATE           NOT NULL,
        new_expires_on       DATE           NOT NULL,
        amount_minor         INT            NOT NULL,
        currency             VARCHAR(3)     NOT NULL DEFAULT 'RUB',
        attempt_count        INT            NOT NULL DEFAULT 0,
        provider_operation_id VARCHAR(255),
        created_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW()
      )
    `);

    /*
     * Enforces "at most one active request per resource" at the DB level.
     * Active statuses: pending, in_progress, needs_attention.
     * rejected and completed are excluded - a new request is allowed after those.
     */
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_resource_active_request
        ON renewal_requests (resource_id)
        WHERE status IN ('pending', 'in_progress', 'needs_attention')
    `);

    await queryRunner.query(`
      CREATE TABLE request_history (
        id          UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
        request_id  UUID           NOT NULL REFERENCES renewal_requests(id) ON DELETE CASCADE,
        actor_id    UUID           REFERENCES users(id),
        from_status request_status,
        to_status   request_status NOT NULL,
        created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_request_history_request ON request_history(request_id)`);

    await queryRunner.query(`
      INSERT INTO resources (id, space_id, external_id, name, expires_on, amount_minor, currency)
      VALUES
        (
          '00000000-0000-0000-0002-000000000001',
          '00000000-0000-0000-0000-000000000001',
          'res-a-01', 'Хранилище A', '2027-03-01', 128000, 'RUB'
        ),
        (
          '00000000-0000-0000-0002-000000000002',
          '00000000-0000-0000-0000-000000000001',
          'res-a-02', 'Сервис B', '2027-05-20', 250000, 'RUB'
        ),
        (
          '00000000-0000-0000-0002-000000000003',
          '00000000-0000-0000-0000-000000000002',
          'res-b-01', 'Сервис C', '2027-06-01', 150000, 'RUB'
        )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS request_history`);
    await queryRunner.query(`DROP TABLE IF EXISTS renewal_requests`);
    await queryRunner.query(`DROP TABLE IF EXISTS resources`);
    await queryRunner.query(`DROP TYPE IF EXISTS request_status`);
  }
}
