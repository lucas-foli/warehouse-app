import { describe, expect, it } from 'vitest';
import { buildSalesOrdersFromCsvText } from './csv';

const TENANT = '00000000-0000-0000-0000-000000000000';

describe('buildSalesOrdersFromCsvText — location', () => {
	it('captures location from the canonical header', () => {
		const csv = 'order_number,total_amount,location\nVT-0001,100,LOJA TESTE A\n';
		const { rows } = buildSalesOrdersFromCsvText(csv, TENANT);
		expect(rows).toHaveLength(1);
		expect(rows[0].location).toBe('LOJA TESTE A');
	});

	it('accepts the loja / local aliases', () => {
		expect(buildSalesOrdersFromCsvText('pedido,loja\nVT-0002,LOJA TESTE B\n', TENANT).rows[0].location).toBe(
			'LOJA TESTE B',
		);
		expect(buildSalesOrdersFromCsvText('pedido,local\nVT-0003,LOJA TESTE C\n', TENANT).rows[0].location).toBe(
			'LOJA TESTE C',
		);
	});

	it('leaves location undefined when blank or absent', () => {
		expect(buildSalesOrdersFromCsvText('order_number,location\nVT-0004,\n', TENANT).rows[0].location).toBeUndefined();
		expect(buildSalesOrdersFromCsvText('order_number,total_amount\nVT-0005,50\n', TENANT).rows[0].location).toBeUndefined();
	});
});
