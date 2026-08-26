import { describe, expect, it } from 'vitest';
import { latestDailyRevenue } from './dailyRevenue';

describe('latestDailyRevenue', () => {
	it('série vazia → 0', () => {
		expect(latestDailyRevenue([])).toBe(0);
	});

	it('retorna o último ponto (hoje), não a média nem o primeiro', () => {
		// mata: dividir por 30, pegar o primeiro ponto, ou tirar média.
		expect(
			latestDailyRevenue([
				{ month: '10/02', value: 10 },
				{ month: '11/02', value: 30 },
			]),
		).toBe(30);
	});
});
