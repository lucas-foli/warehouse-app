export type ReceiptLine = { sku: string; qty: number; unitCost: number | null; name: string };

const normalizeSku = (sku: string) => sku.trim().toUpperCase();

/**
 * Junta as linhas do lote para que cada SKU apareça uma vez, somando as
 * quantidades. Normaliza o SKU (trim + upper) para casar com o índice único
 * (tenant_id, receipt_id, sku) que a RPC impõe. O último custo não-nulo do SKU
 * vence (o usuário corrigiu o valor); o primeiro nome não-vazio vence (foi onde
 * ele digitou). SKUs distintos mantêm a ordem da primeira aparição.
 */
export const mergeReceiptLines = (lines: ReceiptLine[]): ReceiptLine[] => {
	const order: string[] = [];
	const byKey = new Map<string, ReceiptLine>();
	for (const l of lines) {
		const sku = normalizeSku(l.sku);
		if (!sku) continue;
		if (!Number.isInteger(l.qty) || l.qty <= 0) continue;
		const existing = byKey.get(sku);
		if (existing) {
			existing.qty += l.qty;
			if (l.unitCost !== null) existing.unitCost = l.unitCost;
			if (!existing.name && l.name.trim()) existing.name = l.name.trim();
		} else {
			order.push(sku);
			byKey.set(sku, { sku, qty: l.qty, unitCost: l.unitCost, name: l.name.trim() });
		}
	}
	return order.map((k) => byKey.get(k)!);
};

/**
 * Custo total do lote, ou `null` quando qualquer linha veio sem custo — ausente
 * não é zero (mesmo contrato de `price`). Um custo 0 explícito é custo real
 * (brinde) e entra na soma normalmente.
 */
export const receiptTotal = (lines: ReceiptLine[]): number | null => {
	if (lines.length === 0) return null;
	if (lines.some((l) => l.unitCost === null)) return null;
	return Number(lines.reduce((acc, l) => acc + l.unitCost! * l.qty, 0).toFixed(2));
};

/**
 * SKUs que a RPC vai CRIAR como produto novo e ainda estão sem nome. A UI usa
 * isso para exigir o nome na própria linha, em vez de deixar a RPC responder
 * `receipt_product_name_required` depois do envio.
 */
export const linesNeedingName = (lines: ReceiptLine[], knownSkus: Set<string>): string[] =>
	mergeReceiptLines(lines)
		.filter((l) => !knownSkus.has(l.sku) && !l.name)
		.map((l) => l.sku);
