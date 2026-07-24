import { describe, expect, it } from 'vitest';
import { mergeCartLines, skusMissingPrice, type CartLine } from './cart';

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

describe('skusMissingPrice', () => {
	it('lists SKUs whose price was never informed', () => {
		expect(skusMissingPrice([line('abc', 1, null), line('xyz', 1, 10)])).toEqual(['abc']);
	});
	it('treats an explicit 0 as a real price (courtesy/gift), not a missing one', () => {
		expect(skusMissingPrice([line('abc', 1, 0)])).toEqual([]);
	});
	it('returns empty when every line has a price', () => {
		expect(skusMissingPrice([line('abc', 1, 10), line('xyz', 2, 5.5)])).toEqual([]);
	});
	it('returns empty for an empty cart', () => {
		expect(skusMissingPrice([])).toEqual([]);
	});
});
