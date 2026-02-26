export type AuthMode = 'signin' | 'signup' | 'reset';

export interface Product {
	id: string;
	name: string;
	sku: string;
	barcode?: string;
	status: string;
	location: string;
	qty: number;
	min?: number;
	price?: number;
	totalSold?: number;
	image?: string;
}

export interface CategorySale {
	name: string;
	venda: number;
	custo: number;
	share: number;
}

export interface HistoryItem {
	month: string;
	value: number;
	quantity?: number;
}

export interface Client {
	id: string;
	externalId?: string;
	nome: string;
	cidade: string;
	telefone?: string;
	ultimaCompra: string;
}

export interface Seller {
	id: string;
	externalId?: string;
	nome: string;
	itens: number;
	bruto: number;
	liquido: number;
	boletos: number;
}

export interface KPIs {
	faturamento: number;
	totalCusto: number;
	quantidadeTotal: number;
	produtosDistintos: number;
}
