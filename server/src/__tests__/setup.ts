import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

// Global test setup
beforeAll(() => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-key-for-testing-only';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key';
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'mysql://root:@localhost:3306/allgo_test';
});

afterAll(() => {
  // Cleanup after all tests
});

beforeEach(() => {
  // Reset any state before each test
});

afterEach(() => {
  // Cleanup after each test
});
