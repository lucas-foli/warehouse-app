import { describe, expect, it } from 'vitest';
import { mergeCartLines, type CartLine } from './cart';

const line = (sku: string, qty: number, unitPrice: number | null = null): CartLine => ({ sku, qty, unitPrice });

describe('mergeCartLines', () => {
	it('sums qty for duplicate SKUs (case-insensitive, trimmed)', () => {
		expect(mergeCartLines([line('abc', 2), line(' ABC ', 3)])).toEqual([{ sku: 'ABC', qty: 5, unitPrice: null }]);
	});
	it('keeps the last non-null unit price', () => {
		expect(mergeCartLines([line('x', 1, 10), line('x', 1, 12)])).toEqual([{ sku: 'X', qty: 2, unitPrice: 12 }]);
		expect(mergeCartLines([line('x', 1, 10), line('x', 1, null)])).toEqual([{ sku: 'X', qty: 2, unitPrice: 10 }]);
	});
	it('preserves first-seen order of distinct SKUs', () => {
		expect(mergeCartLines([line('b', 1), line('a', 1), line('b', 1)]).map((l) => l.sku)).toEqual(['B', 'A']);
	});
	it('returns empty for empty input', () => {
		expect(mergeCartLines([])).toEqual([]);
	});
});
