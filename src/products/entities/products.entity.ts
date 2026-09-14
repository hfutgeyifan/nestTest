import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('products')
export class Products {
  @PrimaryGeneratedColumn()
  productNo!: string;

  @Column()
  name!: string;

  @Column('int')
  quantity!: number;
}
