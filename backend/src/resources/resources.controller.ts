import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { SpaceGuard } from '../auth/guards/space.guard.js';
import { ResourcesService } from './resources.service.js';

@ApiTags('resources')
@ApiCookieAuth('access_token')
@Controller('spaces/:slug/resources')
@UseGuards(JwtAuthGuard, SpaceGuard)
export class ResourcesController {
  constructor(private readonly service: ResourcesService) {}

  @ApiOperation({ summary: 'List all resources in a space with their active request (if any)' })
  @ApiParam({ name: 'slug', description: 'Space slug' })
  @ApiResponse({ status: 200, description: 'Array of resources, each with activeRequest: RenewalRequest | null' })
  @ApiResponse({ status: 403, description: 'No role in this space' })
  @Get()
  list(@Param('slug') slug: string) {
    return this.service.listBySpace(slug);
  }
}
