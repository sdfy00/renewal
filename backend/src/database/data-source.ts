import 'reflect-metadata';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { DataSource } from 'typeorm';
import { RequestHistory } from '../requests/request-history.entity.js';
import { RenewalRequest } from '../requests/renewal-request.entity.js';
import { Resource } from '../resources/resource.entity.js';
import { Space } from '../spaces/space.entity.js';
import { UserSpaceRole } from '../spaces/user-space-role.entity.js';
import { User } from '../users/user.entity.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME ?? 'renewals',
  username: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  entities: [User, Space, UserSpaceRole, Resource, RenewalRequest, RequestHistory],
  migrations: [join(__dirname, '../migrations/*.{ts,js}')],
  migrationsTableName: 'typeorm_migrations',
});
