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
});
