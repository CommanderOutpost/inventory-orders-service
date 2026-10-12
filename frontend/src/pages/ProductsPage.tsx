import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { productsApi } from '../api/products';
import { useCartStore } from '../store/cart';
import { useUiStore } from '../store/ui';
import { useAuthStore } from '../store/auth';
import { formatCurrency } from '../utils/format';
import type { Product } from '../types';
import { Pagination } from '../components/Pagination';

function stockBadge(stock: number) {
  if (stock <= 0) return 'stock-badge stock-badge--out';
  if (stock <= 5) return 'stock-badge stock-badge--low';
  return 'stock-badge stock-badge--in';
}

function stockLabel(stock: number) {
  if (stock <= 0) return 'Out of stock';
  if (stock <= 5) return `Low · ${stock} left`;
  return `In stock · ${stock}`;
}

export function ProductsPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  const addToCart = useCartStore((s) => s.add);
  const isAuthed = useAuthStore((s) => Boolean(s.token));
  const pushToast = useUiStore((s) => s.pushToast);

  const { data, isPending, isError } = useQuery({
    queryKey: ['products', { search: debouncedSearch, sortBy, sortOrder, page }],
    queryFn: () =>
      productsApi.list({
        search: debouncedSearch,
        sortBy,
        sortOrder,
        page,
        limit: 12,
      }),
  });

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedSearch(value), 300);
  };

  const handleAdd = (product: Product, quantity: number) => {
    if (quantity > product.stock) {
      pushToast('error', `Only ${product.stock} in stock`);
      return;
    }
    addToCart(product, quantity);
    pushToast('success', `Added ${quantity} × ${product.name} to cart`);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Products</h1>
          <p className="page-subtitle">
            {isAuthed
              ? 'Browse our catalogue and place an order.'
              : 'Browse our catalogue. Sign in to place an order.'}
          </p>
        </div>
      </div>

      <div className="toolbar">
        <input
          className="input search-input"
          placeholder="Search by name or SKU…"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
        />
        <select
          className="select"
          value={sortBy}
          onChange={(e) => {
            setSortBy(e.target.value);
            setPage(1);
          }}
        >
          <option value="createdAt">Newest</option>
          <option value="name">Name</option>
          <option value="price">Price</option>
          <option value="stock">Stock</option>
        </select>
        <select
          className="select"
          value={sortOrder}
          onChange={(e) => {
            setSortOrder(e.target.value as 'asc' | 'desc');
            setPage(1);
          }}
        >
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select>
      </div>

      {isError && (
        <div className="error-block">
          Could not load products. The API may be offline.
        </div>
      )}

      {isPending && (
        <div className="loading-block">
          <span className="spinner" aria-label="Loading" />
        </div>
      )}

      {!isPending && !isError && data && data.data.length === 0 && (
        <div className="empty-state">No products match your search.</div>
      )}

      {!isPending && !isError && data && data.data.length > 0 && (
        <>
          <div className="products-grid">
            {data.data.map((product) => (
              <article className="product-card" key={product.id}>
                <div className="product-card__top" />
                <div className="product-card__body">
                  <h3 className="product-card__name">{product.name}</h3>
                  <span className="product-card__sku">{product.sku}</span>
                  {product.description && (
                    <p className="product-card__desc">{product.description}</p>
                  )}
                  <div className="product-card__meta">
                    <span className="product-card__price">
                      {formatCurrency(product.price)}
                    </span>
                    <span className={stockBadge(product.stock)}>
                      {stockLabel(product.stock)}
                    </span>
                  </div>
                  <AddToCartButton product={product} onAdd={handleAdd} />
                </div>
              </article>
            ))}
          </div>

          <Pagination
            page={data.meta.page}
            totalPages={data.meta.totalPages}
            onPage={setPage}
            total={data.meta.total}
          />
        </>
      )}
    </div>
  );
}

function AddToCartButton({
  product,
  onAdd,
}: {
  product: Product;
  onAdd: (product: Product, quantity: number) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const out = product.stock <= 0;

  return (
    <div className="qty-row">
      <input
        className="input"
        type="number"
        min={1}
        max={product.stock}
        value={quantity}
        disabled={out}
        onChange={(e) => setQuantity(Number(e.target.value) || 1)}
      />
      <button
        className="btn btn--primary"
        disabled={out}
        style={{ flex: 1 }}
        onClick={() => onAdd(product, quantity)}
      >
        {out ? 'Sold out' : 'Add to cart'}
      </button>
    </div>
  );
}
