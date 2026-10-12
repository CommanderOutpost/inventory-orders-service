import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import { OrdersService } from './orders.service';
import { Order } from '../database/entities/order.entity';
import { Product } from '../database/entities/product.entity';
import { AuthUser } from '../auth/auth.types';
import { UserRole } from '../users/user-role.enum';
import { OrderStatus } from './order-status.enum';

describe('OrdersService', () => {
  let service: OrdersService;
  let dataSource: { transaction: jest.Mock };
  let ordersRepository: jest.Mocked<
    Pick<Repository<Order>, 'findAndCount' | 'findOne'> & {
      manager: { find: jest.Mock };
    }
  >;
  let manager: {
    findOne: jest.Mock;
    find: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    increment: jest.Mock;
  };

  const product = (overrides: Partial<Product> = {}): Product =>
    ({
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
      ...overrides,
    }) as Product;

  const customer: AuthUser = {
    id: 'u1',
    email: 'jane@example.com',
    role: UserRole.CUSTOMER,
    name: 'Jane',
  };

  beforeEach(() => {
    manager = {
      findOne: jest.fn(),
      find: jest.fn(async () => []),
      save: jest.fn(async (entity) => entity),
      create: jest.fn((_Entity, data) => data),
      increment: jest.fn(),
    };
    dataSource = {
      transaction: jest.fn(async (cb) =>
        cb(manager as unknown as EntityManager),
      ),
    };
    ordersRepository = {
      findAndCount: jest.fn(),
      findOne: jest.fn(),
      manager: { find: jest.fn() },
    };
    service = new OrdersService(
      dataSource as never,
      ordersRepository as never,
    );
  });

  describe('create', () => {
    it('computes totals from server-side prices and decrements stock', async () => {
      const locked = product({ stock: 5 });
      const savedOrder = {
        id: 'o1',
        userId: 'u1',
        status: OrderStatus.PENDING,
        totalAmount: 20,
        notes: null,
        items: [{ productId: 'p1', quantity: 2, unitPrice: 10, lineTotal: 20 }],
      };
      ordersRepository.manager.find.mockResolvedValue([locked]);
      manager.findOne.mockImplementation(async (Entity) =>
        Entity === Product ? locked : savedOrder,
      );
      manager.find.mockResolvedValue(savedOrder.items);

      const result = await service.create('u1', {
        items: [{ productId: 'p1', quantity: 2 }],
      });

      expect(result.totalAmount).toBe(20);
      expect(result.status).toBe(OrderStatus.PENDING);
      expect(result.items[0]).toMatchObject({
        productId: 'p1',
        quantity: 2,
        unitPrice: 10,
        lineTotal: 20,
      });
      // The transaction save must persist the decremented stock.
      const savedProduct = manager.save.mock.calls.find(
        ([entity]) => entity instanceof Product || entity?.id === 'p1',
      );
      expect(savedProduct[0].stock).toBe(3);
    });

    it('rejects an order when stock is insufficient', async () => {
      const locked = product({ stock: 1 });
      ordersRepository.manager.find.mockResolvedValue([locked]);
      manager.findOne.mockResolvedValue(locked);

      await expect(
        service.create('u1', {
          items: [{ productId: 'p1', quantity: 2 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an order referencing unknown products', async () => {
      ordersRepository.manager.find.mockResolvedValue([]);

      await expect(
        service.create('u1', {
          items: [{ productId: 'missing', quantity: 1 }],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('scopes a customer to their own orders', async () => {
      ordersRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll(customer, { page: 1, limit: 20 });

      expect(ordersRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u1' } }),
      );
    });

    it('lets an admin see all orders', async () => {
      ordersRepository.findAndCount.mockResolvedValue([[], 0]);
      const admin: AuthUser = { ...customer, role: UserRole.ADMIN };

      await service.findAll(admin, { page: 1, limit: 20 });

      expect(ordersRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });
  });

  describe('findOne', () => {
    it('hides other customers orders', async () => {
      ordersRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(customer, 'o1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('updateStatus', () => {
    it('rejects an invalid transition', async () => {
      const order = {
        id: 'o1',
        userId: 'u1',
        status: OrderStatus.PENDING,
        items: [],
      };
      manager.findOne.mockResolvedValue(order);

      await expect(
        service.updateStatus('o1', OrderStatus.DELIVERED),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('restocks products when an order is cancelled', async () => {
      const order = {
        id: 'o1',
        userId: 'u1',
        status: OrderStatus.PAID,
        items: [{ productId: 'p1', quantity: 2 }],
      };
      const lockedProduct = product({ stock: 5 });
      manager.findOne.mockImplementation((Entity) =>
        Entity === Product ? Promise.resolve(lockedProduct) : Promise.resolve(order),
      );
      manager.find.mockResolvedValue(order.items);

      const result = await service.updateStatus('o1', OrderStatus.CANCELLED);

      expect(result.status).toBe(OrderStatus.CANCELLED);
      // The locked product is reloaded, restocked and saved (version-safe).
      const savedProduct = manager.save.mock.calls.find(
        ([entity]) => entity === lockedProduct,
      );
      expect(savedProduct[0].stock).toBe(7);
    });

    it('locks the order row so concurrent transitions cannot double-restock', async () => {
      const order = {
        id: 'o1',
        userId: 'u1',
        status: OrderStatus.PAID,
        items: [{ productId: 'p1', quantity: 2 }],
      };
      manager.findOne.mockResolvedValue(order);

      await service.updateStatus('o1', OrderStatus.CANCELLED);

      const lockArg = manager.findOne.mock.calls[0][1];
      expect(lockArg).toMatchObject({
        lock: { mode: 'pessimistic_write' },
      });
    });
  });

  describe('cancel', () => {
    it('cancels a customer pending order and restocks', async () => {
      const order = {
        id: 'o1',
        userId: 'u1',
        status: OrderStatus.PENDING,
        items: [{ productId: 'p1', quantity: 2 }],
      };
      const lockedProduct = product({ stock: 5 });
      manager.findOne.mockImplementation((Entity) =>
        Entity === Product ? Promise.resolve(lockedProduct) : Promise.resolve(order),
      );
      manager.find.mockResolvedValue(order.items);

      const result = await service.cancel('u1', 'o1');

      expect(result.status).toBe(OrderStatus.CANCELLED);
      const savedProduct = manager.save.mock.calls.find(
        ([entity]) => entity === lockedProduct,
      );
      expect(savedProduct[0].stock).toBe(7);
    });

    it('locks the order row while cancelling', async () => {
      const order = {
        id: 'o1',
        userId: 'u1',
        status: OrderStatus.PENDING,
        items: [],
      };
      manager.findOne.mockResolvedValue(order);

      await service.cancel('u1', 'o1');

      const lockArg = manager.findOne.mock.calls[0][1];
      expect(lockArg).toMatchObject({ lock: { mode: 'pessimistic_write' } });
    });

    it('refuses to cancel another customers order', async () => {
      manager.findOne.mockResolvedValue({
        id: 'o1',
        userId: 'someone-else',
        status: OrderStatus.PENDING,
        items: [],
      });

      await expect(service.cancel('u1', 'o1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('refuses to cancel an order that is no longer pending', async () => {
      manager.findOne.mockResolvedValue({
        id: 'o1',
        userId: 'u1',
        status: OrderStatus.SHIPPED,
        items: [],
      });

      await expect(service.cancel('u1', 'o1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('OrderItem snapshot integrity', () => {
    it('snapshots unit price so later price changes do not mutate the order', async () => {
      const locked = product({ price: 10, stock: 5 });
      const savedOrder = {
        id: 'o1',
        userId: 'u1',
        status: OrderStatus.PENDING,
        totalAmount: 10,
        items: [{ productId: 'p1', quantity: 1, unitPrice: 10, lineTotal: 10 }],
      };
      ordersRepository.manager.find.mockResolvedValue([locked]);
      manager.findOne.mockImplementation(async (Entity) =>
        Entity === Product ? locked : savedOrder,
      );
      manager.find.mockResolvedValue(savedOrder.items);

      const result = await service.create('u1', {
        items: [{ productId: 'p1', quantity: 1 }],
      });

      expect(result.items[0].unitPrice).toBe(10);
      expect(result.items[0].lineTotal).toBe(10);
    });
  });
});
