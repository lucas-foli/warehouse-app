import { supabase } from '../lib/supabaseClient';
import type { ContactStage, ContactType, FieldContact, Interaction, InteractionKind, InteractionOutcome } from '../types';
import { clientExternalId } from '../utils/clientSellerForms';

export type SampleInput = { sku: string; qty: number };

export type RegisterInteractionInput = {
	tenantId: string;
	clientId?: string | null;
	supplierId?: string | null;
	kind: InteractionKind;
	outcome?: InteractionOutcome | null;
	note?: string | null;
	occurredAt?: string;
	nextStep?: string | null;
	nextStepDueAt?: string | null;
	samples?: SampleInput[];
};

// Espelha as exceções nomeadas de register_interaction
// (20260826000300_register_interaction.sql) em mensagens pt-BR.
const INTERACTION_ERROR_MESSAGES: Record<string, string> = {
	not_authenticated: 'Sua sessão expirou. Entre novamente para registrar.',
	not_authorized: 'Você não tem acesso a este workspace.',
	interaction_contact_invalid: 'Escolha um contato (cliente ou fornecedor) válido.',
	interaction_kind_invalid: 'Tipo de interação inválido.',
	interaction_outcome_invalid: 'Resultado inválido.',
	interaction_sample_qty_invalid: 'A quantidade de cada amostra deve ser maior que zero.',
	interaction_sample_sku_unknown: 'SKU de amostra não encontrado neste catálogo.',
};

const friendlyInteractionError = (rawMessage: string): string => {
	for (const [code, message] of Object.entries(INTERACTION_ERROR_MESSAGES)) {
		if (rawMessage.includes(code)) return message;
	}
	return rawMessage || 'Não foi possível registrar a interação.';
};

// Merge client-side dos SKUs duplicados: normaliza (trim + upper), soma qty,
// descarta linhas inválidas, preserva a ordem da primeira ocorrência. A RPC
// repete o merge server-side — este aqui existe para a UI mostrar o total real
// antes de salvar.
export const mergeSamples = (samples: SampleInput[]): SampleInput[] => {
	const merged = new Map<string, number>();
	for (const s of samples) {
		const sku = s.sku.trim().toUpperCase();
		if (!sku || !Number.isInteger(s.qty) || s.qty <= 0) continue;
		merged.set(sku, (merged.get(sku) ?? 0) + s.qty);
	}
	return Array.from(merged, ([sku, qty]) => ({ sku, qty }));
};

/**
 * Registra interação + amostras + débito de estoque atomicamente via
 * register_interaction. Estoque pode ficar negativo por decisão de spec —
 * negativeSkus volta para a UI avisar sem bloquear.
 */
export async function registerInteraction(
	input: RegisterInteractionInput,
): Promise<{ interactionId: string; negativeSkus: string[] }> {
	const { data, error } = await supabase.rpc('register_interaction', {
		p_tenant_id: input.tenantId,
		p_client_id: input.clientId ?? null,
		p_supplier_id: input.supplierId ?? null,
		p_kind: input.kind,
		p_outcome: input.outcome ?? null,
		p_note: input.note ?? null,
		p_occurred_at: input.occurredAt ?? new Date().toISOString(),
		p_next_step: input.nextStep ?? null,
		p_next_step_due_at: input.nextStepDueAt ?? null,
		p_samples: mergeSamples(input.samples ?? []),
	});

	if (error) throw new Error(friendlyInteractionError(error.message));
	if (!data) throw new Error('Não foi possível registrar a interação.');

	const payload = data as { interaction_id: string; negative_skus: string[] };
	return { interactionId: payload.interaction_id, negativeSkus: payload.negative_skus ?? [] };
}

type FieldContactRow = {
	contact_type: ContactType;
	id: string;
	tenant_id: string;
	name: string;
	city: string | null;
	phone: string | null;
	email: string | null;
	manual_stage: ContactStage | null;
	stage_overridden_at: string | null;
	last_interaction_at: string | null;
	has_transaction: boolean;
	last_outcome: FieldContact['lastOutcome'];
	has_samples: boolean;
	has_interaction: boolean;
	last_fact_at: string | null;
};

const rowToFieldContact = (r: FieldContactRow): FieldContact => ({
	contactType: r.contact_type,
	id: r.id,
	tenantId: r.tenant_id,
	name: r.name,
	city: r.city ?? undefined,
	phone: r.phone ?? undefined,
	email: r.email ?? undefined,
	manualStage: r.manual_stage,
	stageOverriddenAt: r.stage_overridden_at,
	lastInteractionAt: r.last_interaction_at,
	hasTransaction: r.has_transaction,
	lastOutcome: r.last_outcome,
	hasSamples: r.has_samples,
	hasInteraction: r.has_interaction,
	lastFactAt: r.last_fact_at,
});

type InteractionRow = {
	id: string;
	tenant_id: string;
	client_id: string | null;
	supplier_id: string | null;
	kind: Interaction['kind'];
	outcome: Interaction['outcome'];
	note: string | null;
	occurred_at: string;
	next_step: string | null;
	next_step_due_at: string | null;
	next_step_done_at: string | null;
	interaction_samples?: { sku: string; qty: number }[];
};

