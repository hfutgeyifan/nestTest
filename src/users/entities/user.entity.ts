import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('users')
export class Users {
  @PrimaryGeneratedColumn()
  userId!: number;

  @Column({ unique: true })
  username!: string;

  @Column()
  password!: string;
}
