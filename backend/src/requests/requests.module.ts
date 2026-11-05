import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProviderModule } from '../provider/provider.module.js';
import { Resource } from '../resources/resource.entity.js';
import { RequestsController } from './requests.controller.js';
import { RequestHistory } from './request-history.entity.js';
import { RenewalRequest } from './renewal-request.entity.js';
import { RequestsService } from './requests.service.js';
import { RenewalWorkerService } from './renewal.worker.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([RenewalRequest, RequestHistory, Resource]),
    ProviderModule,
  ],
  controllers: [RequestsController],
  providers: [RequestsService, RenewalWorkerService],
  exports: [TypeOrmModule, RequestsService],
})
export class RequestsModule {}
