import { supabase } from '../lib/supabaseClient';
import type { Product } from '../types';

export type RegisterSaleInput = {
	tenantId: string;
	sku: string;
	qty: number;
	unitPrice?: number | null;
	soldAt?: string;
	clientId?: string | null;
	sellerId?: string | null;
};

export type SaleLineInput = { sku: string; qty: number; unitPrice?: number | null };

export type RegisterSaleOrderInput = {
	tenantId: string;
	items: SaleLineInput[];
	soldAt?: string;
	clientId?: string | null;
	sellerId?: string | null;
};

// Maps the typed exceptions raised by register_sale / the sales_items trigger
// (see 20260528000000_register_sale.sql) to friendly pt-BR messages.
const SALE_ERROR_MESSAGES: Record<string, string> = {
	not_authenticated: 'Sua sessão expirou. Entre novamente para registrar a venda.',
	not_authorized: 'Apenas administradores podem registrar vendas.',
	sale_qty_invalid: 'A quantidade vendida deve ser maior que zero.',
	sale_items_required: 'Adicione ao menos um item à venda.',
	sales_item_sku_required: 'Informe o SKU do produto.',
	sales_item_unknown_sku: 'SKU não encontrado neste catálogo.',
	sales_item_inactive_sku: 'Este produto está inativo e não pode ser vendido.',
};

const friendlySaleError = (rawMessage: string): string => {
	for (const [code, message] of Object.entries(SALE_ERROR_MESSAGES)) {
		if (rawMessage.includes(code)) return message;
	}
	return rawMessage || 'Não foi possível registrar a venda.';
};

type ProductRow = {
	id: string;
	name: string;
	sku: string;
	barcode: string | null;
	status: string;
	location: string;
	qty: number;
	min: number | null;
	price: number | null;
	total_sold: number | null;
	image: string | null;
	image_url: string | null;
	is_active: boolean;
};

const mapProductRow = (row: ProductRow): Product => ({
	id: row.id,
	name: row.name,
	sku: row.sku,
	barcode: row.barcode ?? undefined,
	status: row.status,
	location: row.location,
	qty: Number(row.qty),
	min: row.min ?? undefined,
	price: row.price ?? undefined,
	totalSold: row.total_sold ?? undefined,
	image: row.image_url ?? row.image ?? undefined,
	is_active: row.is_active,
});

/**
 * Registers a single-product sale atomically (order + line item + stock move)
 * via the register_sale RPC. Returns the updated product so callers can refresh
 * stock/total_sold in local state.
 */
export async function registerSale(input: RegisterSaleInput): Promise<Product> {
	const { data, error } = await supabase.rpc('register_sale', {
		p_tenant_id: input.tenantId,
		p_sku: input.sku.trim(),
		p_qty: input.qty,
		p_unit_price: input.unitPrice ?? null,
		p_sold_at: input.soldAt ?? new Date().toISOString(),
		p_client_id: input.clientId ?? null,
		p_seller_id: input.sellerId ?? null,
	});

	if (error) throw new Error(friendlySaleError(error.message));
	if (!data) throw new Error('Não foi possível registrar a venda.');

	return mapProductRow(data as ProductRow);
}

/**
 * Registers a multi-line sale order atomically (one order + N items + N stock
 * moves) via register_sale_order. Returns the created sales_orders row; callers
 * must refresh affected products separately (the RPC returns the order, not products).
 */
export async function registerSaleOrder(input: RegisterSaleOrderInput) {
	const { data, error } = await supabase.rpc('register_sale_order', {
		p_tenant_id: input.tenantId,
		p_items: input.items.map((i) => ({ sku: i.sku.trim(), qty: i.qty, unit_price: i.unitPrice ?? null })),
		p_sold_at: input.soldAt ?? new Date().toISOString(),
		p_client_id: input.clientId ?? null,
		p_seller_id: input.sellerId ?? null,
	});

	if (error) throw new Error(friendlySaleError(error.message));
	if (!data) throw new Error('Não foi possível registrar a venda.');

	return data;
}
