import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('shelves')
export class Shelf {
  @PrimaryColumn()
  name!: string;

  @Column({ default: '' })
  remark!: string;
}
