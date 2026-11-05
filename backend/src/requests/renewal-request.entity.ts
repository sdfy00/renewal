import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Resource } from '../resources/resource.entity.js';

export enum RequestStatus {
  PENDING = 'pending',
  REJECTED = 'rejected',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  NEEDS_ATTENTION = 'needs_attention',
}

export const ACTIVE_STATUSES = [
  RequestStatus.PENDING,
  RequestStatus.IN_PROGRESS,
  RequestStatus.NEEDS_ATTENTION,
];

@Entity('renewal_requests')
export class RenewalRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'resource_id' })
  resourceId: string;

  @ManyToOne(() => Resource, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resource_id' })
  resource: Resource;

  /** Denormalized for fast access-control checks without joining resources. */
  @Column({ name: 'space_id' })
  spaceId: string;

  @Column({ type: 'enum', enum: RequestStatus, enumName: 'request_status' })
  status: RequestStatus;

  @Column({ name: 'created_by' })
  createdBy: string;

  @Column({ name: 'approved_by', nullable: true, type: 'uuid' })
  approvedBy: string | null;

  /** Snapshot of resource.expiresOn at request creation time. */
  @Column({ name: 'snapshot_expires_on', type: 'date' })
  snapshotExpiresOn: string;

  /** snapshotExpiresOn + 30 calendar days, fixed at creation. */
  @Column({ name: 'new_expires_on', type: 'date' })
  newExpiresOn: string;

  @Column({ name: 'amount_minor', type: 'int' })
  amountMinor: number;

  @Column({ default: 'RUB', length: 3 })
  currency: string;

  /** Number of POST /renewals attempts. Capped at 3, then → needs_attention. */
  @Column({ name: 'attempt_count', type: 'int', default: 0 })
  attemptCount: number;

  @Column({ name: 'provider_operation_id', nullable: true, type: 'varchar' })
  providerOperationId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
