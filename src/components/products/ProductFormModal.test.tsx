import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ProductFormModal from './ProductFormModal';
import type { ProductDraft } from '../../utils/productForm';

const draft = (over: Partial<ProductDraft> = {}): ProductDraft => ({
	id: '', name: '', sku: '', status: 'ESTOQUE', location: 'Loja principal',
	qty: '0', min: '', price: '', barcode: '', image: '', ...over,
});

const base = {
	open: true as const, mode: 'create' as const, saving: false, error: '', dirty: false,
	hasTenant: true, ondeOptions: ['ESTOQUE'], localOptions: ['Loja principal'],
	onChange: vi.fn(), onSave: vi.fn(), onReset: vi.fn(), onClose: vi.fn(), onRequestDelete: vi.fn(),
	onRequestReceipt: vi.fn(),
};

describe('ProductFormModal', () => {
	it('BUG-2: SKU e Name marcados como obrigatórios (aria-required)', () => {
		render(<ProductFormModal {...base} draft={draft()} />);
		// mata: faltar a marcação de obrigatório
		expect(screen.getByLabelText(/SKU/i)).toHaveAttribute('aria-required', 'true');
		expect(screen.getByLabelText(/Name/i)).toHaveAttribute('aria-required', 'true');
	});

	it('BUG-3: Salvar desabilitado sem sku+name; habilitado com ambos, mesmo sem dirty', () => {
		const { rerender } = render(<ProductFormModal {...base} draft={draft()} />);
		// mata: botão habilitado sem os obrigatórios
		expect(screen.getByRole('button', { name: /salvar/i })).toBeDisabled();
		// dirty=false (herdado de `base`) de propósito: no create, o BUG-3 exige que o Salvar
		// habilite só com sku+name, sem depender de dirty — mata: create voltar a exigir dirty
		rerender(<ProductFormModal {...base} draft={draft({ sku: 'A', name: 'X' })} />);
		expect(screen.getByRole('button', { name: /salvar/i })).toBeEnabled();
	});

	it('não deixa editar o saldo na edição de produto', () => {
		render(<ProductFormModal {...base} mode="edit" draft={draft({ qty: '148' })} />);
		// mata: trocar {draft.qty} por vazio/outro valor no bloco só-leitura
		expect(screen.getByText('148')).toBeInTheDocument();
		expect(screen.getByText('só-leitura')).toBeInTheDocument();
		// mata: renderizar o input editável de Qtd junto com o bloco só-leitura no modo edit
		// (selecionado por nome acessível "Qtd" para não colidir com os spinbuttons de
		// Mínimo/Preço, que continuam editáveis no modo edit)
		expect(screen.queryByRole('spinbutton', { name: /^qtd$/i })).not.toBeInTheDocument();
	});

	it('"Registrar recebimento deste item" só existe no modo edit, e aciona onRequestReceipt', () => {
		const onRequestReceipt = vi.fn();
		const { rerender } = render(
			<ProductFormModal {...base} onRequestReceipt={onRequestReceipt} draft={draft({ sku: 'POP-1' })} />,
		);
		// mata: renderizar o botão também no modo create (a spec só pede o atalho
		// na edição — no create o saldo já é editável direto no formulário)
		expect(
			screen.queryByRole('button', { name: /registrar recebimento deste item/i }),
		).not.toBeInTheDocument();

		rerender(
			<ProductFormModal
				{...base}
				mode="edit"
				onRequestReceipt={onRequestReceipt}
				draft={draft({ sku: 'POP-1', qty: '148' })}
			/>,
		);
		const button = screen.getByRole('button', { name: /registrar recebimento deste item/i });
		fireEvent.click(button);
		// mata: não chamar onRequestReceipt (o botão existiria mas não faria nada)
		expect(onRequestReceipt).toHaveBeenCalledTimes(1);
	});
});
