import { describe, expect, it } from 'vitest';
import type { Product } from '../types';
import { findProductByCode } from './barcode';

const p = (over: Partial<Product>): Product =>
	({ id: 'i', name: 'n', sku: 'SKU1', qty: 0, status: '', location: '', ...over } as Product);

describe('findProductByCode', () => {
	const list = [p({ id: 'a', sku: 'ABC', barcode: '7891000100103' }), p({ id: 'b', sku: 'XYZ' })];

	it('matches an exact barcode', () => {
		expect(findProductByCode(list, '7891000100103')?.id).toBe('a');
	});
	it('falls back to a case-insensitive SKU', () => {
		expect(findProductByCode(list, 'xyz')?.id).toBe('b');
	});
	it('trims whitespace', () => {
		expect(findProductByCode(list, '  ABC ')?.id).toBe('a');
	});
	it('returns null for no match', () => {
		expect(findProductByCode(list, 'nope')).toBeNull();
	});
	it('returns null for empty input', () => {
		expect(findProductByCode(list, '   ')).toBeNull();
	});
});
