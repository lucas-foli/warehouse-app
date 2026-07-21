import { describe, expect, it } from 'vitest';
import { filterSalesByLocation } from './salesByLocation';
import type { SalesItem, SalesOrder } from '../services/dashboardService';

const orders: SalesOrder[] = [
	{ id: '1', order_number: 'V-0001', location: 'BRASÍLIA SHOPPING' },
	{ id: '2', order_number: 'V-0002', location: 'LOJA PRINCIPAL' },
	{ id: '3', order_number: 'V-0003', location: null },
];
const items: SalesItem[] = [
	{ order_number: 'V-0001', sku: 'A' },
	{ order_number: 'V-0002', sku: 'B' },
	{ order_number: 'V-0003', sku: 'C' },
];

describe('filterSalesByLocation', () => {
	it("returns everything unchanged for 'all'", () => {
		const r = filterSalesByLocation(orders, items, 'all');
		expect(r.orders).toHaveLength(3);
		expect(r.items).toHaveLength(3);
	});
	it('keeps only orders + their items for a specific store', () => {
		const r = filterSalesByLocation(orders, items, 'BRASÍLIA SHOPPING');
		expect(r.orders.map((o) => o.order_number)).toEqual(['V-0001']);
		expect(r.items.map((i) => i.sku)).toEqual(['A']);
	});
	it('excludes null-location (unattributed) orders from a specific store', () => {
		const r = filterSalesByLocation(orders, items, 'LOJA PRINCIPAL');
		expect(r.orders.map((o) => o.order_number)).toEqual(['V-0002']);
		expect(r.items.map((i) => i.sku)).toEqual(['B']);
	});
});
