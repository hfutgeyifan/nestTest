import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ProductsService } from '../products/products.service';
import { CreateInboundDto, UpdateInboundDto } from './dto/stock-inbound.dto';
import { INBOUND_STATUS, StockInbound } from './entities/stock-inbound.entity';

@Injectable()
export class StockService {
  constructor(
    @InjectRepository(StockInbound)
    private inboundRepository: Repository<StockInbound>,
    private productsService: ProductsService,
    private dataSource: DataSource,
  ) {}

  async create(userId: number, dto: CreateInboundDto) {
    const product = await this.productsService.findById(dto.productNo);
    const inbound = this.inboundRepository.create({
      productNo: product.productNo,
      productName: product.name,
      quantity: dto.quantity,
      remark: dto.remark ?? '',
      status: INBOUND_STATUS.DRAFT,
      createdBy: userId,
    });
    return await this.inboundRepository.save(inbound);
  }

  async findMine(userId: number) {
    return await this.inboundRepository.find({
      where: { createdBy: userId },
      order: { id: 'DESC' },
    });
  }

  async updateDraft(userId: number, dto: UpdateInboundDto) {
    const inbound = await this.getOwned(userId, dto.id);
    this.assertDraft(inbound);

    if (dto.quantity !== undefined) {
      inbound.quantity = dto.quantity;
    }
    if (dto.remark !== undefined) {
      inbound.remark = dto.remark;
    }
    return await this.inboundRepository.save(inbound);
  }

  async voidDraft(userId: number, id: number) {
    const inbound = await this.getOwned(userId, id);
    this.assertDraft(inbound);
    inbound.status = INBOUND_STATUS.VOIDED;
    return await this.inboundRepository.save(inbound);
  }

  async confirm(userId: number, id: number) {
    return await this.dataSource.transaction(async (manager) => {
      const inbound = await manager.findOne(StockInbound, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!inbound) {
        throw new HttpException('notFound', HttpStatus.NOT_FOUND);
      }
      if (inbound.createdBy !== userId) {
        throw new HttpException('forbidden', HttpStatus.FORBIDDEN);
      }
      if (inbound.status === INBOUND_STATUS.CONFIRMED) {
        throw new HttpException('alreadyConfirmed', HttpStatus.CONFLICT);
      }
      if (inbound.status !== INBOUND_STATUS.DRAFT) {
        throw new HttpException('notDraft', HttpStatus.BAD_REQUEST);
      }

      await this.productsService.increaseQuantity(
        inbound.productNo,
        inbound.quantity,
        manager,
      );
      inbound.status = INBOUND_STATUS.CONFIRMED;
      return await manager.save(inbound);
    });
  }

  private async getOwned(userId: number, id: number) {
    const inbound = await this.inboundRepository.findOneBy({ id });
    if (!inbound) {
      throw new HttpException('notFound', HttpStatus.NOT_FOUND);
    }
    if (inbound.createdBy !== userId) {
      throw new HttpException('forbidden', HttpStatus.FORBIDDEN);
    }
    return inbound;
  }

  private assertDraft(inbound: StockInbound) {
    if (inbound.status === INBOUND_STATUS.CONFIRMED) {
      throw new HttpException('confirmedReadOnly', HttpStatus.BAD_REQUEST);
    }
    if (inbound.status !== INBOUND_STATUS.DRAFT) {
      throw new HttpException('notDraft', HttpStatus.BAD_REQUEST);
    }
  }
}
