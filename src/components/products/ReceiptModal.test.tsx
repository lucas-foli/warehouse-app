import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Product } from '../../types';

// Same pattern as receiptService.test.ts: build the mock before importing the
// module under test, then dynamically import so the mock is in place first.
// listProductOptions chains .select().eq().eq().order().order() before awaiting
// (two eq calls: tenant_id + kind), unlike the single .eq() the suppliers fetch
// uses — `makeQuery` returns one self-referencing, thenable object so any chain
// length resolves to the same table-keyed result.
const LOCAL_OPTIONS_ROWS = [
	{ value: 'Miami', sort_order: 1 },
	{ value: 'Orlando', sort_order: 2 },
];

const makeQuery = (result: { data: unknown; error: null }) => {
	const builder: {
		select: () => typeof builder;
		eq: () => typeof builder;
		order: () => typeof builder;
		then: (
			resolve: (value: unknown) => void,
			reject: (reason: unknown) => void,
		) => Promise<unknown>;
	} = {
		select: () => builder,
		eq: () => builder,
		order: () => builder,
		then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
	};
	return builder;
};

const fromMock = vi.fn((table: string) =>
	makeQuery(
		table === 'suppliers'
			? { data: [{ id: 'sup-1', name: 'Fornecedor Um' }], error: null }
			: table === 'tenant_product_options'
				? { data: LOCAL_OPTIONS_ROWS, error: null }
				: { data: [], error: null },
	),
);
vi.mock('../../lib/supabaseClient', () => ({
	supabase: { from: (table: string) => fromMock(table) },
}));

// Mocked so the submit test can assert on the input registerReceipt receives
// without going through supabase.rpc (that boundary is receiptService's own
// test file's job).
const registerReceiptMock = vi.fn().mockResolvedValue({ id: 'r1', receipt_number: 'R-0001' });
vi.mock('../../services/receiptService', () => ({
	registerReceipt: (...args: unknown[]) => registerReceiptMock(...args),
}));

const { ReceiptModal } = await import('./ReceiptModal');

const product = (over: Partial<Product> = {}): Product => ({
	id: 'p1',
	name: 'Produto Um',
	sku: 'POP-1',
	status: 'ESTOQUE',
	location: 'Loja',
	qty: 10,
	is_active: true,
	...over,
});

const base = { open: true as const, tenantId: 't1', onClose: vi.fn(), onRegistered: vi.fn() };

// Waits out the async supplier fetch so state updates land inside `act`.
const settle = async () => {
	await waitFor(() => expect(fromMock).toHaveBeenCalled());
};

