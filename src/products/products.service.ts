import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Product } from './interfaces/product';

@Injectable()
export class ProductsService {
    private readonly products: Record<string, Product> = {};

    create(product: Product) {
        const findProduct = this.products[product.productNo]
        if (findProduct) {
            throw new HttpException('alreadyExist', HttpStatus.CONFLICT);
        }
        this.products[product.productNo] = product
    }

    findAll() {
        return Object.values(this.products);
    }

    findById(productNo: string): Product {
        const findProduct = this.products[productNo]
        if (findProduct) {
            return findProduct
        }
        throw new HttpException('notFound', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    updateProductName(productNo: string, name: string) {
        const findProduct = this.products[productNo]
        if (findProduct) {
            return this.products[productNo].name = name
        }
        throw new HttpException('notFound', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    updateProductQuantity(productNo: string, quantity: number) {
        const findProduct = this.products[productNo]
        if (findProduct) {
            if ((findProduct.quantity += quantity) < 0) {
                throw new HttpException('can not down', HttpStatus.BAD_REQUEST);
            }
            return this.products[productNo].quantity += quantity
        }
        throw new HttpException('notFound', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    deleteProduct(productNo: string) {
        const findProduct = this.products[productNo]
        if (findProduct) {
            if (findProduct.quantity !== 0) {
                throw new HttpException('Cannot delete product with non-zero quantity', HttpStatus.BAD_REQUEST);
            }
            delete this.products[productNo];
        }
        throw new HttpException('notFound', HttpStatus.INTERNAL_SERVER_ERROR);
    }
}
