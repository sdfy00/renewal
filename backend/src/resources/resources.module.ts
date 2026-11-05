import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RenewalRequest } from '../requests/renewal-request.entity.js';
import { ResourcesController } from './resources.controller.js';
import { Resource } from './resource.entity.js';
import { ResourcesService } from './resources.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Resource, RenewalRequest])],
  controllers: [ResourcesController],
  providers: [ResourcesService],
  exports: [TypeOrmModule, ResourcesService],
})
export class ResourcesModule {}
