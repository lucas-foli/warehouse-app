import { describe, expect, it } from 'vitest';
import {
	validateClientDraft,
	validateSellerDraft,
	clientExternalId,
	sellerExternalId,
	buildClientInsert,
	buildClientUpdate,
	buildSellerInsert,
	deleteBlockMessage,
	nameDuplicateWarning,
	emailDuplicateError,
} from './clientSellerForms';

const TENANT = '00000000-0000-0000-0000-000000000000';

describe('validateClientDraft', () => {
	it('rejeita nome em branco', () => {
		expect(validateClientDraft({ nome: '  ', cidade: '', telefone: '', email: '' })).toMatch(/nome/i);
	});
	it('aceita quando há nome', () => {
		expect(validateClientDraft({ nome: 'Ana', cidade: '', telefone: '', email: '' })).toBeNull();
	});
});

describe('clientExternalId (espelha o import: email || telefone || nome)', () => {
	it('prefere email', () => {
		expect(clientExternalId({ nome: 'Ana', cidade: '', telefone: '9', email: 'a@x.com' })).toBe('A@X.COM');
	});
	it('cai para telefone', () => {
		expect(clientExternalId({ nome: 'Ana', cidade: '', telefone: '99', email: '' })).toBe('99');
	});
	it('cai para nome', () => {
		expect(clientExternalId({ nome: 'Ana', cidade: '', telefone: '', email: '' })).toBe('ANA');
	});
});

describe('buildClientInsert', () => {
	it('define tenant + external_id e omite opcionais vazios', () => {
		const row = buildClientInsert({ nome: ' Ana ', cidade: '', telefone: '', email: '' }, TENANT);
		expect(row).toEqual({ tenant_id: TENANT, external_id: 'ANA', name: 'Ana' });
	});
	it('inclui opcionais trimados quando presentes', () => {
		const row = buildClientInsert({ nome: 'Ana', cidade: ' SP ', telefone: ' 9 ', email: ' a@x.com ' }, TENANT);
		expect(row).toMatchObject({ name: 'Ana', city: 'SP', phone: '9', email: 'a@x.com', external_id: 'A@X.COM' });
	});
});

describe('buildClientUpdate (não toca external_id)', () => {
	it('zera campos vazios com null para limpá-los', () => {
		const row = buildClientUpdate({ nome: 'Ana', cidade: '', telefone: '', email: '' });
		expect(row).toEqual({ name: 'Ana', city: null, phone: null, email: null });
		expect(row).not.toHaveProperty('external_id');
	});
});

describe('vendedor', () => {
	it('valida nome', () => {
		expect(validateSellerDraft({ nome: '', email: '' })).toMatch(/nome/i);
	});
	it('external_id = email || nome', () => {
		expect(sellerExternalId({ nome: 'Bea', email: '' })).toBe('BEA');
		expect(sellerExternalId({ nome: 'Bea', email: 'b@x.com' })).toBe('B@X.COM');
	});
	it('insert omite email vazio', () => {
		expect(buildSellerInsert({ nome: 'Bea', email: '' }, TENANT)).toEqual({
			tenant_id: TENANT,
			external_id: 'BEA',
			name: 'Bea',
		});
	});
});

describe('deleteBlockMessage', () => {
	it('singular', () => {
		expect(deleteBlockMessage('vendedor', 1)).toContain('1 venda vinculada');
	});
	it('plural', () => {
		expect(deleteBlockMessage('cliente', 3)).toContain('3 vendas vinculadas');
	});
});

describe('nameDuplicateWarning', () => {
	it('monta o aviso com o tipo e o nome', () => {
		expect(nameDuplicateWarning('cliente', 'Jacksons')).toBe(
			'Já existe um cliente chamado "Jacksons". Deseja salvar mesmo assim?',
		);
		expect(nameDuplicateWarning('vendedor', 'Bruno')).toContain('um vendedor chamado "Bruno"');
	});
});

describe('emailDuplicateError', () => {
	it('monta a mensagem com o tipo', () => {
		expect(emailDuplicateError('cliente')).toBe('Já existe um cliente com esse e-mail.');
		expect(emailDuplicateError('vendedor')).toContain('um vendedor com esse e-mail');
	});
});
