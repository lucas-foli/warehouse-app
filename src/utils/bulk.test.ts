import { describe, expect, it } from 'vitest';
import { aggregateBulkResults, chunked, type BulkResult } from './bulk';

describe('chunked', () => {
  it('splits an array into fixed-size chunks', () => {
    expect(chunked([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns empty array for empty input', () => {
    expect(chunked([], 500)).toEqual([]);
  });

  it('returns one chunk when input fits', () => {
    expect(chunked([1, 2, 3], 500)).toEqual([[1, 2, 3]]);
  });

  it('throws on non-positive size', () => {
    expect(() => chunked([1], 0)).toThrow();
  });
});

describe('aggregateBulkResults', () => {
  it('sums successes and concatenates failures', () => {
    const a: BulkResult = { succeeded: 3, failed: [{ id: 'x', reason: 'fk' }] };
    const b: BulkResult = { succeeded: 2, failed: [] };
    expect(aggregateBulkResults([a, b])).toEqual({
      succeeded: 5,
      failed: [{ id: 'x', reason: 'fk' }],
    });
  });

  it('returns zero result for empty input', () => {
    expect(aggregateBulkResults([])).toEqual({ succeeded: 0, failed: [] });
  });
});
