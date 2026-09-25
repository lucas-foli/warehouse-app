import { describe, expect, it } from 'vitest';
import type { SalesOrder } from '../services/dashboardService';
import type { Seller } from '../types';
import { aggregateSellers } from './sellerRollup';
import { buildSellerDailyPerformance } from './sellerDailyPerformance';

const seller = (over: Partial<Seller>): Seller =>
	({ id: 'u', nome: 'S', itens: 0, bruto: 0, liquido: 0, boletos: 0, ...over });
const order = (over: Partial<SalesOrder>): SalesOrder =>
	({ id: 'o', order_number: 'V-1', total_amount: 0, ...over } as SalesOrder);

const ref = new Date('2026-02-12T12:00:00'); // referenceDate fixa

describe('buildSellerDailyPerformance', () => {
	it('sem vendedores → []', () => {
		expect(buildSellerDailyPerformance([], [order({ total_amount: 10 })], 30, ref)).toEqual([]);
	});

	it('nenhuma venda na janela → [] (empty state explícito)', () => {
		// mata: retornar série constante/preenchida quando não houve venda.
		const out = buildSellerDailyPerformance([seller({ id: 'u1', nome: 'Ana' })], [], 30, ref);
		expect(out).toEqual([]);
	});

	it('venda em dia conhecido cai no dia certo; janela completa de `days` pontos', () => {
		const out = buildSellerDailyPerformance(
			[seller({ id: 'u1', nome: 'Ana' })],
			[order({ seller_id: 'u1', total_amount: 100, sold_at: '2026-02-12T08:00:00' })],
			30,
			ref,
		);
		// mata: série vazia / dias trocados / omitir dias vazios.
		expect(out).toHaveLength(30);
		expect(out[out.length - 1].Ana).toBe(100); // hoje
		expect(out[0].Ana).toBe(0); // primeiro dia da janela, sem venda
	});

	it('conciliação: soma dos dias == bruto de aggregateSellers (mesmos orders na janela)', () => {
		const sellers = [seller({ id: 'u1', nome: 'Ana' })];
		const orders = [
			order({ seller_id: 'u1', total_amount: 100, sold_at: '2026-02-12T08:00:00' }),
			order({ order_number: 'V-2', seller_id: 'u1', total_amount: 40, sold_at: '2026-02-05T09:00:00' }),
		];
		const out = buildSellerDailyPerformance(sellers, orders, 30, ref);
		const somaSerie = out.reduce((s, row) => s + (Number(row.Ana) || 0), 0);
		const bruto = aggregateSellers(sellers, orders, []).find((s) => s.id === 'u1')!.bruto;
		// mata: escalar/dividir o valor (o Math.random original erra a soma).
		expect(somaSerie).toBe(bruto);
		expect(somaSerie).toBe(140);
	});

	it('dual-key: resolve por seller_id (manual) e por seller_external_id (importada)', () => {
		const sellers = [seller({ id: 'u1', externalId: 'E1', nome: 'Ana' })];
		const byId = buildSellerDailyPerformance(
			sellers,
			[order({ seller_id: 'u1', total_amount: 10, sold_at: '2026-02-12T08:00:00' })],
			30,
			ref,
		);
		const byExt = buildSellerDailyPerformance(
			sellers,
			[order({ seller_external_id: 'E1', total_amount: 10, sold_at: '2026-02-12T08:00:00' })],
			30,
			ref,
		);
		// mata: casar só por um dos campos.
		expect(byId[byId.length - 1].Ana).toBe(10);
		expect(byExt[byExt.length - 1].Ana).toBe(10);
	});

	it('order fora da janela é ignorado; vendedor sem match não vira coluna', () => {
		const sellers = [seller({ id: 'u1', nome: 'Ana' })];
		const out = buildSellerDailyPerformance(
			sellers,
			[
				order({ seller_id: 'u1', total_amount: 100, sold_at: '2026-02-12T08:00:00' }),
				order({ order_number: 'V-old', seller_id: 'u1', total_amount: 999, sold_at: '2025-12-01T08:00:00' }),
				order({ order_number: 'V-ghost', seller_id: 'ghost', total_amount: 5, sold_at: '2026-02-12T08:00:00' }),
			],
			30,
			ref,
		);
		// mata: incluir orders antigos / criar coluna "desconhecido".
		const somaSerie = out.reduce((s, row) => s + (Number(row.Ana) || 0), 0);
		expect(somaSerie).toBe(100);
		out.forEach((row) => {
			expect(Object.keys(row).sort()).toEqual(['Ana', 'month']);
		});
	});
});
