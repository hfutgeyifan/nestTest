import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Product } from './interfaces/product';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Products } from './entities/products.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Products)
    private productsRepository: Repository<Products>,
  ) {}

  async create(product: Product) {
    const findProduct = await this.productsRepository.findOneBy({
      productNo: product.productNo,
    });
    if (findProduct) {
      throw new HttpException('alreadyExist', HttpStatus.CONFLICT);
    }
    if (product.quantity !== 0) {
      throw new HttpException('请使用入库单上架', HttpStatus.BAD_REQUEST);
    }
    await this.productsRepository.insert(product);
    return product;
  }

  async findAll() {
    return await this.productsRepository.find();
  }

  async findById(productNo: string): Promise<Products> {
    const findProduct = await this.productsRepository.findOneBy({ productNo });
    if (findProduct) {
      return findProduct;
    }
    throw new HttpException('notFound', HttpStatus.INTERNAL_SERVER_ERROR);
  }

  async updateProductName(productNo: string, name: string) {
    const findProduct = await this.productsRepository.findOneBy({ productNo });
    if (findProduct) {
      return await this.productsRepository.update({ productNo }, { name });
    }
    throw new HttpException('notFound', HttpStatus.INTERNAL_SERVER_ERROR);
  }

  async deleteProduct(productNo: string) {
    const findProduct = await this.productsRepository.findOneBy({ productNo });
    if (findProduct) {
      if (findProduct.quantity !== 0) {
        throw new HttpException(
          'Cannot delete product with non-zero quantity',
          HttpStatus.BAD_REQUEST,
        );
      }
      return await this.productsRepository.delete(productNo);
    }
    throw new HttpException('notFound', HttpStatus.INTERNAL_SERVER_ERROR);
  }

  async increaseQuantity(
    productNo: string,
    quantity: number,
    manager?: EntityManager,
  ) {
    if (quantity <= 0) {
      throw new HttpException(
        'quantity must be greater than 0',
        HttpStatus.BAD_REQUEST,
      );
    }

    const repo = manager?.getRepository(Products) ?? this.productsRepository;
    const findProduct = await repo.findOne({
      where: { productNo },
      ...(manager ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });

    if (!findProduct) {
      throw new HttpException('notFound', HttpStatus.NOT_FOUND);
    }

    findProduct.quantity += quantity;
    return await repo.save(findProduct);
  }

  async syncQuantity(
    productNo: string,
    quantity: number,
    manager?: EntityManager,
  ) {
    if (quantity < 0) {
      throw new HttpException('can not down', HttpStatus.BAD_REQUEST);
    }
    const repo = manager?.getRepository(Products) ?? this.productsRepository;
    const findProduct = await repo.findOne({
      where: { productNo },
      ...(manager ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!findProduct) {
      throw new HttpException('notFound', HttpStatus.NOT_FOUND);
    }
    findProduct.quantity = quantity;
    return await repo.save(findProduct);
  }
}
