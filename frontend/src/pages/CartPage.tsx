import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ordersApi } from '../api/orders';
import { selectCartSubtotal, useCartStore } from '../store/cart';
import { useAuthStore } from '../store/auth';
import { useUiStore } from '../store/ui';
import { formatCurrency } from '../utils/format';

export function CartPage() {
  const lines = useCartStore((s) => s.lines);
  const setQuantity = useCartStore((s) => s.setQuantity);
  const remove = useCartStore((s) => s.remove);
  const clear = useCartStore((s) => s.clear);
  const subtotal = useCartStore(selectCartSubtotal);
  const token = useAuthStore((s) => s.token);
  const pushToast = useUiStore((s) => s.pushToast);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const placeOrder = useMutation({
    mutationFn: () =>
      ordersApi.create({
        items: lines.map((l) => ({
          productId: l.product.id,
          quantity: l.quantity,
        })),
      }),
    onSuccess: (order) => {
      clear();
      pushToast('success', `Order ${order.id.slice(0, 8)} placed successfully`);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      navigate(`/orders/${order.id}`);
    },
  });

  if (lines.length === 0) {
    return (
      <div className="empty-state">
        <h2>Your cart is empty</h2>
        <p>
          <Link to="/products">Browse products</Link> to get started.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Your cart</h1>
          <p className="page-subtitle">{lines.length} line item(s)</p>
        </div>
      </div>

      <div className="cart-layout">
        <div className="card">
          {lines.map((line) => (
            <div className="cart-line" key={line.product.id}>
              <div className="cart-line__info">
                <p className="cart-line__name">{line.product.name}</p>
                <span className="cart-line__meta">
                  {line.product.sku} · {formatCurrency(line.product.price)} each
                  · {line.product.stock} available
                </span>
              </div>
              <input
                className="input"
                type="number"
                min={1}
                max={line.product.stock}
                value={line.quantity}
                style={{ width: 72, textAlign: 'center' }}
                onChange={(e) =>
                  setQuantity(line.product.id, Number(e.target.value) || 1)
                }
              />
              <span className="cart-line__price">
                {formatCurrency(line.product.price * line.quantity)}
              </span>
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => remove(line.product.id)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <aside className="card order-summary">
          <h3 style={{ margin: '0 0 12px' }}>Order summary</h3>
          <div className="summary-row">
            <span>Subtotal</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          <div className="summary-row">
            <span>Shipping</span>
            <span>Free</span>
          </div>
          <div className="summary-row summary-row--total">
            <span>Total</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>

          {token ? (
            <button
              className="btn btn--success btn--block"
              style={{ marginTop: 16 }}
              disabled={placeOrder.isPending || lines.length === 0}
              onClick={() => placeOrder.mutate()}
            >
              {placeOrder.isPending ? 'Placing order…' : 'Place order'}
            </button>
          ) : (
            <Link
              to="/login"
              className="btn btn--primary btn--block"
              style={{ marginTop: 16 }}
            >
              Sign in to check out
            </Link>
          )}
        </aside>
      </div>
    </div>
  );
}
