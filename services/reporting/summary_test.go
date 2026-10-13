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

func TestToUpperBound(t *testing.T) {
	cases := []struct {
		input string
		want  string
	}{
		// Date-only upper bounds become inclusive of the whole day (end of
		// that day in UTC).
		{"2026-10-13", "2026-10-13T23:59:59.999999999Z"},
		// Full timestamps pass through unchanged.
		{"2026-10-13T12:30:00Z", "2026-10-13T12:30:00Z"},
		{"", ""},
	}
	for _, tc := range cases {
		if got := toUpperBound(tc.input); got != tc.want {
			t.Errorf("toUpperBound(%q) = %q, want %q", tc.input, got, tc.want)
		}
	}
}

func TestRequireToken(t *testing.T) {
	unauth := requireToken("secret")
	req := httptest.NewRequest(http.MethodGet, "/api/v1/summary/orders", nil)
	res := httptest.NewRecorder()
	unauth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})).ServeHTTP(res, req)
	if res.Code != http.StatusUnauthorized {
		t.Errorf("no token: status = %d, want 401", res.Code)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/v1/summary/orders", nil)
	req.Header.Set("Authorization", "Bearer secret")
	res = httptest.NewRecorder()
	unauth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})).ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Errorf("valid token: status = %d, want 200", res.Code)
	}

	open := requireToken("")
	req = httptest.NewRequest(http.MethodGet, "/health", nil)
	res = httptest.NewRecorder()
	open(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})).ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Errorf("no token configured: status = %d, want 200", res.Code)
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
