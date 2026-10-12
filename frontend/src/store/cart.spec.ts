import { describe, it, expect, beforeEach } from 'vitest';
import { useCartStore, selectCartCount, selectCartSubtotal } from './cart';
import type { Product } from '../types';

const product = (overrides: Partial<Product> = {}): Product => ({
  id: 'p1',
  name: 'Coffee',
  sku: 'COF-1',
  description: null,
  price: 10,
  stock: 5,
  isActive: true,
  version: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

describe('cart store', () => {
  beforeEach(() => {
    useCartStore.setState({ lines: [] }, false);
    localStorage.clear();
  });

  it('adds a new product line', () => {
    useCartStore.getState().add(product());
    useCartStore.getState().add(product({ id: 'p2' }));

    expect(useCartStore.getState().lines).toHaveLength(2);
    expect(selectCartCount(useCartStore.getState())).toBe(2);
  });

  it('merges quantity when the same product is added again', () => {
    useCartStore.getState().add(product());
    useCartStore.getState().add(product());

    expect(useCartStore.getState().lines).toHaveLength(1);
    expect(useCartStore.getState().lines[0].quantity).toBe(2);
  });

  it('clamps quantity to available stock', () => {
    useCartStore.getState().add(product());
    useCartStore.getState().add(product(), 99);

    expect(useCartStore.getState().lines[0].quantity).toBe(5);
  });

  it('clamps setQuantity between 1 and stock', () => {
    const p = product();
    useCartStore.getState().add(p);
    useCartStore.getState().setQuantity(p.id, 0);
    expect(useCartStore.getState().lines[0].quantity).toBe(1);

    useCartStore.getState().setQuantity(p.id, 999);
    expect(useCartStore.getState().lines[0].quantity).toBe(5);
  });

  it('removes a line and clears the cart', () => {
    useCartStore.getState().add(product());
    useCartStore.getState().remove('p1');
    expect(useCartStore.getState().lines).toHaveLength(0);

    useCartStore.getState().add(product());
    useCartStore.getState().clear();
    expect(selectCartSubtotal(useCartStore.getState())).toBe(0);
  });

  it('computes the subtotal from server prices', () => {
    useCartStore.getState().add(product({ price: 12.5 }), 3);

    expect(selectCartSubtotal(useCartStore.getState())).toBe(37.5);
  });

  it('persists the cart across store re-hydration', () => {
    useCartStore.getState().add(product());
    useCartStore.persist.rehydrate();

    const state = useCartStore.getState();
    expect(state.lines).toHaveLength(1);
    expect(state.lines[0].product.id).toBe('p1');
  });
});