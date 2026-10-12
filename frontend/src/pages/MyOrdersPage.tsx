import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ordersApi } from '../api/orders';
import { useUiStore } from '../store/ui';
import {
  formatCurrency,
  formatDate,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_STYLES,
} from '../utils/format';
import { Pagination } from '../components/Pagination';
import { useState } from 'react';
import type { Order, OrderStatus } from '../types';

const STATUS_FILTERS: Array<OrderStatus | 'all'> = [
  'all',
  'pending',
  'paid',
  'shipped',
  'delivered',
  'cancelled',
];

export function MyOrdersPage() {
  const [status, setStatus] = useState<OrderStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const pushToast = useUiStore((s) => s.pushToast);
  const queryClient = useQueryClient();

  const { data, isPending, isError } = useQuery({
    queryKey: ['orders', { status, page }],
    queryFn: () =>
      ordersApi.list({
        status: status === 'all' ? undefined : status,
        page,
        limit: 10,
      }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => ordersApi.cancel(id),
    onSuccess: () => {
      pushToast('success', 'Order cancelled and inventory restored');
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">My orders</h1>
          <p className="page-subtitle">Track and manage your purchases.</p>
        </div>
      </div>

      <div className="toolbar">
        <select
          className="select"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as OrderStatus | 'all');
            setPage(1);
          }}
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {s === 'all' ? 'All statuses' : ORDER_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {isError && <div className="error-block">Could not load your orders.</div>}
      {isPending && (
        <div className="loading-block">
          <span className="spinner" aria-label="Loading" />
        </div>
      )}

      {!isPending && !isError && data && data.data.length === 0 && (
        <div className="empty-state">
          <h3>No orders yet</h3>
          <p>
            <Link to="/products">Browse products</Link> to place your first
            order.
          </p>
        </div>
      )}

      {!isPending && !isError && data && data.data.length > 0 && (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Placed</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((order) => (
                  <OrderRow
                    key={order.id}
                    order={order}
                    onCancel={() => cancelMutation.mutate(order.id)}
                    cancelling={cancelMutation.isPending}
                  />
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
    </div>
  );
}

function OrderRow({
  order,
  onCancel,
  cancelling,
}: {
  order: Order;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const itemCount = order.items.reduce((sum, i) => sum + i.quantity, 0);
  return (
    <tr>
      <td>
        <Link to={`/orders/${order.id}`}>{order.id.slice(0, 8)}</Link>
      </td>
      <td>{formatDate(order.createdAt)}</td>
      <td>{itemCount}</td>
      <td>{formatCurrency(order.totalAmount)}</td>
      <td>
        <span className={ORDER_STATUS_STYLES[order.status]}>
          {ORDER_STATUS_LABELS[order.status]}
        </span>
      </td>
      <td>
        <div className="cell-actions">
          <Link className="btn btn--ghost btn--sm" to={`/orders/${order.id}`}>
            View
          </Link>
          {order.status === 'pending' && (
            <button
              className="btn btn--danger btn--sm"
              disabled={cancelling}
              onClick={onCancel}
            >
              Cancel
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
