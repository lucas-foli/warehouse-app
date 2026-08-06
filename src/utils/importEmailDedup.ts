// Pula linhas de e-mail duplicado antes do upsert do import (BUG-12).
// Uma linha com e-mail (case-insensitive, não vazio) é pulada quando:
//  - o e-mail já apareceu antes no próprio CSV, OU
//  - o e-mail existe no banco sob um external_id DIFERENTE do da linha.
// Mesmo external_id = atualização legítima do próprio registro (não pula).
// Linhas sem e-mail nunca são puladas por este motivo.
export const dedupeByEmail = <T extends { external_id: string; email?: string }>(
	rows: T[],
	existingByEmail: Map<string, string>,
): { toImport: T[]; skippedEmails: number } => {
	const seen = new Set<string>();
	const toImport: T[] = [];
	let skippedEmails = 0;

	for (const row of rows) {
		const email = (row.email ?? '').trim().toLowerCase();
		if (!email) {
			toImport.push(row);
			continue;
		}
		if (seen.has(email)) {
			skippedEmails += 1;
			continue;
		}
		const existing = existingByEmail.get(email);
		if (existing && existing.toUpperCase() !== row.external_id.toUpperCase()) {
			skippedEmails += 1;
			continue;
		}
		seen.add(email);
		toImport.push(row);
	}

	return { toImport, skippedEmails };
};
