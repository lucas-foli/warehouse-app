import { describe, expect, it } from 'vitest';
import { getProductRisk, SEM_GIRO_DIAS } from './productRisk';
import type { Product } from '../types';

const NOW = new Date('2026-07-21T12:00:00Z');

const baseProduct = (overrides: Partial<Product> = {}): Product => ({
	id: '1',
	name: 'Produto Base',
	sku: 'ABC123',
	status: 'VITRINE',
	location: 'Loja principal',
	qty: 10,
	min: 2,
	image: 'foto.jpg',
	created_at: '2020-01-01T00:00:00Z',
	...overrides,
});

const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

describe('getProductRisk', () => {
	it('is not critical for a healthy product with a recent sale', () => {
		const product = baseProduct();
		const lastSaleBySku = new Map([['ABC123', daysAgo(5)]]);
		expect(getProductRisk(product, lastSaleBySku, NOW)).toEqual({ critical: false, reasons: [] });
	});

	it('flags "estoque zerado" when qty <= 0', () => {
		const product = baseProduct({ qty: 0 });
		const lastSaleBySku = new Map([['ABC123', daysAgo(5)]]);
		const result = getProductRisk(product, lastSaleBySku, NOW);
		expect(result.critical).toBe(true);
		expect(result.reasons).toContain('estoque zerado');
	});

	it('flags "sem foto" when image is missing', () => {
		const product = baseProduct({ image: undefined });
		const lastSaleBySku = new Map([['ABC123', daysAgo(5)]]);
		const result = getProductRisk(product, lastSaleBySku, NOW);
		expect(result.critical).toBe(true);
		expect(result.reasons).toContain('sem foto');
	});

	it('flags "comprar" when qty <= min', () => {
		const product = baseProduct({ qty: 2, min: 2 });
		const lastSaleBySku = new Map([['ABC123', daysAgo(5)]]);
		const result = getProductRisk(product, lastSaleBySku, NOW);
		expect(result.critical).toBe(true);
		expect(result.reasons).toContain('comprar');
	});

	it('does not flag "comprar" when min is absent', () => {
		const product = baseProduct({ qty: 1, min: undefined });
		const lastSaleBySku = new Map([['ABC123', daysAgo(5)]]);
		const result = getProductRisk(product, lastSaleBySku, NOW);
		expect(result.reasons).not.toContain('comprar');
	});

	it('does not flag "comprar" when qty > min', () => {
		const product = baseProduct({ qty: 10, min: 2 });
		const lastSaleBySku = new Map([['ABC123', daysAgo(5)]]);
		const result = getProductRisk(product, lastSaleBySku, NOW);
		expect(result.reasons).not.toContain('comprar');
	});

	it('flags "sem giro" when the last sale is more than 30 days ago', () => {
		const product = baseProduct();
		const lastSaleBySku = new Map([['ABC123', daysAgo(SEM_GIRO_DIAS + 1)]]);
		const result = getProductRisk(product, lastSaleBySku, NOW);
		expect(result.critical).toBe(true);
		expect(result.reasons).toContain('sem giro');
	});

	it('does not flag "sem giro" when the last sale is within 30 days', () => {
		const product = baseProduct();
		const lastSaleBySku = new Map([['ABC123', daysAgo(SEM_GIRO_DIAS)]]);
		const result = getProductRisk(product, lastSaleBySku, NOW);
		expect(result.reasons).not.toContain('sem giro');
	});

	it('flags "sem giro" for a never-sold product registered more than 30 days ago', () => {
		const product = baseProduct({ created_at: daysAgo(SEM_GIRO_DIAS + 1) });
		const result = getProductRisk(product, new Map(), NOW);
		expect(result.critical).toBe(true);
		expect(result.reasons).toContain('sem giro');
	});

	it('does not flag "sem giro" for a never-sold product registered recently', () => {
		const product = baseProduct({ created_at: daysAgo(SEM_GIRO_DIAS) });
		const result = getProductRisk(product, new Map(), NOW);
		expect(result.reasons).not.toContain('sem giro');
	});

	it('normalizes the SKU (trim + uppercase) to look up lastSaleBySku', () => {
		const product = baseProduct({ sku: '  abc123 ' });
		const lastSaleBySku = new Map([['ABC123', daysAgo(SEM_GIRO_DIAS + 1)]]);
		const result = getProductRisk(product, lastSaleBySku, NOW);
		expect(result.reasons).toContain('sem giro');
	});

	it('place and risk coexist: status "VITRINE" with qty <= min is still critical', () => {
		const product = baseProduct({ status: 'VITRINE', qty: 2, min: 2 });
		const lastSaleBySku = new Map([['ABC123', daysAgo(5)]]);
		const result = getProductRisk(product, lastSaleBySku, NOW);
		expect(result.critical).toBe(true);
		expect(result.reasons).toContain('comprar');
	});

	it('guard-rail: a healthy product is never critical regardless of status "SEM GIRO" (old keyword behavior must not come back)', () => {
		const product = baseProduct({ status: 'SEM GIRO', qty: 50, min: 2, image: 'foto.jpg' });
		const lastSaleBySku = new Map([['ABC123', daysAgo(1)]]);
		expect(getProductRisk(product, lastSaleBySku, NOW)).toEqual({ critical: false, reasons: [] });
	});

	it('guard-rail: a healthy product is never critical regardless of status "EM RISCO" or "COMPRAR"', () => {
		const lastSaleBySku = new Map([['ABC123', daysAgo(1)]]);
		const emRisco = baseProduct({ status: 'EM RISCO', qty: 50, min: 2, image: 'foto.jpg' });
		expect(getProductRisk(emRisco, lastSaleBySku, NOW)).toEqual({ critical: false, reasons: [] });

		const comprar = baseProduct({ status: 'COMPRAR', qty: 50, min: 2, image: 'foto.jpg' });
		expect(getProductRisk(comprar, lastSaleBySku, NOW)).toEqual({ critical: false, reasons: [] });
	});

	it('does not flag "sem giro" when lastSale is an invalid date (fails safe: NaN > 30 is false)', () => {
		const product = baseProduct();
		const lastSaleBySku = new Map([['ABC123', 'not-a-date']]);
		const result = getProductRisk(product, lastSaleBySku, NOW);
		expect(result.reasons).not.toContain('sem giro');
	});

	it('does not flag "sem giro" for a never-sold product with an invalid created_at (fails safe: NaN > 30 is false)', () => {
		const product = baseProduct({ created_at: 'not-a-date' });
		const result = getProductRisk(product, new Map(), NOW);
		expect(result.reasons).not.toContain('sem giro');
	});

	it('combines multiple reasons when several triggers fire', () => {
		const product = baseProduct({ qty: 0, image: undefined, min: 1 });
		const lastSaleBySku = new Map([['ABC123', daysAgo(SEM_GIRO_DIAS + 1)]]);
		const result = getProductRisk(product, lastSaleBySku, NOW);
		expect(result.critical).toBe(true);
		expect(result.reasons).toEqual(expect.arrayContaining(['estoque zerado', 'sem foto', 'comprar', 'sem giro']));
	});
});
