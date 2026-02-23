import { supabase } from '../lib/supabaseClient';
import type { Client, Product, Seller } from '../types';

export type SalesOrder = {
	order_number: string;
	client_id?: string;
	client_external_id?: string;
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

export async function fetchProducts(tenantId: string): Promise<Product[]> {
	const { data, error } = await supabase
		.from('products')
		.select('*')
		.eq('tenant_id', tenantId);

	if (error) throw error;
	if (!data?.length) return [];

	return (data as Record<string, unknown>[]).map((row) => {
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

		const currency = (...keys: string[]) => {
			const value = str(...keys);
			if (!value) return undefined;
			const parsed = Number(value.replace(/[^\d,.-]/g, '').replace(',', '.'));
			return Number.isFinite(parsed) ? parsed : undefined;
		};

		return {
			id: str('id') || str('sku') || crypto.randomUUID(),
			name: str('name', 'descricao', 'Descrição'),
			sku: str('sku', 'SKU') || '—',
			barcode: str('barcode', 'Barcode', 'BARCODE', 'codigo_barras') || undefined,
			status: str('status', 'Status') || 'ESTOQUE',
			location: str('location', 'local', 'Local') || 'Loja principal',
			qty: num('qty', 'quantidade_estoque', 'Quantidade_Estoque', 'total_estoque', 'Total_Estoque') ?? 0,
			min: num('min', 'estoque_minimo', 'Estoque_Minimo') ?? undefined,
			price: num('price') ?? currency('preco_venda', 'Preço de Venda Normal') ?? undefined,
			totalSold: num('total_sold') ?? undefined,
			image: str('image_url', 'image', 'foto', 'Foto') || undefined,
		};
	});
}

export async function fetchClients(tenantId: string): Promise<Client[]> {
	const { data, error } = await supabase
		.from('clients')
		.select('*')
		.eq('tenant_id', tenantId);

	if (error) throw error;
	if (!data?.length) return [];

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
	const { data, error } = await supabase
		.from('sellers')
		.select('*')
		.eq('tenant_id', tenantId);

	if (error) throw error;
	if (!data?.length) return [];

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
	const { data, error } = await supabase
		.from('sales_orders')
		.select('*')
		.eq('tenant_id', tenantId);

	if (error) throw error;
	if (!data?.length) return [];

	return data.map((row) => ({
		order_number: toText(row.order_number),
		client_id: toText(row.client_id) || undefined,
		client_external_id: toText(row.client_external_id) || undefined,
		seller_id: toText(row.seller_id) || undefined,
		seller_external_id: toText(row.seller_external_id) || undefined,
		status: toText(row.status) || undefined,
		total_amount: Number(row.total_amount),
		sold_at: toText(row.sold_at) || undefined,
	}));
}

export async function fetchSalesItems(tenantId: string): Promise<SalesItem[]> {
	const { data, error } = await supabase
		.from('sales_items')
		.select('*')
		.eq('tenant_id', tenantId);

	if (error) throw error;
	if (!data?.length) return [];

	return data.map((row) => ({
		order_number: toText(row.order_number),
		sku: toText(row.sku) || undefined,
		qty: Number(row.qty),
		unit_price: row.unit_price !== null && row.unit_price !== undefined ? Number(row.unit_price) : undefined,
		total_price: row.total_price !== null && row.total_price !== undefined ? Number(row.total_price) : undefined,
	}));
}
