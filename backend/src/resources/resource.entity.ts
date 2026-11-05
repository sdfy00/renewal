import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Space } from '../spaces/space.entity.js';

@Entity('resources')
export class Resource {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'space_id' })
  spaceId: string;

  @ManyToOne(() => Space, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'space_id' })
  space: Space;

  @Column({ name: 'external_id', unique: true })
  externalId: string;

  @Column()
  name: string;

  /** Calendar date stored as 'YYYY-MM-DD', no time zone. */
  @Column({ name: 'expires_on', type: 'date' })
  expiresOn: string;

  @Column({ name: 'amount_minor', type: 'int' })
  amountMinor: number;

  @Column({ default: 'RUB', length: 3 })
  currency: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
