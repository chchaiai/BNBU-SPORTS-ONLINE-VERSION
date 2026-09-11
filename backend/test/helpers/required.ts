import assert from 'node:assert/strict';

// A missing fixture row must fail the test before its fields are inspected.
export function required<T>(value: T | null | undefined): T {
  assert.ok(value !== null && value !== undefined, 'Expected test data to be present');
  return value;
}

export function responseContainer(value: unknown): Record<string, unknown> | unknown[] {
  assert.ok(typeof value === 'object' && value !== null, 'Expected response data object or array');
  return Array.isArray(value) ? value : value as Record<string, unknown>;
}
