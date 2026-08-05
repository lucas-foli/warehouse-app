import type { Client, Seller } from '../types';

export type ClientDraft = {
	nome: string;
	cidade: string;
	telefone: string;
	email: string;
};

export type SellerDraft = {
	nome: string;
	email: string;
};

export type ClientInsert = {
	tenant_id: string;
	external_id: string;
	name: string;
	city?: string;
	phone?: string;
	email?: string;
};

export type ClientUpdate = {
	name: string;
	city: string | null;
	phone: string | null;
	email: string | null;
};

export type SellerInsert = {
	tenant_id: string;
	external_id: string;
	name: string;
	email?: string;
};

export type SellerUpdate = {
	name: string;
	email: string | null;
};

export const emptyClientDraft = (): ClientDraft => ({ nome: '', cidade: '', telefone: '', email: '' });
export const emptySellerDraft = (): SellerDraft => ({ nome: '', email: '' });

export const clientToDraft = (c: Client): ClientDraft => ({
	nome: c.nome ?? '',
	// A cidade ausente chega do map como o placeholder '—'; não queremos editá-lo como texto.
	cidade: c.cidade && c.cidade !== '—' ? c.cidade : '',
	telefone: c.telefone ?? '',
	email: c.email ?? '',
});

export const sellerToDraft = (s: Seller): SellerDraft => ({
	nome: s.nome ?? '',
	email: s.email ?? '',
});

export const validateClientDraft = (d: ClientDraft): string | null =>
	d.nome.trim() ? null : 'Informe o nome do cliente.';

export const validateSellerDraft = (d: SellerDraft): string | null =>
	d.nome.trim() ? null : 'Informe o nome do vendedor.';

// external_id espelha a regra do import CSV (src/utils/csv.ts): mantém o registro
// criado à mão deduplicável e cruzável com importações futuras.
export const clientExternalId = (d: ClientDraft): string =>
	(d.email.trim() || d.telefone.trim() || d.nome.trim()).toUpperCase();

export const sellerExternalId = (d: SellerDraft): string =>
	(d.email.trim() || d.nome.trim()).toUpperCase();

export const buildClientInsert = (d: ClientDraft, tenantId: string): ClientInsert => {
	const city = d.cidade.trim();
	const phone = d.telefone.trim();
	const email = d.email.trim();
	return {
		tenant_id: tenantId,
		external_id: clientExternalId(d),
		name: d.nome.trim(),
		city: city || undefined,
		phone: phone || undefined,
		email: email || undefined,
	};
};

// Na edição NÃO tocamos external_id (chave imutável de cruzamento); campos vazios
// viram null para efetivamente limpar o valor antigo.
export const buildClientUpdate = (d: ClientDraft): ClientUpdate => ({
	name: d.nome.trim(),
	city: d.cidade.trim() || null,
	phone: d.telefone.trim() || null,
	email: d.email.trim() || null,
});

export const buildSellerInsert = (d: SellerDraft, tenantId: string): SellerInsert => {
	const email = d.email.trim();
	return {
		tenant_id: tenantId,
		external_id: sellerExternalId(d),
		name: d.nome.trim(),
		email: email || undefined,
	};
};

export const buildSellerUpdate = (d: SellerDraft): SellerUpdate => ({
	name: d.nome.trim(),
	email: d.email.trim() || null,
});

export const deleteBlockMessage = (kind: 'cliente' | 'vendedor', count: number): string =>
	`Este ${kind} tem ${count} ${count === 1 ? 'venda vinculada' : 'vendas vinculadas'}. ` +
	`Desvincule ou remova ${count === 1 ? 'essa venda' : 'essas vendas'} antes de excluir.`;

export const nameDuplicateWarning = (kind: 'cliente' | 'vendedor', nome: string): string =>
	`Já existe um ${kind} chamado "${nome}". Deseja salvar mesmo assim?`;

export const emailDuplicateError = (kind: 'cliente' | 'vendedor'): string =>
	`Já existe um ${kind} com esse e-mail.`;
