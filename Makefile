.PHONY: up down logs db-reset seed test test-backend test-go run-backend run-go run-frontend

# ---- Docker (entire stack) ----
up:
	docker compose up --build
down:
	docker compose down
logs:
	docker compose logs -f

# ---- Local development ----
install:
	cd backend && npm install
	cd frontend && npm install
	cd services/reporting && go mod download

db-create:
	createdb inventory || true

migrate:
	cd backend && npm run migration:run

seed:
	cd backend && npm run seed

run-backend:
	cd backend && npm run start:dev

run-go:
	cd services/reporting && go run .

run-frontend:
	cd frontend && npm run dev

# ---- Tests ----
test: test-backend test-go

test-backend:
	cd backend && npm test && npm run test:e2e

test-go:
	cd services/reporting && go test ./...

db-reset:
	dropdb --if-exists inventory && createdb inventory && make migrate seed
