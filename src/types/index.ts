export type AuthMode = 'signin' | 'reset';

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
	is_active?: boolean;
	created_at?: string;
}

export interface CategorySale {
	name: string;
	venda: number;
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
	email?: string;
	ultimaCompra: string;
	created_at?: string;
}

export interface Seller {
	id: string;
	externalId?: string;
	nome: string;
	email?: string;
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

export type ContactType = 'client' | 'supplier';
export type InteractionKind = 'visit' | 'call' | 'whatsapp' | 'email';
export type InteractionOutcome =
	| 'interested'
	| 'proposal_requested'
	| 'undecided'
	| 'not_interested'
	| 'buyer_absent';
export type ContactStage = 'new' | 'contacted' | 'sample_delivered' | 'negotiating' | 'active' | 'lost';

export interface FieldContact {
	contactType: ContactType;
	id: string;
	tenantId: string;
	name: string;
	city?: string;
	phone?: string;
	email?: string;
	manualStage: ContactStage | null;
	stageOverriddenAt: string | null;
	lastInteractionAt: string | null;
	hasTransaction: boolean;
	lastOutcome: InteractionOutcome | null;
	hasSamples: boolean;
	hasInteraction: boolean;
	lastFactAt: string | null;
}

export interface Interaction {
	id: string;
	tenantId: string;
	clientId: string | null;
	supplierId: string | null;
	kind: InteractionKind;
	outcome: InteractionOutcome | null;
	note: string | null;
	occurredAt: string;
	nextStep: string | null;
	nextStepDueAt: string | null;
	nextStepDoneAt: string | null;
	samples: { sku: string; qty: number }[];
}
