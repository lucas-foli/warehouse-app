import { describe, expect, it } from 'vitest';
import { canSaveProduct, type ProductDraft } from './productForm';

const draft = (over: Partial<ProductDraft> = {}): ProductDraft => ({
	id: '', name: '', sku: '', status: 'ESTOQUE', location: 'Loja principal',
	qty: '0', min: '', price: '', barcode: '', image: '', ...over,
});

describe('canSaveProduct', () => {
	it('create: exige sku E name preenchidos', () => {
		// mata: habilitar no create ao primeiro campo (regra antiga do dirty)
		expect(canSaveProduct('create', draft({ sku: 'A' }), true, false, true)).toBe(false);
		expect(canSaveProduct('create', draft({ name: 'X' }), true, false, true)).toBe(false);
		expect(canSaveProduct('create', draft({ sku: 'A', name: 'X' }), true, false, true)).toBe(true);
		expect(canSaveProduct('create', draft({ sku: '  ', name: '  ' }), true, false, true)).toBe(false);
	});

	it('edit: basta dirty', () => {
		// mata: ignorar o modo
		expect(canSaveProduct('edit', draft(), false, false, true)).toBe(false);
		expect(canSaveProduct('edit', draft(), true, false, true)).toBe(true);
	});

	it('bloqueia sem tenant, salvando, ou draft nulo', () => {
		// mata: permitir salvar sem tenant / durante saving
		expect(canSaveProduct('create', draft({ sku: 'A', name: 'X' }), true, false, false)).toBe(false);
		expect(canSaveProduct('create', draft({ sku: 'A', name: 'X' }), true, true, true)).toBe(false);
		expect(canSaveProduct('create', null, true, false, true)).toBe(false);
	});
});
