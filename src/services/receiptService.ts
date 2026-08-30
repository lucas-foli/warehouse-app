import { supabase } from '../lib/supabaseClient';
import type { Receipt } from '../types';
import { mergeReceiptLines, type ReceiptLine } from '../utils/receiptCart';

export type RegisterReceiptInput = {
	tenantId: string;
	supplierId: string;
	items: ReceiptLine[];
	receivedAt?: string;
	document?: string | null;
	note?: string | null;
	location?: string | null;
};

// Espelha as exceções nomeadas de register_receipt
// (20260830000300_receipt_location.sql) em mensagens pt-BR.
const RECEIPT_ERROR_MESSAGES: Record<string, string> = {
	not_authenticated: 'Sua sessão expirou. Entre novamente para registrar a entrada.',
	not_authorized: 'Apenas administradores podem registrar recebimentos.',
	receipt_supplier_required: 'Escolha o fornecedor deste recebimento.',
	receipt_items_required: 'Adicione ao menos um item ao recebimento.',
	receipt_qty_invalid: 'A quantidade recebida deve ser um número inteiro maior que zero.',
	receipt_cost_invalid: 'O custo unitário não pode ser negativo.',
	receipt_sku_required: 'Informe o SKU do produto.',
	receipt_product_name_required: 'Informe o nome do produto novo antes de registrar a entrada.',
	receipt_location_required: 'Escolha o local de destino: o lote cria um produto novo.',
};

const friendlyReceiptError = (rawMessage: string): string => {
	for (const [code, message] of Object.entries(RECEIPT_ERROR_MESSAGES)) {
		if (rawMessage.includes(code)) return message;
	}
	return rawMessage || 'Não foi possível registrar a entrada.';
};

/**
 * Barra linha inválida antes do merge em vez de deixar `mergeReceiptLines`
 * descartá-la em silêncio (receiptCart.ts:17-18 usa `continue`, pensado para o
 * carrinho da UI filtrar rascunho incompleto enquanto o usuário digita — aqui,
 * no envio, a mesma linha teria que ser um erro alto, não um item que some).
 * Sem isto: um carrinho [A, B inválido] registraria só A sem avisar; um
 * carrinho de uma linha só e inválida viraria `p_items: []`, e a RPC
 * responderia `receipt_items_required` — mensagem errada para o problema real.
 * Reusa as mesmas mensagens do mapa de erros da RPC (não duplica texto).
 */
const validateReceiptLines = (items: ReceiptLine[]): void => {
	for (const item of items) {
		if (!item.sku.trim()) throw new Error(RECEIPT_ERROR_MESSAGES.receipt_sku_required);
		if (!Number.isInteger(item.qty) || item.qty <= 0) {
			throw new Error(RECEIPT_ERROR_MESSAGES.receipt_qty_invalid);
		}
	}
};

/**
 * Registra um recebimento atomicamente (um receipts + N receipt_items + N
 * créditos de estoque) via register_receipt. O merge client-side repete o que a
 * RPC faz server-side: aqui ele existe para o payload já sair sem SKU repetido.
 * Devolve a linha de receipts criada; quem chama recarrega os produtos afetados
 * por conta própria (a RPC devolve o lote, não os produtos).
 */
export async function registerReceipt(input: RegisterReceiptInput): Promise<Receipt> {
	validateReceiptLines(input.items);

	const items = mergeReceiptLines(input.items).map((l) => ({
		sku: l.sku,
		qty: l.qty,
		unit_cost: l.unitCost,
		name: l.name || null,
	}));

	const { data, error } = await supabase.rpc('register_receipt', {
		p_tenant_id: input.tenantId,
		p_supplier_id: input.supplierId,
		p_items: items,
		p_received_at: input.receivedAt ?? new Date().toISOString(),
		p_document: input.document ?? null,
		p_note: input.note ?? null,
		p_location: input.location?.trim() || null,
	});

	if (error) throw new Error(friendlyReceiptError(error.message));
	if (!data) throw new Error('Não foi possível registrar a entrada.');

	return data as Receipt;
}
