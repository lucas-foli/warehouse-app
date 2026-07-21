import type { SalesItem, SalesOrder } from '../services/dashboardService';

/**
 * Last sale date per SKU, used downstream to flag "sem giro" (no turnover)
 * risk. Joins active sales items to their order's `sold_at` by
 * `order_number`, then keeps the most recent date per SKU (trimmed,
 * uppercase — same normalization `getProductRisk` uses to look it up).
 *
 * Pass already-voided-filtered orders/items (same convention as
 * aggregateSellers/filterClientsByStoreOrders — see sellerRollup.ts /
 * clientsByStore.ts): a voided order's items must never make a product look
 * like it still has turnover.
 */
export function buildLastSaleBySku(orders: SalesOrder[], items: SalesItem[]): Map<string, string> {
	const lastSaleBySku = new Map<string, string>();
	if (!items.length || !orders.length) return lastSaleBySku;

	const soldAtByOrderNumber = new Map<string, string>();
	orders.forEach((order) => {
		if (order.sold_at) soldAtByOrderNumber.set(order.order_number, order.sold_at);
	});

	items.forEach((item) => {
		if (!item.sku) return;
		const soldAt = soldAtByOrderNumber.get(item.order_number);
		if (!soldAt) return;
		const key = item.sku.trim().toUpperCase();
		const current = lastSaleBySku.get(key);
		if (!current || new Date(soldAt) > new Date(current)) {
			lastSaleBySku.set(key, soldAt);
		}
	});

	return lastSaleBySku;
}
