import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ordersApi } from '../../api/orders';
import { useUiStore } from '../../store/ui';
import {
  formatCurrency,
  formatDate,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_STYLES,
} from '../../utils/format';
import { Pagination } from '../../components/Pagination';
import type { OrderStatus } from '../../types';

const STATUS_FILTERS: Array<OrderStatus | 'all'> = [
  'all',
  'pending',
  'paid',
  'shipped',
  'delivered',
  'cancelled',
];

/** Legal transitions mirror the backend state machine. */
const NEXT_STATUSES: Partial<Record<OrderStatus, OrderStatus[]>> = {
  pending: ['paid', 'cancelled'],
  paid: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

export function AdminOrdersPage() {
  const [status, setStatus] = useState<OrderStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const pushToast = useUiStore((s) => s.pushToast);
  const queryClient = useQueryClient();

  const { data, isPending, isError } = useQuery({
    queryKey: ['admin-orders', { status, page }],
    queryFn: () =>
      ordersApi.list({
        status: status === 'all' ? undefined : status,
        page,
        limit: 15,
      }),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status: next }: { id: string; status: OrderStatus }) =>
      ordersApi.updateStatus(id, next),
    onSuccess: (order) => {
      pushToast(
        'success',
        `Order ${order.id.slice(0, 8)} → ${ORDER_STATUS_LABELS[order.status]}`,
      );
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Incoming orders</h1>
          <p className="page-subtitle">
            Review and advance orders through fulfilment.
          </p>
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

      {isError && <div className="error-block">Could not load orders.</div>}
      {isPending && (
        <div className="loading-block">
          <span className="spinner" aria-label="Loading" />
        </div>
      )}

      {!isPending && !isError && data && data.data.length === 0 && (
        <div className="empty-state">No orders found.</div>
      )}

      {!isPending && !isError && data && data.data.length > 0 && (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Placed</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Advance</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((order) => {
                  const next = NEXT_STATUSES[order.status] ?? [];
                  return (
                    <tr key={order.id}>
                      <td>
                        <code>{order.id.slice(0, 8)}</code>
                      </td>
                      <td>
                        {order.user ? (
                          <span title={order.user.email}>
                            {order.user.name}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td>{formatDate(order.createdAt)}</td>
                      <td>
                        {order.items.reduce((sum, i) => sum + i.quantity, 0)}
                      </td>
                      <td>{formatCurrency(order.totalAmount)}</td>
                      <td>
                        <span className={ORDER_STATUS_STYLES[order.status]}>
                          {ORDER_STATUS_LABELS[order.status]}
                        </span>
                      </td>
                      <td>
                        <div className="cell-actions">
                          {next.map((s) => (
                            <button
                              key={s}
                              className="btn btn--ghost btn--sm"
                              disabled={updateStatus.isPending}
                              onClick={() =>
                                updateStatus.mutate({ id: order.id, status: s })
                              }
                            >
                              Mark {ORDER_STATUS_LABELS[s].toLowerCase()}
                            </button>
                          ))}
                          {next.length === 0 && (
                            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                              Terminal
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
