import { describe, expect, it } from 'vitest';
import type { FieldContact, Interaction, Receipt, ReceiptItem } from '../types';
import { resolveWindow } from './reportWindow';
import { lastKnownCostBySku, summarizeSamples } from './sampleCost';

const NOW = new Date('2026-09-08T12:00:00.000Z');
const W = resolveWindow('30d', NOW);

const receipt = (id: string, receivedAt: string): Receipt => ({
	id, tenantId: 't1', receiptNumber: `R-${id}`, supplierId: 's1', receivedAt,
	document: null, note: null, totalCost: null, createdBy: null,
	createdAt: receivedAt, updatedAt: receivedAt,
});

const item = (
	receiptId: string,
	sku: string,
	unitCost: number | null,
	createdAt = '2026-09-01T00:00:00.000Z',
): ReceiptItem => ({
	id: `${receiptId}-${sku}`, tenantId: 't1', receiptId, receiptNumber: `R-${receiptId}`,
	productId: null, sku, qty: 10, unitCost, totalCost: null, createdAt,
});

const interaction = (over: Partial<Interaction> = {}): Interaction => ({
	id: 'i1', tenantId: 't1', clientId: 'c1', supplierId: null, kind: 'visit',
	outcome: null, note: null, occurredAt: '2026-09-05T00:00:00.000Z',
	nextStep: null, nextStepDueAt: null, nextStepDoneAt: null, samples: [], ...over,
});

const contact = (id: string, name: string): FieldContact => ({
	contactType: 'client', id, tenantId: 't1', name, manualStage: null,
	stageOverriddenAt: null, lastInteractionAt: null, hasTransaction: false,
	lastOutcome: null, hasSamples: true, hasInteraction: true, lastFactAt: null,
});

describe('lastKnownCostBySku', () => {
	it('usa o custo do recebimento mais recente por received_at', () => {
		// mata: ordenar por created_at do item, ou pegar o primeiro que aparecer
		// created_at do item é invertido de propósito em relação ao received_at
		// do recebimento: se a implementação usar created_at do item por engano,
		// ela escolhe o item errado (cost 9) em vez do certo (cost 12).
		const map = lastKnownCostBySku(
			[receipt('r1', '2026-08-01T00:00:00.000Z'), receipt('r2', '2026-09-01T00:00:00.000Z')],
			[
				item('r1', 'CAM-1620', 9, '2026-09-05T00:00:00.000Z'),
				item('r2', 'CAM-1620', 12, '2026-08-05T00:00:00.000Z'),
			],
		);
		expect(map.get('CAM-1620')).toBe(12);
	});

	it('ignora linha sem custo em vez de tratá-la como zero', () => {
		// mata: `unitCost ?? 0` — o SKU passaria a "custar" zero, silenciosamente
		const map = lastKnownCostBySku(
			[receipt('r1', '2026-08-01T00:00:00.000Z'), receipt('r2', '2026-09-01T00:00:00.000Z')],
			[item('r1', 'CAM-1620', 9), item('r2', 'CAM-1620', null)],
		);
		expect(map.get('CAM-1620')).toBe(9);
	});

	it('normaliza o SKU', () => {
		// mata: chavear pelo sku cru (cam-1620 e CAM-1620 viram dois custos)
		const map = lastKnownCostBySku([receipt('r1', '2026-08-01T00:00:00.000Z')], [item('r1', ' cam-1620 ', 7)]);
		expect(map.get('CAM-1620')).toBe(7);
	});

	it('descarta item cujo receiptId não tem recebimento correspondente (órfão)', () => {
		// mata: cair para item.createdAt quando o recebimento não é encontrado
		// (`receivedAt.get(item.receiptId) ?? item.createdAt`) — inventaria uma
		// data de fato que não se conhece, igual ao que receivedVsSold recusa
		const map = lastKnownCostBySku(
			[], // nenhum recebimento cadastrado: 'r-orfao' não existe em `receipts`
			[item('r-orfao', 'CAM-1620', 9)],
		);
		expect(map.has('CAM-1620')).toBe(false);
	});
});

describe('summarizeSamples', () => {
	const base = {
		contacts: [contact('c1', 'Popeye Seafood'), contact('c2', 'Bayou Foods')],
		receipts: [receipt('r1', '2026-09-01T00:00:00.000Z')],
		receiptItems: [item('r1', 'CAM-1620', 10)],
		window: W,
	};

	it('soma quantidade por contato e custeia com o último custo', () => {
		// mata: somar interações em vez de unidades, ou trocar o contato pelo id cru
		const r = summarizeSamples({
			...base,
			interactions: [
				interaction({ id: 'i1', clientId: 'c1', samples: [{ sku: 'CAM-1620', qty: 3 }] }),
				interaction({ id: 'i2', clientId: 'c1', samples: [{ sku: 'CAM-1620', qty: 2 }] }),
			],
		});
		expect(r.totalQty).toBe(5);
		expect(r.cost).toBe(50);
		expect(r.byContact).toEqual([
			{ key: 'client:c1', name: 'Popeye Seafood', qty: 5, cost: 50, partial: false },
		]);
	});

	it('conta SKU sem custo na cobertura e marca o total como parcial', () => {
		// mata: contar SKU sem custo como custo zero (o aviso sumiria da tela)
		const r = summarizeSamples({
			...base,
			interactions: [
				interaction({ clientId: 'c1', samples: [{ sku: 'CAM-1620', qty: 1 }, { sku: 'LAG-CDA', qty: 4 }] }),
			],
		});
		expect(r.totalQty).toBe(5);
		expect(r.cost).toBe(10);
		expect(r.skusTotal).toBe(2);
		expect(r.skusWithoutCost).toBe(1);
		expect(r.byContact[0].partial).toBe(true);
	});

	it('ignora amostra fora da janela', () => {
		// mata: esquecer a janela (o custo de aquisição do período viraria all-time)
		const r = summarizeSamples({
			...base,
			interactions: [interaction({ occurredAt: '2026-01-01T00:00:00.000Z', samples: [{ sku: 'CAM-1620', qty: 9 }] })],
		});
		expect(r.totalQty).toBe(0);
		expect(r.byContact).toEqual([]);
	});

	it('resolve o nome de fornecedor pelo supplierId', () => {
		// mata: procurar todo contato como cliente (fornecedor viraria "—")
		const supplier: FieldContact = { ...contact('s9', 'Noronha Pescados'), contactType: 'supplier' };
		const r = summarizeSamples({
			...base,
			contacts: [supplier],
			interactions: [interaction({ clientId: null, supplierId: 's9', samples: [{ sku: 'CAM-1620', qty: 2 }] })],
		});
		expect(r.byContact[0]).toMatchObject({ key: 'supplier:s9', name: 'Noronha Pescados' });
	});
});
