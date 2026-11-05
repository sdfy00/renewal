import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ProviderOperation {
  operation_id: string;
  status: string;
}

export type SubmitResult =
  | { outcome: 'ok'; operation: ProviderOperation }
  | { outcome: 'lost' }
  | { outcome: 'error'; statusCode: number };

@Injectable()
export class ProviderService {
  private readonly logger = new Logger(ProviderService.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    this.baseUrl = config.get('PROVIDER_URL', 'http://localhost:8091');
    this.timeoutMs = config.get<number>('PROVIDER_REQUEST_TIMEOUT_MS', 15_000);
  }

  async submitRenewal(
    idempotencyKey: string,
    payload: {
      resource_id: string;
      period_months: number;
      amount_minor: number;
      currency: string;
    },
  ): Promise<SubmitResult> {
    try {
      const res = await fetch(`${this.baseUrl}/renewals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (res.ok) {
        const operation = (await res.json()) as ProviderOperation;
        return { outcome: 'ok', operation };
      }
      if (res.status === 503) {
        return { outcome: 'lost' };
      }
      return { outcome: 'error', statusCode: res.status };
    } catch (err) {
      this.logger.warn(`submitRenewal network error: ${String(err)}`);
      return { outcome: 'error', statusCode: 0 };
    }
  }

  async checkRenewal(idempotencyKey: string): Promise<ProviderOperation | null> {
    try {
      const res = await fetch(
        `${this.baseUrl}/renewals/${encodeURIComponent(idempotencyKey)}`,
        { signal: AbortSignal.timeout(this.timeoutMs) },
      );
      if (res.ok) {
        return (await res.json()) as ProviderOperation;
      }
      return null;
    } catch (err) {
      this.logger.warn(`checkRenewal network error: ${String(err)}`);
      return null;
    }
  }
}
