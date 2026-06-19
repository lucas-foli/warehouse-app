import type { SalesOrder } from '../services/dashboardService';
import type { Client } from '../types';

/**
 * Narrow the client list to those who bought in a given set of orders (already
 * filtered to one store and voided-excluded by the caller). A client matches an
 * order by EITHER its uuid (client_id) or its imported external_id
 * (client_external_id) — the same dual-key match the hook uses. `ultimaCompra`
 * is recomputed to the most recent sale that client made within this set, so a
 * specific-store view shows the store's last-purchase date, not the global one.
 */
export function filterClientsByStoreOrders(clients: Client[], orders: SalesOrder[]): Client[] {
	const lastByKey = new Map<string, string>();
	const remember = (key: string | null | undefined, soldAt?: string) => {
		if (!key || !soldAt) return;
		const current = lastByKey.get(key);
		if (!current || new Date(soldAt) > new Date(current)) lastByKey.set(key, soldAt);
	};

	for (const order of orders) {
		remember(order.client_id, order.sold_at);
		remember(order.client_external_id, order.sold_at);
	}

	const result: Client[] = [];
	for (const client of clients) {
		const last =
			(client.id ? lastByKey.get(client.id) : undefined) ??
			(client.externalId ? lastByKey.get(client.externalId) : undefined);
		if (last) result.push({ ...client, ultimaCompra: last });
	}
	return result;
}
