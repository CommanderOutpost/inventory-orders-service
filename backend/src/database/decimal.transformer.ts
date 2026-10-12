import { ValueTransformer } from 'typeorm';

/**
 * Maps PostgreSQL `numeric` columns (returned as strings by the pg driver)
 * to JavaScript numbers so the API and services work with plain numbers.
 * Numbers are safe here: amounts are bounded well below Number.MAX_SAFE_INTEGER.
 */
export const decimalTransformer: ValueTransformer = {
  to: (value?: number | null): string | null =>
    value == null ? null : value.toFixed(2),
  from: (value?: string | null): number | null =>
    value == null ? null : Number.parseFloat(value),
};
