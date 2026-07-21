import { describe, expect, it } from 'vitest';
import { buildLastSaleBySku } from './lastSaleBySku';
import type { SalesItem, SalesOrder } from '../services/dashboardService';

const order = (over: Partial<SalesOrder>): SalesOrder =>
	({ id: 'o', order_number: 'V-0001', ...over } as SalesOrder);

// Mirrors the exact filtering useDashboardData applies before calling
// buildLastSaleBySku, so this test proves the case that matters most for the
// whole pipeline: a voided sale must never make a product look like it still
// has turnover.
const excludeVoided = (orders: SalesOrder[], items: SalesItem[]) => {
	const voidedOrderNumbers = new Set(orders.filter((o) => o.status === 'voided').map((o) => o.order_number));
	return {
		activeOrders: orders.filter((o) => o.status !== 'voided'),
		activeItems: items.filter((i) => !voidedOrderNumbers.has(i.order_number)),
	};
};

describe('buildLastSaleBySku', () => {
	it('a voided sale does not make a product look like it has turnover', () => {
		const orders: SalesOrder[] = [
			order({ order_number: 'V-VOID', status: 'voided', sold_at: '2026-07-20' }), // yesterday, but voided
			order({ order_number: 'V-OLD', sold_at: '2026-01-01' }), // months ago, still active
		];
		const items: SalesItem[] = [
			{ order_number: 'V-VOID', sku: 'ABC' },
			{ order_number: 'V-OLD', sku: 'ABC' },
		];
		const { activeOrders, activeItems } = excludeVoided(orders, items);
		const result = buildLastSaleBySku(activeOrders, activeItems);
		expect(result.get('ABC')).toBe('2026-01-01');
	});

	it('the most recent sale wins when a SKU sold in multiple active orders', () => {
		const orders: SalesOrder[] = [
			order({ order_number: 'V-1', sold_at: '2026-01-01' }),
			order({ order_number: 'V-2', sold_at: '2026-06-01' }),
		];
		const items: SalesItem[] = [
			{ order_number: 'V-1', sku: 'ABC' },
			{ order_number: 'V-2', sku: 'ABC' },
		];
		expect(buildLastSaleBySku(orders, items).get('ABC')).toBe('2026-06-01');
	});

	it('normalizes the SKU (trim + uppercase) as the map key', () => {
		const orders: SalesOrder[] = [order({ order_number: 'V-1', sold_at: '2026-01-01' })];
		const items: SalesItem[] = [{ order_number: 'V-1', sku: '  abc123 ' }];
		expect(buildLastSaleBySku(orders, items).get('ABC123')).toBe('2026-01-01');
	});

	it('ignores an item whose order_number does not match any active order', () => {
		const orders: SalesOrder[] = [order({ order_number: 'V-1', sold_at: '2026-01-01' })];
		const items: SalesItem[] = [{ order_number: 'V-OTHER', sku: 'ABC' }];
		expect(buildLastSaleBySku(orders, items).size).toBe(0);
	});

	it('ignores an order with no sold_at', () => {
		const orders: SalesOrder[] = [order({ order_number: 'V-1' })];
		const items: SalesItem[] = [{ order_number: 'V-1', sku: 'ABC' }];
		expect(buildLastSaleBySku(orders, items).size).toBe(0);
	});

	it('ignores an item with no sku', () => {
		const orders: SalesOrder[] = [order({ order_number: 'V-1', sold_at: '2026-01-01' })];
		const items: SalesItem[] = [{ order_number: 'V-1' }];
		expect(buildLastSaleBySku(orders, items).size).toBe(0);
	});

	it('returns an empty map when there are no orders or no items', () => {
		expect(buildLastSaleBySku([], [{ order_number: 'V-1', sku: 'ABC' }]).size).toBe(0);
		expect(buildLastSaleBySku([order({ order_number: 'V-1', sold_at: '2026-01-01' })], []).size).toBe(0);
	});
});
