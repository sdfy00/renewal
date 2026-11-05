import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { User } from '../../users/user.entity.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User => {
    const req = ctx.switchToHttp().getRequest<Request & { user: User }>();
    return req.user;
  },
);
