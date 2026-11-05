import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module.js';
import { RequestHistory } from './requests/request-history.entity.js';
import { RenewalRequest } from './requests/renewal-request.entity.js';
import { RequestsModule } from './requests/requests.module.js';
import { Resource } from './resources/resource.entity.js';
import { ResourcesModule } from './resources/resources.module.js';
import { Space } from './spaces/space.entity.js';
import { SpacesModule } from './spaces/spaces.module.js';
import { UserSpaceRole } from './spaces/user-space-role.entity.js';
import { User } from './users/user.entity.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        database: config.get('DB_NAME', 'renewals'),
        username: config.get('DB_USER', 'postgres'),
        password: config.get('DB_PASSWORD', 'postgres'),
        entities: [User, Space, UserSpaceRole, Resource, RenewalRequest, RequestHistory],
        migrations: [],
        synchronize: false,
      }),
    }),
    ScheduleModule.forRoot(),
    UsersModule,
    SpacesModule,
    AuthModule,
    ResourcesModule,
    RequestsModule,
  ],
})
export class AppModule {}
