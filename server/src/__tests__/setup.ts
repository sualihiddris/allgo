import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

// Global test setup
beforeAll(() => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  // Legacy secret is still configured (migration not yet complete) but is no
  // longer used to sign or verify any token type.
  process.env.JWT_SECRET = 'test-secret-key-for-testing-only';
  // Per-token-type signing secrets. Each must be distinct so tests can prove
  // that a token signed with one type's secret cannot be verified as another
  // token type, even if its payload `type` claim is tampered with.
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-key-distinct-32chars-min';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-distinct-32chars-min';
  process.env.JWT_TOTP_SECRET = 'test-totp-secret-key-distinct-32chars-min';
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
