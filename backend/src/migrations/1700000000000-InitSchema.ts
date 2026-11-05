import bcrypt from 'bcrypt';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1700000000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TYPE space_role AS ENUM ('initiator', 'approver')
    `);

    await queryRunner.query(`
      CREATE TABLE spaces (
        id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
        slug         VARCHAR(50) NOT NULL UNIQUE,
        display_name VARCHAR(100) NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE users (
        id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
        username      VARCHAR(100) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE user_space_roles (
        id       UUID       PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id  UUID       NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
        space_id UUID       NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
        role     space_role NOT NULL,
        CONSTRAINT uq_user_space_role UNIQUE (user_id, space_id, role)
      )
    `);

    await queryRunner.query(`
      INSERT INTO spaces (id, slug, display_name) VALUES
        ('00000000-0000-0000-0000-000000000001', 'alpha', 'Alpha'),
        ('00000000-0000-0000-0000-000000000002', 'beta',  'Beta')
    `);

    // Seed users - all share the same password: "password"
    const hash = await bcrypt.hash('password', 10);
    await queryRunner.query(
      `INSERT INTO users (id, username, password_hash) VALUES
        ('00000000-0000-0000-0001-000000000001', 'initiator-alpha',  $1),
        ('00000000-0000-0000-0001-000000000002', 'approver-alpha',   $1),
        ('00000000-0000-0000-0001-000000000003', 'initiator-beta',   $1),
        ('00000000-0000-0000-0001-000000000004', 'universal-alpha',  $1)`,
      [hash],
    );

    await queryRunner.query(`
      INSERT INTO user_space_roles (user_id, space_id, role) VALUES
        ('00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0000-000000000001', 'initiator'),
        ('00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0000-000000000001', 'approver'),
        ('00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0000-000000000002', 'initiator'),
        ('00000000-0000-0000-0001-000000000004', '00000000-0000-0000-0000-000000000001', 'initiator'),
        ('00000000-0000-0000-0001-000000000004', '00000000-0000-0000-0000-000000000001', 'approver')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS user_space_roles`);
    await queryRunner.query(`DROP TABLE IF EXISTS users`);
    await queryRunner.query(`DROP TABLE IF EXISTS spaces`);
    await queryRunner.query(`DROP TYPE IF EXISTS space_role`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS "uuid-ossp"`);
  }
}
