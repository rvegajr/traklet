/**
 * Vitest test setup file
 * Configures global test utilities and mocks
 */

import { afterAll, afterEach, beforeAll } from 'vitest';

// Clean up after each test
afterEach(() => {
  // Clear any IndexedDB databases created during tests
  if (typeof indexedDB !== 'undefined') {
    // Note: jsdom doesn't fully support indexedDB cleanup
  }
});

// Global test utilities
beforeAll(() => {
  // Suppress console.error in tests unless debugging
  if (process.env['DEBUG'] !== 'true') {
    // Keep errors visible but suppress expected ones
  }
});

afterAll(() => {
  // Global cleanup
});

// Custom matchers can be added here
// declare module 'vitest' {
//   interface Assertion<T = unknown> {
//     toBeValidIssue(): T;
//   }
// }
