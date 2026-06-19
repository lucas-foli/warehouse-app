/**
 * Stores shown in the Dashboard location filter: the union of the tenant's
 * managed "local" list (Settings → Onde/Local), the stores attached to sales
 * (sales_orders.location), and the stores set on products (products.location)
 * — deduplicated, blanks removed, sorted. A store added in Settings or one that
 * only appears on sales must show up even before a product uses it.
 */
export function buildStoreFilterOptions(
	managedLocal: Array<string | null | undefined>,
	orderLocations: Array<string | null | undefined>,
	productLocations: Array<string | null | undefined>,
): string[] {
	const set = new Set<string>();
	for (const raw of [...managedLocal, ...orderLocations, ...productLocations]) {
		const value = (raw ?? '').trim();
		if (value) set.add(value);
	}
	return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
