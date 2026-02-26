export type ProductSkuLookup = {
	id: string;
	isActive: boolean;
};

export type SalesItemSkuValidationResult = {
	isValid: boolean;
	unknownSkus: string[];
	inactiveSkus: string[];
	errorMessage?: string;
};

const uniqueSkus = (skus: string[]) => {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const sku of skus) {
		if (!sku) continue;
		if (seen.has(sku)) continue;
		seen.add(sku);
		result.push(sku);
	}
	return result;
};

const buildUnknownSkuMessage = (skus: string[]) => {
	if (!skus.length) return '';
	if (skus.length === 1) return `Produto ${skus[0]} nao cadastrado.`;
	return `Produtos nao cadastrados: ${skus.join(', ')}.`;
};

const buildInactiveSkuMessage = (skus: string[]) => {
	if (!skus.length) return '';
	if (skus.length === 1) return `Produto ${skus[0]} esta inativo.`;
	return `Produtos inativos: ${skus.join(', ')}.`;
};

export const validateSalesItemSkus = (
	skus: string[],
	productsBySku: Map<string, ProductSkuLookup>,
): SalesItemSkuValidationResult => {
	const unknownSkus: string[] = [];
	const inactiveSkus: string[] = [];

	for (const sku of uniqueSkus(skus)) {
		const product = productsBySku.get(sku);
		if (!product) {
			unknownSkus.push(sku);
			continue;
		}
		if (!product.isActive) inactiveSkus.push(sku);
	}

	const isValid = unknownSkus.length === 0 && inactiveSkus.length === 0;
	if (isValid) return { isValid, unknownSkus, inactiveSkus };

	const parts = [buildUnknownSkuMessage(unknownSkus), buildInactiveSkuMessage(inactiveSkus)].filter(Boolean);
	return {
		isValid,
		unknownSkus,
		inactiveSkus,
		errorMessage: parts.join(' '),
	};
};
