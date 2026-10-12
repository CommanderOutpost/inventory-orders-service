import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { UsersService } from '../src/users/users.service';
import { UserRole } from '../src/users/user-role.enum';
import { OrderStatus } from '../src/orders/order-status.enum';
import {
  authHeader,
  createTestApp,
  resetDatabase,
} from './test-utils';

describe('Inventory & Orders API (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let usersService: UsersService;

  const adminEmail = 'admin@test.com';
  const adminPassword = 'Admin123!';

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer());
    usersService = app.get(UsersService);

    const passwordHash = await bcrypt.hash(adminPassword, 4);
    await usersService.create({
      email: adminEmail,
      passwordHash,
      name: 'Test Admin',
      role: UserRole.ADMIN,
    });
  });

  beforeEach(async () => {
    await resetDatabase(app);
    const passwordHash = await bcrypt.hash(adminPassword, 4);
    await usersService.create({
      email: adminEmail,
      passwordHash,
      name: 'Test Admin',
      role: UserRole.ADMIN,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const register = (suffix: string) =>
    http
      .post('/api/v1/auth/register')
      .send({
        name: 'Jane Doe',
        email: `jane${suffix}@test.com`,
        password: 'Passw0rd',
      })
      .expect(201);

  const loginAdmin = async (): Promise<string> => {
    const res = await http
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password: adminPassword })
      .expect(201);
    return res.body.accessToken as string;
  };

  const createProduct = async (
    token: string,
    overrides: Record<string, unknown> = {},
  ): Promise<{ id: string; stock: number; price: number }> => {
    const res = await http
      .post('/api/v1/products')
      .set(authHeader(token))
      .send({
        name: 'Coffee Beans',
        sku: `COF-${Date.now()}`,
        price: 12.5,
        stock: 10,
        ...overrides,
      })
      .expect(201);
    return res.body;
  };

  describe('auth', () => {
    it('registers a customer and returns a token', async () => {
      const res = await register('auth1');
      expect(res.body.user).toMatchObject({
        email: 'janeauth1@test.com',
        role: UserRole.CUSTOMER,
      });
      expect(res.body.accessToken).toBeDefined();
    });

    it('rejects duplicate registration', async () => {
      await register('dup1');
      await http
        .post('/api/v1/auth/register')
        .send({ name: 'Jane', email: 'janedup1@test.com', password: 'Passw0rd' })
        .expect(409);
    });

    it('rejects a wrong password', async () => {
      await register('badpw');
      await http
        .post('/api/v1/auth/login')
        .send({ email: 'janebadpw@test.com', password: 'wrong' })
        .expect(401);
    });

    it('rejects malformed registration payloads', async () => {
      await http
        .post('/api/v1/auth/register')
        .send({ name: 'X', email: 'not-an-email', password: 'short' })
        .expect(400);
    });
  });

  describe('authorization', () => {
    it('rejects unauthenticated order requests', async () => {
      await http
        .post('/api/v1/orders')
        .send({ items: [{ productId: '00000000-0000-4000-8000-000000000000', quantity: 1 }] })
        .expect(401);
    });

    it('allows unauthenticated product browsing', async () => {
      await http.get('/api/v1/products').expect(200);
    });

    it('forbids customers from managing products', async () => {
      const customerRes = await register('rbac1');
      await http
        .post('/api/v1/products')
        .set(authHeader(customerRes.body.accessToken))
        .send({ name: 'X', sku: 'X-1', price: 1, stock: 1 })
        .expect(403);
    });

    it('forbids customers from the reports endpoint', async () => {
      const customerRes = await register('rbac2');
      await http
        .get('/api/v1/reports/order-summary')
        .set(authHeader(customerRes.body.accessToken))
        .expect(403);
    });

    it('rejects non-RFC3339 report date filters with 400', async () => {
      const token = await loginAdmin();
      await http
        .get('/api/v1/reports/order-summary?from=2026-10-12')
        .set(authHeader(token))
        .expect(400);
    });
  });

  describe('product management', () => {
    it('lets an admin create, update and list products', async () => {
      const token = await loginAdmin();
      const product = await createProduct(token);

      const updated = await http
        .patch(`/api/v1/products/${product.id}`)
        .set(authHeader(token))
        .send({ price: 14.0, stock: 5 })
        .expect(200);
      expect(updated.body.price).toBe(14);
      expect(updated.body.stock).toBe(5);

      const listed = await http.get('/api/v1/products').expect(200);
      expect(listed.body.meta.total).toBeGreaterThanOrEqual(1);
    });

    it('rejects duplicate SKUs', async () => {
      const token = await loginAdmin();
      await createProduct(token, { sku: 'DUP-SKU' });
      await http
        .post('/api/v1/products')
        .set(authHeader(token))
        .send({ name: 'Another', sku: 'DUP-SKU', price: 1, stock: 1 })
        .expect(409);
    });

    it('does not leak archived products to the public catalogue', async () => {
      const token = await loginAdmin();
      const product = await createProduct(token, { sku: 'LEAK-SKU' });

      // Give the product order history so DELETE soft-archives it.
      const customerRes = await register('leak1');
      await http
        .post('/api/v1/orders')
        .set(authHeader(customerRes.body.accessToken))
        .send({ items: [{ productId: product.id, quantity: 1 }] })
        .expect(201);

      await http
        .delete(`/api/v1/products/${product.id}`)
        .set(authHeader(token))
        .expect(200);

      // Even with includeInactive=true, the public endpoint must hide it.
      const publicList = await http
        .get('/api/v1/products?includeInactive=true')
        .expect(200);
      const ids = publicList.body.data.map((p: { id: string }) => p.id);
      expect(ids).not.toContain(product.id);

      // The admin-only endpoint returns it (with includeInactive).
      const adminList = await http
        .get(`/api/v1/products/admin?includeInactive=true`)
        .set(authHeader(token))
        .expect(200);
      const adminIds = adminList.body.data.map((p: { id: string }) => p.id);
      expect(adminIds).toContain(product.id);
    });
  });

  describe('order flow (core)', () => {
    it('places an order, decrements stock and computes totals from server prices', async () => {
      const adminToken = await loginAdmin();
      const product = await createProduct(adminToken, { price: 12.5, stock: 10 });
      const customerRes = await register('flow1');
      const customerToken = customerRes.body.accessToken as string;

      const orderRes = await http
        .post('/api/v1/orders')
        .set(authHeader(customerToken))
        .send({ items: [{ productId: product.id, quantity: 2 }] })
        .expect(201);

      expect(orderRes.body.status).toBe(OrderStatus.PENDING);
      expect(orderRes.body.totalAmount).toBe(25);
      expect(orderRes.body.items[0]).toMatchObject({
        productId: product.id,
        quantity: 2,
        unitPrice: 12.5,
        lineTotal: 25,
      });

      const productAfter = await http
        .get(`/api/v1/products/${product.id}`)
        .expect(200);
      expect(productAfter.body.stock).toBe(8);
    });

    it('rejects orders that exceed available stock', async () => {
      const adminToken = await loginAdmin();
      const product = await createProduct(adminToken, { stock: 2 });
      const customerRes = await register('flow2');

      await http
        .post('/api/v1/orders')
        .set(authHeader(customerRes.body.accessToken))
        .send({ items: [{ productId: product.id, quantity: 3 }] })
        .expect(400);
    });

    it('rejects orders referencing unknown products', async () => {
      const customerRes = await register('flow3');
      await http
        .post('/api/v1/orders')
        .set(authHeader(customerRes.body.accessToken))
        .send({
          items: [
            { productId: '00000000-0000-4000-8000-000000000000', quantity: 1 },
          ],
        })
        .expect(404);
    });

    it('scopes order visibility: customers cannot see others orders', async () => {
      const adminToken = await loginAdmin();
      const product = await createProduct(adminToken);

      const customerA = await register('scopa');
      const customerB = await register('scopb');

      const orderA = await http
        .post('/api/v1/orders')
        .set(authHeader(customerA.body.accessToken))
        .send({ items: [{ productId: product.id, quantity: 1 }] })
        .expect(201);

      // Customer B cannot read Customer A's order...
      await http
        .get(`/api/v1/orders/${orderA.body.id}`)
        .set(authHeader(customerB.body.accessToken))
        .expect(404);

      // ...but the admin can see all orders.
      const adminList = await http
        .get('/api/v1/orders')
        .set(authHeader(adminToken))
        .expect(200);
      expect(adminList.body.meta.total).toBe(1);
    });

    it('advances an order through the status state machine', async () => {
      const adminToken = await loginAdmin();
      const product = await createProduct(adminToken);
      const customerRes = await register('flow4');
      const customerToken = customerRes.body.accessToken as string;

      const order = await http
        .post('/api/v1/orders')
        .set(authHeader(customerToken))
        .send({ items: [{ productId: product.id, quantity: 1 }] })
        .expect(201);

      await http
        .patch(`/api/v1/orders/${order.body.id}/status`)
        .set(authHeader(adminToken))
        .send({ status: OrderStatus.PAID })
        .expect(200);
      await http
        .patch(`/api/v1/orders/${order.body.id}/status`)
        .set(authHeader(adminToken))
        .send({ status: OrderStatus.SHIPPED })
        .expect(200);
      await http
        .patch(`/api/v1/orders/${order.body.id}/status`)
        .set(authHeader(adminToken))
        .send({ status: OrderStatus.DELIVERED })
        .expect(200);

      // Delivered is terminal.
      await http
        .patch(`/api/v1/orders/${order.body.id}/status`)
        .set(authHeader(adminToken))
        .send({ status: OrderStatus.CANCELLED })
        .expect(400);
    });

    it('restocks inventory when a pending order is cancelled', async () => {
      const adminToken = await loginAdmin();
      const product = await createProduct(adminToken, { stock: 10 });
      const customerRes = await register('flow5');
      const customerToken = customerRes.body.accessToken as string;

      const order = await http
        .post('/api/v1/orders')
        .set(authHeader(customerToken))
        .send({ items: [{ productId: product.id, quantity: 4 }] })
        .expect(201);

      await http
        .post(`/api/v1/orders/${order.body.id}/cancel`)
        .set(authHeader(customerToken))
        .expect(201);

      const productAfter = await http
        .get(`/api/v1/products/${product.id}`)
        .expect(200);
      expect(productAfter.body.stock).toBe(10);

      const orderAfter = await http
        .get(`/api/v1/orders/${order.body.id}`)
        .set(authHeader(customerToken))
        .expect(200);
      expect(orderAfter.body.status).toBe(OrderStatus.CANCELLED);
    });

    it('restores stock exactly once under concurrent cancels', async () => {
      const adminToken = await loginAdmin();
      const product = await createProduct(adminToken, { stock: 10 });
      const customerRes = await register('race1');
      const customerToken = customerRes.body.accessToken as string;

      const order = await http
        .post('/api/v1/orders')
        .set(authHeader(customerToken))
        .send({ items: [{ productId: product.id, quantity: 4 }] })
        .expect(201);

      // Fire two cancels at once: the row lock serializes them so only one
      // can win the transition, and stock is restored exactly once.
      const [first, second] = await Promise.all([
        http
          .post(`/api/v1/orders/${order.body.id}/cancel`)
          .set(authHeader(customerToken)),
        http
          .post(`/api/v1/orders/${order.body.id}/cancel`)
          .set(authHeader(customerToken)),
      ]);

      const statuses = [first.status, second.status].sort();
      expect(statuses[0]).toBe(201); // one succeeded
      expect(statuses[1]).toBe(400); // the other saw the terminal state

      const productAfter = await http
        .get(`/api/v1/products/${product.id}`)
        .expect(200);
      expect(productAfter.body.stock).toBe(10); // 4 restored once, not twice
    });
  });
});
