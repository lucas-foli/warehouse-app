import { supabase } from '../lib/supabaseClient';
import type { Client, Product, Seller } from '../types';

export type SalesOrder = {
	id: string;
	order_number: string;
	client_id?: string;
	client_external_id?: string;
	location: string | null;
	seller_id?: string;
	seller_external_id?: string;
	status?: string;
	total_amount?: number;
	sold_at?: string;
};

export type SalesItem = {
	order_number: string;
	sku?: string;
	qty?: number;
	unit_price?: number;
	total_price?: number;
};

const toText = (value: unknown): string => {
	if (typeof value === 'string') return value.trim();
	if (typeof value === 'number') return String(value);
	return '';
};

const PAGE_SIZE = 1000;

/**
 * Fetch every row for a tenant, paging past PostgREST's default 1000-row cap.
 * Orders by the `id` primary key so pages never overlap or skip rows.
 */
async function fetchAllRows(
	table: 'products' | 'clients' | 'sellers' | 'sales_orders' | 'sales_items',
	tenantId: string,
): Promise<Record<string, unknown>[]> {
	const rows: Record<string, unknown>[] = [];
	for (let from = 0; ; from += PAGE_SIZE) {
		const { data, error } = await supabase
			.from(table)
			.select('*')
			.eq('tenant_id', tenantId)
			.order('id', { ascending: true })
			.range(from, from + PAGE_SIZE - 1);

		if (error) throw error;
		if (!data?.length) break;
		rows.push(...(data as Record<string, unknown>[]));
		if (data.length < PAGE_SIZE) break;
	}
	return rows;
}

export async function fetchProducts(tenantId: string): Promise<Product[]> {
	const data = await fetchAllRows('products', tenantId);
	if (!data.length) return [];

	return data.map((row) => {
		const str = (...keys: string[]) => {
			for (const key of keys) {
				const value = row[key];
				if (typeof value === 'string' && value.trim()) return value.trim();
				if (typeof value === 'number') return String(value);
			}
			return '';
		};

		const num = (...keys: string[]) => {
			const value = str(...keys);
			const parsed = Number(value);
			return Number.isFinite(parsed) ? parsed : undefined;
		};

		// Unlike `num`, treats an absent/NULL value as undefined instead of 0.
		// `price` is nullable in the schema (as are `min` and `total_sold`), and
		// "not registered" must stay undefined so consumers can tell it apart from
		// a genuine 0 — e.g. SaleOrderModal leaves the price field empty (forcing a
		// value) instead of pre-filling R$ 0,00, and getProductRisk's
		// `min !== undefined` guard / the "—" display fallbacks keep working.
		// `qty` stays on `num` since "absent = 0" is correct there.
		const numOrUndefined = (...keys: string[]) => {
			const value = str(...keys);
			if (!value) return undefined;
			const parsed = Number(value);
			return Number.isFinite(parsed) ? parsed : undefined;
		};

		// The mapper reads DB rows (`select('*')`), whose keys are always the
		// canonical column names — the CSV importer normalizes header aliases
		// (descricao, preco_venda, foto, …) to those columns before upserting.
		// So only real column names are read here.
		return {
			id: str('id') || str('sku') || crypto.randomUUID(),
			name: str('name'),
			sku: str('sku') || '—',
			barcode: str('barcode') || undefined,
			status: str('status') || 'ESTOQUE',
			location: str('location') || 'Loja principal',
			qty: num('qty') ?? 0,
			min: numOrUndefined('min'),
			price: numOrUndefined('price'),
			totalSold: numOrUndefined('total_sold'),
			image: str('image_url', 'image') || undefined,
			created_at: str('created_at') || undefined,
		};
	});
}

export async function fetchClients(tenantId: string): Promise<Client[]> {
	const data = await fetchAllRows('clients', tenantId);
	if (!data.length) return [];

	return data.map((row) => ({
		id: toText(row.id) || crypto.randomUUID(),
		externalId: toText(row.external_id) || undefined,
		nome: toText(row.name) || toText(row.nome) || 'Cliente',
		cidade: toText(row.city) || toText(row.cidade) || '—',
		telefone: toText(row.phone) || toText(row.telefone) || undefined,
		ultimaCompra: toText(row.last_purchase_at) || '',
	}));
}

export async function fetchSellers(tenantId: string): Promise<Seller[]> {
	const data = await fetchAllRows('sellers', tenantId);
	if (!data.length) return [];

	return data.map((row) => ({
		id: toText(row.id) || crypto.randomUUID(),
		externalId: toText(row.external_id) || undefined,
		nome: toText(row.name) || toText(row.nome) || toText(row.external_id) || 'Vendedor',
		itens: 0,
		bruto: 0,
		liquido: 0,
		boletos: 0,
	}));
}

export async function fetchSalesOrders(tenantId: string): Promise<SalesOrder[]> {
	const data = await fetchAllRows('sales_orders', tenantId);
	if (!data.length) return [];

	return data.map((row) => ({
		id: toText(row.id),
		order_number: toText(row.order_number),
		client_id: toText(row.client_id) || undefined,
		client_external_id: toText(row.client_external_id) || undefined,
		location: toText(row.location) || null,
		seller_id: toText(row.seller_id) || undefined,
		seller_external_id: toText(row.seller_external_id) || undefined,
		status: toText(row.status) || undefined,
		total_amount: Number(row.total_amount),
		sold_at: toText(row.sold_at) || undefined,
	}));
}

export async function fetchSalesItems(tenantId: string): Promise<SalesItem[]> {
	const data = await fetchAllRows('sales_items', tenantId);
	if (!data.length) return [];

	return data.map((row) => ({
		order_number: toText(row.order_number),
		sku: toText(row.sku) || undefined,
		qty: Number(row.qty),
		unit_price: row.unit_price !== null && row.unit_price !== undefined ? Number(row.unit_price) : undefined,
		total_price: row.total_price !== null && row.total_price !== undefined ? Number(row.total_price) : undefined,
	}));
}