describe('ReceiptModal', () => {
	beforeEach(() => {
		registerReceiptMock.mockClear();
	});

	it('rodapé "Custo do lote" some quando alguma linha está sem custo', async () => {
		render(<ReceiptModal {...base} products={[product()]} />);
		await settle();

		fireEvent.change(screen.getByLabelText('SKU'), { target: { value: 'POP-1' } });
		// Custo unitário fica em branco de propósito.
		fireEvent.click(screen.getByRole('button', { name: /adicionar item/i }));

		expect(screen.getByText('Itens · 1')).toBeInTheDocument();
		// mata: exibir "Custo do lote" com US$ 0,00 (ou qualquer valor) quando
		// receiptTotal devolve null por falta de custo em alguma linha — a spec
		// proíbe explicitamente um total mentiroso.
		expect(screen.queryByText(/custo do lote/i)).not.toBeInTheDocument();
	});

	it('botão "Registrar entrada" fica desabilitado sem fornecedor escolhido', async () => {
		render(<ReceiptModal {...base} products={[product()]} />);
		await settle();

		fireEvent.change(screen.getByLabelText('SKU'), { target: { value: 'POP-1' } });
		fireEvent.change(screen.getByLabelText('Custo unitário'), { target: { value: '2.5' } });
		fireEvent.click(screen.getByRole('button', { name: /adicionar item/i }));

		// mata: remover o gate do fornecedor de `canSubmit` — sem fornecedor
		// escolhido o botão tem que continuar desabilitado mesmo com um lote válido.
		expect(screen.getByRole('button', { name: /registrar entrada/i })).toBeDisabled();

		fireEvent.change(screen.getByLabelText(/fornecedor/i), { target: { value: 'sup-1' } });
		expect(screen.getByRole('button', { name: /registrar entrada/i })).toBeEnabled();
	});

	it('botão "Registrar entrada" fica desabilitado enquanto uma linha do lote está sem nome para um SKU que o catálogo não reconhece', async () => {
		// A UI nunca deixa adicionar um SKU novo sem nome (canAddLine já bloqueia
		// isso no bloco "adicionar item"), então o único jeito de observar o gate
		// de `linesNeedingName` em `canSubmit` é o catálogo mudar depois que a
		// linha já foi adicionada — exatamente o cenário do Important 1 (loja
		// filtrada some com um SKU que existia). Simulamos isso re-renderizando
		// com um catálogo menor.
		const { rerender } = render(<ReceiptModal {...base} products={[product()]} />);
		await settle();

		fireEvent.change(screen.getByLabelText(/fornecedor/i), { target: { value: 'sup-1' } });
		fireEvent.change(screen.getByLabelText('SKU'), { target: { value: 'POP-1' } });
		fireEvent.change(screen.getByLabelText('Custo unitário'), { target: { value: '2.5' } });
		fireEvent.click(screen.getByRole('button', { name: /adicionar item/i }));

		expect(screen.getByRole('button', { name: /registrar entrada/i })).toBeEnabled();

		// POP-1 sai do catálogo que o modal enxerga: a linha já adicionada não tem
		// nome próprio (foi adicionada quando o SKU era conhecido) e agora não bate
		// com nenhum produto — linesNeedingName tem que voltar a pegá-la.
		rerender(<ReceiptModal {...base} products={[]} />);

		// mata: remover `needingName.length === 0` de `canSubmit`
		expect(screen.getByRole('button', { name: /registrar entrada/i })).toBeDisabled();
	});

	it('o rascunho de uma segunda linha não some enquanto o usuário digita', async () => {
		render(<ReceiptModal {...base} products={[product(), product({ id: 'p2', sku: 'POP-2', name: 'Produto Dois' })]} />);
		await settle();

		fireEvent.change(screen.getByLabelText('SKU'), { target: { value: 'POP-1' } });
		fireEvent.change(screen.getByLabelText('Custo unitário'), { target: { value: '1' } });
		fireEvent.click(screen.getByRole('button', { name: /adicionar item/i }));
		expect(screen.getByText('Itens · 1')).toBeInTheDocument();

		// Começa a digitar uma segunda linha sem clicar em "Adicionar item" ainda.
		fireEvent.change(screen.getByLabelText('SKU'), { target: { value: 'POP-2' } });
		fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '3' } });

		// mata: mesclar `lines` a cada tecla (a armadilha que o comentário de
		// receiptCart.ts avisa) — se o merge rodasse a cada onChange, o rascunho
		// ainda-inválido poderia ser descartado e os campos voltariam a ficar em
		// branco antes do usuário terminar de digitar.
		expect(screen.getByLabelText('SKU')).toHaveValue('POP-2');
		expect(screen.getByLabelText('Quantidade')).toHaveValue(3);
		// E a linha ainda não foi empurrada pra lista — só ao clicar em Adicionar.
		expect(screen.getByText('Itens · 1')).toBeInTheDocument();

		fireEvent.click(screen.getByRole('button', { name: /adicionar item/i }));
		expect(screen.getByText('Itens · 2')).toBeInTheDocument();
	});

	it('o select de local de destino não aparece num lote só de SKUs conhecidos', async () => {
		// mata: tornar o campo sempre visível, reintroduzindo a decisão de local
		// a cada recebimento — a Emenda 1 existe pra evitar isso quando o lote
		// não cria produto nenhum.
		render(<ReceiptModal {...base} products={[product()]} />);
		await settle();

		fireEvent.change(screen.getByLabelText(/fornecedor/i), { target: { value: 'sup-1' } });
		fireEvent.change(screen.getByLabelText('SKU'), { target: { value: 'POP-1' } });
		fireEvent.change(screen.getByLabelText('Custo unitário'), { target: { value: '2.5' } });
		fireEvent.click(screen.getByRole('button', { name: /adicionar item/i }));

		expect(screen.getByText('Itens · 1')).toBeInTheDocument();
		expect(screen.queryByLabelText(/local de destino/i)).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: /registrar entrada/i })).toBeEnabled();
	});

	it('com um SKU novo no lote e nenhum local escolhido, "Registrar entrada" fica desabilitado', async () => {
		// mata: remover o gate do local de `canSubmit` e deixar salvar um
		// produto novo sem loja escolhida.
		render(<ReceiptModal {...base} products={[product()]} />);
		await settle();

		fireEvent.change(screen.getByLabelText(/fornecedor/i), { target: { value: 'sup-1' } });
		fireEvent.change(screen.getByLabelText('SKU'), { target: { value: 'POP-NOVO' } });
		fireEvent.change(screen.getByLabelText(/nome do produto/i), { target: { value: 'Produto Novo' } });
		fireEvent.change(screen.getByLabelText('Custo unitário'), { target: { value: '2.5' } });
		fireEvent.click(screen.getByRole('button', { name: /adicionar item/i }));

		expect(screen.getByText('Itens · 1')).toBeInTheDocument();
		expect(screen.getByLabelText(/local de destino/i)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /registrar entrada/i })).toBeDisabled();

		fireEvent.change(screen.getByLabelText(/local de destino/i), { target: { value: 'Miami' } });
		expect(screen.getByRole('button', { name: /registrar entrada/i })).toBeEnabled();
	});

	it('o local escolhido chega em registerReceipt ao registrar um lote com SKU novo', async () => {
		// mata: `location: null` fixo (ou remover a linha) no submit() do modal —
		// os 248 testes anteriores continuariam verdes, mas todo recebimento com
		// SKU novo quebraria em runtime com receipt_location_required.
		render(<ReceiptModal {...base} products={[product()]} />);
		await settle();

		fireEvent.change(screen.getByLabelText(/fornecedor/i), { target: { value: 'sup-1' } });
		fireEvent.change(screen.getByLabelText('SKU'), { target: { value: 'POP-NOVO' } });
		fireEvent.change(screen.getByLabelText(/nome do produto/i), { target: { value: 'Produto Novo' } });
		fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '4' } });
		fireEvent.change(screen.getByLabelText('Custo unitário'), { target: { value: '2.5' } });
		fireEvent.click(screen.getByRole('button', { name: /adicionar item/i }));

		fireEvent.change(screen.getByLabelText(/local de destino/i), { target: { value: 'Miami' } });
		expect(screen.getByRole('button', { name: /registrar entrada/i })).toBeEnabled();

		fireEvent.click(screen.getByRole('button', { name: /registrar entrada/i }));

		await waitFor(() => expect(registerReceiptMock).toHaveBeenCalledTimes(1));
		expect(registerReceiptMock.mock.calls[0][0]).toMatchObject({ location: 'Miami' });
	});
});
