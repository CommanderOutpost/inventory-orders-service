import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { Order } from '../database/entities/order.entity';
import { OrderItem } from '../database/entities/order-item.entity';
import { Product } from '../database/entities/product.entity';
import { AuthUser } from '../auth/auth.types';
import { UserRole } from '../users/user-role.enum';
import {
  canTransition,
  OrderStatus,
} from './order-status.enum';
import { CreateOrderDto } from './dto/create-order.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { Paginated, paginate } from '../common/dto/pagination.dto';

const ORDER_RELATIONS = { items: { product: true } } as const;
// Admins also see which customer owns each order. The user's password hash is
// never included because the column is `select: false`.
const ADMIN_ORDER_RELATIONS = { ...ORDER_RELATIONS, user: true } as const;

interface PricedItem {
  productId: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

const roundMoney = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

@Injectable()
export class OrdersService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Order)
    private readonly ordersRepository: Repository<Order>,
  ) {}

  /**
   * Places an order atomically: validates availability, locks each product,
   * decrements stock and writes the order with price snapshots in one
   * transaction so concurrent orders can never oversell.
   */
  async create(userId: string, dto: CreateOrderDto): Promise<Order> {
    const quantityByProduct = this.mergeQuantities(dto.items);
    const products = await this.loadActiveProducts(
      Array.from(quantityByProduct.keys()),
    );

    return this.dataSource.transaction(async (manager) => {
      const items: PricedItem[] = [];
      let totalAmount = 0;

      const sortedProducts = [...products].sort((a, b) =>
        a.id.localeCompare(b.id),
      );

      for (const product of sortedProducts) {
        const requested = quantityByProduct.get(product.id) as number;
        const locked = await manager.findOne(Product, {
          where: { id: product.id, isActive: true },
          lock: { mode: 'pessimistic_write' },
        });

        if (!locked) {
          throw new NotFoundException('Product not found');
        }
        if (locked.stock < requested) {
          throw new BadRequestException(
            `Insufficient stock for "${locked.name}": ${locked.stock} available, ${requested} requested`,
          );
        }

        locked.stock -= requested;
        await manager.save(locked);

        const lineTotal = roundMoney(locked.price * requested);
        totalAmount += lineTotal;
        items.push({
          productId: locked.id,
          quantity: requested,
          unitPrice: locked.price,
          lineTotal,
        });
      }

      const order = manager.create(Order, {
        userId,
        status: OrderStatus.PENDING,
        totalAmount: roundMoney(totalAmount),
        notes: dto.notes ?? null,
        items: items.map((item) => manager.create(OrderItem, item)),
      });
      const saved = await manager.save(order);

      return this.findOrder(manager, saved.id);
    });
  }

  async findAll(user: AuthUser, query: QueryOrdersDto): Promise<Paginated<Order>> {
    const where: Record<string, unknown> = {};
    if (user.role === UserRole.CUSTOMER) {
      where.userId = user.id;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.userId && user.role === UserRole.ADMIN) {
      where.userId = query.userId;
    }

    const [data, total] = await this.ordersRepository.findAndCount({
      where,
      relations:
        user.role === UserRole.ADMIN ? ADMIN_ORDER_RELATIONS : ORDER_RELATIONS,
      order: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });

    return paginate(data, total, query.page, query.limit);
  }

  async findOne(user: AuthUser, id: string): Promise<Order> {
    const where: Record<string, unknown> = { id };
    if (user.role === UserRole.CUSTOMER) {
      // Hide the existence of other customers' orders.
      where.userId = user.id;
    }

    const order = await this.ordersRepository.findOne({
      where,
      relations:
        user.role === UserRole.ADMIN ? ADMIN_ORDER_RELATIONS : ORDER_RELATIONS,
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  /** Admin: advance an order along the status state machine (restocks on cancel). */
  async updateStatus(id: string, status: OrderStatus): Promise<Order> {
    return this.dataSource.transaction(async (manager) => {
      const order = await this.findOrder(manager, id);

      if (!canTransition(order.status, status)) {
        throw new BadRequestException(
          `Cannot transition order from "${order.status}" to "${status}"`,
        );
      }

      if (status === OrderStatus.CANCELLED) {
        await this.restockItems(manager, order);
      }

      order.status = status;
      await manager.save(order);
      return order;
    });
  }

  /** Customer: cancels one of their own orders while it is still pending. */
  async cancel(userId: string, orderId: string): Promise<Order> {
    return this.dataSource.transaction(async (manager) => {
      const order = await this.findOrder(manager, orderId);

      if (order.userId !== userId) {
        throw new NotFoundException('Order not found');
      }
      if (order.status !== OrderStatus.PENDING) {
        throw new BadRequestException('Only pending orders can be cancelled');
      }

      await this.restockItems(manager, order);
      order.status = OrderStatus.CANCELLED;
      await manager.save(order);
      return order;
    });
  }

  private mergeQuantities(
    items: CreateOrderDto['items'],
  ): Map<string, number> {
    const map = new Map<string, number>();
    for (const item of items) {
      map.set(item.productId, (map.get(item.productId) ?? 0) + item.quantity);
    }
    return map;
  }

  private async loadActiveProducts(ids: string[]): Promise<Product[]> {
    if (ids.length === 0) {
      throw new BadRequestException('An order must contain at least one item');
    }

    const products = await this.ordersRepository.manager.find(Product, {
      where: { id: In(ids), isActive: true },
    });

    if (products.length !== ids.length) {
      const found = new Set(products.map((p) => p.id));
      const missing = ids.filter((id) => !found.has(id));
      throw new NotFoundException(
        `One or more products were not found or are unavailable: ${missing.join(', ')}`,
      );
    }
    return products;
  }

  /**
   * Returns stock to a product. Uses a locked read + save so the `version`
   * column is honoured: a concurrent admin edit with a stale version fails
   * its optimizer check instead of silently overwriting the restored stock.
   * Locks are acquired in id-sorted order (same as `create`) to keep the
   * codebase's deadlock-avoidance guarantee across all product lock sites.
   */
  private async restockItems(
    manager: EntityManager,
    order: Order,
  ): Promise<void> {
    const sortedItems = [...order.items].sort((a, b) =>
      a.productId.localeCompare(b.productId),
    );
    for (const item of sortedItems) {
      const product = await manager.findOne(Product, {
        where: { id: item.productId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!product) {
        continue;
      }
      product.stock += item.quantity;
      await manager.save(product);
    }
  }

  /**
   * Loads an order inside a transaction with its items, optionally taking a
   * pessimistic write lock on the order row. The lock is applied on a bare
   * row read (not a joined query) because PostgreSQL rejects `FOR UPDATE` on
   * the nullable side of an outer join. Locking serializes concurrent status
   * transitions so restock-on-cancel can never run twice for the same order.
   */
  private async findOrder(
    manager: EntityManager,
    id: string,
    lock = true,
  ): Promise<Order> {
    const order = await manager.findOne(Order, {
      where: { id },
      lock: lock ? { mode: 'pessimistic_write' } : undefined,
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    order.items = await manager.find(OrderItem, {
      where: { orderId: id },
      relations: { product: true },
    });
    return order;
  }
}
