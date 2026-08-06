import type { HistoryItem } from '../types';

/**
 * Faturamento do dia = valor do último ponto da série diária (hoje).
 * Série vazia → 0 (empty state honesto). Substitui o antigo mês÷30.
 */
export const latestDailyRevenue = (salesTrend: HistoryItem[]): number =>
	salesTrend[salesTrend.length - 1]?.value ?? 0;
