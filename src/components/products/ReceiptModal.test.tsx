import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Product } from '../../types';

// Same pattern as receiptService.test.ts: build the mock before importing the
// module under test, then dynamically import so the mock is in place first.
const fromMock = vi.fn((table: string) => ({
	select: () => ({
		eq: () =>
			Promise.resolve(
				table === 'suppliers'
					? { data: [{ id: 'sup-1', name: 'Fornecedor Um' }], error: null }
					: { data: [], error: null },
			),
	}),
}));
vi.mock('../../lib/supabaseClient', () => ({
	supabase: { from: (table: string) => fromMock(table) },
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
});
