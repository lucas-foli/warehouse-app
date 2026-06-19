import type { SalesItem, SalesOrder } from '../services/dashboardService';

/**
 * Narrow orders + items to a single store. 'all' is a pass-through. For a
 * specific store, only orders whose `location` matches are kept, and only the
 * items belonging to those orders (joined by order_number). Orders with a null
 * location are unattributed and excluded from any specific-store view.
 */
export function filterSalesByLocation(
	orders: SalesOrder[],
	items: SalesItem[],
	location: 'all' | string,
): { orders: SalesOrder[]; items: SalesItem[] } {
	if (location === 'all') return { orders, items };
	const keptOrders = orders.filter((o) => o.location === location);
	const keptNumbers = new Set(keptOrders.map((o) => o.order_number));
	return { orders: keptOrders, items: items.filter((i) => keptNumbers.has(i.order_number)) };
}
