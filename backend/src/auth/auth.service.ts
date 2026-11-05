import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service.js';
import { User } from '../users/user.entity.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(username: string, password: string): Promise<User | null> {
    const user = await this.usersService.findByUsername(username);
    // Always run bcrypt.compare to avoid timing-based user enumeration.
    const hash = user?.passwordHash ?? '$2b$10$invalidPlaceholderXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
    const valid = await bcrypt.compare(password, hash).catch(() => false);
    return valid && user ? user : null;
  }

  login(user: User): { token: string; user: { id: string; username: string; spaceRoles: { spaceId: string; spaceSlug: string | undefined; role: string }[] } } {
    const payload = { sub: user.id, username: user.username };
    return {
      token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        username: user.username,
        spaceRoles: (user.spaceRoles ?? []).map((r) => ({
          spaceId: r.spaceId,
          spaceSlug: r.space?.slug,
          role: r.role,
        })),
      },
    };
  }
}
