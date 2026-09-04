import { describe, expect, it } from 'vitest';
import { linesNeedingName, mergeReceiptLines, receiptTotal, type ReceiptLine } from './receiptCart';

const line = (over: Partial<ReceiptLine> = {}): ReceiptLine => ({
	sku: 'POP-401', qty: 1, unitCost: null, name: '', ...over,
});

describe('mergeReceiptLines', () => {
	it('soma a qty de SKUs repetidos e normaliza o código', () => {
		// mata: trocar a soma por max/primeiro, ou parar de normalizar (trim+upper)
		expect(mergeReceiptLines([
			line({ sku: 'pop-401', qty: 10 }),
			line({ sku: ' POP-401 ', qty: 5 }),
		])).toEqual([line({ sku: 'POP-401', qty: 15 })]);
	});

	it('preserva o ÚLTIMO custo não-nulo do SKU', () => {
		// mata: pegar o primeiro custo, ou deixar o null sobrescrever o valor
		const [merged] = mergeReceiptLines([
			line({ qty: 1, unitCost: 4 }),
			line({ qty: 1, unitCost: 5 }),
			line({ qty: 1, unitCost: null }),
		]);
		expect(merged.unitCost).toBe(5);
	});

	it('preserva o PRIMEIRO nome não-vazio do SKU', () => {
		// mata: último nome vencer (o usuário digitou o nome na 1a ocorrência)
		const [merged] = mergeReceiptLines([
			line({ qty: 1, name: 'Camarão rosa 500g' }),
			line({ qty: 1, name: '' }),
		]);
		expect(merged.name).toBe('Camarão rosa 500g');
	});

	it('não deixa um SEGUNDO nome não-vazio sobrescrever o primeiro', () => {
		// mata: remover a guarda !existing.name e virar "último não-vazio vence"
		const [merged] = mergeReceiptLines([
			line({ qty: 1, name: 'Camarão rosa 500g' }),
			line({ qty: 1, name: 'Camarão G' }),
		]);
		expect(merged.name).toBe('Camarão rosa 500g');
	});

	it('mantém a ordem da primeira aparição de cada SKU', () => {
		// mata: ordenar alfabeticamente
		expect(mergeReceiptLines([
			line({ sku: 'B', qty: 1 }), line({ sku: 'A', qty: 1 }), line({ sku: 'B', qty: 1 }),
		]).map((l) => l.sku)).toEqual(['B', 'A']);
	});

	it('descarta linha sem SKU ou com qty inválida', () => {
		// mata: remover a validação e deixar lixo chegar na RPC
		expect(mergeReceiptLines([
			line({ sku: '   ', qty: 5 }),
			line({ qty: 0 }),
			line({ qty: -3 }),
			line({ qty: 1.5 }),
		])).toEqual([]);
	});
});

describe('receiptTotal', () => {
	it('soma qty x custo de cada linha', () => {
		// mata: somar só o custo unitário, ignorando a quantidade
		expect(receiptTotal([
			line({ sku: 'A', qty: 100, unitCost: 4.5 }),
			line({ sku: 'B', qty: 40, unitCost: 7.2 }),
		])).toBe(738);
	});

	it('devolve null (não 0) se qualquer linha estiver sem custo', () => {
		// mata: coalesce(custo, 0) — ausente vira zero e o total mente
		expect(receiptTotal([
			line({ sku: 'A', qty: 10, unitCost: 4.5 }),
			line({ sku: 'B', qty: 10, unitCost: null }),
		])).toBeNull();
	});

	it('trata custo 0 como custo real, não como ausente', () => {
		// mata: testar falsy (!custo) em vez de === null — brinde tem custo 0
		expect(receiptTotal([line({ qty: 10, unitCost: 0 })])).toBe(0);
	});

	it('devolve null para carrinho vazio', () => {
		// mata: devolver 0 e exibir "US$ 0,00" num lote sem itens
		expect(receiptTotal([])).toBeNull();
	});

	it('arredonda ruído de ponto flutuante para 2 casas', () => {
		// mata: remover o Number(...toFixed(2)) — 3 * 0.1 sem arredondar dá 0.30000000000000004
		expect(receiptTotal([line({ qty: 3, unitCost: 0.1 })])).toBe(0.3);
	});
});

describe('linesNeedingName', () => {
	it('aponta o SKU desconhecido que ainda está sem nome', () => {
		// mata: parar de exigir nome — a RPC responderia receipt_product_name_required
		expect(linesNeedingName(
			[line({ sku: 'POP-922', qty: 40, name: '' })],
			new Set(['POP-401']),
		)).toEqual(['POP-922']);
	});

	it('não cobra nome de SKU que já existe no catálogo', () => {
		// mata: exigir nome de todo mundo, travando o lote normal
		expect(linesNeedingName(
			[line({ sku: 'POP-401', qty: 10, name: '' })],
			new Set(['POP-401']),
		)).toEqual([]);
	});

	it('não cobra nome de SKU novo que já foi nomeado', () => {
		// mata: ignorar o nome preenchido e bloquear o salvamento para sempre
		expect(linesNeedingName(
			[line({ sku: 'POP-922', qty: 40, name: 'Camarão rosa 500g' })],
			new Set(['POP-401']),
		)).toEqual([]);
	});

	it('compara SKU normalizado contra o catálogo', () => {
		// mata: comparar cru — 'pop-401' seria tratado como produto novo
		expect(linesNeedingName(
			[line({ sku: ' pop-401 ', qty: 10, name: '' })],
			new Set(['POP-401']),
		)).toEqual([]);
	});

	it('normaliza o catálogo recebido, não só o SKU da linha', () => {
		// mata: normalizar só o SKU da linha e comparar contra o Set cru do chamador
		expect(linesNeedingName(
			[line({ sku: 'POP-401', qty: 10, name: '' })],
			new Set(['pop-401']),
		)).toEqual([]);
	});
});
