import { describe, expect, it } from 'vitest';
import type { Interaction, InteractionKind } from '../types';
import { resolveWindow } from './reportWindow';
import { summarizeActivity } from './fieldActivity';

const NOW = new Date('2026-09-08T12:00:00.000Z');
const W = resolveWindow('7d', NOW);

const it_ = (kind: InteractionKind, occurredAt: string): Interaction => ({
	id: `${kind}-${occurredAt}`, tenantId: 't1', clientId: 'c1', supplierId: null,
	kind, outcome: null, note: null, occurredAt,
	nextStep: null, nextStepDueAt: null, nextStepDoneAt: null, samples: [],
});

describe('summarizeActivity', () => {
	it('conta por canal só o que está na janela', () => {
		// mata: ignorar a janela, ou somar todos os canais num balde só
		const r = summarizeActivity([
			it_('visit', '2026-09-07T10:00:00.000Z'),
			it_('whatsapp', '2026-09-07T11:00:00.000Z'),
			it_('whatsapp', '2026-09-06T11:00:00.000Z'),
			it_('call', '2026-08-01T10:00:00.000Z'),
		], W);
		expect(r.total).toBe(3);
		expect(r.byChannel).toEqual({ visit: 1, call: 0, whatsapp: 2, email: 0 });
	});

	it('conta a interação exatamente na borda inferior', () => {
		// mata: trocar >= por > na comparação da janela
		expect(summarizeActivity([it_('visit', W.from as string)], W).total).toBe(1);
	});

	it('devolve todos os canais zerados quando não há interação', () => {
		// mata: devolver objeto vazio (a UI renderizaria undefined)
		expect(summarizeActivity([], W)).toEqual({
			total: 0, byChannel: { visit: 0, call: 0, whatsapp: 0, email: 0 },
		});
	});
});
