import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Product } from '../types';

export interface CartLine {
  product: Product;
  quantity: number;
}

interface CartState {
  lines: CartLine[];
  add: (product: Product, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      add: (product, quantity = 1) =>
        set((state) => {
          const existing = state.lines.find((l) => l.product.id === product.id);
          if (existing) {
            return {
              lines: state.lines.map((l) =>
                l.product.id === product.id
                  ? { ...l, quantity: Math.min(l.quantity + quantity, product.stock) }
                  : l,
              ),
            };
          }
          return { lines: [...state.lines, { product, quantity }] };
        }),
      setQuantity: (productId, quantity) =>
        set((state) => ({
          lines: state.lines.map((l) =>
            l.product.id === productId
              ? { ...l, quantity: Math.max(1, Math.min(quantity, l.product.stock)) }
              : l,
          ),
        })),
      remove: (productId) =>
        set((state) => ({
          lines: state.lines.filter((l) => l.product.id !== productId),
        })),
      clear: () => set({ lines: [] }),
    }),
    {
      name: 'atlas-cart',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export const selectCartCount = (state: CartState): number =>
  state.lines.reduce((sum, l) => sum + l.quantity, 0);

export const selectCartSubtotal = (state: CartState): number =>
  state.lines.reduce((sum, l) => sum + l.product.price * l.quantity, 0);
