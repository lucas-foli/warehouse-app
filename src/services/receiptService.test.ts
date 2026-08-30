import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('../lib/supabaseClient', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));

const { registerReceipt } = await import('./receiptService');

const baseInput = {
	tenantId: 't1',
	supplierId: 's1',
	items: [{ sku: 'pop-401', qty: 10, unitCost: 4.5, name: '' }],
};

// Espelha RECEIPT_ERROR_MESSAGES de receiptService.ts — cobre as 8 chaves,
// não só as 2 que os testes originais tocavam.
const ERROR_CASES: [string, string][] = [
	['not_authenticated', 'Sua sessão expirou. Entre novamente para registrar a entrada.'],
	['not_authorized', 'Apenas administradores podem registrar recebimentos.'],
	['receipt_supplier_required', 'Escolha o fornecedor deste recebimento.'],
	['receipt_items_required', 'Adicione ao menos um item ao recebimento.'],
	['receipt_qty_invalid', 'A quantidade recebida deve ser um número inteiro maior que zero.'],
	['receipt_cost_invalid', 'O custo unitário não pode ser negativo.'],
	['receipt_sku_required', 'Informe o SKU do produto.'],
	['receipt_product_name_required', 'Informe o nome do produto novo antes de registrar a entrada.'],
];

describe('registerReceipt', () => {
	beforeEach(() => {
		rpc.mockReset();
		rpc.mockResolvedValue({ data: { id: 'r1', receipt_number: 'R-0001' }, error: null });
	});

	it('envia o payload com os 6 parâmetros da RPC, incluindo p_items e p_received_at', async () => {
		// mata: renomear qualquer um dos 6 p_* (inclusive p_received_at, que
		// nenhum teste checava antes) — a RPC rejeitaria a chamada inteira
		await registerReceipt({
			...baseInput,
			document: 'NF 4471',
			note: null,
			receivedAt: '2026-08-30T12:00:00.000Z',
		});
		const [fn, params] = rpc.mock.calls[0];
		expect(fn).toBe('register_receipt');
		expect(params).toMatchObject({
			p_tenant_id: 't1',
			p_supplier_id: 's1',
			p_items: [{ sku: 'POP-401', qty: 10, unit_cost: 4.5, name: null }],
			p_received_at: '2026-08-30T12:00:00.000Z',
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

	it('preserva unit_cost 0 (brinde) em vez de tratar como ausência de custo', async () => {
		// mata: `l.unitCost || null` em vez de `l.unitCost` — 0 é falsy mas é
		// custo real, não "sem custo" (mesmo contrato de receiptTotal)
		await registerReceipt({
			...baseInput,
			items: [{ sku: 'pop-401', qty: 3, unitCost: 0, name: 'Amostra' }],
		});
		expect(rpc.mock.calls[0][1].p_items[0].unit_cost).toBe(0);
	});

	it('rejeita o lote inteiro quando alguma linha tem qty inválida', async () => {
		// mata: mergeReceiptLines descartar em silêncio a linha com qty <= 0 e
		// registrar só as linhas restantes sem avisar quem chamou
		await expect(
			registerReceipt({
				...baseInput,
				items: [
					{ sku: 'A', qty: 10, unitCost: 1, name: 'Produto A' },
					{ sku: 'B', qty: -5, unitCost: 1, name: 'Produto B' },
				],
			}),
		).rejects.toThrow('A quantidade recebida deve ser um número inteiro maior que zero.');
		expect(rpc).not.toHaveBeenCalled();
	});

	it('rejeita com "quantidade inválida" quando a única linha tem qty 0, não "adicione um item"', async () => {
		// mata: deixar a linha inválida sumir no merge, mandar p_items: [] e
		// deixar a RPC responder receipt_items_required — mensagem errada pro
		// usuário que acabou de digitar uma linha
		await expect(
			registerReceipt({ ...baseInput, items: [{ sku: 'pop-401', qty: 0, unitCost: 1, name: '' }] }),
		).rejects.toThrow('A quantidade recebida deve ser um número inteiro maior que zero.');
		expect(rpc).not.toHaveBeenCalled();
	});

	it('rejeita quando alguma linha tem SKU vazio', async () => {
		// mata: mergeReceiptLines descartar em silêncio a linha sem SKU
		await expect(
			registerReceipt({ ...baseInput, items: [{ sku: '   ', qty: 5, unitCost: 1, name: '' }] }),
		).rejects.toThrow('Informe o SKU do produto.');
		expect(rpc).not.toHaveBeenCalled();
	});

	it.each(ERROR_CASES)('traduz o código de erro "%s" para mensagem pt-BR', async (code, message) => {
		// mata: typo em qualquer uma das 8 chaves do mapa vazando a mensagem
		// crua do Postgres na tela do usuário
		rpc.mockResolvedValue({ data: null, error: { message: code } });
		await expect(registerReceipt(baseInput)).rejects.toThrow(message);
	});

	it('devolve a mensagem crua quando o código de erro não está mapeado', async () => {
		// mata: normalizar todo erro desconhecido pra mensagem genérica em vez
		// de preservar o texto original (perderia informação de debug real)
		rpc.mockResolvedValue({ data: null, error: { message: 'algum_erro_novo_do_postgres' } });
		await expect(registerReceipt(baseInput)).rejects.toThrow('algum_erro_novo_do_postgres');
	});

	it('devolve mensagem genérica quando o erro vem sem texto', async () => {
		// mata: propagar error.message === '' direto pra UI em vez de cair no
		// fallback genérico
		rpc.mockResolvedValue({ data: null, error: { message: '' } });
		await expect(registerReceipt(baseInput)).rejects.toThrow('Não foi possível registrar a entrada.');
	});

	it('lança erro genérico quando a RPC devolve sucesso sem dado', async () => {
		// mata: assumir que "sem erro" implica "com dado" e devolver undefined
		// pra UI em vez de falhar alto
		rpc.mockResolvedValue({ data: null, error: null });
		await expect(registerReceipt(baseInput)).rejects.toThrow('Não foi possível registrar a entrada.');
	});

	it('devolve a linha criada quando dá certo', async () => {
		// mata: engolir o retorno da RPC (a UI precisa do número do lote)
		await expect(registerReceipt(baseInput)).resolves.toMatchObject({ receipt_number: 'R-0001' });
	});

	it('envia p_location quando informado', async () => {
		// mata: esquecer de repassar o local ao adicionar o parâmetro na RPC
		await registerReceipt({ ...baseInput, location: 'Miami' });
		expect(rpc.mock.calls[0][1].p_location).toBe('Miami');
	});

	it('envia p_location null quando não informado', async () => {
		// mata: mandar string vazia, que a RPC trataria diferente de ausente
		await registerReceipt(baseInput);
		expect(rpc.mock.calls[0][1].p_location).toBeNull();
	});

	it('envia p_location null quando o local é só espaço em branco', async () => {
		// mata: `input.location ?? null` sem trim — passaria '  ' direto pra RPC
		// em vez de tratá-lo como ausente, e `nullif(trim(...))` do lado do banco
		// já cobre isso lá, então aqui é o client que não pode regredir.
		await registerReceipt({ ...baseInput, location: '   ' });
		expect(rpc.mock.calls[0][1].p_location).toBeNull();
	});

	it('traduz receipt_location_required', async () => {
		// mata: exceção nova sem entrada no mapa, vazando texto cru do Postgres
		rpc.mockResolvedValue({ data: null, error: { message: 'receipt_location_required' } });
		await expect(registerReceipt(baseInput)).rejects.toThrow(
			'Escolha o local de destino: o lote cria um produto novo.',
		);
	});
});
