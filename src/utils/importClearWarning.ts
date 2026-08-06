// Aviso mostrado quando "Limpar dados antes de importar" vai desvincular vendas
// (FK on delete set null). Espelha o tom de deleteBlockMessage em clientSellerForms.ts.
export const buildClearWarning = (kind: 'clients' | 'sellers', count: number): string => {
	const alvo = kind === 'clients' ? 'cliente' : 'vendedor';
	const vendas = count === 1 ? '1 venda' : `${count} vendas`;
	const ficarao = count === 1 ? 'ela ficará' : 'elas ficarão';
	return `Isso vai desvincular ${vendas} — ${ficarao} sem ${alvo}.`;
};
