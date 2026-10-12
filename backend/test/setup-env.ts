/**
 * Sets environment variables BEFORE any module is imported, so the app under
 * test connects to an isolated test database and never touches dev data.
 */
process.env.NODE_ENV = 'test';
process.env.PORT = '3100';
process.env.DATABASE_URL = 'postgres://localhost:5432/inventory_test';
process.env.DB_SYNCHRONIZE = 'false';
process.env.DB_LOGGING = 'false';
process.env.JWT_SECRET = 'e2e-test-secret-0123456789abcdef';
process.env.JWT_EXPIRES_IN = '1h';
process.env.REPORTING_SERVICE_URL = 'http://localhost:8080';
