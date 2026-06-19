import { describe, expect, it } from 'vitest';
import { buildStoreFilterOptions } from './storeFilterOptions';

describe('buildStoreFilterOptions', () => {
	it('unions managed list, sales and product stores, deduped and sorted', () => {
		const r = buildStoreFilterOptions(['LOJA B', 'LOJA A'], ['LOJA A', null, 'LOJA C'], ['LOJA A', 'LOJA B']);
		expect(r).toEqual(['LOJA A', 'LOJA B', 'LOJA C']);
	});

	it('includes a managed store that has no products or sales yet', () => {
		expect(buildStoreFilterOptions(['LOJA NOVA'], [], [])).toEqual(['LOJA NOVA']);
	});

	it('includes a store that only appears in sales', () => {
		expect(buildStoreFilterOptions([], ['LOJA SO VENDAS'], [])).toEqual(['LOJA SO VENDAS']);
	});

	it('drops blanks and null/undefined', () => {
		expect(buildStoreFilterOptions([''], [null, undefined, '  '], [])).toEqual([]);
	});
});
