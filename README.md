# Inventory & Orders Service

A small but complete full-stack **Inventory & Orders** application built for a technical assessment:

- **Backend** — NestJS (TypeScript) REST API with PostgreSQL, JWT auth (admin/customer), migrations, validation and centralised error handling.
- **Frontend** — React (TypeScript) + Vite SPA for browsing products, placing orders, order history, and an admin console.
- **Golang microservice** — a standalone reporting service that aggregates order summaries; the NestJS API calls it over HTTP.

> Cancelled orders are excluded from revenue metrics; price snapshots preserve order history; stock is decremented/restored transactionally so concurrent orders can never oversell.

---

## Architecture

```
                        ┌─────────────────────────────┐
                        │  React SPA (Vite, :5173)    │
                        │  TanStack Query + Zustand   │
                        └──────────────┬──────────────┘
                                       │  /api/v1/*
                                       ▼
                        ┌─────────────────────────────┐
                        │  NestJS API (:3000)         │
                        │  JWT · Roles · Validation   │
                        └──────┬──────────────┬───────┘
                               │  TypeORM      │  HTTP
                               ▼              ▼
                    ┌──────────────────┐  ┌──────────────────────┐
                    │ PostgreSQL (:5432)│  │ Go reporting (:8080) │
                    └──────────────────┘  └──────────────────────┘
```

## Repository layout

```
.
├── backend/              # NestJS REST API
│   ├── src/
│   │   ├── auth/         # JWT auth, roles, strategy
│   │   ├── common/       # guards, decorators, error filter, pagination
│   │   ├── config/       # validated env config (Joi)
│   │   ├── database/     # entities + snake_case naming strategy
│   │   ├── migrations/   # schema migrations (source of truth)
│   │   ├── orders/       # order placement, status state machine
│   │   ├── products/     # product CRUD (hard/soft delete)
│   │   ├── reports/      # thin proxy → Go service
│   │   └── users/        # user persistence
│   └── test/             # e2e suite (real Postgres)
├── frontend/             # React + Vite SPA
│   └── src/
│       ├── api/          # typed API clients (axios)
│       ├── components/   # layout, guards, modal, pagination, toasts
│       ├── pages/        # customer + admin pages
│       ├── store/        # Zustand: auth, cart, UI toasts
│       └── types/        # shared domain types
└── services/reporting/   # Golang reporting microservice
```

## Features

### Authentication & authorization
- Register (creates a `customer`) and login → JWT (`1d` expiry, `BCRYPT`-hashed passwords).
- Two roles enforced by a global `JwtAuthGuard` + `RolesGuard`:
  - `admin` — manage products, view/advance **all** orders, reports.
  - `customer` — place and view **own** orders, cancel own pending orders.
- `@Public()` opt-out for login/register/products/health. Passwords are never serialised.

### Products
- Public browsing with pagination, search (name/SKU, case-insensitive) and sorting.
- Admin CRUD. Deleting a product that has order history **soft-archives** it (`isActive=false`) to preserve referential integrity; otherwise it is hard-deleted. Archived products can be restored.
- `@VersionColumn` optimistic locking on stock updates.

### Orders (the core flow)
- Place an order: server-side price calculation with **unit-price snapshots**, atomically **decrements stock** inside a transaction using pessimistic row locks (rows locked in id-sorted order to avoid deadlocks), rejects insufficient stock with a clear message.
- Status state machine: `pending → paid → shipped → delivered`, cancellable from `pending`/`paid`. **Cancelling restores stock.**
- Status transitions and cancellation take a **pessimistic lock on the order row**, so concurrent cancels serialize and stock is restored exactly once (covered by a unit test and a concurrent e2e test).
- Customers can cancel their own pending orders; admins advance status. Scoping prevents customers from seeing other customers’ orders (404, no leakage).

### Reporting (Golang microservice)
- `GET /api/v1/summary/orders?from=&to=` aggregates totals, revenue, average order value, orders-by-status and top products by revenue.
- The NestJS API proxies it (`GET /api/v1/reports/order-summary`, admin only) with a 5s timeout; a clear 503 is returned when the Go service is down.

## Quick start

### Option A — Docker (whole stack)
```bash
echo "JWT_SECRET=$(openssl rand -hex 32)" > .env   # required: compose fails fast without it
docker compose up --build
# frontend  → http://localhost:5173
# backend   → http://localhost:3000/api/v1  (Swagger at /docs)
# reporting → http://localhost:8080
```
The backend applies migrations automatically on startup. Seeded demo data (admin + 8 products) is **not** auto-inserted — run:

```bash
docker compose exec backend node dist/seed.js
```

### Option B — Local development
Prerequisites: Node 20+, PostgreSQL 14+, Go 1.22+.

