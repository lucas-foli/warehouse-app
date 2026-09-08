import type { ContactStage, FieldContact } from '../types';
import { deriveStage, STAGE_LABELS, STAGE_ORDER } from './stageDerivation';

export type FunnelRow = { stage: ContactStage; label: string; count: number };

// Foto de agora, sem janela: estágio é estado presente e o app não guarda
// histórico de mudança (Emenda 1 da spec). Importa deriveStage em vez de
// reimplementar a regra — a sub-view Funil usa a mesma fonte.
export const summarizeFunnel = (
	contacts: FieldContact[],
): { rows: FunnelRow[]; total: number } => {
	const counts = new Map<ContactStage, number>(STAGE_ORDER.map((s) => [s, 0]));
	for (const c of contacts) {
		const { stage } = deriveStage(c);
		counts.set(stage, (counts.get(stage) ?? 0) + 1);
	}
	return {
		rows: STAGE_ORDER.map((stage) => ({
			stage, label: STAGE_LABELS[stage], count: counts.get(stage) ?? 0,
		})),
		total: contacts.length,
	};
};
