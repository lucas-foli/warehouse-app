import { describe, expect, it } from 'vitest';
import { mergeSamples } from './fieldService';

describe('mergeSamples', () => {
	it('soma quantidades de SKUs duplicados (case/espaço-insensível)', () => {
		// mata: mutação que não agrega ou não normaliza o SKU
		expect(
			mergeSamples([
				{ sku: 'pop-401', qty: 2 },
				{ sku: ' POP-401 ', qty: 1 },
				{ sku: 'POP-114', qty: 1 },
			]),
		).toEqual([
			{ sku: 'POP-401', qty: 3 },
			{ sku: 'POP-114', qty: 1 },
		]);
	});

	it('descarta linhas sem SKU ou com qty <= 0', () => {
		// mata: mutação que deixa lixo passar para a RPC
		expect(
			mergeSamples([
				{ sku: '  ', qty: 2 },
				{ sku: 'POP-401', qty: 0 },
				{ sku: 'POP-401', qty: -1 },
			]),
		).toEqual([]);
	});

	it('preserva a ordem da primeira ocorrência', () => {
		// mata: mutação que reordena (a UI mostra a lista na ordem digitada)
		expect(
			mergeSamples([
				{ sku: 'B', qty: 1 },
				{ sku: 'A', qty: 1 },
				{ sku: 'B', qty: 1 },
			]).map((s) => s.sku),
		).toEqual(['B', 'A']);
	});
});
