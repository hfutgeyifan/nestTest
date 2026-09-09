import { Body, Controller, Get, Post } from '@nestjs/common';
import { CreateProductDto } from './dto/createProduct';

@Controller('products')
export class ProductsController {
    @Get('getAllProducts')
    findAll(): CreateProductDto[] {
        return [];
    }

    @Post("create")
    async create(@Body() createProductDto: CreateProductDto) {
        return 'This action adds a new cat';
    }
}
