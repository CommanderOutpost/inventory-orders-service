import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { productsApi, type ProductInput } from '../../api/products';
import { ProductFormModal, type ProductFormValues } from '../../components/ProductFormModal';
import { useUiStore } from '../../store/ui';
import { formatCurrency } from '../../utils/format';
import type { Product } from '../../types';
import { Pagination } from '../../components/Pagination';

export function AdminProductsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const pushToast = useUiStore((s) => s.pushToast);
  const queryClient = useQueryClient();

  const { data, isPending, isError } = useQuery({
    queryKey: ['admin-products', { search, page }],
    queryFn: () =>
      productsApi.listAdmin({ search, page, limit: 10, includeInactive: true }),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-products'] });
    queryClient.invalidateQueries({ queryKey: ['products'] });
  };

  const saveMutation = useMutation({
    mutationFn: (input: ProductInput) =>
      editing
        ? productsApi.update(editing.id, input)
        : productsApi.create(input),
    onSuccess: () => {
      pushToast('success', editing ? 'Product updated' : 'Product created');
      setEditing(null);
      setCreating(false);
      invalidate();
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => productsApi.remove(id),
    onSuccess: (res) => {
      pushToast(
        'success',
        res.archived
          ? 'Product archived (it has order history)'
          : 'Product deleted',
      );
      invalidate();
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (product: Product) =>
      productsApi.update(product.id, { isActive: true }),
    onSuccess: () => {
      pushToast('success', 'Product restored to the catalogue');
      invalidate();
    },
  });

  const handleSave = (values: ProductFormValues) => {
    saveMutation.mutate({
      name: values.name,
      sku: values.sku,
      description: values.description || undefined,
      price: Number(values.price),
      stock: Number(values.stock),
      isActive: values.isActive,
    });
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Manage products</h1>
          <p className="page-subtitle">
            Create, edit and archive products. Archived products keep order
            history intact.
          </p>
        </div>
        <button className="btn btn--primary" onClick={() => setCreating(true)}>
          + Add product
        </button>
      </div>

      <div className="toolbar">
        <input
          className="input search-input"
          placeholder="Search products…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {isError && <div className="error-block">Could not load products.</div>}
      {isPending && (
        <div className="loading-block">
          <span className="spinner" aria-label="Loading" />
        </div>
      )}

      {!isPending && !isError && data && (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>SKU</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((product) => (
                  <tr key={product.id} className={product.isActive ? '' : 'is-inactive'}>
                    <td>{product.name}</td>
                    <td>
                      <code>{product.sku}</code>
                    </td>
                    <td>{formatCurrency(product.price)}</td>
                    <td>{product.stock}</td>
                    <td>
                      {product.isActive ? (
                        <span className="badge badge--success">Active</span>
                      ) : (
                        <span className="badge badge--danger">Archived</span>
                      )}
                    </td>
                    <td>
                      <div className="cell-actions">
                        <button
                          className="btn btn--ghost btn--sm"
                          onClick={() => setEditing(product)}
                        >
                          Edit
                        </button>
                        {product.isActive ? (
                          <button
                            className="btn btn--ghost btn--sm"
                            disabled={removeMutation.isPending}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Archive/delete "${product.name}"? Products without order history are deleted; others are archived (hidden from customers).`,
                                )
                              ) {
                                removeMutation.mutate(product.id);
                              }
                            }}
                          >
                            Archive
                          </button>
                        ) : (
                          <button
                            className="btn btn--ghost btn--sm"
                            disabled={restoreMutation.isPending}
                            onClick={() => restoreMutation.mutate(product)}
                          >
                            Restore
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={data.meta.page}
            totalPages={data.meta.totalPages}
            total={data.meta.total}
            onPage={setPage}
          />
        </>
      )}

      {(creating || editing) && (
        <ProductFormModal
          initial={editing}
          saving={saveMutation.isPending}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
