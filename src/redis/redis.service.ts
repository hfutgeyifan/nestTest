import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createClient, type RedisClientType } from 'redis';

/**
 * 原子扣库存。整段脚本在 Redis 里一次跑完，中间不会被别的请求插入。
 * 返回 0 = 失败（key 不存在或库存不够）。
 * 成功返回 remaining+1：扣完剩 0 时不能也回 0，否则 JS 分不清成败。
 */
const DEDUCT_LUA = `
local current = tonumber(redis.call('GET', KEYS[1]))
if current == nil then
  return 0
end
local qty = tonumber(ARGV[1])
if current < qty then
  return 0
end
local remaining = current - qty
redis.call('SET', KEYS[1], remaining)
return remaining + 1
`;

/**
 * 只删“自己的锁”。token 对不上说明锁已过期被别人抢走，不能 DEL。
 */
const UNLOCK_LUA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
else
  return 0
end
`;

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client!: RedisClientType;

  // 构造函数不能 await；Nest 会等这个钩子连上再接请求
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

  stockKey(productNo: string) {
    return `stock:product:${productNo}`;
  }

  lockKey(productNo: string) {
    return `lock:product:${productNo}`;
  }

  /** 入库确认后覆盖 Redis 库存，和 MySQL 对齐 */
  async setStock(productNo: string, quantity: number) {
    await this.client.set(this.stockKey(productNo), String(quantity));
  }

  /** 老商品可能还没有 Redis key，出库前用 MySQL 数量补一次 */
  async ensureStock(productNo: string, dbQuantity: number) {
    const exists = await this.client.exists(this.stockKey(productNo));
    if (!exists) {
      await this.client.set(this.stockKey(productNo), String(dbQuantity));
    }
  }

  /**
   * 抢商品锁。NX=没人持有才写；PX=持锁最长 ttlMs，进程挂了也会自动释放。
   * 抢不到立刻返回 false，不会在 Redis 里等待。
   */
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

  async deduct(
    productNo: string,
    quantity: number,
  ): Promise<{ ok: true; remaining: number } | { ok: false }> {
    const raw = await this.client.eval(DEDUCT_LUA, {
      keys: [this.stockKey(productNo)],
      arguments: [String(quantity)],
    });
    const coded = Number(raw);
    if (!Number.isFinite(coded) || coded === 0) {
      return { ok: false };
    }
    return { ok: true, remaining: coded - 1 };
  }

  /** MySQL 出库失败时，把刚才 Lua 扣掉的数量加回去 */
  async restore(productNo: string, quantity: number) {
    await this.client.incrBy(this.stockKey(productNo), quantity);
  }
}
