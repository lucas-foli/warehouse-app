import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { Product } from '../types';

// Same pattern as ReceiptModal.test.tsx: build the mock before importing the
// module under test, then dynamically import so the mock is in place first.
//
// Scope note: this file only covers the `handleSaveDraft` payload concern
// below (Task 6 fix round 1 — qty must never be written back on edit). It is
// not a general ProductsPage test suite; ProductsPage has no other tests.
const updateMock = vi.fn((_payload: Record<string, unknown>) => ({
	eq: () => ({
		eq: () => Promise.resolve({ error: null }),
	}),
}));

const fromMock = vi.fn((table: string) => {
	if (table === 'products') {
		return { update: updateMock };
	}
	// tenant_product_options (Onde/Local dropdowns): .select().eq().eq().order().order()
	return {
		select: () => ({
			eq: () => ({
				eq: () => ({
					order: () => ({
						order: () => Promise.resolve({ data: [], error: null }),
					}),
				}),
			}),
		}),
	};
});

vi.mock('../lib/supabaseClient', () => ({
	supabase: { from: (table: string) => fromMock(table) },
}));

const { default: ProductsPage } = await import('./ProductsPage');

const product = (): Product => ({
	id: 'p1',
	name: 'Produto Um',
	sku: 'POP-1',
	status: 'ESTOQUE',
	location: 'Loja principal',
	qty: 148,
	min: 5,
	price: 10,
	is_active: true,
});

describe('ProductsPage handleSaveDraft', () => {
	it('salvar uma edição não envia qty no update — o saldo não é dono deste form', async () => {
		render(<ProductsPage products={[product()]} loading={false} onBack={vi.fn()} tenantId="t1" />);

		// A linha renderiza duplicada (cartão mobile + linha da tabela desktop,
		// já que jsdom não aplica os breakpoints do Tailwind); qualquer uma abre
		// a edição do mesmo produto.
		fireEvent.click(screen.getAllByText('Produto Um')[0]);

		const dialog = screen.getByRole('dialog');
		// Muda o Preço (único campo com valor '10' visível) para marcar `dirty`
		// e habilitar o Salvar — sem tocar em Qtd, que nem é mais um input no
		// modo edit.
		fireEvent.change(within(dialog).getByDisplayValue('10'), { target: { value: '20' } });
		fireEvent.click(within(dialog).getByRole('button', { name: /salvar/i }));

		await waitFor(() => expect(updateMock).toHaveBeenCalled());

		const payload = updateMock.mock.calls[0][0] as Record<string, unknown>;
		// mata: reintroduzir `qty` no payload de update de edição (a regressão
		// que o fix round 1 fechou — o saldo some em silêncio numa edição
		// concorrente com um recebimento/venda).
		expect(payload).not.toHaveProperty('qty');
		expect(payload.price).toBe(20);
	});
});
