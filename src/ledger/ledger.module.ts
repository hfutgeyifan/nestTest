import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockLedger } from './stock-ledger.entity';
import { StockLedgerService } from './stock-ledger.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([StockLedger])],
  providers: [StockLedgerService],
  exports: [StockLedgerService],
})
export class LedgerModule {}
