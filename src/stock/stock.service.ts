import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { ProductsService } from '../products/products.service';
import { RedisService } from '../redis/redis.service';
import { CreateInboundDto, UpdateInboundDto } from './dto/stock-inbound.dto';
import { CreateOutboundDto, UpdateOutboundDto } from './dto/stock-outbound.dto';
import { INBOUND_STATUS, StockInbound } from './entities/stock-inbound.entity';
import {
  OUTBOUND_STATUS,
  StockOutbound,
} from './entities/stock-outbound.entity';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class StockService {
  constructor(
    @InjectRepository(StockInbound)
    private inboundRepository: Repository<StockInbound>,
    @InjectRepository(StockOutbound)
    private outboundRepository: Repository<StockOutbound>,
    private productsService: ProductsService,
    private redisService: RedisService,
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

  async createOutbound(userId: number, dto: CreateOutboundDto) {
    const product = await this.productsService.findById(dto.productNo);
    const outbound = this.outboundRepository.create({
      productNo: product.productNo,
      productName: product.name,
      quantity: dto.quantity,
      orderNo: dto.orderNo,
      status: OUTBOUND_STATUS.DRAFT,
      createdBy: userId,
    });
    return await this.outboundRepository.save(outbound);
  }

  async findMyOutbounds(userId: number) {
    return await this.outboundRepository.find({
      where: { createdBy: userId },
      order: { id: 'DESC' },
    });
  }

  async updateOutboundDraft(userId: number, dto: UpdateOutboundDto) {
    const outbound = await this.getOwnedOutbound(userId, dto.id);
    this.assertOutboundDraft(outbound);
    if (dto.quantity !== undefined) {
      outbound.quantity = dto.quantity;
    }
    if (dto.orderNo !== undefined) {
      outbound.orderNo = dto.orderNo;
    }
    return await this.outboundRepository.save(outbound);
  }

  async voidOutboundDraft(userId: number, id: number) {
    const outbound = await this.getOwnedOutbound(userId, id);
    this.assertOutboundDraft(outbound);
    outbound.status = OUTBOUND_STATUS.VOIDED;
    return await this.outboundRepository.save(outbound);
  }

  async confirmOutbound(userId: number, id: number) {
    const outbound = await this.getOwnedOutbound(userId, id);
    this.assertOutboundDraft(outbound);

    const token = randomUUID();
    let locked = false;
    for (let i = 0; i < 40; i++) {
      locked = await this.redisService.tryLock(outbound.productNo, token);
      if (locked) {
        break;
      }
      await sleep(50);
    }
    if (!locked) {
      throw new HttpException(
        `${outbound.productName}库存不足`,
        HttpStatus.CONFLICT,
      );
    }

    let deducted = 0;
    try {
      const product = await this.productsService.findById(outbound.productNo);
      await this.redisService.ensureStock(product.productNo, product.quantity);
      const result = await this.redisService.deduct(
        outbound.productNo,
        outbound.quantity,
      );
      if (!result.ok) {
        throw new HttpException(
          `${outbound.productName}库存不足`,
          HttpStatus.CONFLICT,
        );
      }
      deducted = outbound.quantity;

      try {
        return await this.dataSource.transaction(async (manager) => {
          const row = await manager.findOne(StockOutbound, {
            where: { id: outbound.id },
            lock: { mode: 'pessimistic_write' },
          });
          if (!row) {
            throw new HttpException('notFound', HttpStatus.NOT_FOUND);
          }
          if (row.status !== OUTBOUND_STATUS.DRAFT) {
            throw new HttpException('alreadyConfirmed', HttpStatus.CONFLICT);
          }
          await this.productsService.syncQuantity(
            row.productNo,
            result.remaining,
            manager,
          );
          row.status = OUTBOUND_STATUS.CONFIRMED;
          return await manager.save(row);
        });
      } catch (error) {
        await this.redisService.restore(outbound.productNo, deducted);
        throw error;
      }
    } finally {
      await this.redisService.unlock(outbound.productNo, token);
    }
  }

  private async getOwnedOutbound(userId: number, id: number) {
    const outbound = await this.outboundRepository.findOneBy({ id });
    if (!outbound) {
      throw new HttpException('notFound', HttpStatus.NOT_FOUND);
    }
    if (outbound.createdBy !== userId) {
      throw new HttpException('forbidden', HttpStatus.FORBIDDEN);
    }
    return outbound;
  }

  private assertOutboundDraft(outbound: StockOutbound) {
    if (outbound.status === OUTBOUND_STATUS.CONFIRMED) {
      throw new HttpException('confirmedReadOnly', HttpStatus.BAD_REQUEST);
    }
    if (outbound.status !== OUTBOUND_STATUS.DRAFT) {
      throw new HttpException('notDraft', HttpStatus.BAD_REQUEST);
    }
  }
}
