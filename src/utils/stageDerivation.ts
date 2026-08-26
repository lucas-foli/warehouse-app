import type { ContactStage, FieldContact } from '../types';

// Fonte única da derivação de estágio (emenda da spec: TS, não SQL — aqui as
// 7 regras têm suíte de unidade; a view field_contacts entrega só fatos crus).
// Precedência, avaliada de cima para baixo:
// 1. override manual, se mais novo que o último fato (senão expira)
// 2. tem transação (venda; recebimento entra na fatia 2)   → active
// 3. último resultado not_interested                        → lost
// 4. último resultado proposal_requested                    → negotiating
// 5. tem amostra entregue                                   → sample_delivered
// 6. tem ao menos uma interação                             → contacted
// 7. nada                                                   → new
export const deriveStage = (c: FieldContact): { stage: ContactStage; overridden: boolean } => {
	if (c.manualStage && c.stageOverriddenAt) {
		const overrideWins = !c.lastFactAt || c.stageOverriddenAt >= c.lastFactAt;
		if (overrideWins) return { stage: c.manualStage, overridden: true };
	}
	if (c.hasTransaction) return { stage: 'active', overridden: false };
	if (c.lastOutcome === 'not_interested') return { stage: 'lost', overridden: false };
	if (c.lastOutcome === 'proposal_requested') return { stage: 'negotiating', overridden: false };
	if (c.hasSamples) return { stage: 'sample_delivered', overridden: false };
	if (c.hasInteraction) return { stage: 'contacted', overridden: false };
	return { stage: 'new', overridden: false };
};

// Ordem de exibição do funil (mais quente primeiro) e labels pt-BR.
export const STAGE_ORDER: ContactStage[] = [
	'negotiating',
	'sample_delivered',
	'active',
	'contacted',
	'new',
	'lost',
];

export const STAGE_LABELS: Record<ContactStage, string> = {
	new: 'Novo',
	contacted: 'Contatado',
	sample_delivered: 'Amostra entregue',
	negotiating: 'Negociando',
	active: 'Ativo',
	lost: 'Perdido',
};
