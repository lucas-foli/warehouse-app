import { describe, expect, it } from 'vitest';
import type { Product } from '../types';
import { findNegativeBalances } from './negativeBalances';

const product = (sku: string, qty: number): Product => ({
	id: sku, name: `Produto ${sku}`, sku, status: 'ativo', location: 'Miami', qty,
});

describe('findNegativeBalances', () => {
	it('lista só os produtos com saldo abaixo de zero, do pior para o melhor', () => {
		// mata: usar <= 0 (saldo zero viraria divergência), ou não ordenar
		expect(findNegativeBalances([
			product('A', 5), product('B', -2), product('C', 0), product('D', -9),
		])).toEqual([
			{ sku: 'D', name: 'Produto D', qty: -9 },
			{ sku: 'B', name: 'Produto B', qty: -2 },
		]);
	});

	it('devolve lista vazia quando está tudo em ordem', () => {
		// mata: devolver todos os produtos quando não há negativo
		expect(findNegativeBalances([product('A', 1)])).toEqual([]);
	});
});
