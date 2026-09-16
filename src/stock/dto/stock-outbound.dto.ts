import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateOutboundDto {
  @IsString()
  productNo!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsString()
  orderNo!: string;
}

export class UpdateOutboundDto {
  @Type(() => Number)
  @IsInt()
  id!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsString()
  orderNo?: string;
}

export class OutboundIdDto {
  @Type(() => Number)
  @IsInt()
  id!: number;
}
