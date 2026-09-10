import { Body, Controller, Get, Post } from '@nestjs/common';
import { CreateProductDto, deleteProductDto, findByIdDto, updateProductNameDto, updateProductQuantityDto } from './dto/createProduct';
import { ProductsService } from './products.service';
import { Product } from './interfaces/product';

@Controller('products')
export class ProductsController {
    constructor(private productService: ProductsService) { }

    @Post('getAllProducts')
    findAll(): Product[] {
        return this.productService.findAll()
    }

    @Post('create')
    create(@Body() createProductParams: CreateProductDto) {
        return this.productService.create(createProductParams)
    }

    @Post('findById')
    findById(@Body() findByIdParams: findByIdDto) {
        return this.productService.findById(findByIdParams.productNo)
    }

    @Post('updateProductName')
    updateProductName(@Body() updateProductNameParams: updateProductNameDto) {
        return this.productService.updateProductName(updateProductNameParams.productNo, updateProductNameParams.name)
    }

    @Post('updateProductQuantity')
    updateProductQuantity(@Body() updateProductQuantityParams: updateProductQuantityDto) {
        return this.productService.updateProductQuantity(updateProductQuantityParams.productNo, updateProductQuantityParams.quantity)
    }

    @Post('deleteProduct')
    deleteProduct(@Body() deleteProductParams: deleteProductDto) {
        return this.productService.deleteProduct(deleteProductParams.productNo)
    }
}
