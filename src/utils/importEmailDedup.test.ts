import { describe, expect, it } from 'vitest';
import { dedupeByEmail } from './importEmailDedup';

type Row = { external_id: string; email?: string };

describe('dedupeByEmail', () => {
	it('pula duplicata interna do CSV (mesmo e-mail, case-insensitive)', () => {
		const rows: Row[] = [
			{ external_id: 'A@X.COM', email: 'a@x.com' },
			{ external_id: 'OUTRO', email: 'A@X.COM' },
		];
		const res = dedupeByEmail(rows, new Map());
		expect(res.toImport).toEqual([{ external_id: 'A@X.COM', email: 'a@x.com' }]);
		expect(res.skippedEmails).toBe(1);
	});

	it('pula e-mail já no banco sob external_id diferente', () => {
		const rows: Row[] = [{ external_id: 'NOVO', email: 'a@x.com' }];
		const existing = new Map([['a@x.com', 'ANTIGO']]);
		const res = dedupeByEmail(rows, existing);
		expect(res.toImport).toEqual([]);
		expect(res.skippedEmails).toBe(1);
	});

	it('NÃO pula quando o external_id é o mesmo do banco (update legítimo)', () => {
		const rows: Row[] = [{ external_id: 'A@X.COM', email: 'a@x.com' }];
		const existing = new Map([['a@x.com', 'A@X.COM']]);
		const res = dedupeByEmail(rows, existing);
		expect(res.toImport).toEqual(rows);
		expect(res.skippedEmails).toBe(0);
	});

	it('não pula linhas sem e-mail, mesmo repetidas', () => {
		const rows: Row[] = [
			{ external_id: 'ANA', email: '' },
			{ external_id: 'BEA' },
		];
		const res = dedupeByEmail(rows, new Map());
		expect(res.toImport).toEqual(rows);
		expect(res.skippedEmails).toBe(0);
	});

	// Mata a mutação de remover o toUpperCase na comparação de external_id:
	// banco em minúsculas + linha em maiúsculas = mesmo registro, não pode pular.
	it('compara external_id case-insensitive (banco lower vs linha upper = mesmo)', () => {
		const rows: Row[] = [{ external_id: 'A@X.COM', email: 'a@x.com' }];
		const existing = new Map([['a@x.com', 'a@x.com']]);
		const res = dedupeByEmail(rows, existing);
		expect(res.toImport).toEqual(rows);
		expect(res.skippedEmails).toBe(0);
	});
});
