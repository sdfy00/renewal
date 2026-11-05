import { Body, Controller, HttpCode, Post, Request, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest, Response } from 'express';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { LoginRateLimitGuard } from './guards/login-rate-limit.guard.js';
import { User } from '../users/user.entity.js';

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly rateLimitGuard: LoginRateLimitGuard,
  ) {}

  @ApiOperation({ summary: 'Log in and receive an HttpOnly session cookie' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 201, description: 'Login successful - sets access_token cookie' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 429, description: 'Too many login attempts' })
  @UseGuards(LoginRateLimitGuard, AuthGuard('local'))
  @Post('login')
  login(
    @Body() _dto: LoginDto,
    @Request() req: ExpressRequest & { user: User },
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, user } = this.authService.login(req.user);
    res.cookie('access_token', token, COOKIE_OPTS);
    this.rateLimitGuard.clearAttempts(req.ip ?? 'unknown');
    return user;
  }

  @ApiOperation({ summary: 'Log out and clear the session cookie' })
  @ApiCookieAuth('access_token')
  @ApiResponse({ status: 200, description: 'Logged out' })
  @HttpCode(200)
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('access_token');
    return { ok: true };
  }
}
