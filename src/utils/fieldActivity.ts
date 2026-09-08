import type { Interaction, InteractionKind } from '../types';
import { inWindow, type ReportWindow } from './reportWindow';

export type FieldActivity = {
	total: number;
	byChannel: Record<InteractionKind, number>;
};

const emptyChannels = (): Record<InteractionKind, number> => ({
	visit: 0, call: 0, whatsapp: 0, email: 0,
});

export const summarizeActivity = (
	interactions: Interaction[],
	w: ReportWindow,
): FieldActivity => {
	const byChannel = emptyChannels();
	let total = 0;
	for (const i of interactions) {
		if (!inWindow(i.occurredAt, w)) continue;
		// Canal desconhecido (schema mudou sem o app saber) não vira balde novo
		// nem quebra a soma: fica fora da quebra, mas conta no total.
		if (i.kind in byChannel) byChannel[i.kind] += 1;
		total += 1;
	}
	return { total, byChannel };
};
