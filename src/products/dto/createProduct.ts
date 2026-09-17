import { IsEmail, IsInt, IsNotEmpty, IsString } from 'class-validator';

export class CreateProductDto {
    @IsString()
    productNo!: string;

    @IsString()
    name!: string;

    @IsInt()
    quantity!: number;
}

export class findByIdDto {
    @IsString()
    productNo!: string;
}

export class updateProductNameDto {
    @IsString()
    productNo!: string;

    @IsString()
    name!: string;
}

export class deleteProductDto {
    @IsString()
    productNo!: string;
}
