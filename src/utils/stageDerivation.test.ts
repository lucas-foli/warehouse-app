// src/utils/stageDerivation.test.ts
import { describe, expect, it } from 'vitest';
import type { FieldContact } from '../types';
import { deriveStage, STAGE_LABELS, STAGE_ORDER } from './stageDerivation';

const base: FieldContact = {
	contactType: 'client',
	id: 'c1',
	tenantId: 't1',
	name: 'Ocean Fresh',
	manualStage: null,
	stageOverriddenAt: null,
	lastInteractionAt: null,
	hasTransaction: false,
	lastOutcome: null,
	hasSamples: false,
	hasInteraction: false,
	lastFactAt: null,
};

describe('deriveStage — 7 regras da spec, em ordem de precedência', () => {
	it('regra 7: nada registrado → new', () => {
		// mata: mutação que devolve constante != 'new' ou ignora o caso vazio
		expect(deriveStage(base)).toEqual({ stage: 'new', overridden: false });
	});

	it('regra 6: tem interação → contacted', () => {
		// mata: mutação que ignora hasInteraction
		expect(deriveStage({ ...base, hasInteraction: true, lastFactAt: '2026-08-20T10:00:00Z' })).toEqual({
			stage: 'contacted',
			overridden: false,
		});
	});

	it('regra 5: amostra entregue vence interação simples', () => {
		// mata: inversão de precedência entre hasSamples e hasInteraction
		expect(
			deriveStage({ ...base, hasInteraction: true, hasSamples: true, lastFactAt: '2026-08-20T10:00:00Z' }),
		).toEqual({ stage: 'sample_delivered', overridden: false });
	});

	it('regra 4: último resultado proposal_requested → negotiating (vence amostra)', () => {
		// mata: mutação que só olha hasSamples
		expect(
			deriveStage({
				...base,
				hasInteraction: true,
				hasSamples: true,
				lastOutcome: 'proposal_requested',
				lastFactAt: '2026-08-20T10:00:00Z',
			}),
		).toEqual({ stage: 'negotiating', overridden: false });
	});

	it('regra 3: último resultado not_interested → lost (vence negociação)', () => {
		// mata: mutação que não mapeia not_interested para lost (as regras 3 e 4 leem o mesmo campo; não há precedência real entre elas)
		expect(
			deriveStage({
				...base,
				hasInteraction: true,
				hasSamples: true,
				lastOutcome: 'not_interested',
				lastFactAt: '2026-08-20T10:00:00Z',
			}),
		).toEqual({ stage: 'lost', overridden: false });
	});

	it('regra 2: transação vence tudo que não é override → active', () => {
		// mata: mutação que deixa lastOutcome vencer hasTransaction
		expect(
			deriveStage({
				...base,
				hasTransaction: true,
				hasInteraction: true,
				lastOutcome: 'not_interested',
				lastFactAt: '2026-08-20T10:00:00Z',
			}),
		).toEqual({ stage: 'active', overridden: false });
	});

	it('regra 1: override vale enquanto não há fato posterior', () => {
		// mata: mutação que ignora manualStage ou não exige lastFactAt nulo
		expect(
			deriveStage({
				...base,
				hasInteraction: true,
				lastFactAt: null,
				manualStage: 'lost',
				stageOverriddenAt: '2026-08-21T10:00:00Z',
			}),
		).toEqual({ stage: 'lost', overridden: true });
	});

	it('regra 1 (expiração): fato novo depois do override volta a derivar', () => {
		// mata: mutação que trata override como permanente
		expect(
			deriveStage({
				...base,
				hasInteraction: true,
				lastFactAt: '2026-08-22T10:00:00Z',
				manualStage: 'lost',
				stageOverriddenAt: '2026-08-21T10:00:00Z',
			}),
		).toEqual({ stage: 'contacted', overridden: false });
	});

	it('regra 1 (sem fato): override com lastFactAt null vale', () => {
		// mata: mutação que exige lastFactAt não-nulo para honrar o override
		expect(deriveStage({ ...base, manualStage: 'negotiating', stageOverriddenAt: '2026-08-21T10:00:00Z' })).toEqual({
			stage: 'negotiating',
			overridden: true,
		});
	});

	it('regra 1 (escopo): amostra anterior ao override não ressuscita "amostra entregue"', () => {
		// mata: derivação que olha fatos de antes do override (o caso do e2e:
		// marcado Perdido, visitado depois sem amostra, voltava para Amostra entregue)
		expect(
			deriveStage({
				...base,
				hasInteraction: true,
				hasSamples: false,
				lastFactAt: '2026-08-22T10:00:00Z',
				manualStage: 'lost',
				stageOverriddenAt: '2026-08-21T10:00:00Z',
			}),
		).toEqual({ stage: 'contacted', overridden: false });
	});
});

describe('labels e ordem do funil', () => {
	it('todo estágio tem label pt-BR e posição no funil', () => {
		// mata: estágio adicionado sem label/ordem (quebra o agrupamento do funil)
		for (const stage of STAGE_ORDER) {
			expect(STAGE_LABELS[stage]).toBeTruthy();
		}
		expect(STAGE_ORDER).toHaveLength(6);
	});
});
