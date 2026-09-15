import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('products')
export class Products {
  @PrimaryColumn()
  productNo!: string;

  @Column()
  name!: string;

  @Column('int')
  quantity!: number;
}
