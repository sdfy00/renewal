import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { ProviderService } from './provider.service.js';

const configService = { get: (_key: string, def: unknown) => def } as unknown as ConfigService;

function makeProvider() {
  return new ProviderService(configService);
}

function mockFetch(response: Partial<Response>) {
  vi.mocked(fetch).mockResolvedValue(response as Response);
}

describe('ProviderService', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const payload = { resource_id: 'res-1', period_months: 1, amount_minor: 100, currency: 'RUB' };

  describe('submitRenewal', () => {
    it('returns outcome:ok with operation on HTTP 200', async () => {
      mockFetch({ ok: true, status: 200, json: async () => ({ operation_id: 'op-1', status: 'completed' }) });

      const result = await makeProvider().submitRenewal('key-1', payload);

      expect(result).toEqual({ outcome: 'ok', operation: { operation_id: 'op-1', status: 'completed' } });
    });

    it('returns outcome:lost on HTTP 503', async () => {
      mockFetch({ ok: false, status: 503, json: async () => ({}) });

      const result = await makeProvider().submitRenewal('key-1', payload);

      expect(result).toEqual({ outcome: 'lost' });
    });

    it('returns outcome:error with statusCode on non-503 HTTP error', async () => {
      mockFetch({ ok: false, status: 400, json: async () => ({}) });

      const result = await makeProvider().submitRenewal('key-1', payload);

      expect(result).toEqual({ outcome: 'error', statusCode: 400 });
    });

    it('returns outcome:error with statusCode 0 on network failure', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

      const result = await makeProvider().submitRenewal('key-1', payload);

      expect(result).toEqual({ outcome: 'error', statusCode: 0 });
    });

    it('sends the idempotency key in the Idempotency-Key header', async () => {
      mockFetch({ ok: true, status: 200, json: async () => ({ operation_id: 'op-1', status: 'completed' }) });

      await makeProvider().submitRenewal('my-idempotency-key', payload);

      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.stringContaining('/renewals'),
        expect.objectContaining({
          headers: expect.objectContaining({ 'Idempotency-Key': 'my-idempotency-key' }),
        }),
      );
    });

    it('POSTs the payload as JSON', async () => {
      mockFetch({ ok: true, status: 200, json: async () => ({ operation_id: 'op-1', status: 'completed' }) });

      await makeProvider().submitRenewal('key-1', payload);

      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(payload),
        }),
      );
    });
  });

  describe('checkRenewal', () => {
    it('returns the operation on HTTP 200', async () => {
      mockFetch({ ok: true, status: 200, json: async () => ({ operation_id: 'op-2', status: 'completed' }) });

      const result = await makeProvider().checkRenewal('key-1');

      expect(result).toEqual({ operation_id: 'op-2', status: 'completed' });
    });

    it('returns null on HTTP 404', async () => {
      mockFetch({ ok: false, status: 404, json: async () => ({}) });

      const result = await makeProvider().checkRenewal('key-1');

      expect(result).toBeNull();
    });

    it('returns null on network failure', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('timeout'));

      const result = await makeProvider().checkRenewal('key-1');

      expect(result).toBeNull();
    });

    it('GETs the correct URL using the idempotency key', async () => {
      mockFetch({ ok: true, status: 200, json: async () => ({ operation_id: 'op-1', status: 'completed' }) });

      await makeProvider().checkRenewal('my-key');

      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.stringContaining('/renewals/my-key'),
        expect.any(Object),
      );
    });
  });
});
