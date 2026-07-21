import type { Product } from '../types';

/** Days without a sale after which a product is flagged as "sem giro". */
export const SEM_GIRO_DIAS = 30;

export interface ProductRisk {
	critical: boolean;
	reasons: string[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const daysSince = (dateStr: string, now: Date): number => (now.getTime() - new Date(dateStr).getTime()) / MS_PER_DAY;

/**
 * Derives a product's risk (critical + reasons) purely from its own fields and
 * the tenant's last-sale-per-SKU map. `status` ("Onde") is never read here — it
 * is place-only; risk is 100% derived so a product can be well-placed and still
 * critical (or vice versa).
 */
export function getProductRisk(product: Product, lastSaleBySku: Map<string, string>, now: Date): ProductRisk {
	const reasons: string[] = [];

	if (product.qty <= 0) reasons.push('estoque zerado');
	if (!product.image) reasons.push('sem foto');
	if (product.min !== undefined && product.qty <= product.min) reasons.push('comprar');

	const key = product.sku?.trim().toUpperCase();
	const lastSale = key ? lastSaleBySku.get(key) : undefined;
	if (lastSale) {
		if (daysSince(lastSale, now) > SEM_GIRO_DIAS) reasons.push('sem giro');
	} else if (product.created_at && daysSince(product.created_at, now) > SEM_GIRO_DIAS) {
		reasons.push('sem giro');
	}

	return { critical: reasons.length > 0, reasons };
}
