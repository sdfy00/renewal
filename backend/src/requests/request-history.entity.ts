import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { RenewalRequest, RequestStatus } from './renewal-request.entity.js';
import { User } from '../users/user.entity.js';

@Entity('request_history')
export class RequestHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'request_id' })
  requestId: string;

  @ManyToOne(() => RenewalRequest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_id' })
  request: RenewalRequest;

  /** null for system-initiated transitions (e.g. background worker). */
  @Column({ name: 'actor_id', nullable: true, type: 'uuid' })
  actorId: string | null;

  @ManyToOne(() => User, { nullable: true, eager: false })
  @JoinColumn({ name: 'actor_id' })
  actor: Relation<User> | null;

  @Column({ name: 'from_status', type: 'enum', enum: RequestStatus, enumName: 'request_status', nullable: true })
  fromStatus: RequestStatus | null;

  @Column({ name: 'to_status', type: 'enum', enum: RequestStatus, enumName: 'request_status' })
  toStatus: RequestStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
