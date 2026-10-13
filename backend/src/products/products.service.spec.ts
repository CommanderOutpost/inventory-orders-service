import { ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
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
  });

  describe('update (optimistic locking)', () => {
    it('rejects a stale update with a 409 and never saves', async () => {
      // The product was already changed (version bumped to 2) since the
      // client read it (version 1): a stale stock/price edit must not win.
      productsRepository.findOne.mockResolvedValue({
        ...product,
        stock: 7,
        version: 2,
      });

      await expect(
        service.update('p1', { name: 'Renamed', stock: 10, version: 1 }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(productsRepository.save).not.toHaveBeenCalled();
    });

    it('applies the update when the version matches', async () => {
      const found = { ...product, stock: 7, version: 2 } as Product;
      productsRepository.findOne.mockResolvedValue(found);
      productsRepository.merge.mockImplementation((target, source) =>
        Object.assign(target, source),
      );
      productsRepository.save.mockResolvedValue(found);

      const result = await service.update('p1', {
        name: 'Renamed',
        stock: 5,
        version: 2,
      });

      expect(result).toMatchObject({ name: 'Renamed', stock: 5, version: 2 });
      expect(productsRepository.merge).toHaveBeenCalledWith(
        expect.objectContaining({ version: 2 }),
        expect.not.objectContaining({ version: expect.anything() }),
      );
    });

    it('never merges the submitted version onto the saved product', async () => {
      const found = { ...product, version: 3 } as Product;
      productsRepository.findOne.mockResolvedValue(found);
      productsRepository.save.mockResolvedValue(found);

      await service.update('p1', { isActive: false, version: 3 });

      // The DTO carries the version for the check but it must not be merged
      // as a caller-supplied column; the entity keeps its loaded version.
      expect(productsRepository.merge).toHaveBeenCalledWith(
        expect.anything(),
        expect.not.objectContaining({ version: expect.anything() }),
      );
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
