package main

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"time"
)

const queryTimeout = 5 * time.Second

type OrderStore struct {
	db *sql.DB
}

type StatusCount struct {
	Status string `json:"status"`
	Count  int64  `json:"count"`
}

type TopProduct struct {
	ProductID    string  `json:"productId"`
	Name         string  `json:"name"`
	SKU          string  `json:"sku"`
	QuantitySold int64   `json:"quantitySold"`
	Revenue      float64 `json:"revenue"`
}

type OrderSummary struct {
	GeneratedAt       time.Time     `json:"generatedAt"`
	From              string        `json:"from"`
	To                string        `json:"to"`
	TotalOrders       int64         `json:"totalOrders"`
	TotalRevenue      float64       `json:"totalRevenue"`
	AverageOrderValue float64       `json:"averageOrderValue"`
	OrdersByStatus    []StatusCount `json:"ordersByStatus"`
	TopProducts       []TopProduct  `json:"topProducts"`
}

// GetSummary aggregates order data for the requested period.
// Cancelled orders are excluded from revenue and sales metrics but are
// still broken down in OrdersByStatus. All three aggregation queries run
// inside one read-only repeatable-read transaction so they observe the same
// snapshot of the data.
func (s *OrderStore) GetSummary(ctx context.Context, from, to string) (OrderSummary, error) {
	var summary OrderSummary
	// Always expose arrays (never null) so API consumers can call .length.
	summary.OrdersByStatus = []StatusCount{}
	summary.TopProducts = []TopProduct{}

	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()

	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{
		Isolation: sql.LevelRepeatableRead,
		ReadOnly:  true,
	})
	if err != nil {
		return summary, err
	}
	defer tx.Rollback() //nolint:errcheck // read-only; rollback is discard

	// Overall figures.
	row := tx.QueryRowContext(ctx, `
		SELECT
			COUNT(*) FILTER (WHERE status <> 'cancelled') AS total_orders,
			COALESCE(SUM(total_amount) FILTER (WHERE status <> 'cancelled'), 0) AS total_revenue,
			COALESCE(AVG(total_amount) FILTER (WHERE status <> 'cancelled'), 0) AS average_order_value
		FROM orders
		WHERE ($1::timestamptz IS NULL OR created_at >= $1::timestamptz)
		  AND ($2::timestamptz IS NULL OR created_at <= $2::timestamptz)`,
		nullableDate(from), nullableDate(toUpperBound(to)),
	)
	if err := row.Scan(&summary.TotalOrders, &summary.TotalRevenue, &summary.AverageOrderValue); err != nil {
		return summary, err
	}

	// Status breakdown (all orders, including cancelled).
	statusRows, err := tx.QueryContext(ctx, `
		SELECT status, COUNT(*) FROM orders
		WHERE ($1::timestamptz IS NULL OR created_at >= $1::timestamptz)
		  AND ($2::timestamptz IS NULL OR created_at <= $2::timestamptz)
		GROUP BY status ORDER BY status`,
		nullableDate(from), nullableDate(toUpperBound(to)),
	)
	if err != nil {
		return summary, err
	}
	defer statusRows.Close()

	for statusRows.Next() {
		var sc StatusCount
		if err := statusRows.Scan(&sc.Status, &sc.Count); err != nil {
			return summary, err
		}
		summary.OrdersByStatus = append(summary.OrdersByStatus, sc)
	}
	if err := statusRows.Err(); err != nil {
		return summary, err
	}

	// Top selling products by revenue.
	productRows, err := tx.QueryContext(ctx, `
		SELECT p.id, p.name, p.sku,
		       SUM(oi.quantity)::bigint AS quantity_sold,
		       SUM(oi.line_total)::float8 AS revenue
		FROM order_items oi
		JOIN orders o  ON o.id = oi.order_id
		JOIN products p ON p.id = oi.product_id
		WHERE o.status <> 'cancelled'
		  AND ($1::timestamptz IS NULL OR o.created_at >= $1::timestamptz)
		  AND ($2::timestamptz IS NULL OR o.created_at <= $2::timestamptz)
		GROUP BY p.id, p.name, p.sku
		ORDER BY revenue DESC
		LIMIT 10`,
		nullableDate(from), nullableDate(toUpperBound(to)),
	)
	if err != nil {
		return summary, err
	}
	defer productRows.Close()

	for productRows.Next() {
		var tp TopProduct
		if err := productRows.Scan(&tp.ProductID, &tp.Name, &tp.SKU, &tp.QuantitySold, &tp.Revenue); err != nil {
			return summary, err
		}
		summary.TopProducts = append(summary.TopProducts, tp)
	}
	if err := productRows.Err(); err != nil {
		return summary, err
	}

	summary.GeneratedAt = time.Now().UTC()
	summary.From = from
	summary.To = to

	return summary, nil
}

// nullableDate converts an empty string to nil so SQL can use the
// `IS NULL` branch (i.e. no lower bound).
func nullableDate(value string) any {
	if value == "" {
		return nil
	}
	return value
}

// toUpperBound makes a date-only `to` value (YYYY-MM-DD) inclusive of that
// whole day by shifting the upper bound to the end of the day in UTC. Full
// timestamps pass through unchanged, so `<=` keeps its exact semantics.
func toUpperBound(to string) string {
	if to == "" {
		return ""
	}
	if t, err := time.Parse("2006-01-02", to); err == nil {
		return t.AddDate(0, 0, 1).Add(-time.Nanosecond).Format(time.RFC3339Nano)
	}
	return to
}

type SummaryHandler struct {
	store *OrderStore
}

func (h *SummaryHandler) health(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	if err := h.store.db.PingContext(ctx); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{
			"status": "degraded",
			"db":     "down",
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"status": "ok",
		"db":     "up",
	})
}

func (h *SummaryHandler) orderSummary(w http.ResponseWriter, r *http.Request) {
	from := r.URL.Query().Get("from")
	to := r.URL.Query().Get("to")

	if (from != "" && !isSupportedDate(from)) || (to != "" && !isSupportedDate(to)) {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error": "from and to must be RFC 3339 timestamps or YYYY-MM-DD dates",
		})
		return
	}

	summary, err := h.store.GetSummary(r.Context(), from, to)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			writeJSON(w, http.StatusGatewayTimeout, map[string]string{"error": "query timed out"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{
			"error": "failed to build order summary",
		})
		return
	}

	writeJSON(w, http.StatusOK, summary)
}

// isSupportedDate accepts full RFC 3339 timestamps as well as simpler
// date-only / minute-precision values (treated as UTC by Postgres).
func isSupportedDate(value string) bool {
	for _, layout := range []string{
		time.RFC3339,
		time.RFC3339Nano,
		"2006-01-02T15:04:05",
		"2006-01-02T15:04",
		"2006-01-02",
	} {
		if _, err := time.Parse(layout, value); err == nil {
			return true
		}
	}
	return false
}
