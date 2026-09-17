import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class TransferDto {
  @IsString()
  @IsNotEmpty()
  productNo!: string;

  @IsString()
  @IsNotEmpty()
  fromShelf!: string;

  @IsString()
  @IsNotEmpty()
  toShelf!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class ProductNoDto {
  @IsString()
  @IsNotEmpty()
  productNo!: string;
}

export class ShelfNameDto {
  @IsString()
  @IsNotEmpty()
  shelfName!: string;
}
