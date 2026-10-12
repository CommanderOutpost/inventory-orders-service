package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestIsSupportedDate(t *testing.T) {
	cases := []struct {
		input string
		want  bool
	}{
		{"2026-10-12T00:00:00Z", true},
		{"2026-10-12T00:00:00+01:00", true},
		{"2026-10-12T00:00:00", true},
		{"2026-10-12T14:30", true},
		{"2026-10-12", true},
		{"", false},
		{"not-a-date", false},
	}
	for _, tc := range cases {
		if got := isSupportedDate(tc.input); got != tc.want {
			t.Errorf("isSupportedDate(%q) = %v, want %v", tc.input, got, tc.want)
		}
	}
}

// Query validation runs before any database access, so these cases are
// deterministic and do not require a running Postgres instance.
func TestOrderSummaryRejectsInvalidParams(t *testing.T) {
	handler := &SummaryHandler{store: &OrderStore{}}

	for _, query := range []string{"?from=not-a-date", "?to=nonsense", "?from=10/12/2026", "?from=2026-13-45"} {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/summary/orders"+query, nil)
		rec := httptest.NewRecorder()

		handler.orderSummary(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Errorf("query %q: status = %d, want %d", query, rec.Code, http.StatusBadRequest)
		}
	}
}

// Integration test: exercises the real aggregation queries against a
// Postgres instance. Skipped unless TEST_DATABASE_URL is provided, so the
// default `go test` run stays green without a database.
func TestOrderSummaryIntegration(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping integration test")
	}

	db, err := openDB(databaseURL)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	handler := &SummaryHandler{store: &OrderStore{db: db}}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/summary/orders", nil)
	rec := httptest.NewRecorder()

	handler.orderSummary(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body: %s)", rec.Code, rec.Body.String())
	}

	var summary OrderSummary
	if err := json.NewDecoder(strings.NewReader(rec.Body.String())).Decode(&summary); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if summary.GeneratedAt.IsZero() {
		t.Error("generatedAt should be set")
	}
	if summary.OrdersByStatus == nil {
		t.Error("ordersByStatus should be present")
	}
}
