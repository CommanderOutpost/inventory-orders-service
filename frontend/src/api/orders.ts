import { api } from './client';
import type { Order, OrderStatus, Paginated } from '../types';

export interface CreateOrderInput {
  items: Array<{ productId: string; quantity: number }>;
  notes?: string;
}

export const ordersApi = {
  list: (params: { page?: number; limit?: number; status?: OrderStatus } = {}) =>
    api.get<Paginated<Order>>('/orders', { params }).then((r) => r.data),

  get: (id: string) => api.get<Order>(`/orders/${id}`).then((r) => r.data),

  create: (input: CreateOrderInput) =>
    api.post<Order>('/orders', input).then((r) => r.data),

  updateStatus: (id: string, status: OrderStatus) =>
    api.patch<Order>(`/orders/${id}/status`, { status }).then((r) => r.data),

  cancel: (id: string) =>
    api.post<Order>(`/orders/${id}/cancel`).then((r) => r.data),
};
