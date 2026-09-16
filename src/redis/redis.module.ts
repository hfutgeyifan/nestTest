import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

// @Global：任意模块都能注入 RedisService，不用每个 module 再 import
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