const rowToInteraction = (r: InteractionRow): Interaction => ({
	id: r.id,
	tenantId: r.tenant_id,
	clientId: r.client_id,
	supplierId: r.supplier_id,
	kind: r.kind,
	outcome: r.outcome,
	note: r.note,
	occurredAt: r.occurred_at,
	nextStep: r.next_step,
	nextStepDueAt: r.next_step_due_at,
	nextStepDoneAt: r.next_step_done_at,
	samples: r.interaction_samples ?? [],
});

export async function fetchFieldContacts(tenantId: string): Promise<FieldContact[]> {
	const { data, error } = await supabase
		.from('field_contacts')
		.select('*')
		.eq('tenant_id', tenantId)
		.order('last_interaction_at', { ascending: false, nullsFirst: false });
	if (error) throw error;
	return ((data ?? []) as FieldContactRow[]).map(rowToFieldContact);
}

// Agenda = interações com próximo passo em aberto (não existe tabela própria).
export async function fetchOpenAgenda(tenantId: string): Promise<Interaction[]> {
	const { data, error } = await supabase
		.from('interactions')
		.select('*, interaction_samples(sku, qty)')
		.eq('tenant_id', tenantId)
		.not('next_step_due_at', 'is', null)
		.is('next_step_done_at', null)
		.order('next_step_due_at', { ascending: true });
	if (error) throw error;
	return ((data ?? []) as InteractionRow[]).map(rowToInteraction);
}

export async function fetchContactInteractions(
	tenantId: string,
	contactType: ContactType,
	contactId: string,
): Promise<Interaction[]> {
	const column = contactType === 'client' ? 'client_id' : 'supplier_id';
	const { data, error } = await supabase
		.from('interactions')
		.select('*, interaction_samples(sku, qty)')
		.eq('tenant_id', tenantId)
		.eq(column, contactId)
		.order('occurred_at', { ascending: false });
	if (error) throw error;
	return ((data ?? []) as InteractionRow[]).map(rowToInteraction);
}

export async function markNextStepDone(interactionId: string): Promise<void> {
	const { data, error } = await supabase
		.from('interactions')
		.update({ next_step_done_at: new Date().toISOString(), updated_at: new Date().toISOString() })
		.eq('id', interactionId)
		.select('id');
	if (error) throw error;
	if (!data || data.length === 0) throw new Error('Não foi possível atualizar o follow-up.');
}

export async function rescheduleNextStep(interactionId: string, dueAt: string): Promise<void> {
	const { data, error } = await supabase
		.from('interactions')
		.update({ next_step_due_at: dueAt, updated_at: new Date().toISOString() })
		.eq('id', interactionId)
		.select('id');
	if (error) throw error;
	if (!data || data.length === 0) throw new Error('Não foi possível atualizar o follow-up.');
}

// Escrita direta em clients/suppliers é admin-gated (policies existentes).
// Decisão da fatia 1: override é ato de admin; policy de membro por coluna
// fica para fatia futura. O .select('id') detecta o no-op da RLS — sem ele
// o update filtrado "sucede" em silêncio.
// stage = null limpa o override (volta a derivar dos fatos).
export async function setManualStage(
	contactType: ContactType,
	contactId: string,
	stage: ContactStage | null,
): Promise<void> {
	const table = contactType === 'client' ? 'clients' : 'suppliers';
	const { data: sessionData } = await supabase.auth.getSession();
	const { data, error } = await supabase
		.from(table)
		.update({
			stage,
			stage_overridden_at: stage ? new Date().toISOString() : null,
			stage_overridden_by: stage ? (sessionData?.session?.user?.id ?? null) : null,
			updated_at: new Date().toISOString(),
		})
		.eq('id', contactId)
		.select('id');
	if (error) throw error;
	if (!data || data.length === 0) throw new Error('Apenas administradores podem alterar o estágio.');
}

// Criação mínima na rua: só nome + cidade. external_id segue a regra do CRUD
// de clientes (clientSellerForms) para manter dedupe com importações futuras.
export async function quickCreateContact(
	tenantId: string,
	contactType: ContactType,
	nome: string,
	cidade: string,
): Promise<{ id: string }> {
	const table = contactType === 'client' ? 'clients' : 'suppliers';
	const external = clientExternalId({ nome, cidade, telefone: '', email: '' });
	const { data, error } = await supabase
		.from(table)
		.insert({
			tenant_id: tenantId,
			external_id: external,
			name: nome.trim(),
			city: cidade.trim() || undefined,
		})
		.select('id')
		.single();
	if (error) {
		const code = (error as { code?: string }).code;
		if (code === '23505') {
			throw new Error('Já existe um contato com esse nome. Busque-o na lista.');
		}
		if (code === '42501') {
			throw new Error(
				contactType === 'client'
					? 'Apenas administradores podem cadastrar clientes.'
					: 'Apenas administradores podem cadastrar fornecedores.',
			);
		}
		throw error;
	}
	return { id: (data as { id: string }).id };
}
