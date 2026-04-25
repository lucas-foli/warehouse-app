import { describe, expect, it } from 'vitest';
import { buildRecentDailySalesFromOrders } from './helpers';

describe('buildRecentDailySalesFromOrders', () => {
	it('gera janela fixa entre hoje-20 e hoje com zero para dias sem vendas', () => {
		const referenceDate = new Date('2026-02-12T12:00:00');
		const result = buildRecentDailySalesFromOrders([], 20, referenceDate);

		expect(result).toHaveLength(21);
		expect(result[0]?.month).toBe('23/01');
		expect(result[result.length - 1]?.month).toBe('12/02');
		expect(result.every((point) => point.value === 0)).toBe(true);
	});

	it('agrega valores por dia e ignora vendas fora da janela', () => {
		const referenceDate = new Date('2026-02-12T12:00:00');
		const result = buildRecentDailySalesFromOrders(
			[
				{ sold_at: '2026-02-12T08:00:00', total_amount: 100 },
				{ sold_at: '2026-02-02T09:00:00', total_amount: 50 },
				{ sold_at: '2026-02-02T15:00:00', total_amount: 25 },
				{ sold_at: '2026-01-20T09:00:00', total_amount: 999 },
			],
			20,
			referenceDate,
		);

		const byLabel = new Map(result.map((item) => [item.month, item.value]));

		expect(result).toHaveLength(21);
		expect(byLabel.get('12/02')).toBe(100);
		expect(byLabel.get('02/02')).toBe(75);
		expect(byLabel.get('05/02')).toBe(0);
		expect(result.reduce((sum, point) => sum + point.value, 0)).toBe(175);
	});
});
