import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation, Unique } from 'typeorm';
import { User } from '../users/user.entity.js';
import { Space } from './space.entity.js';

export enum SpaceRole {
  INITIATOR = 'initiator',
  APPROVER = 'approver',
}

@Entity('user_space_roles')
@Unique(['userId', 'spaceId', 'role'])
export class UserSpaceRole {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: Relation<User>;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => Space, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'space_id' })
  space: Space;

  @Column({ name: 'space_id' })
  spaceId: string;

  @Column({ type: 'enum', enum: SpaceRole, enumName: 'space_role' })
  role: SpaceRole;
}
