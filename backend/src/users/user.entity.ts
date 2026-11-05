import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { UserSpaceRole } from '../spaces/user-space-role.entity.js';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  username: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => UserSpaceRole, (r) => r.user)
  spaceRoles: Relation<UserSpaceRole[]>;
}
