import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createClient, type RedisClientType } from 'redis';

/**
 * 从指定货架原子扣库存。Hash key=stock:HEAR-BLACK，field=A区-01。
 * 只看这一架，不够不会去别的架偷。
 * 成功返回「该架剩余+1」，失败返回 0。
 */
const DEDUCT_LUA = `
local current = tonumber(redis.call('HGET', KEYS[1], ARGV[1]))
if current == nil then
  return 0
end
local qty = tonumber(ARGV[2])
if current < qty then
  return 0
end
local remaining = current - qty
if remaining == 0 then
  redis.call('HDEL', KEYS[1], ARGV[1])
else
  redis.call('HSET', KEYS[1], ARGV[1], remaining)
end
return remaining + 1
`;

/**
 * 同一 Hash 内移架：A区-01 减、B区-03 加，中间不会被插入。
 * 来源架不够返回 0。
 */
const MOVE_LUA = `
if ARGV[1] == ARGV[2] then
  return 0
end
local current = tonumber(redis.call('HGET', KEYS[1], ARGV[1]))
if current == nil then
  return 0
end
local qty = tonumber(ARGV[3])
if current < qty then
  return 0
end
local fromLeft = current - qty
if fromLeft == 0 then
  redis.call('HDEL', KEYS[1], ARGV[1])
else
  redis.call('HSET', KEYS[1], ARGV[1], fromLeft)
end
local dest = tonumber(redis.call('HGET', KEYS[1], ARGV[2])) or 0
redis.call('HSET', KEYS[1], ARGV[2], dest + qty)
return 1
`;

const UNLOCK_LUA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
else
  return 0
end
`;

export type ShelfQty = { shelfName: string; quantity: number };

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client!: RedisClientType;

  async onModuleInit() {
    this.client = createClient({
      socket: {
        host: process.env.REDIS_HOST ?? '127.0.0.1',
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
    });
    await this.client.connect();
  }

  async onModuleDestroy() {
    if (this.client?.isOpen) {
      await this.client.quit();
    }
  }

  /** Hash：stock:HEAR-BLACK，field 是货架名 */
  stockKey(productNo: string) {
    return `stock:${productNo}`;
  }

  lockKey(productNo: string) {
    return `lock:product:${productNo}`;
  }

  async incrShelf(productNo: string, shelfName: string, quantity: number) {
    await this.client.hIncrBy(this.stockKey(productNo), shelfName, quantity);
  }

  async getHash(productNo: string): Promise<ShelfQty[]> {
    const raw = await this.client.hGetAll(this.stockKey(productNo));
    return Object.entries(raw)
      .map(([shelfName, quantity]) => ({
        shelfName,
        quantity: Number(quantity),
      }))
      .filter((row) => Number.isFinite(row.quantity) && row.quantity > 0)
      .sort((a, b) => a.shelfName.localeCompare(b.shelfName, 'zh-CN'));
  }

  hashTotal(rows: ShelfQty[]) {
    return rows.reduce((sum, row) => sum + row.quantity, 0);
  }

  /** 出库/移架前：Hash 不存在才用 MySQL 货位灌进去 */
  async ensureHash(productNo: string, locations: ShelfQty[]) {
    const exists = await this.client.exists(this.stockKey(productNo));
    if (exists) {
      return;
    }
    for (const row of locations) {
      if (row.quantity > 0) {
        await this.client.hSet(
          this.stockKey(productNo),
          row.shelfName,
          String(row.quantity),
        );
      }
    }
  }

  async tryLock(productNo: string, token: string, ttlMs = 8000) {
    const result = await this.client.set(this.lockKey(productNo), token, {
      NX: true,
      PX: ttlMs,
    });
    return result === 'OK';
  }

  async unlock(productNo: string, token: string) {
    await this.client.eval(UNLOCK_LUA, {
      keys: [this.lockKey(productNo)],
      arguments: [token],
    });
  }

  async deductFromShelf(
    productNo: string,
    shelfName: string,
    quantity: number,
  ): Promise<{ ok: true; shelfRemaining: number } | { ok: false }> {
    const raw = await this.client.eval(DEDUCT_LUA, {
      keys: [this.stockKey(productNo)],
      arguments: [shelfName, String(quantity)],
    });
    const coded = Number(raw);
    if (!Number.isFinite(coded) || coded === 0) {
      return { ok: false };
    }
    return { ok: true, shelfRemaining: coded - 1 };
  }

  async moveShelf(
    productNo: string,
    fromShelf: string,
    toShelf: string,
    quantity: number,
  ): Promise<boolean> {
    const raw = await this.client.eval(MOVE_LUA, {
      keys: [this.stockKey(productNo)],
      arguments: [fromShelf, toShelf, String(quantity)],
    });
    return Number(raw) === 1;
  }

  async restoreShelf(productNo: string, shelfName: string, quantity: number) {
    await this.client.hIncrBy(this.stockKey(productNo), shelfName, quantity);
  }
}
