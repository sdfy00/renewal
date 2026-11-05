import type { RenewalRequest } from '../../request/model/types';

export interface Resource {
  id: string;
  externalId: string;
  name: string;
  expiresOn: string;
  amountMinor: number;
  currency: string;
  activeRequest: RenewalRequest | null;
}
