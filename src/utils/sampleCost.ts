import type { FieldContact, Interaction, Receipt, ReceiptItem } from '../types';
import { inWindow, type ReportWindow } from './reportWindow';

export const normalizeSku = (sku: string): string => sku.trim().toUpperCase();

// Último custo CONHECIDO por SKU: o do recebimento mais recente por
// received_at (data do fato, não do registro) que tenha custo. Linha sem custo
// é ignorada — ausente não é zero, como a fatia 2 estabeleceu.
export const lastKnownCostBySku = (receipts: Receipt[], items: ReceiptItem[]): Map<string, number> => {
	const receivedAt = new Map(receipts.map((r) => [r.id, r.receivedAt]));
	const best = new Map<string, { at: number; cost: number }>();
	for (const item of items) {
		if (item.unitCost === null || item.unitCost === undefined) continue;
		// Recebimento órfão (receiptId sem linha em `receipts`): mesma condição
		// que receivedVsSold descarta. Cair para item.createdAt inventaria uma
		// data de fato que não se conhece — descartar é a resposta honesta.
		const receivedAtRaw = receivedAt.get(item.receiptId);
		if (receivedAtRaw === undefined) continue;
		const at = new Date(receivedAtRaw).getTime();
		if (Number.isNaN(at)) continue;
		const sku = normalizeSku(item.sku);
		const current = best.get(sku);
		if (!current || at >= current.at) best.set(sku, { at, cost: item.unitCost });
	}
	return new Map([...best].map(([sku, v]) => [sku, v.cost]));
};

export type SampleContactRow = {
	key: string; name: string; qty: number; cost: number; partial: boolean;
};

export type SampleSummary = {
	totalQty: number;
	cost: number;
	skusTotal: number;
	skusWithoutCost: number;
	byContact: SampleContactRow[];
};

export type SampleInput = {
	interactions: Interaction[];
	contacts: FieldContact[];
	receipts: Receipt[];
	receiptItems: ReceiptItem[];
	window: ReportWindow;
};

export const summarizeSamples = (input: SampleInput): SampleSummary => {
	const costBySku = lastKnownCostBySku(input.receipts, input.receiptItems);
	const nameByKey = new Map(input.contacts.map((c) => [`${c.contactType}:${c.id}`, c.name]));
	const rows = new Map<string, SampleContactRow>();
	const skus = new Set<string>();
	const skusSemCusto = new Set<string>();
	let totalQty = 0;
	let cost = 0;

	for (const interaction of input.interactions) {
		if (!inWindow(interaction.occurredAt, input.window)) continue;
		const key = interaction.clientId
			? `client:${interaction.clientId}`
			: interaction.supplierId
				? `supplier:${interaction.supplierId}`
				: null;
		if (!key) continue;
		for (const sample of interaction.samples) {
			const sku = normalizeSku(sample.sku);
			const unit = costBySku.get(sku);
			skus.add(sku);
			if (unit === undefined) skusSemCusto.add(sku);
			totalQty += sample.qty;
			const lineCost = unit === undefined ? 0 : unit * sample.qty;
			cost += lineCost;
			const row = rows.get(key) ?? {
				key, name: nameByKey.get(key) ?? '—', qty: 0, cost: 0, partial: false,
			};
			row.qty += sample.qty;
			row.cost += lineCost;
			if (unit === undefined) row.partial = true;
			rows.set(key, row);
		}
	}

	return {
		totalQty,
		cost,
		skusTotal: skus.size,
		skusWithoutCost: skusSemCusto.size,
		byContact: [...rows.values()].sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name)),
	};
};
