import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Product } from '../database/entities/product.entity';
import { OrderItem } from '../database/entities/order-item.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { Paginated, paginate } from '../common/dto/pagination.dto';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    @InjectRepository(OrderItem)
    private readonly orderItemsRepository: Repository<OrderItem>,
  ) {}

  async findAll(query: QueryProductsDto): Promise<Paginated<Product>> {
    const base: Record<string, unknown> = {};

    if (!query.includeInactive) {
      base.isActive = true;
    }

    let where: Record<string, unknown> | Record<string, unknown>[] = base;
    if (query.search) {
      const term = `%${query.search.trim()}%`;
      where = [
        { ...base, name: ILike(term) },
        { ...base, sku: ILike(term) },
      ];
    }

    const sortBy: string = query.sortBy ?? 'createdAt';
    const sortOrder: 'asc' | 'desc' = query.sortOrder ?? 'desc';

    const [data, total] = await this.productsRepository.findAndCount({
      where,
      order: { [sortBy]: sortOrder },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });

    return paginate(data, total, query.page, query.limit);
  }

  async findOne(id: string, includeInactive = false): Promise<Product> {
    const product = await this.productsRepository.findOne({ where: { id } });
    if (!product || (!includeInactive && !product.isActive)) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  async create(dto: CreateProductDto): Promise<Product> {
    await this.assertSkuAvailable(dto.sku);

    const product = this.productsRepository.create({
      name: dto.name,
      sku: dto.sku,
      description: dto.description ?? null,
      price: dto.price,
      stock: dto.stock,
      isActive: dto.isActive ?? true,
    });
    return this.productsRepository.save(product);
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    const product = await this.findOne(id, true);

    if (dto.sku && dto.sku !== product.sku) {
      await this.assertSkuAvailable(dto.sku, id);
    }

    this.productsRepository.merge(product, dto);
    return this.productsRepository.save(product);
  }

  /**
   * Deletes a product. If it has ever been part of an order it is soft-deleted
   * (archived via `isActive = false`) to preserve order history; otherwise it
   * is hard deleted.
   */
  async remove(id: string): Promise<{ deleted: boolean; archived: boolean }> {
    const product = await this.findOne(id, true);

    const referenced = await this.orderItemsRepository.count({
      where: { productId: id },
    });

    if (referenced > 0) {
      product.isActive = false;
      await this.productsRepository.save(product);
      return { deleted: false, archived: true };
    }

    await this.productsRepository.remove(product);
    return { deleted: true, archived: false };
  }

  private async assertSkuAvailable(
    sku: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.productsRepository.findOne({ where: { sku } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(
        `A product with SKU "${sku}" already exists`,
      );
    }
  }
}
