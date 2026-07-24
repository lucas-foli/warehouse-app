import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the supabase client module so fetchProducts reads from a controllable
// stub instead of a real network client. Each test sets `mockRows` to the rows
// the paged reader should return for the products table.
let mockRows: Record<string, unknown>[] = [];

vi.mock('../lib/supabaseClient', () => {
	// Reproduce the fluent chain fetchAllRows uses:
	// from(table).select('*').eq(...).order(...).range(from, to) -> { data, error }
	const makeBuilder = () => {
		const builder: Record<string, unknown> = {};
		builder.select = () => builder;
		builder.eq = () => builder;
		builder.order = () => builder;
		// range resolves the query. Return every mock row on the first page and an
		// empty array afterwards so the pager stops after one iteration.
		builder.range = (from: number) =>
			Promise.resolve({ data: from === 0 ? mockRows : [], error: null });
		return builder;
	};
	return { supabase: { from: () => makeBuilder() } };
});

// Imported after vi.mock so the stub is in place.
const { fetchProducts } = await import('./dashboardService');

describe('fetchProducts price/total_sold mapping', () => {
	beforeEach(() => {
		mockRows = [];
	});

	it('maps a NULL price to undefined, not 0', async () => {
		mockRows = [{ id: 'p1', sku: 'SKU1', name: 'Sem preço', qty: 5, price: null }];

		const [product] = await fetchProducts('tenant-1');

		expect(product.price).toBeUndefined();
	});

	it('maps a NULL total_sold to undefined, not 0', async () => {
		mockRows = [{ id: 'p1', sku: 'SKU1', name: 'Sem vendas', qty: 5, total_sold: null }];

		const [product] = await fetchProducts('tenant-1');

		expect(product.totalSold).toBeUndefined();
	});

	it('keeps a real price value', async () => {
		mockRows = [{ id: 'p1', sku: 'SKU1', name: 'Com preço', qty: 5, price: 19.9 }];

		const [product] = await fetchProducts('tenant-1');

		expect(product.price).toBe(19.9);
	});

	it('keeps a real total_sold value', async () => {
		mockRows = [{ id: 'p1', sku: 'SKU1', name: 'Vendido', qty: 5, total_sold: 42 }];

		const [product] = await fetchProducts('tenant-1');

		expect(product.totalSold).toBe(42);
	});

	it('still maps an absent qty to 0 (num semantics preserved)', async () => {
		mockRows = [{ id: 'p1', sku: 'SKU1', name: 'Sem qty' }];

		const [product] = await fetchProducts('tenant-1');

		expect(product.qty).toBe(0);
	});
});
