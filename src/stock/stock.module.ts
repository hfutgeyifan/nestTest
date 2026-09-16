import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsModule } from '../products/products.module';
import { StockInbound } from './entities/stock-inbound.entity';
import { StockOutbound } from './entities/stock-outbound.entity';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([StockInbound, StockOutbound]),
    ProductsModule,
  ],
  controllers: [StockController],
  providers: [StockService],
})
export class StockModule {}
