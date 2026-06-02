import { describe, expect, it } from 'vitest';
import type { SalesItem, SalesOrder } from '../services/dashboardService';
import type { Seller } from '../types';
import { aggregateSellers } from './sellerRollup';

const seller = (over: Partial<Seller>): Seller =>
	({ id: 'u', nome: 'S', itens: 0, bruto: 0, liquido: 0, boletos: 0, ...over });
const order = (over: Partial<SalesOrder>): SalesOrder =>
	({ id: 'o', order_number: 'V-0001', total_amount: 0, ...over } as SalesOrder);

describe('aggregateSellers', () => {
	it('matches a manual sale (seller_id UUID) onto an imported seller (has external_id)', () => {
		const sellers = [seller({ id: 'u1', externalId: 'E1', nome: 'Ana' })];
		const orders = [order({ order_number: 'V-1', seller_id: 'u1', total_amount: 100 })];
		const out = aggregateSellers(sellers, orders, []);
		const ana = out.find((s) => s.id === 'u1')!;
		expect(ana.bruto).toBe(100);
		expect(out).toHaveLength(1); // no phantom UUID-named seller
	});

	it('matches an in-app seller (no external_id) by seller_id', () => {
		const out = aggregateSellers(
			[seller({ id: 'u2', nome: 'Bia' })],
			[order({ seller_id: 'u2', total_amount: 50 })],
			[],
		);
		expect(out.find((s) => s.id === 'u2')!.bruto).toBe(50);
	});

	it('matches an imported order (seller_external_id only)', () => {
		const out = aggregateSellers(
			[seller({ id: 'u3', externalId: 'E3', nome: 'Cau' })],
			[order({ seller_external_id: 'E3', total_amount: 30 })],
			[],
		);
		expect(out.find((s) => s.id === 'u3')!.bruto).toBe(30);
	});

	it('sums itens from items by order_number', () => {
		const out = aggregateSellers(
			[seller({ id: 'u4', nome: 'Dan' })],
			[order({ order_number: 'V-9', seller_id: 'u4', total_amount: 10 })],
			[{ order_number: 'V-9', qty: 3 } as SalesItem, { order_number: 'V-9', qty: 2 } as SalesItem],
		);
		expect(out.find((s) => s.id === 'u4')!.itens).toBe(5);
	});

	it('labels an unknown seller readably, not with a raw UUID', () => {
		const out = aggregateSellers([], [order({ seller_id: 'ghost-uuid', total_amount: 5 })], []);
		expect(out).toHaveLength(1);
		expect(out[0].nome).toBe('Vendedor desconhecido');
	});

	it('does not duplicate a seller registered under both keys', () => {
		const out = aggregateSellers(
			[seller({ id: 'u5', externalId: 'E5', nome: 'Eli' })],
			[order({ seller_id: 'u5', total_amount: 1 })],
			[],
		);
		expect(out).toHaveLength(1);
	});
});
