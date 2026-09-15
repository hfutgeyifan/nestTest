import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export const INBOUND_STATUS = {
  DRAFT: 'draft',
  CONFIRMED: 'confirmed',
  VOIDED: 'voided',
} as const;

export type InboundStatus =
  (typeof INBOUND_STATUS)[keyof typeof INBOUND_STATUS];

@Entity('stock_inbounds')
export class StockInbound {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  productNo!: string;

  @Column()
  productName!: string;

  @Column('int')
  quantity!: number;

  @Column({ default: '' })
  remark!: string;

  @Column({ default: INBOUND_STATUS.DRAFT })
  status!: InboundStatus;

  @Column('int')
  createdBy!: number;
}
