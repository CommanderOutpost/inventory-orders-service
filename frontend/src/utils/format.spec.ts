import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatDate,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_STYLES,
} from './format';

describe('formatCurrency', () => {
  it('formats with USD currency and two decimals', () => {
    expect(formatCurrency(12.5)).toBe('$12.50');
    expect(formatCurrency(0)).toBe('$0.00');
    expect(formatCurrency(1999)).toBe('$1,999.00');
  });
});

describe('formatDate', () => {
  it('returns a localized date string', () => {
    const out = formatDate('2026-10-12T10:30:00.000Z');
    expect(out).toMatch(/2026/);
    expect(out).toMatch(/Oct/);
  });
});

describe('order status helpers', () => {
  it('labels every status exactly once', () => {
    expect(Object.keys(ORDER_STATUS_LABELS).sort()).toEqual([
      'cancelled',
      'delivered',
      'paid',
      'pending',
      'shipped',
    ]);
  });

  it('provides a style class for every status', () => {
    for (const status of Object.keys(ORDER_STATUS_LABELS)) {
      expect(ORDER_STATUS_STYLES[status as keyof typeof ORDER_STATUS_STYLES]).toMatch(
        /^badge /,
      );
    }
  });
});