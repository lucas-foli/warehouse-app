// Agrupa follow-ups por DIA LOCAL do navegador (spec: "timezone do navegador").
// Atrasados / Hoje / Esta semana (próximos 7 dias) / Mais tarde.

export type AgendaGroups<T> = {
	overdue: T[];
	today: T[];
	week: T[];
	later: T[];
};

const startOfDay = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const DAY_MS = 24 * 60 * 60 * 1000;

export const groupAgenda = <T extends { nextStepDueAt: string | null }>(
	items: T[],
	now: Date,
): AgendaGroups<T> => {
	const todayStart = startOfDay(now);
	const tomorrowStart = todayStart + DAY_MS;
	const weekEnd = todayStart + 8 * DAY_MS; // amanhã + 7 dias corridos (exclusivo)

	const groups: AgendaGroups<T> = { overdue: [], today: [], week: [], later: [] };
	for (const item of items) {
		if (!item.nextStepDueAt) continue;
		const due = startOfDay(new Date(item.nextStepDueAt));
		if (due < todayStart) groups.overdue.push(item);
		else if (due < tomorrowStart) groups.today.push(item);
		else if (due < weekEnd) groups.week.push(item);
		else groups.later.push(item);
	}
	const byDue = (a: T, b: T) => (a.nextStepDueAt ?? '').localeCompare(b.nextStepDueAt ?? '');
	groups.overdue.sort(byDue);
	groups.today.sort(byDue);
	groups.week.sort(byDue);
	groups.later.sort(byDue);
	return groups;
};
