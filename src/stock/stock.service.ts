import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Products } from '../products/entities/products.entity';
import { ProductsService } from '../products/products.service';
import { KafkaService } from '../kafka/kafka.service';
import type { StockChangedEvent } from '../kafka/stock-changed.event';
import { RedisService } from '../redis/redis.service';
import {
  ConfirmInboundDto,
  CreateInboundDto,
  UpdateInboundDto,
} from './dto/stock-inbound.dto';
import {
  ConfirmOutboundDto,
  CreateOutboundDto,
  UpdateOutboundDto,
} from './dto/stock-outbound.dto';
import { TransferDto } from './dto/stock-transfer.dto';
import { ProductLocation } from './entities/product-location.entity';
import { Shelf } from './entities/shelf.entity';
import { INBOUND_STATUS, StockInbound } from './entities/stock-inbound.entity';
import {
  OUTBOUND_STATUS,
  StockOutbound,
} from './entities/stock-outbound.entity';

const DEFAULT_SHELVES = ['A区-01', 'B区-03'];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class StockService implements OnModuleInit {
  private readonly logger = new Logger(StockService.name);

  constructor(
    @InjectRepository(StockInbound)
    private inboundRepository: Repository<StockInbound>,
    @InjectRepository(StockOutbound)
    private outboundRepository: Repository<StockOutbound>,
    @InjectRepository(Shelf)
    private shelfRepository: Repository<Shelf>,
    @InjectRepository(ProductLocation)
    private locationRepository: Repository<ProductLocation>,
    private productsService: ProductsService,
    private redisService: RedisService,
    private kafkaService: KafkaService,
    private dataSource: DataSource,
  ) {}

  async onModuleInit() {
    for (const name of DEFAULT_SHELVES) {
      const exists = await this.shelfRepository.findOneBy({ name });
      if (!exists) {
        await this.shelfRepository.save({ name, remark: '' });
      }
    }
  }

  listShelves() {
    return this.shelfRepository.find({ order: { name: 'ASC' } });
  }

  async locationsByProduct(productNo: string) {
    const product = await this.productsService.findById(productNo);
    const shelves = await this.locationRepository.find({
      where: { productNo },
      order: { shelfName: 'ASC' },
    });
    const total = shelves.reduce((sum, row) => sum + row.quantity, 0);
    return {
      productNo: product.productNo,
      productName: product.name,
      quantity: product.quantity,
      shelves,
      total,
    };
  }

  async locationsByShelf(shelfName: string) {
    await this.assertShelf(shelfName);
    const rows = await this.locationRepository.find({
      where: { shelfName },
      order: { productNo: 'ASC' },
    });
    const items: {
      productNo: string;
      productName: string;
      quantity: number;
    }[] = [];
    for (const row of rows) {
      if (row.quantity <= 0) continue;
      const product = await this.productsService.findById(row.productNo);
      items.push({
        productNo: row.productNo,
        productName: product.name,
        quantity: row.quantity,
      });
    }
    return { shelfName, items };
  }

  async listProductLocations() {
    const products = await this.dataSource.getRepository(Products).find({
      order: { productNo: 'ASC' },
    });
    const result: {
      productNo: string;
      productName: string;
      quantity: number;
      shelves: ProductLocation[];
      total: number;
    }[] = [];
    for (const product of products) {
      const shelves = await this.locationRepository.find({
        where: { productNo: product.productNo },
        order: { shelfName: 'ASC' },
      });
      result.push({
        productNo: product.productNo,
        productName: product.name,
        quantity: product.quantity,
        shelves,
        total: shelves.reduce((sum, row) => sum + row.quantity, 0),
      });
    }
    return result;
  }

  async create(userId: number, dto: CreateInboundDto) {
    const product = await this.productsService.findById(dto.productNo);
    const shelfName = dto.shelfName?.trim() ?? '';
    if (shelfName) {
      await this.assertShelf(shelfName);
    }
    const inbound = new StockInbound();
    inbound.productNo = product.productNo;
    inbound.productName = product.name;
    inbound.quantity = dto.quantity;
    inbound.shelfName = shelfName;
    inbound.remark = dto.remark ?? '';
    inbound.status = INBOUND_STATUS.DRAFT;
    inbound.createdBy = userId;
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
    if (dto.shelfName !== undefined) {
      const shelfName = dto.shelfName.trim();
      if (shelfName) {
        await this.assertShelf(shelfName);
      }
      inbound.shelfName = shelfName;
    }
    return await this.inboundRepository.save(inbound);
  }

  async voidDraft(userId: number, id: number) {
    const inbound = await this.getOwned(userId, id);
    this.assertDraft(inbound);
    inbound.status = INBOUND_STATUS.VOIDED;
    return await this.inboundRepository.save(inbound);
  }

  async confirm(userId: number, username: string, dto: ConfirmInboundDto) {
    const shelfName = dto.shelfName.trim();
    await this.assertShelf(shelfName);

    const saved = await this.dataSource.transaction(async (manager) => {
      const inbound = await manager.findOne(StockInbound, {
        where: { id: dto.id },
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
      await this.addLocationQty(
        manager,
        inbound.productNo,
        shelfName,
        inbound.quantity,
      );
      await this.redisService.incrShelf(
        inbound.productNo,
        shelfName,
        inbound.quantity,
      );
      inbound.shelfName = shelfName;
      inbound.status = INBOUND_STATUS.CONFIRMED;
      return await manager.save(inbound);
    });
    this.publishStockChanged({
      eventId: randomUUID(),
      type: 'inbound',
      userId,
      username,
      productNo: saved.productNo,
      productName: saved.productName,
      quantity: saved.quantity,
      shelfName: saved.shelfName,
      documentId: saved.id,
      orderNo: '',
      occurredAt: new Date().toISOString(),
    });
    return saved;
  }

  async createOutbound(userId: number, dto: CreateOutboundDto) {
    const product = await this.productsService.findById(dto.productNo);
    const shelfName = dto.shelfName?.trim() ?? '';
    if (shelfName) {
      await this.assertShelf(shelfName);
    }
    const outbound = this.outboundRepository.create({
      productNo: product.productNo,
      productName: product.name,
      quantity: dto.quantity,
      orderNo: dto.orderNo,
      shelfName,
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
    if (dto.shelfName !== undefined) {
      const shelfName = dto.shelfName.trim();
      if (shelfName) {
        await this.assertShelf(shelfName);
      }
      outbound.shelfName = shelfName;
    }
    return await this.outboundRepository.save(outbound);
  }

  async voidOutboundDraft(userId: number, id: number) {
    const outbound = await this.getOwnedOutbound(userId, id);
    this.assertOutboundDraft(outbound);
    outbound.status = OUTBOUND_STATUS.VOIDED;
    return await this.outboundRepository.save(outbound);
  }

  async confirmOutbound(
    userId: number,
    username: string,
    dto: ConfirmOutboundDto,
  ) {
    const outbound = await this.getOwnedOutbound(userId, dto.id);
    this.assertOutboundDraft(outbound);
    const shelfName = dto.shelfName.trim();
    await this.assertShelf(shelfName);

    const token = randomUUID();
    const locked = await this.acquireLock(outbound.productNo, token, 40);
    if (!locked) {
      throw new HttpException(
        `${outbound.productName}库存不足`,
        HttpStatus.CONFLICT,
      );
    }

    let deducted = 0;
    try {
      const locations = await this.locationRepository.findBy({
        productNo: outbound.productNo,
      });
      await this.redisService.ensureHash(outbound.productNo, locations);
      const result = await this.redisService.deductFromShelf(
        outbound.productNo,
        shelfName,
        outbound.quantity,
      );
      if (!result.ok) {
        throw new HttpException(`${shelfName}库存不足`, HttpStatus.CONFLICT);
      }
      deducted = outbound.quantity;

      try {
        const hash = await this.redisService.getHash(outbound.productNo);
        const remaining = this.redisService.hashTotal(hash);
        const saved = await this.dataSource.transaction(async (manager) => {
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
            remaining,
            manager,
          );
          await this.subLocationQty(
            manager,
            row.productNo,
            shelfName,
            row.quantity,
          );
          row.shelfName = shelfName;
          row.status = OUTBOUND_STATUS.CONFIRMED;
          return await manager.save(row);
        });
        this.publishStockChanged({
          eventId: randomUUID(),
          type: 'outbound',
          userId,
          username,
          productNo: saved.productNo,
          productName: saved.productName,
          quantity: -saved.quantity,
          shelfName: saved.shelfName,
          documentId: saved.id,
          orderNo: saved.orderNo,
          occurredAt: new Date().toISOString(),
        });
        return saved;
      } catch (error) {
        await this.redisService.restoreShelf(
          outbound.productNo,
          shelfName,
          deducted,
        );
        throw error;
      }
    } finally {
      await this.redisService.unlock(outbound.productNo, token);
    }
  }

  async transfer(dto: TransferDto) {
    if (dto.fromShelf === dto.toShelf) {
      throw new HttpException('不能搬到同一货架', HttpStatus.BAD_REQUEST);
    }
    await this.assertShelf(dto.fromShelf);
    await this.assertShelf(dto.toShelf);
    const product = await this.productsService.findById(dto.productNo);

    const token = randomUUID();
    const locked = await this.redisService.tryLock(product.productNo, token);
    if (!locked) {
      throw new HttpException('移架冲突，请稍后重试', HttpStatus.CONFLICT);
    }

    let moved = false;
    try {
      const locations = await this.locationRepository.findBy({
        productNo: product.productNo,
      });
      await this.redisService.ensureHash(product.productNo, locations);
      moved = await this.redisService.moveShelf(
        product.productNo,
        dto.fromShelf,
        dto.toShelf,
        dto.quantity,
      );
      if (!moved) {
        throw new HttpException(
          `${dto.fromShelf}库存不足`,
          HttpStatus.CONFLICT,
        );
      }

      try {
        await this.dataSource.transaction(async (manager) => {
          await this.subLocationQty(
            manager,
            product.productNo,
            dto.fromShelf,
            dto.quantity,
          );
          await this.addLocationQty(
            manager,
            product.productNo,
            dto.toShelf,
            dto.quantity,
          );
        });
      } catch (error) {
        await this.redisService.moveShelf(
          product.productNo,
          dto.toShelf,
          dto.fromShelf,
          dto.quantity,
        );
        throw error;
      }

      return this.locationsByProduct(product.productNo);
    } finally {
      await this.redisService.unlock(product.productNo, token);
    }
  }

  private publishStockChanged(event: StockChangedEvent) {
    void this.kafkaService.emitStockChanged(event).catch((error: unknown) => {
      this.logger.error(
        `发送 stock.changed 失败 ${event.eventId}`,
        error instanceof Error ? error.stack : error,
      );
    });
  }

  private async acquireLock(
    productNo: string,
    token: string,
    attempts: number,
  ) {
    for (let i = 0; i < attempts; i++) {
      if (await this.redisService.tryLock(productNo, token)) {
        return true;
      }
      await sleep(50);
    }
    return false;
  }

  private async assertShelf(name: string) {
    const shelf = await this.shelfRepository.findOneBy({ name });
    if (!shelf) {
      throw new HttpException(`货架不存在：${name}`, HttpStatus.BAD_REQUEST);
    }
  }

  private async addLocationQty(
    manager: EntityManager,
    productNo: string,
    shelfName: string,
    quantity: number,
  ) {
    const repo = manager.getRepository(ProductLocation);
    const row = await repo.findOne({
      where: { productNo, shelfName },
      lock: { mode: 'pessimistic_write' },
    });
    if (!row) {
      return await repo.save(repo.create({ productNo, shelfName, quantity }));
    }
    row.quantity += quantity;
    return await repo.save(row);
  }

  private async subLocationQty(
    manager: EntityManager,
    productNo: string,
    shelfName: string,
    quantity: number,
  ) {
    const repo = manager.getRepository(ProductLocation);
    const row = await repo.findOne({
      where: { productNo, shelfName },
      lock: { mode: 'pessimistic_write' },
    });
    if (!row || row.quantity < quantity) {
      throw new HttpException(`${shelfName}库存不足`, HttpStatus.CONFLICT);
    }
    row.quantity -= quantity;
    if (row.quantity === 0) {
      await repo.remove(row);
      return;
    }
    await repo.save(row);
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
