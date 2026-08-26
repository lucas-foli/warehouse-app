import { supabase } from '../lib/supabaseClient';
import type { InteractionKind, InteractionOutcome } from '../types';

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
