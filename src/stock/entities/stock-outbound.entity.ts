import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export const OUTBOUND_STATUS = {
  DRAFT: 'draft',
  CONFIRMED: 'confirmed',
  VOIDED: 'voided',
} as const;

export type OutboundStatus =
  (typeof OUTBOUND_STATUS)[keyof typeof OUTBOUND_STATUS];

@Entity('stock_outbounds')
export class StockOutbound {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  productNo!: string;

  @Column()
  productName!: string;

  @Column('int')
  quantity!: number;

  @Column()
  orderNo!: string;

  @Column({ default: OUTBOUND_STATUS.DRAFT })
  status!: OutboundStatus;

  @Column('int')
  createdBy!: number;
}
