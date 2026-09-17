import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateInboundDto {
  @IsString()
  productNo!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  shelfName?: string;

  @IsOptional()
  @IsString()
  remark?: string;
}

export class UpdateInboundDto {
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
  shelfName?: string;

  @IsOptional()
  @IsString()
  remark?: string;
}

export class ConfirmInboundDto {
  @Type(() => Number)
  @IsInt()
  id!: number;

  @IsString()
  @IsNotEmpty()
  shelfName!: string;
}

export class InboundIdDto {
  @Type(() => Number)
  @IsInt()
  id!: number;
}
