import { IsEmail, IsInt, IsNotEmpty, IsString } from 'class-validator';

export class CreateProductDto {
    @IsString()
    productNo!: string;

    @IsString()
    name!: string;

    @IsInt()
    quantity!: string;
}
