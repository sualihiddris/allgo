# Testing Infrastructure

## Overview
This document describes the testing infrastructure for the AllGo monorepo.

## Test Frameworks

### Server (Backend)
- **Framework:** Vitest
- **Additional Tools:** Supertest for API testing
- **Location:** `/server/src/__tests__/`

### Customer App (React Native)
- **Framework:** Jest + React Native Testing Library
- **Location:** `/apps/customer/src/__tests__/`

### Shared Package
- **Framework:** Vitest
- **Location:** `/shared/**/__tests__/`

## Running Tests

### All Packages
```bash
# Run all tests across workspace
npm test

# Watch mode
npm test -- --watch

# With coverage
npm run test:coverage
```

### Individual Packages
```bash
# Server tests
cd server
npm test
npm run test:watch
npm run test:coverage

# Customer app tests
cd apps/customer
npm test
npm run test:watch
npm run test:coverage

# Shared package tests
cd shared
npm test
npm run test:watch
npm run test:coverage
```

## Test Structure

### Server Tests
```
server/src/__tests__/
├── setup.ts              # Global test configuration
├── utils/               # Utility function tests
│   ├── phone.test.ts
│   └── generators.test.ts
├── services/            # Service layer tests
│   ├── jwt.test.ts
│   ├── fare.test.ts
│   └── auth.test.ts
└── routes/              # API endpoint tests (integration)
    ├── auth.test.ts
    └── booking.test.ts
```

### Customer App Tests
```
apps/customer/src/__tests__/
├── setup.ts             # Global test configuration
├── example.test.tsx     # Example component test
├── components/          # Component tests
├── hooks/              # Custom hook tests
└── screens/            # Screen flow tests
```

### Shared Package Tests
```
shared/
├── constants/__tests__/
│   └── constants.test.ts
└── types/__tests__/
    └── validation.test.ts
```

## Writing Tests

### Unit Test Example (Vitest)
```typescript
import { describe, it, expect } from 'vitest';
import { calculateFare } from '@/services/fare';

describe('Fare Calculator', () => {
  it('should calculate correct fare for MOTO', () => {
    const fare = calculateFare({
      vehicleType: 'MOTO',
      distanceMeters: 5000,
    });
    
    expect(fare.total).toBeGreaterThan(0);
  });
});
```

### Component Test Example (Jest)
```typescript
import { render, screen } from '@testing-library/react-native';
import BookingConfirm from '@/screens/BookingConfirm';

describe('BookingConfirm', () => {
  it('displays fare estimate', () => {
    render(<BookingConfirm fare={15.00} />);
    expect(screen.getByText(/GHS 15.00/)).toBeTruthy();
  });
});
```

### API Integration Test Example
```typescript
import request from 'supertest';
import app from '@/app';

describe('POST /api/auth/otp', () => {
  it('sends OTP to valid phone number', async () => {
    const res = await request(app)
      .post('/api/auth/otp')
      .send({ phone: '+233241234567' });
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message');
  });
});
```

## Test Coverage Goals

| Package | Target | Current |
|---------|--------|---------|
| Server | 70% | TBD |
| Customer App | 60% | TBD |
| Shared | 80% | TBD |

## Best Practices

### 1. Test Naming
```typescript
describe('ComponentName', () => {
  it('should do something specific', () => {
    // test code
  });
});
```

### 2. AAA Pattern
```typescript
it('should calculate fare correctly', () => {
  // Arrange
  const input = { vehicleType: 'MOTO', distance: 5000 };
  
  // Act
  const result = calculateFare(input);
  
  // Assert
  expect(result.total).toBeGreaterThan(0);
});
```

### 3. Mock External Dependencies
```typescript
vi.mock('@/services/sms', () => ({
  sendSMS: vi.fn(() => Promise.resolve({ success: true })),
}));
```

### 4. Test Edge Cases
- Empty inputs
- Invalid data
- Boundary values
- Error conditions

### 5. Keep Tests Fast
- Mock database calls
- Avoid real API calls
- Use test doubles

## CI/CD Integration

Tests should run automatically:
- On every commit (pre-commit hook)
- On pull requests
- Before deployment

```yaml
# Example GitHub Actions
- name: Run Tests
  run: npm test
  
- name: Check Coverage
  run: npm run test:coverage
```

## Debugging Tests

### Vitest
```bash
# Run specific test file
npm test phone.test.ts

# Debug mode
node --inspect-brk ./node_modules/vitest/vitest.mjs run
```

### Jest
```bash
# Run specific test file
npm test example.test.tsx

# Debug mode
node --inspect-brk ./node_modules/.bin/jest --runInBand
```

## Mocking Strategy

### Server
- Mock Prisma client for database tests
- Mock Redis for cache tests
- Mock external APIs (SMS, payment providers)

### Customer App
- Mock AsyncStorage
- Mock SecureStore
- Mock Socket.io client
- Mock Expo Router
- Mock React Query

## Test Data

### Fixtures
Store reusable test data in separate files:
```typescript
// __tests__/fixtures/trips.ts
export const mockTrip = {
  id: 'trip-123',
  pickupAddress: 'Test Location',
  // ...
};
```

### Factories
Create test data builders:
```typescript
// __tests__/factories/user.ts
export const createMockUser = (overrides = {}) => ({
  id: 'user-123',
  phone: '233241234567',
  role: 'CUSTOMER',
  ...overrides,
});
```

## Known Issues

### React Native Testing
- Some Expo modules may need manual mocking
- Native modules won't work without proper setup
- Animations should be disabled in tests

### Vitest with TypeScript
- Ensure `vitest/config` is imported, not `vite/config`
- Path aliases must match tsconfig.json

## Next Steps

1. ✅ Test infrastructure setup complete
2. ⏳ Write tests for critical user flows
3. ⏳ Add API integration tests with test database
4. ⏳ Set up CI/CD pipeline
5. ⏳ Add E2E tests (Detox/Maestro)
6. ⏳ Performance/load testing

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Jest Documentation](https://jestjs.io/)
- [React Native Testing Library](https://callstack.github.io/react-native-testing-library/)
- [Supertest Documentation](https://github.com/ladjs/supertest)

## Support

If tests are failing:
1. Check test setup files
2. Verify mocks are configured correctly
3. Ensure dependencies are installed
4. Check for TypeScript errors
5. Review test output for specific errors

For help, contact the development team.
