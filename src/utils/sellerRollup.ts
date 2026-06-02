import type { SalesItem, SalesOrder } from '../services/dashboardService';
import type { Seller } from '../types';

/**
 * Aggregate per-seller revenue/items from orders+items, matching a seller by
 * EITHER its external_id or its id — so manually-registered sales (which set
 * only seller_id) roll onto the correct imported seller instead of spawning a
 * UUID-named phantom. Pass already-voided-filtered orders/items.
 */
export function aggregateSellers(
	sellers: Seller[],
	orders: SalesOrder[],
	items: SalesItem[],
): Seller[] {
	const byKey = new Map<string, Seller>();
	const register = (key: string | undefined | null, s: Seller) => {
		if (key) byKey.set(key, s);
	};

	for (const s of sellers) {
		const entry: Seller = { ...s, itens: 0, bruto: 0, liquido: 0, boletos: 0 };
		register(s.externalId, entry);
		register(s.id, entry);
	}

	const resolve = (o: SalesOrder): Seller | undefined =>
		(o.seller_id ? byKey.get(o.seller_id) : undefined) ??
		(o.seller_external_id ? byKey.get(o.seller_external_id) : undefined);

	const sellerByOrderNumber = new Map<string, Seller>();
	for (const o of orders) {
		let s = resolve(o);
		const key = o.seller_id || o.seller_external_id;
		if (!s) {
			if (!key) continue; // order with no seller — skip
			s = {
				id: key,
				externalId: o.seller_external_id,
				nome: 'Vendedor desconhecido',
				itens: 0,
				bruto: 0,
				liquido: 0,
				boletos: 0,
			};
			register(key, s);
		}
		if (o.order_number) sellerByOrderNumber.set(o.order_number, s);
		if (Number.isFinite(o.total_amount)) {
			s.bruto += Number(o.total_amount);
			s.liquido = s.bruto;
		}
		if (o.status && o.status.toLowerCase().includes('boleto')) s.boletos += 1;
	}

	for (const item of items) {
		const s = sellerByOrderNumber.get(item.order_number);
		if (!s) continue;
		s.itens += Number.isFinite(item.qty) ? Number(item.qty) : 0;
	}

	const unique = new Set<Seller>(byKey.values()); // same object may sit under 2 keys
	return unique.size ? Array.from(unique) : sellers;
}
