import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Space } from './space.entity.js';
import { UserSpaceRole } from './user-space-role.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Space, UserSpaceRole])],
  exports: [TypeOrmModule],
})
export class SpacesModule {}
