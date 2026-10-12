import { api } from './client';
import type { Paginated, Product } from '../types';

export interface ProductQuery {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  includeInactive?: boolean;
}

export interface ProductInput {
  name: string;
  sku: string;
  description?: string;
  price: number;
  stock: number;
  isActive?: boolean;
}

export const productsApi = {
  list: (query: ProductQuery = {}) =>
    api
      .get<Paginated<Product>>('/products', { params: query })
      .then((r) => r.data),

  get: (id: string) =>
    api.get<Product>(`/products/${id}`).then((r) => r.data),

  create: (input: ProductInput) =>
    api.post<Product>('/products', input).then((r) => r.data),

  update: (id: string, input: Partial<ProductInput>) =>
    api.patch<Product>(`/products/${id}`, input).then((r) => r.data),

  remove: (id: string) =>
    api
      .delete<{ deleted: boolean; archived: boolean }>(`/products/${id}`)
      .then((r) => r.data),
};
