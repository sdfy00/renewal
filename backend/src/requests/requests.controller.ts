import { Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { SpaceGuard } from '../auth/guards/space.guard.js';
import type { User } from '../users/user.entity.js';
import { RequestsService } from './requests.service.js';

@ApiTags('requests')
@ApiCookieAuth('access_token')
@Controller()
@UseGuards(JwtAuthGuard)
export class RequestsController {
  constructor(private readonly service: RequestsService) {}

  @ApiOperation({ summary: 'Create a renewal request for a resource (initiator role required)' })
  @ApiParam({ name: 'slug', description: 'Space slug' })
  @ApiParam({ name: 'resourceId', description: 'Resource UUID' })
  @ApiResponse({ status: 201, description: 'Request created with status pending' })
  @ApiResponse({ status: 403, description: 'Initiator role required' })
  @ApiResponse({ status: 409, description: 'Active request already exists for this resource' })
  @Post('spaces/:slug/resources/:resourceId/requests')
  @UseGuards(SpaceGuard)
  create(
    @Param('slug') slug: string,
    @Param('resourceId') resourceId: string,
    @CurrentUser() user: User,
  ) {
    return this.service.createRequest(slug, resourceId, user);
  }

  @ApiOperation({ summary: 'List all renewal requests in a space' })
  @ApiParam({ name: 'slug', description: 'Space slug' })
  @ApiResponse({ status: 200, description: 'Array of renewal requests' })
  @Get('spaces/:slug/requests')
  @UseGuards(SpaceGuard)
  list(@Param('slug') slug: string) {
    return this.service.listBySpace(slug);
  }

  @ApiOperation({ summary: 'Approve a pending request (approver role required, cannot approve own)' })
  @ApiParam({ name: 'id', description: 'Request UUID' })
  @ApiResponse({ status: 200, description: 'Request transitioned to in_progress' })
  @ApiResponse({ status: 403, description: 'Approver role required or approving own request' })
  @ApiResponse({ status: 409, description: 'Request is not in pending status' })
  @Patch('requests/:id/approve')
  approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.service.approveRequest(id, user);
  }

  @ApiOperation({ summary: 'Reject a pending request (approver role required, cannot reject own)' })
  @ApiParam({ name: 'id', description: 'Request UUID' })
  @ApiResponse({ status: 200, description: 'Request transitioned to rejected' })
  @ApiResponse({ status: 403, description: 'Approver role required or rejecting own request' })
  @ApiResponse({ status: 409, description: 'Request is not in pending status' })
  @Patch('requests/:id/reject')
  reject(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.service.rejectRequest(id, user);
  }

  @ApiOperation({ summary: 'Retry a needs_attention request, resetting attempt counter (approver only)' })
  @ApiParam({ name: 'id', description: 'Request UUID' })
  @ApiResponse({ status: 200, description: 'Request transitioned back to in_progress' })
  @ApiResponse({ status: 409, description: 'Request is not in needs_attention status' })
  @Patch('requests/:id/retry')
  retry(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.service.retryRequest(id, user);
  }

  @ApiOperation({ summary: 'Get the state-transition history of a request' })
  @ApiParam({ name: 'id', description: 'Request UUID' })
  @ApiResponse({ status: 200, description: 'Array of history entries with actor username' })
  @ApiResponse({ status: 403, description: 'No role in the request space' })
  @Get('requests/:id/history')
  history(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.service.getHistory(id, user);
  }
}
