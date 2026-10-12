import { useState } from 'react';
import type { Product } from '../types';
import { Modal } from './Modal';

export interface ProductFormValues {
  name: string;
  sku: string;
  description: string;
  price: string;
  stock: string;
  isActive: boolean;
}

export function ProductFormModal({
  initial,
  saving,
  onSave,
  onClose,
}: {
  initial: Product | null;
  saving: boolean;
  onSave: (values: ProductFormValues) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<ProductFormValues>({
    name: initial?.name ?? '',
    sku: initial?.sku ?? '',
    description: initial?.description ?? '',
    price: initial ? String(initial.price) : '',
    stock: initial ? String(initial.stock) : '',
    isActive: initial?.isActive ?? true,
  });

  const set = (key: keyof ProductFormValues, value: string | boolean) =>
    setValues((v) => ({ ...v, [key]: value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(values);
  };

  return (
    <Modal
      title={initial ? `Edit ${initial.name}` : 'Add product'}
      onClose={onClose}
    >
      <form className="form" onSubmit={submit}>
        <div className="form-field">
          <label htmlFor="pf-name">Name</label>
          <input
            id="pf-name"
            className="input"
            required
            minLength={2}
            maxLength={200}
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </div>

        <div className="form-field">
          <label htmlFor="pf-sku">SKU</label>
          <input
            id="pf-sku"
            className="input"
            required
            pattern="[A-Z0-9_-]+"
            title="Uppercase letters, numbers, dashes and underscores"
            value={values.sku}
            onChange={(e) => set('sku', e.target.value.toUpperCase())}
          />
          <span className="hint">Uppercase only (e.g. COF-ARB-1KG).</span>
        </div>

        <div className="form-field">
          <label htmlFor="pf-desc">Description</label>
          <textarea
            id="pf-desc"
            className="textarea"
            rows={3}
            maxLength={2000}
            value={values.description}
            onChange={(e) => set('description', e.target.value)}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-field">
            <label htmlFor="pf-price">Price (USD)</label>
            <input
              id="pf-price"
              className="input"
              type="number"
              required
              min={0.01}
              step={0.01}
              value={values.price}
              onChange={(e) => set('price', e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="pf-stock">Stock</label>
            <input
              id="pf-stock"
              className="input"
              type="number"
              required
              min={0}
              step={1}
              value={values.stock}
              onChange={(e) => set('stock', e.target.value)}
            />
          </div>
        </div>

        <label
          style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}
        >
          <input
            type="checkbox"
            checked={values.isActive}
            onChange={(e) => set('isActive', e.target.checked)}
          />
          Active (visible to customers)
        </label>

        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn--primary"
            disabled={saving}
          >
            {saving ? 'Saving…' : initial ? 'Save changes' : 'Create product'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
