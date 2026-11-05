import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('spaces')
export class Space {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  slug: string;

  @Column({ name: 'display_name' })
  displayName: string;
}
