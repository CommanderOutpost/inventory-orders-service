import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '../../api/reports';
import { formatCurrency, ORDER_STATUS_LABELS, ORDER_STATUS_STYLES } from '../../utils/format';
import type { OrderStatus } from '../../types';

export function AdminReportsPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // datetime-local yields "YYYY-MM-DDTHH:mm"; normalize to full RFC 3339
  // (UTC) which the reporting service requires.
  const toRfc3339 = (value: string): string | undefined =>
    value ? new Date(value).toISOString() : undefined;

  const { data, isPending, isError, refetch, isFetching } = useQuery({
    queryKey: ['reports', 'order-summary', { from, to }],
    queryFn: () =>
      reportsApi.orderSummary({
        from: toRfc3339(from),
        to: toRfc3339(to),
      }),
  });

  const statusCount = (status: OrderStatus): number =>
    data?.ordersByStatus.find((s) => s.status === status)?.count ?? 0;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Order reports</h1>
          <p className="page-subtitle">
            Aggregated by the Golang reporting microservice. Cancelled orders
            are excluded from revenue.
          </p>
        </div>
      </div>

      <div className="toolbar">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          From
          <input
            type="datetime-local"
            className="input"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          To
          <input
            type="datetime-local"
            className="input"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button className="btn btn--ghost" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {isError && (
        <div className="error-block">
          Could not load the report. Make sure the Golang reporting service is
          running (see README → reports) and the date range is valid.
        </div>
      )}

      {isPending && (
        <div className="loading-block">
          <span className="spinner" aria-label="Loading" />
        </div>
      )}

      {!isPending && !isError && data && (
        <>
          <div className="stats-grid">
            <div className="card stat-card">
              <div className="stat-card__label">Total orders</div>
              <div className="stat-card__value">{data.totalOrders}</div>
            </div>
            <div className="card stat-card">
              <div className="stat-card__label">Revenue</div>
              <div className="stat-card__value">
                {formatCurrency(data.totalRevenue)}
              </div>
            </div>
            <div className="card stat-card">
              <div className="stat-card__label">Avg order value</div>
              <div className="stat-card__value">
                {formatCurrency(data.averageOrderValue)}
              </div>
            </div>
            <div className="card stat-card">
              <div className="stat-card__label">Pending</div>
              <div className="stat-card__value">{statusCount('pending')}</div>
            </div>
          </div>

          <div className="detail-grid detail-grid--reports">
            <div className="card detail-card">
              <h3 style={{ marginTop: 0 }}>Orders by status</h3>
              {data.ordersByStatus.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No orders in period.</p>
              ) : (
                <div className="table-wrap" style={{ boxShadow: 'none' }}>
                  <table className="table">
                    <tbody>
                      {data.ordersByStatus.map((row) => (
                        <tr key={row.status}>
                          <td>
                            <span className={ORDER_STATUS_STYLES[row.status]}>
                              {ORDER_STATUS_LABELS[row.status]}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>
                            {row.count}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card detail-card">
              <h3 style={{ marginTop: 0 }}>Top products by revenue</h3>
              {data.topProducts.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No sales in period.</p>
              ) : (
                <div className="table-wrap" style={{ boxShadow: 'none' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>SKU</th>
                        <th>Sold</th>
                        <th>Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topProducts.map((p) => (
                        <tr key={p.productId}>
                          <td>{p.name}</td>
                          <td>
                            <code>{p.sku}</code>
                          </td>
                          <td>{p.quantitySold}</td>
                          <td>{formatCurrency(p.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
