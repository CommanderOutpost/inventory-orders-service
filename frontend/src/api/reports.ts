import { api } from './client';
import type { OrderSummary } from '../types';

export const reportsApi = {
  orderSummary: (params: { from?: string; to?: string } = {}) =>
    api.get<OrderSummary>('/reports/order-summary', { params }).then((r) => r.data),
};
