import { describe, expect, it } from 'vitest';
import { buildProductsFromCsvText } from './csv';

const TENANT = '00000000-0000-0000-0000-000000000000';

describe('buildProductsFromCsvText — location', () => {
	it('normalizes location so it matches the managed list and the store filter', () => {
		const { rows } = buildProductsFromCsvText('sku,name,location\nA-1,Item,  loja   principal \n', TENANT);
		expect(rows[0].location).toBe('LOJA PRINCIPAL');
	});

	it('leaves location undefined when blank', () => {
		const { rows } = buildProductsFromCsvText('sku,name,location\nA-2,Item,\n', TENANT);
		expect(rows[0].location).toBeUndefined();
	});
});
