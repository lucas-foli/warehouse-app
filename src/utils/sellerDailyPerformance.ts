import type { SalesOrder } from '../services/dashboardService';
import type { Seller } from '../types';

const dayKeyOf = (d: Date) =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Série diária real de faturamento por vendedor, para o gráfico "Performance por
 * período". Agrega `total_amount` por vendedor por dia numa janela dos últimos
 * `days` dias terminando em `referenceDate ?? hoje`.
 *
 * Casamento dual-key (seller_id OU seller_external_id) idêntico a aggregateSellers:
 * vendas manuais (só seller_id) e importadas (só seller_external_id) caem no mesmo
 * vendedor. Orders sem vendedor resolvível são ignorados (sem coluna "desconhecido").
 *
 * Passe orders já filtrados por voided e por loja (o chamador usa visibleActiveOrders).
 * Sem nenhuma venda na janela → [] (empty state). Com ao menos uma venda → janela
 * completa de `days` pontos (dias sem venda = 0), para o eixo não ter buracos.
 */
export function buildSellerDailyPerformance(
	sellers: Seller[],
	orders: SalesOrder[],
	days = 30,
	referenceDate?: Date,
): Array<Record<string, string | number>> {
	if (!sellers.length) return [];

	const byKey = new Map<string, Seller>();
	for (const s of sellers) {
		if (s.externalId) byKey.set(s.externalId, s);
		if (s.id) byKey.set(s.id, s);
	}
	const resolve = (o: SalesOrder): Seller | undefined =>
		(o.seller_id ? byKey.get(o.seller_id) : undefined) ??
		(o.seller_external_id ? byKey.get(o.seller_external_id) : undefined);

	const today = referenceDate ? new Date(referenceDate) : new Date();
	today.setHours(0, 0, 0, 0);
	const start = new Date(today);
	start.setDate(start.getDate() - (days - 1));

	// byDay[dayKey][seller.nome] = faturamento do dia
	const byDay = new Map<string, Map<string, number>>();
	let anySale = false;

	for (const o of orders) {
		if (!Number.isFinite(o.total_amount)) continue;
		const s = resolve(o);
		if (!s) continue; // vendedor não resolvível — ignora
		const parsed = o.sold_at ? new Date(o.sold_at) : null;
		if (!parsed || Number.isNaN(parsed.getTime())) continue;
		parsed.setHours(0, 0, 0, 0);
		if (parsed < start || parsed > today) continue;

		const key = dayKeyOf(parsed);
		const row = byDay.get(key) ?? new Map<string, number>();
		row.set(s.nome, (row.get(s.nome) ?? 0) + Number(o.total_amount));
		byDay.set(key, row);
		anySale = true;
	}

	if (!anySale) return [];

	const series: Array<Record<string, string | number>> = [];
	for (let offset = days - 1; offset >= 0; offset--) {
		const date = new Date(today);
		date.setDate(today.getDate() - offset);
		const row = byDay.get(dayKeyOf(date));
		const point: Record<string, string | number> = {
			month: date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
		};
		for (const s of sellers) {
			point[s.nome] = row?.get(s.nome) ?? 0;
		}
		series.push(point);
	}

	return series;
}
