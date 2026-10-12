import { ConflictException, NotFoundException } from '@nestjs/common';
import { OptimisticLockVersionMismatchError, Repository } from 'typeorm';
import { ProductsService } from './products.service';
import { Product } from '../database/entities/product.entity';
import { OrderItem } from '../database/entities/order-item.entity';

describe('ProductsService', () => {
  let service: ProductsService;
  let productsRepository: jest.Mocked<Pick<Repository<Product>, 'findAndCount' | 'findOne' | 'create' | 'save' | 'merge' | 'remove'>>;
  let orderItemsRepository: jest.Mocked<Pick<Repository<OrderItem>, 'count'>>;

  const product: Product = {
    id: 'p1',
    name: 'Coffee',
    sku: 'COF-1',
    description: null,
    price: 10,
    stock: 5,
    isActive: true,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    productsRepository = {
      findAndCount: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      merge: jest.fn(),
      remove: jest.fn(),
    };
    orderItemsRepository = { count: jest.fn() };
    service = new ProductsService(
      productsRepository as never,
      orderItemsRepository as never,
    );
  });

  describe('findAll', () => {
    it('filters to active products by default and paginates', async () => {
      productsRepository.findAndCount.mockResolvedValue([[product], 1]);

      const result = await service.findAll({
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        includeInactive: false,
      });

      expect(result.data).toEqual([product]);
      expect(result.meta.total).toBe(1);
      expect(productsRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });
  });

  describe('findOne', () => {
    it('hides inactive products from the public API', async () => {
      productsRepository.findOne.mockResolvedValue({ ...product, isActive: false });

      await expect(service.findOne('p1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the product when found', async () => {
      productsRepository.findOne.mockResolvedValue(product);

      await expect(service.findOne('p1')).resolves.toEqual(product);
    });
  });

  describe('create', () => {
    it('rejects a duplicate SKU', async () => {
      productsRepository.findOne.mockResolvedValue(product);

      await expect(
        service.create({ name: 'X', sku: 'COF-1', price: 1, stock: 1 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates an active product by default', async () => {
      productsRepository.findOne.mockResolvedValue(null);
      productsRepository.create.mockReturnValue(product);
      productsRepository.save.mockResolvedValue(product);

      const result = await service.create({
        name: 'Coffee',
        sku: 'COF-2',
        price: 10,
        stock: 5,
      });

      expect(productsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true, sku: 'COF-2' }),
      );
      expect(result).toEqual(product);
    });

    it('maps a concurrent SKU unique-violation to a 409 Conflict', async () => {
      productsRepository.findOne.mockResolvedValue(null);
      productsRepository.create.mockReturnValue(product);
      productsRepository.save.mockRejectedValue({ code: '23505' } as never);

      await expect(
        service.create({ name: 'Coffee', sku: 'COF-2', price: 10, stock: 5 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('maps an optimistic-lock mismatch to a 409 Conflict', async () => {
      productsRepository.findOne.mockResolvedValue(null);
      productsRepository.create.mockReturnValue(product);
      productsRepository.save.mockRejectedValue(
        new OptimisticLockVersionMismatchError('products', 1, 2) as never,
      );

      await expect(
        service.create({ name: 'Coffee', sku: 'COF-2', price: 10, stock: 5 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('remove', () => {
    it('soft-archives a product referenced by order items', async () => {
      productsRepository.findOne.mockResolvedValue(product);
      orderItemsRepository.count.mockResolvedValue(3);

      const result = await service.remove('p1');

      expect(result).toEqual({ deleted: false, archived: true });
      expect(productsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      );
    });

    it('hard deletes a product never referenced by orders', async () => {
      productsRepository.findOne.mockResolvedValue(product);
      orderItemsRepository.count.mockResolvedValue(0);
      productsRepository.remove.mockResolvedValue(product as never);

      const result = await service.remove('p1');

      expect(result).toEqual({ deleted: true, archived: false });
      expect(productsRepository.remove).toHaveBeenCalled();
    });

    it('falls back to archiving if a concurrent order blocks the delete', async () => {
      productsRepository.findOne.mockResolvedValue(product);
      orderItemsRepository.count.mockResolvedValue(0);
      productsRepository.remove.mockRejectedValue({ code: '23503' } as never);
      productsRepository.save.mockResolvedValue(product as never);

      const result = await service.remove('p1');

      expect(result).toEqual({ deleted: false, archived: true });
      expect(productsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      );
    });
  });
});
