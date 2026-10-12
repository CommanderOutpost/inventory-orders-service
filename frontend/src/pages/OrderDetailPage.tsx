import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ordersApi } from '../api/orders';
import {
  formatCurrency,
  formatDate,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_STYLES,
} from '../utils/format';

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: order, isPending, isError } = useQuery({
    queryKey: ['orders', id],
    queryFn: () => ordersApi.get(id!),
    enabled: Boolean(id),
  });

  if (isPending) {
    return (
      <div className="loading-block">
        <span className="spinner" aria-label="Loading" />
      </div>
    );
  }

  if (isError || !order) {
    return (
      <div className="error-block">
        Order not found. <Link to="/orders">Back to my orders</Link>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Order {order.id.slice(0, 8)}</h1>
          <p className="page-subtitle">
            Placed {formatDate(order.createdAt)}
          </p>
        </div>
        <span className={ORDER_STATUS_STYLES[order.status]}>
          {ORDER_STATUS_LABELS[order.status]}
        </span>
      </div>

      <div className="detail-grid">
        <div className="card detail-card">
          <h3 style={{ marginTop: 0 }}>Items</h3>
          <div className="table-wrap" style={{ boxShadow: 'none' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Unit price</th>
                  <th>Qty</th>
                  <th>Line total</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.product?.name ?? item.productId}
                      {item.product && (
                        <span style={{ color: 'var(--text-muted)' }}>
                          {' '}
                          · {item.product.sku}
                        </span>
                      )}
                    </td>
                    <td>{formatCurrency(item.unitPrice)}</td>
                    <td>{item.quantity}</td>
                    <td>{formatCurrency(item.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {order.notes && (
            <p style={{ marginTop: 14, color: 'var(--text-muted)' }}>
              <strong>Notes:</strong> {order.notes}
            </p>
          )}
        </div>

        <aside className="card detail-card">
          <h3 style={{ marginTop: 0 }}>Summary</h3>
          <dl style={{ margin: 0 }}>
            <div className="detail-row">
              <dt>Order ID</dt>
              <dd>{order.id}</dd>
            </div>
            <div className="detail-row">
              <dt>Status</dt>
              <dd>{ORDER_STATUS_LABELS[order.status]}</dd>
            </div>
            <div className="detail-row">
              <dt>Placed</dt>
              <dd>{formatDate(order.createdAt)}</dd>
            </div>
            <div className="detail-row">
              <dt>Total</dt>
              <dd>{formatCurrency(order.totalAmount)}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  );
}
