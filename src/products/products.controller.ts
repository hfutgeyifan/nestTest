import { Body, Controller, Post } from '@nestjs/common';
import {
  CreateProductDto,
  deleteProductDto,
  findByIdDto,
  updateProductNameDto,
} from './dto/createProduct';
import { ProductsService } from './products.service';
import { Product } from './interfaces/product';

@Controller('products')
export class ProductsController {
  constructor(private productService: ProductsService) {}

  @Post('getAllProducts')
  async findAll(): Promise<Product[]> {
    return await this.productService.findAll();
  }

  @Post('create')
  async create(@Body() createProductParams: CreateProductDto) {
    return await this.productService.create(createProductParams);
  }

  @Post('findById')
  async findById(@Body() findByIdParams: findByIdDto) {
    return await this.productService.findById(findByIdParams.productNo);
  }

  @Post('updateProductName')
  async updateProductName(
    @Body() updateProductNameParams: updateProductNameDto,
  ) {
    return await this.productService.updateProductName(
      updateProductNameParams.productNo,
      updateProductNameParams.name,
    );
  }

  @Post('deleteProduct')
  async deleteProduct(@Body() deleteProductParams: deleteProductDto) {
    return await this.productService.deleteProduct(
      deleteProductParams.productNo,
    );
  }
}
