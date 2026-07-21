import { describe, expect, it } from 'vitest';
import { filterClientsByStoreOrders } from './clientsByStore';
import type { SalesOrder } from '../services/dashboardService';
import type { Client } from '../types';

const clients: Client[] = [
	{ id: 'c1', externalId: 'EXT1', nome: 'Ana', cidade: 'BSB', ultimaCompra: '' },
	{ id: 'c2', nome: 'Bia', cidade: 'BSB', ultimaCompra: '' },
	{ id: 'c3', nome: 'Cris', cidade: 'BSB', ultimaCompra: '' },
];

const order = (over: Partial<SalesOrder>): SalesOrder => ({
	id: 'o',
	order_number: 'V',
	location: 'LOJA A',
	...over,
});

describe('filterClientsByStoreOrders', () => {
	it('keeps only clients that have an order in the given set', () => {
		const r = filterClientsByStoreOrders(clients, [order({ order_number: 'V-1', client_id: 'c1', sold_at: '2026-06-01' })]);
		expect(r.map((c) => c.id)).toEqual(['c1']);
	});

	it('matches by external_id when the uuid does not match', () => {
		const r = filterClientsByStoreOrders(clients, [
			order({ order_number: 'V-2', client_external_id: 'EXT1', sold_at: '2026-06-02' }),
		]);
		expect(r.map((c) => c.id)).toEqual(['c1']);
	});

	it('sets ultimaCompra to the most recent order for that client', () => {
		const r = filterClientsByStoreOrders(clients, [
			order({ order_number: 'V-3', client_id: 'c1', sold_at: '2026-06-01' }),
			order({ order_number: 'V-4', client_id: 'c1', sold_at: '2026-06-10' }),
		]);
		expect(r[0].ultimaCompra).toBe('2026-06-10');
	});

	it('keeps a store buyer even when the order has no sold_at', () => {
		const withPrior: Client[] = [{ id: 'c1', nome: 'Ana', cidade: 'BSB', ultimaCompra: '2026-01-01' }];
		const r = filterClientsByStoreOrders(withPrior, [order({ order_number: 'V-5', client_id: 'c1' })]);
		expect(r.map((c) => c.id)).toEqual(['c1']);
		// no date on this order → falls back to the client's existing ultimaCompra
		expect(r[0].ultimaCompra).toBe('2026-01-01');
	});
});
