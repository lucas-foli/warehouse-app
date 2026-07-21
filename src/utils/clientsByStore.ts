import type { SalesOrder } from '../services/dashboardService';
import type { Client } from '../types';

/**
 * Narrow the client list to those who bought in a given set of orders (already
 * filtered to one store and voided-excluded by the caller). A client matches an
 * order by EITHER its uuid (client_id) or its imported external_id
 * (client_external_id) — the same dual-key match the hook uses. Membership is
 * independent of the order date: a client who bought here is kept even if that
 * order lacks a sold_at (mirrors the 'all' baseline, which never drops a buyer
 * for a missing date). `ultimaCompra` is recomputed to the most recent sale in
 * this set; when none of the store's orders carry a date, the client's existing
 * ultimaCompra is preserved rather than blanked.
 */
export function filterClientsByStoreOrders(clients: Client[], orders: SalesOrder[]): Client[] {
	const boughtKeys = new Set<string>();
	const lastByKey = new Map<string, string>();
	const register = (key: string | null | undefined, soldAt?: string) => {
		if (!key) return;
		boughtKeys.add(key);
		if (!soldAt) return;
		const current = lastByKey.get(key);
		if (!current || new Date(soldAt) > new Date(current)) lastByKey.set(key, soldAt);
	};

	for (const order of orders) {
		register(order.client_id, order.sold_at);
		register(order.client_external_id, order.sold_at);
	}

	const result: Client[] = [];
	for (const client of clients) {
		const bought =
			(client.id ? boughtKeys.has(client.id) : false) ||
			(client.externalId ? boughtKeys.has(client.externalId) : false);
		if (!bought) continue;
		const last =
			(client.id ? lastByKey.get(client.id) : undefined) ??
			(client.externalId ? lastByKey.get(client.externalId) : undefined);
		result.push(last ? { ...client, ultimaCompra: last } : client);
	}
	return result;
}
