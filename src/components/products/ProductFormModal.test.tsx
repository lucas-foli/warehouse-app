import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
