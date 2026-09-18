import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import type { StockChangedEvent } from '../kafka/stock-changed.event';
import { StockLedger } from './stock-ledger.entity';

@Injectable()
export class StockLedgerService {
  private readonly logger = new Logger(StockLedgerService.name);

  constructor(
    @InjectRepository(StockLedger)
    private readonly ledgerRepository: Repository<StockLedger>,
  ) {}

  async record(event: StockChangedEvent) {
    try {
      await this.ledgerRepository.insert({
        eventId: event.eventId,
        type: event.type,
        userId: event.userId,
        username: event.username,
        productNo: event.productNo,
        productName: event.productName,
        quantity: event.quantity,
        shelfName: event.shelfName,
        documentId: event.documentId,
        orderNo: event.orderNo ?? '',
        occurredAt: new Date(event.occurredAt),
      });
    } catch (error) {
      if (this.isDuplicateEvent(error)) {
        this.logger.warn(`重复事件已忽略 ${event.eventId}`);
        return;
      }
      throw error;
    }
  }

  async findByProduct(productNo: string) {
    return await this.ledgerRepository.find({
      where: { productNo },
      order: { occurredAt: 'ASC', id: 'ASC' },
    });
  }

  private isDuplicateEvent(error: unknown) {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }
    const driver = error.driverError as { errno?: number; code?: string };
    return driver.errno === 1062 || driver.code === 'ER_DUP_ENTRY';
  }
}