```bash
# 1. install deps
make install

# 2. database
createdb inventory
make migrate        # applies TypeORM migrations
make seed           # admin + sample products

# 3. run the three services (three terminals)
make run-backend    # :3000
make run-go         # :8080
make run-frontend   # :5173 (proxies /api to :3000)
```

Demo credentials (from seed): **admin@example.com / Admin123!**. Register a customer from the UI.

### Environment variables
Copy the examples and adjust:
```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | *(required)* | Postgres DSN, e.g. `postgres://localhost:5432/inventory` |
| `JWT_SECRET` | *(required)* | ≥16 chars |
| `JWT_EXPIRES_IN` | `1d` | token lifetime |
| `CORS_ORIGINS` | `http://localhost:5173` | comma-separated |
| `REPORTING_SERVICE_URL` | `http://localhost:8080` | Go service base URL |
| `DB_SYNCHRONIZE` | `false` | keep false; migrations are the source of truth |

## API overview

Base path `/api/v1`. Errors always return `{ statusCode, message, error, path, timestamp }`; list endpoints return `{ data, meta: { page, limit, total, totalPages } }`. Interactive docs at `/docs` (Swagger).

| Method | Path | Access |
| --- | --- | --- |
| `POST` | `/auth/register` | public |
| `POST` | `/auth/login` | public |
| `GET` | `/auth/me` | any authenticated |
| `GET` | `/products` · `/products/:id` | public (active products only) |
| `GET` | `/products/admin` | admin (includes archived) |
| `POST`/`PATCH`/`DELETE` | `/products...` | admin |
| `POST` | `/orders` | customer |
| `GET` | `/orders` · `/orders/:id` | customer (own) / admin (all) |
| `PATCH` | `/orders/:id/status` | admin |
| `POST` | `/orders/:id/cancel` | customer (own, pending) |
| `GET` | `/reports/order-summary` | admin |
| `GET` | `/health` | public |

## Data model

- **users** — id, email (unique), password_hash, name, role (`admin`/`customer`)
- **products** — id, name, sku (unique), description, price (`numeric(12,2)`), stock, is_active, version
- **orders** — id, user_id, status (enum), total_amount, notes
- **order_items** — order_id, product_id, quantity, unit_price (snapshot), line_total

Prices use `numeric` columns and are exposed as JS numbers via a value transformer. Foreign keys are indexed; order items cascade-delete with their order.

## Tests

```bash
# Backend unit tests (auth, products, users, orders)
cd backend && npm test

# Backend e2e tests against a real Postgres (creates/uses `inventory_test`)
createdb inventory_test
cd backend && npm run test:e2e

# Go tests (unit + optional integration when TEST_DATABASE_URL is set)
cd services/reporting && go test ./...

# Frontend tests (cart store invariants, formatters) + lint/type checks
cd frontend && npm test
cd backend && npm run lint
```

The e2e suite covers the **core order flow**: registration/login, RBAC, stock decrement on order placement, oversell rejection, order visibility scoping, the status state machine, restock-on-cancel, and exactly-once restock under concurrent cancels.

## Assumptions & trade-offs

- **Cancelled orders** are excluded from revenue/reporting metrics but still appear in the status breakdown.
- **Price snapshots** are stored per line item; later product price edits never rewrite historical orders.
- **Delete semantics**: products with order history are soft-archived rather than deleted to keep history valid; clean products are hard-deleted.
- **Money** is stored as `numeric(12,2)` in Postgres and surfaced as JS numbers — fine for this scale (well below `Number.MAX_SAFE_INTEGER`); a decimal library would be warranted for very large volumes.
- **No payments** — order placement creates a `pending` order; an admin advances it to `paid`/`shipped`/`delivered`.
- **Row locking** (pessimistic) chosen over pure optimistic retry for simplicity and guaranteed correctness under concurrency; products also carry a `version` column for extra safety.
- **Global error filter** returns structured errors; the frontend normalises them into toasts and auto-logs-out on 401.
- **Reporting** runs a dedicated Go process that owns the aggregation SQL; the API stays a thin proxy so the two teams/services can evolve independently.

## What I would improve with more time

- Add paginated order detail / cursor pagination for large datasets and a `money` decimal type end-to-end.
- Idempotency keys on `POST /orders` to prevent duplicate submissions on retries.
- Refresh-token rotation and per-user session revocation (token version column).
- Rate limiting (`@nestjs/throttler`), audit logging of admin mutations, and row-level security.
- Event-driven reporting (e.g. emit `order.placed` to a queue) so the Go service doesn’t re-read orders on demand.
- Frontend: e2e tests (Playwright) and more granular skeleton loading states.
- CI pipeline (GitHub Actions) running unit + e2e + Go tests on every push.
