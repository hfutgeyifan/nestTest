import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';
import type { StockChangeType } from '../kafka/stock-changed.event';

@Entity('stock_ledgers')
@Unique(['eventId'])
export class StockLedger {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  eventId!: string;

  @Column()
  type!: StockChangeType;

  @Column('int')
  userId!: number;

  @Column()
  username!: string;

  @Column()
  productNo!: string;

  @Column()
  productName!: string;

  /** 入库为正、出库为负，加总应对上当前剩余数量 */
  @Column('int')
  quantity!: number;

  @Column()
  shelfName!: string;

  @Column('int')
  documentId!: number;

  @Column({ default: '' })
  orderNo!: string;

  @Column()
  occurredAt!: Date;
}
