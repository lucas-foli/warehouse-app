import type { FieldContact, Product, Receipt, ReceiptItem } from '../types';
import type { SalesItem, SalesOrder } from '../services/dashboardService';
import { inWindow, type ReportWindow } from './reportWindow';
import { normalizeSku } from './sampleCost';

export type ReceivedVsSoldRow = {
	sku: string;
	name: string;
	received: number;
	sold: number;
	/** products.qty — valor de AGORA, não do fim da janela (Emenda 1 da spec). */
	balance: number;
	/** Procedência: fornecedor do recebimento mais recente. Nunca agrega vendas. */
	supplierName: string | null;
	multipleSuppliers: boolean;
};

export type ReceivedVsSoldInput = {
	products: Product[];
	receipts: Receipt[];
	receiptItems: ReceiptItem[];
	orders: SalesOrder[];
	salesItems: SalesItem[];
	suppliers: FieldContact[];
	window: ReportWindow;
};

type Acc = {
	name: string; received: number; sold: number; balance: number;
	supplierIds: Set<string>; lastSupplierId: string | null; lastAt: number;
};

export const buildReceivedVsSold = (input: ReceivedVsSoldInput): ReceivedVsSoldRow[] => {
	const acc = new Map<string, Acc>();
	const touch = (rawSku: string): Acc => {
		const sku = normalizeSku(rawSku);
		const current = acc.get(sku);
		if (current) return current;
		const created: Acc = {
			name: sku, received: 0, sold: 0, balance: 0,
			supplierIds: new Set(), lastSupplierId: null, lastAt: -Infinity,
		};
		acc.set(sku, created);
		return created;
	};

	for (const p of input.products) {
		const row = touch(p.sku);
		row.name = p.name || normalizeSku(p.sku);
		row.balance = p.qty;
	}

	const receiptById = new Map(input.receipts.map((r) => [r.id, r]));
	for (const item of input.receiptItems) {
		const receipt = receiptById.get(item.receiptId);
		if (!receipt) continue;
		const row = touch(item.sku);
		// A procedência olha TODO o histórico; só a soma respeita a janela.
		row.supplierIds.add(receipt.supplierId);
		const at = new Date(receipt.receivedAt).getTime();
		if (!Number.isNaN(at) && at >= row.lastAt) {
			row.lastAt = at;
			row.lastSupplierId = receipt.supplierId;
		}
		if (inWindow(receipt.receivedAt, input.window)) row.received += item.qty;
	}

	// Item liga ao pedido por order_number: sales_items não tem order_id.
	const soldAtByOrder = new Map(input.orders.map((o) => [o.order_number, o.sold_at]));
	for (const item of input.salesItems) {
		if (!item.sku) continue;
		const soldAt = soldAtByOrder.get(item.order_number);
		if (!soldAt || !inWindow(soldAt, input.window)) continue;
		touch(item.sku).sold += item.qty ?? 0;
	}

	const supplierName = new Map(input.suppliers.map((s) => [s.id, s.name]));
	return [...acc.entries()]
		.map(([sku, row]) => ({
			sku,
			name: row.name,
			received: row.received,
			sold: row.sold,
			balance: row.balance,
			supplierName: row.lastSupplierId ? (supplierName.get(row.lastSupplierId) ?? null) : null,
			multipleSuppliers: row.supplierIds.size > 1,
		}))
		.sort((a, b) => b.received - a.received || b.sold - a.sold || a.sku.localeCompare(b.sku));
};

export type SupplierReceivedRow = {
	supplierId: string; name: string; qty: number; cost: number;
};

// Este é o único lugar em que fornecedor vira agregação — e só do lado
// RECEBIDO, que é o único que conhece procedência. Venda nunca entra aqui.
export const buildReceivedBySupplier = (input: {
	receipts: Receipt[];
	receiptItems: ReceiptItem[];
	suppliers: FieldContact[];
	window: ReportWindow;
}): SupplierReceivedRow[] => {
	const receiptById = new Map(input.receipts.map((r) => [r.id, r]));
	const nameById = new Map(input.suppliers.map((s) => [s.id, s.name]));
	const acc = new Map<string, SupplierReceivedRow>();
	for (const item of input.receiptItems) {
		const receipt = receiptById.get(item.receiptId);
		if (!receipt || !inWindow(receipt.receivedAt, input.window)) continue;
		const row = acc.get(receipt.supplierId) ?? {
			supplierId: receipt.supplierId,
			name: nameById.get(receipt.supplierId) ?? '—',
			qty: 0,
			cost: 0,
		};
		row.qty += item.qty;
		// Linha sem custo entra na quantidade e não no valor: ausente não é zero,
		// mas também não invalida o que já se sabe do fornecedor.
		if (item.unitCost !== null && item.unitCost !== undefined) row.cost += item.unitCost * item.qty;
		acc.set(receipt.supplierId, row);
	}
	return [...acc.values()].sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
};
