import { useMemo } from 'react';
import {
	Area,
	AreaChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts';
import type { CategorySale, HistoryItem, Product } from '../types';
import { Card, ListItem, Metric, Section } from './ui/Primitives';


const OverviewPage = ({
	products,
	categorySales,
	history,
	salesTrend,
	primaryColor,
	secondaryColor,
	onViewAllProducts,
}: {
	products: Product[];
	categorySales: CategorySale[];
	history: HistoryItem[];
	salesTrend: HistoryItem[];
	primaryColor: string;
	secondaryColor: string;
	onViewAllProducts: () => void;
}) => {
	const estoqueBaixo = products.filter((p) => p.min !== undefined && p.qty < (p.min ?? 0)).length;
	const semFoto = products.filter((p) => !p.image).length;

	const isCriticalProduct = (p: Product) => {
		const zeroStock = (p.qty || 0) <= 0;
		const noPhoto = !p.image;
		const status = (p.status || '').toLowerCase();
		const criticalStatus =
			status.includes('sem giro') || status.includes('stockout') || status.includes('comprar') || status.includes('em risco');
		return zeroStock || noPhoto || criticalStatus;
	};

	const criticalItems = products.filter(isCriticalProduct).length;
	const estoqueZerado = products.filter((p) => (p.qty || 0) === 0).length;

	const latestMonth = history[history.length - 1];
	const previousMonth = history[history.length - 2];
	const monthlyRevenue = latestMonth?.value ?? 574661;
	const dailyRevenue = monthlyRevenue / 30;
	const monthlyChange =
		latestMonth && previousMonth && previousMonth.value
			? (latestMonth.value - previousMonth.value) / previousMonth.value
			: 0;

	const operationStatusLabel =
		monthlyChange > 0.08 ? 'Acelerando' : monthlyChange < -0.05 ? 'Em atenção' : 'Em linha';
	const operationStatusDetail =
		monthlyChange === 0
			? 'Tendência estável no mês.'
			: monthlyChange > 0
				? `Crescimento de ${(monthlyChange * 100).toFixed(1)}% vs mês anterior.`
				: `Queda de ${Math.abs(monthlyChange * 100).toFixed(1)}% vs mês anterior.`;
	const operationStatusClass = useMemo(() => {
		const length = operationStatusLabel.trim().length;
		if (length <= 7) return 'text-2xl sm:text-3xl';
		if (length <= 10) return 'text-lg sm:text-xl';
		return 'text-base sm:text-lg';
	}, [operationStatusLabel]);

	const topProducts = useMemo(() => {
		const withSales = [...products]
			.filter((p) => p.totalSold)
			.sort((a, b) => (b.totalSold || 0) - (a.totalSold || 0));

		return withSales.slice(0, 5);
	}, [products]);

	return (
		<>
			{/* Nível 1 — Overview absoluto */}
			<Section className="mt-8 grid items-stretch gap-8 md:grid-cols-2 xl:grid-cols-4">
				<Card className="text-white shadow-lg" style={{ background: `linear-gradient(to bottom right, ${primaryColor}, ${secondaryColor})` }}>
					<Metric
						value={Math.max(0, dailyRevenue || 0).toLocaleString('pt-BR', {
							maximumFractionDigits: 0,
						})}
						label="Faturamento do dia"
						prefix="R$ "
						detail={monthlyChange >= 0 ? '⬆︎ Tendência positiva' : '⬇︎ Tendência em atenção'}
					/>
				</Card>
				<Card>
					<Metric
						value={Math.max(0, monthlyRevenue || 0).toLocaleString('pt-BR')}
						label="Faturamento Total"
						prefix="R$ "
						detail="Visão consolidada do mês atual"
					/>
				</Card>
				<Card>
					<Metric
						value={String(criticalItems)}
						label="Itens críticos"
						detail={`${estoqueZerado} sem estoque • ${semFoto} sem foto • ${estoqueBaixo} abaixo do mínimo`}
					/>
				</Card>
				<Card>
					<Metric
						value={operationStatusLabel}
						label="Status da operação"
						detail={operationStatusDetail}
						valueClassName={`${operationStatusClass} leading-tight tracking-tight`}
					/>
				</Card>
			</Section>

			{/* Nível 2 — Seções com propósito */}
			<Section className="grid items-stretch gap-10 xl:grid-cols-2">
					<Card>
						<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
							Alertas importantes
						</p>
						<div className="mt-5 space-y-3 text-sm">
							<ListItem>
								<div className="flex flex-col">
									<span className="text-foreground">Itens com estoque baixo</span>
								</div>
								<span className="text-base font-semibold text-foreground">{estoqueBaixo}</span>
							</ListItem>
							<ListItem>
								<div className="flex flex-col">
									<span className="text-foreground">Itens sem foto</span>
								</div>
								<span className="text-base font-semibold text-foreground">{semFoto}</span>
							</ListItem>
							<ListItem>
								<div className="flex flex-col">
									<span className="text-foreground">Itens sem estoque</span>
								</div>
								<span className="text-base font-semibold text-foreground">{estoqueZerado}</span>
							</ListItem>
						</div>
					</Card>

					<Card>
						<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
							Categorias — vendas e custos
						</p>
					<div className="mt-5 space-y-4">
						{categorySales.slice(0, 5).map((cat) => {
							const share = Math.min(100, cat.share || 0);
							return (
								<div key={cat.name} className="space-y-1.5">
										<div className="flex items-center justify-between text-sm" style={{ color: primaryColor }}>
											<span>{cat.name}</span>
											<span className="text-xs text-muted-foreground/80">R$ {cat.venda.toLocaleString('pt-BR')}</span>
										</div>
										<div className="flex h-2 overflow-hidden rounded-full bg-card">
											<div style={{ width: `${share}%`, backgroundColor: primaryColor }} />
										</div>
										<div className="flex justify-between text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80">
											<span>Custo: R$ {cat.custo.toLocaleString('pt-BR')}</span>
											<span>Share: {share.toFixed(1)}%</span>
										</div>
								</div>
							);
						})}
					</div>
				</Card>
			</Section>

				<Section className="grid gap-10 xl:grid-cols-2">
					<Card>
						<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
							Tendência (últimos 20 dias)
						</p>
						<div className="mt-4 h-56 w-full rounded-xl bg-muted/60 p-4">
						<ResponsiveContainer width="100%" height="100%">
							<AreaChart data={salesTrend}>
								<defs>
									<linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
										<stop offset="5%" stopColor={primaryColor} stopOpacity={0.3} />
										<stop offset="95%" stopColor={primaryColor} stopOpacity={0} />
									</linearGradient>
								</defs>
								<XAxis
									dataKey="month"
									axisLine={false}
									tickLine={false}
									tick={{ fill: primaryColor, fontSize: 10 }}
									interval={3}
									minTickGap={24}
									dy={10}
								/>
								<YAxis
									axisLine={false}
									tickLine={false}
									tick={{ fill: primaryColor, fontSize: 10 }}
									tickFormatter={(value) => (value >= 1000 ? `${(value / 1000).toFixed(0)}K` : value)}
								/>
									<Tooltip
										contentStyle={{
											backgroundColor: 'hsl(var(--card))',
											borderRadius: '10px',
											border: '1px solid hsl(var(--border))',
											boxShadow: 'var(--shadow-card)',
										}}
										itemStyle={{ fontSize: '12px', fontWeight: 600 }}
										labelStyle={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', marginBottom: '8px' }}
										formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR')}`, 'Faturamento']}
									/>
								<Area
									type="monotone"
									dataKey="value"
									stroke={primaryColor}
									strokeWidth={2.5}
									fill="url(#colorRevenue)"
									dot={{ r: 3, fill: primaryColor }}
									activeDot={{ r: 5, strokeWidth: 0 }}
								/>
							</AreaChart>
						</ResponsiveContainer>
					</div>
				</Card>

					<Card>
						<div className="flex items-center justify-between gap-4">
							<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
								Top 5 produtos
							</p>
							<button
								type="button"
								onClick={onViewAllProducts}
								className="rounded-full border border-border/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground transition hover:bg-primary hover:text-primary-foreground">
								Ver todos os produtos
							</button>
						</div>
						<div className="mt-5 space-y-3">
							{topProducts.map((product, index) => (
								<ListItem key={product.id} className="items-start">
									<div className="flex min-w-0 flex-1 items-start gap-3">
										<span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">
											{index + 1}
										</span>
										<div className="min-w-0 flex-col">
											<span className="line-clamp-2 font-semibold text-foreground">{product.name}</span>
											<span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/80">
												SKU {product.sku}
											</span>
										</div>
									</div>
									<div className="ml-4 shrink-0 text-right">
										<p className="text-xs uppercase tracking-[0.18em] text-muted-foreground/80">Vendidos</p>
										<p className="text-sm font-semibold text-foreground">
											{product.totalSold?.toLocaleString('pt-BR') ?? '—'}
										</p>
									</div>
								</ListItem>
							))}
							{!topProducts.length && (
								<p className="text-xs text-muted-foreground/80">Sem dados suficientes para calcular o ranking.</p>
							)}
						</div>
					</Card>
			</Section>
		</>
	);
};

export default OverviewPage;
