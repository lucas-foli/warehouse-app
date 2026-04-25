import { describe, expect, it } from 'vitest';
import { validateSalesItemSkus } from './salesIntegrity';

describe('validateSalesItemSkus', () => {
	it('aceita venda quando todos os SKUs existem e estao ativos', () => {
		const productsBySku = new Map([
			['SKU-001', { id: 'p1', isActive: true }],
			['SKU-002', { id: 'p2', isActive: true }],
		]);

		const result = validateSalesItemSkus(['SKU-001', 'SKU-002', 'SKU-001'], productsBySku);

		expect(result.isValid).toBe(true);
		expect(result.unknownSkus).toEqual([]);
		expect(result.inactiveSkus).toEqual([]);
		expect(result.errorMessage).toBeUndefined();
	});

	it('rejeita SKU inexistente com erro tratado', () => {
		const productsBySku = new Map([['SKU-001', { id: 'p1', isActive: true }]]);

		const result = validateSalesItemSkus(['SKU-001', 'SKU-404'], productsBySku);

		expect(result.isValid).toBe(false);
		expect(result.unknownSkus).toEqual(['SKU-404']);
		expect(result.errorMessage).toContain('Produto SKU-404 nao cadastrado.');
	});

	it('rejeita SKU com erro de digitacao', () => {
		const productsBySku = new Map([['PROD-12345', { id: 'p1', isActive: true }]]);

		const result = validateSalesItemSkus(['PROD-1234'], productsBySku);

		expect(result.isValid).toBe(false);
		expect(result.unknownSkus).toEqual(['PROD-1234']);
		expect(result.errorMessage).toContain('nao cadastrado');
	});

	it('rejeita SKU inativo', () => {
		const productsBySku = new Map([['SKU-002', { id: 'p2', isActive: false }]]);

		const result = validateSalesItemSkus(['SKU-002'], productsBySku);

		expect(result.isValid).toBe(false);
		expect(result.inactiveSkus).toEqual(['SKU-002']);
		expect(result.errorMessage).toContain('Produto SKU-002 esta inativo.');
	});
});
