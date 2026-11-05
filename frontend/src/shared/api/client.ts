const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    if (res.status === 401) {
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }
    const err = await res.json().catch(() => ({ message: res.statusText })) as { message?: string | string[] };
    const msg = Array.isArray(err.message) ? err.message.join('; ') : (err.message ?? res.statusText);
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}
