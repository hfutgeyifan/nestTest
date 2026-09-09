import { Body, Controller, Post } from '@nestjs/common';
import { CreateProductDto } from './dto/createProduct';

@Controller('products')
export class ProductsController {
    @Post("create")
    async create(@Body() createProductDto: CreateProductDto) {
        return 'This action adds a new cat';
    }
}
