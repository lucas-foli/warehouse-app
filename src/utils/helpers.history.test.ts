import { describe, expect, it } from 'vitest';
import { buildHistoryFromOrders } from './helpers';

describe('buildHistoryFromOrders', () => {
	it('retorna [] sem pedidos', () => {
		expect(buildHistoryFromOrders([])).toEqual([]);
	});

	it('agrega por mês, ordenado, a partir de datas reais', () => {
		const out = buildHistoryFromOrders([
			{ sold_at: '2026-06-15T10:00:00', total_amount: 100 },
			{ sold_at: '2026-07-20T10:00:00', total_amount: 50 },
			{ sold_at: '2026-07-25T10:00:00', total_amount: 25 },
		]);
		// Dois meses reais, em ordem cronológica, com os valores somados.
		// mata: remover a fonte real (viria [] ou valores fabricados).
		expect(out.map((p) => p.value)).toEqual([100, 75]);
		expect(out).toHaveLength(2);
		expect(out[0].month).not.toBe(out[1].month);
	});
});
