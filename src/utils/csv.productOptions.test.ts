import { describe, expect, it } from 'vitest';
import { buildProductOptionsFromCsvText } from './csv';

const TENANT = '00000000-0000-0000-0000-000000000000';

describe('buildProductOptionsFromCsvText', () => {
	it('parses kind + value and uppercases/collapses the value', () => {
		const { rows } = buildProductOptionsFromCsvText('kind,value\nlocal,  loja   principal \n', TENANT);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ tenant_id: TENANT, kind: 'local', value: 'LOJA PRINCIPAL' });
		expect(rows[0].sort_order).toBeUndefined();
	});

	it('accepts tipo/valor aliases and an optional sort_order', () => {
		const { rows } = buildProductOptionsFromCsvText('tipo,valor,ordem\nonde,estoque,3\n', TENANT);
		expect(rows[0]).toMatchObject({ kind: 'onde', value: 'ESTOQUE', sort_order: 3 });
	});

	it('skips rows with an invalid kind or a blank value', () => {
		const r = buildProductOptionsFromCsvText('kind,value\nfoo,X\nlocal,\nlocal,LOJA A\n', TENANT);
		expect(r.rows).toHaveLength(1);
		expect(r.rows[0].value).toBe('LOJA A');
		expect(r.skippedRows).toBe(2);
	});
});
