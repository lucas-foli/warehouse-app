import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('../lib/supabaseClient', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));

const { registerReceipt } = await import('./receiptService');

const baseInput = {
	tenantId: 't1',
	supplierId: 's1',
	items: [{ sku: 'pop-401', qty: 10, unitCost: 4.5, name: '' }],
};

describe('registerReceipt', () => {
	beforeEach(() => {
		rpc.mockReset();
		rpc.mockResolvedValue({ data: { id: 'r1', receipt_number: 'R-0001' }, error: null });
	});

	it('envia o payload com os nomes de parâmetro da RPC', async () => {
		// mata: renomear p_* — a RPC rejeitaria a chamada inteira
		await registerReceipt({ ...baseInput, document: 'NF 4471', note: null });
		const [fn, params] = rpc.mock.calls[0];
		expect(fn).toBe('register_receipt');
		expect(params).toMatchObject({
			p_tenant_id: 't1',
			p_supplier_id: 's1',
			p_document: 'NF 4471',
			p_note: null,
		});
	});

	it('normaliza e faz merge dos itens antes de enviar', async () => {
		// mata: mandar as linhas cruas e trincar o índice único (tenant, receipt, sku)
		await registerReceipt({
			...baseInput,
			items: [
				{ sku: 'pop-401', qty: 10, unitCost: 4.5, name: '' },
				{ sku: 'POP-401', qty: 5, unitCost: null, name: '' },
			],
		});
		expect(rpc.mock.calls[0][1].p_items).toEqual([
			{ sku: 'POP-401', qty: 15, unit_cost: 4.5, name: null },
		]);
	});

	it('manda name null quando o nome está vazio', async () => {
		// mata: enviar string vazia — a RPC trata '' e null de formas diferentes
		await registerReceipt(baseInput);
		expect(rpc.mock.calls[0][1].p_items[0].name).toBeNull();
	});

	it('traduz not_authorized para mensagem de permissão', async () => {
		// mata: vazar o erro cru do Postgres na tela do usuário
		rpc.mockResolvedValue({ data: null, error: { message: 'not_authorized' } });
		await expect(registerReceipt(baseInput)).rejects.toThrow(
			'Apenas administradores podem registrar recebimentos.',
		);
	});

	it('traduz receipt_product_name_required', async () => {
		// mata: deixar o código bruto aparecer quando falta o nome do produto novo
		rpc.mockResolvedValue({ data: null, error: { message: 'receipt_product_name_required' } });
		await expect(registerReceipt(baseInput)).rejects.toThrow(
			'Informe o nome do produto novo antes de registrar a entrada.',
		);
	});

	it('devolve a linha criada quando dá certo', async () => {
		// mata: engolir o retorno da RPC (a UI precisa do número do lote)
		await expect(registerReceipt(baseInput)).resolves.toMatchObject({ receipt_number: 'R-0001' });
	});
});
