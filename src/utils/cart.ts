export type CartLine = { sku: string; qty: number; unitPrice: number | null };

/**
 * Merges cart lines so each SKU appears once, summing quantities. SKUs are
 * normalized (trimmed + upper-cased) to match the (tenant_id, order_number, sku)
 * unique index the RPC enforces; the last non-null unit price for a SKU wins.
 * Distinct SKUs keep their first-seen order.
 */
export const mergeCartLines = (lines: CartLine[]): CartLine[] => {
	const order: string[] = [];
	const byKey = new Map<string, CartLine>();
	for (const l of lines) {
		const sku = l.sku.trim().toUpperCase();
		if (!sku) continue;
		const existing = byKey.get(sku);
		if (existing) {
			existing.qty += l.qty;
			if (l.unitPrice !== null) existing.unitPrice = l.unitPrice;
		} else {
			order.push(sku);
			byKey.set(sku, { sku, qty: l.qty, unitPrice: l.unitPrice });
		}
	}
	return order.map((k) => byKey.get(k)!);
};

/**
 * SKUs whose unit price was never informed (`null`). Used to block checkout so a
 * product with no registered price can't be sold silently. An explicit 0 is a
 * real price (courtesy/gift) and is deliberately NOT reported as missing.
 */
export const skusMissingPrice = (lines: CartLine[]): string[] =>
	lines.filter((l) => l.unitPrice === null).map((l) => l.sku);
