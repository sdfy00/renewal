export type RequestStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'rejected'
  | 'needs_attention';

export interface RenewalRequest {
  id: string;
  resourceId: string;
  spaceId: string;
  status: RequestStatus;
  createdBy: string;
  approvedBy: string | null;
  snapshotExpiresOn: string;
  newExpiresOn: string;
  amountMinor: number;
  currency: string;
  attemptCount: number;
  providerOperationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HistoryEntry {
  id: string;
  requestId: string;
  actorId: string | null;
  actorUsername: string | null;
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus;
  createdAt: string;
}
