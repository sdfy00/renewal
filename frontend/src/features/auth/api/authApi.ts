import { request } from '@/shared/api/client';
import type { AuthUser } from '@/entities/user/model/types';

export function loginApi(username: string, password: string) {
  return request<AuthUser>('POST', '/auth/login', { username, password });
}

export function logoutApi() {
  return request<{ ok: boolean }>('POST', '/auth/logout');
}
