import type { Request } from 'express';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../../users/users.service.js';
import { User } from '../../users/user.entity.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly usersService: UsersService,
    config: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) =>
          (req?.cookies as Record<string, string | undefined>)?.access_token ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: { sub: string; username: string }): Promise<User> {
    const user = await this.usersService.findById(payload.sub);
    if (!user) throw new UnauthorizedException();
    return user;
  }
}
