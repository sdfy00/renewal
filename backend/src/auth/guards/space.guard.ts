import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { User } from '../../users/user.entity.js';

@Injectable()
export class SpaceGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { user: User }>();
    const slug: string | undefined = (req.params as Record<string, string>)['slug'];
    if (!slug) return false;

    const hasAccess = req.user.spaceRoles?.some((r) => r.space?.slug === slug) ?? false;
    if (!hasAccess) throw new ForbiddenException('No access to this space');
    return true;
  }
}
