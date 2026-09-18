import { Test, TestingModule } from '@nestjs/testing';
import { StockLedgerService } from '../ledger/stock-ledger.service';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  let service: ProductsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: StockLedgerService, useValue: { findByProduct: async () => [] } },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
