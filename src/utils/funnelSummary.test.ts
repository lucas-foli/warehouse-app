import { describe, expect, it } from 'vitest';
import type { FieldContact } from '../types';
import { summarizeFunnel } from './funnelSummary';

const contact = (over: Partial<FieldContact> = {}): FieldContact => ({
	contactType: 'client', id: 'c1', tenantId: 't1', name: 'Popeye Seafood',
	manualStage: null, stageOverriddenAt: null, lastInteractionAt: null,
	hasTransaction: false, lastOutcome: null, hasSamples: false,
	hasInteraction: false, lastFactAt: null, ...over,
});

describe('summarizeFunnel', () => {
	it('conta cada contato no estágio derivado, na ordem do funil', () => {
		// mata: contar em ordem alfabética, ou perder o contato "novo"
		const r = summarizeFunnel([
			contact({ id: 'a', hasTransaction: true }),
			contact({ id: 'b', hasSamples: true, hasInteraction: true }),
			contact({ id: 'c' }),
		]);
		expect(r.total).toBe(3);
		expect(r.rows.map((x) => [x.stage, x.count])).toEqual([
			['negotiating', 0], ['sample_delivered', 1], ['active', 1],
			['contacted', 0], ['new', 1], ['lost', 0],
		]);
	});

	it('respeita o override manual ainda válido', () => {
		// mata: chamar deriveStage e jogar fora o override (o funil discordaria
		// da sub-view Funil, que usa a mesma derivação)
		const r = summarizeFunnel([
			contact({ manualStage: 'negotiating', stageOverriddenAt: '2026-09-01T00:00:00.000Z' }),
		]);
		expect(r.rows.find((x) => x.stage === 'negotiating')?.count).toBe(1);
	});

	it('expira o override quando há fato posterior', () => {
		// mata: tratar manualStage como verdade absoluta
		const r = summarizeFunnel([
			contact({
				manualStage: 'negotiating', stageOverriddenAt: '2026-09-01T00:00:00.000Z',
				lastFactAt: '2026-09-05T00:00:00.000Z', hasTransaction: true,
			}),
		]);
		expect(r.rows.find((x) => x.stage === 'active')?.count).toBe(1);
		expect(r.rows.find((x) => x.stage === 'negotiating')?.count).toBe(0);
	});

	it('devolve todas as linhas mesmo sem contato nenhum', () => {
		// mata: devolver [] (a UI mostraria um funil vazio sem explicar)
		expect(summarizeFunnel([]).rows).toHaveLength(6);
	});
});
