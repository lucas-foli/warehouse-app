export type ReportPeriod = '7d' | '30d' | '90d' | 'all';

export type ReportWindow = {
	/** ISO inclusivo; null = sem limite inferior ("tudo"). */
	from: string | null;
	/** ISO inclusivo; o instante em que a tela foi montada. */
	to: string;
};

export const REPORT_PERIODS: { value: ReportPeriod; label: string }[] = [
	{ value: '7d', label: '7 dias' },
	{ value: '30d', label: '30 dias' },
	{ value: '90d', label: '90 dias' },
	{ value: 'all', label: 'Tudo' },
];

const DAYS: Record<Exclude<ReportPeriod, 'all'>, number> = { '7d': 7, '30d': 30, '90d': 90 };

// `now` é sempre parâmetro: módulo puro não lê o relógio (a suíte precisa
// fixar o tempo, e a página passa o mesmo instante para todos os blocos).
export const resolveWindow = (period: ReportPeriod, now: Date): ReportWindow => {
	const to = now.toISOString();
	if (period === 'all') return { from: null, to };
	const from = new Date(now.getTime() - DAYS[period] * 24 * 60 * 60 * 1000);
	return { from: from.toISOString(), to };
};

export const inWindow = (at: string | null | undefined, w: ReportWindow): boolean => {
	if (!at) return false;
	const t = new Date(at).getTime();
	if (Number.isNaN(t)) return false;
	// "Tudo" (from null) não tem teto: um input type="date" sem `max` aceita
	// data futura, e products.qty já conta esse fato. Só os períodos com piso
	// (`from` definido) têm teto em `to`.
	if (!w.from) return true;
	if (t > new Date(w.to).getTime()) return false;
	return t >= new Date(w.from).getTime();
};
