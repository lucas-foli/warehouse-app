import type { Product } from '../types';

export type NegativeBalance = { sku: string; name: string; qty: number };

// Amostra registrada sem estoque deixa products.qty negativo
// (register_interaction avisa e não bloqueia, por decisão da fatia 1) e o aviso
// da RPC é efêmero. Este é o único lugar do app onde a divergência aparece.
export const findNegativeBalances = (products: Product[]): NegativeBalance[] =>
	products
		.filter((p) => p.qty < 0)
		.map((p) => ({ sku: p.sku, name: p.name, qty: p.qty }))
		.sort((a, b) => a.qty - b.qty);
