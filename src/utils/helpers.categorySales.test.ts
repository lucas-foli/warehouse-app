import { describe, expect, it } from 'vitest';
import { buildCategorySalesFromItems, buildCategorySalesFromProducts } from './helpers';

describe('buildCategorySales* não expõe custo fabricado', () => {
	it('FromItems retorna name/venda/share, sem custo', () => {
		const out = buildCategorySalesFromItems(
			[{ sku: 'A', total_price: 100 }],
			new Map([['A', 'ESTOQUE']]),
		);
		// mata: reintroduzir custo = venda * 0.4
		expect(out[0]).not.toHaveProperty('custo');
		expect(out[0].venda).toBe(100);
		expect(out[0].name).toBe('ESTOQUE');
	});

	it('FromProducts retorna name/venda/share, sem custo', () => {
		const out = buildCategorySalesFromProducts([
			{ status: 'ESTOQUE', price: 10, totalSold: 5 },
		]);
		expect(out[0]).not.toHaveProperty('custo');
		expect(out[0].venda).toBe(50);
	});
});
