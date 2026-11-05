import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';

interface AttemptEntry {
  count: number;
  resetAt: number;
}

@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  private readonly attempts = new Map<string, AttemptEntry>();
  private readonly maxAttempts = 5;
  private readonly windowMs = 60_000;

  clearAttempts(ip: string): void {
    this.attempts.delete(ip);
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const ip = req.ip ?? 'unknown';
    const now = Date.now();

    // Evict expired entries to prevent unbounded memory growth
    for (const [key, val] of this.attempts) {
      if (val.resetAt < now) this.attempts.delete(key);
    }

    const entry = this.attempts.get(ip);

    if (!entry || entry.resetAt < now) {
      this.attempts.set(ip, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    if (entry.count >= this.maxAttempts) {
      throw new HttpException('Too many login attempts, try again later', HttpStatus.TOO_MANY_REQUESTS);
    }

    entry.count++;
    return true;
  }
}
