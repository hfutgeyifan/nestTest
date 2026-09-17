import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('product_locations')
export class ProductLocation {
  @PrimaryColumn()
  productNo!: string;

  @PrimaryColumn()
  shelfName!: string;

  @Column('int')
  quantity!: number;
}
