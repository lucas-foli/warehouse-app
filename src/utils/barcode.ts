import type { Product } from '../types';

/** Resolve a scanned/typed code to a product: exact barcode first, then case-insensitive SKU. */
export function findProductByCode(products: Product[], raw: string): Product | null {
	const code = raw.trim();
	if (!code) return null;
	return (
		products.find((p) => p.barcode && p.barcode === code) ??
		products.find((p) => p.sku.toUpperCase() === code.toUpperCase()) ??
		null
	);
}
