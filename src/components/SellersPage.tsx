import { useMemo, useState } from 'react';
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	Legend,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts';
import type { TooltipContentProps } from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import type { Seller } from '../types';
import { buildMultiSellerPerformance } from '../utils/helpers';
import { Card, Metric, Section } from './ui/Primitives';

const SellersPage = ({
	vendedores,
	primaryColor,
	secondaryColor,
}: {
	vendedores: Seller[];
	primaryColor: string;
	secondaryColor: string;
}) => {
	const formatCurrency = (value: number) =>
		`R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

	const sellersSortedByRevenue = useMemo(
		() => [...vendedores].sort((a, b) => (b.bruto || 0) - (a.bruto || 0)),
		[vendedores],
	);
	const sellersForDisplay = useMemo(
		() => (sellersSortedByRevenue.length > 15 ? sellersSortedByRevenue.slice(0, 15) : sellersSortedByRevenue),
		[sellersSortedByRevenue],
	);
	const isSellerListCapped = sellersSortedByRevenue.length > 15;

	const [sellersExpanded, setSellersExpanded] = useState(false);
	const SELLERS_INITIAL = 5;

	const sellerPerformanceSeries = buildMultiSellerPerformance(sellersForDisplay);
	const sellerPerformance = sellerPerformanceSeries.length ? sellerPerformanceSeries : [];

	const sellerBarData = useMemo(
		() =>
			sellersForDisplay.map((v) => ({
				vendedor: v.nome,
				bruto: v.bruto,
				liquido: v.liquido,
			})),
		[sellersForDisplay],
	);

	const renderSellerTooltip = ({ active, payload, label }: TooltipContentProps<ValueType, NameType>) => {
		if (!active || !payload?.length) return null;
		const bruto = Number(payload.find((p) => p.dataKey === 'bruto')?.value ?? 0) || 0;
		const liquido = Number(payload.find((p) => p.dataKey === 'liquido')?.value ?? 0) || 0;
		const total = bruto + liquido;

			return (
				<div className="rounded-xl border border-border/40 bg-card px-4 py-3 text-xs shadow-[var(--shadow-card)]">
					<p className="mb-2 text-sm font-semibold text-foreground">{label}</p>
					<div className="space-y-1">
						<div className="flex items-center justify-between gap-6">
							<span className="text-muted-foreground">Valor bruto</span>
							<span className="font-semibold text-foreground">{formatCurrency(bruto)}</span>
						</div>
						<div className="flex items-center justify-between gap-6">
							<span className="text-muted-foreground">Valor líquido</span>
							<span className="font-semibold text-foreground">{formatCurrency(liquido)}</span>
						</div>
						<div className="mt-2 flex items-center justify-between gap-6 border-t border-border/30 pt-2">
							<span className="text-muted-foreground">Total</span>
							<span className="font-semibold text-foreground">{formatCurrency(total)}</span>
						</div>
					</div>
				</div>
			);
	};

	return (
		<>
			<Section className="mt-8 grid items-stretch gap-8 md:grid-cols-2 xl:grid-cols-4">
				<Card>
					<Metric value={vendedores.length.toString()} label="Vendedores ativos" />
				</Card>
				<Card>
					<Metric
						value={
							vendedores.length
								? `R$ ${vendedores.reduce((sum, v) => sum + (v.bruto || 0), 0).toLocaleString('pt-BR')}`
								: '—'
						}
						label="Faturamento combinado"
					/>
				</Card>
				<Card>
					<Metric value={sellersSortedByRevenue[0]?.nome ?? '—'} label="Maior faturamento" />
				</Card>
				<Card>
					<Metric value="—" label="Abaixo da meta" />
				</Card>
			</Section>

			<div className="hidden md:block">
				<Section className="grid gap-10 2xl:grid-cols-2">
					<Card>
						<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
							Performance por período
						</p>
					<div className="mt-4 h-64 w-full rounded-xl p-4 outline-none [&_.recharts-wrapper]:outline-none">
						<ResponsiveContainer width="100%" height="100%">
							<AreaChart data={sellerPerformance}>
									<defs>
										{sellersForDisplay.map((v) => (
											<linearGradient key={v.id} id={`color${v.id}`} x1="0" y1="0" x2="0" y2="1">
												<stop offset="5%" stopColor={primaryColor} stopOpacity={0.3} />
												<stop offset="95%" stopColor={primaryColor} stopOpacity={0} />
											</linearGradient>
										))}
									</defs>
									<CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
									<XAxis
										dataKey="month"
										axisLine={false}
										tickLine={false}
										tick={{ fill: primaryColor, fontSize: 10 }}
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
											borderRadius: '8px',
											border: '1px solid hsl(var(--border))',
											boxShadow: 'var(--shadow-card)',
										}}
										itemStyle={{ fontSize: '12px', fontWeight: 600 }}
										labelStyle={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', marginBottom: '8px' }}
									/>
									{sellersForDisplay.map((v) => (
										<Area
											key={v.id}
											type="monotone"
											dataKey={v.nome}
											name={v.nome}
											stroke={primaryColor}
											strokeWidth={2}
											fillOpacity={1}
											fill={`url(#color${v.id})`}
											dot={{
												r: 4,
												fill: primaryColor,
												strokeWidth: 2,
												stroke: 'hsl(var(--card))',
											}}
											activeDot={{ r: 6, strokeWidth: 0 }}
										/>
									))}
							</AreaChart>
						</ResponsiveContainer>
					</div>
				</Card>
					<Card>
						<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
							Faturamento por vendedor
						</p>
					<div className="mt-4 h-64 w-full rounded-xl p-4 outline-none [&_.recharts-wrapper]:outline-none">
						<ResponsiveContainer width="100%" height="100%">
									<BarChart
										data={sellerBarData}
										layout="vertical"
										margin={{ top: 8, right: 24, bottom: 8, left: 0 }}>
									<CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
									<XAxis
										type="number"
										axisLine={false}
										tickLine={false}
										tick={{ fill: primaryColor, fontSize: 10 }}
										tickFormatter={(value) => (value >= 1000 ? `${(value / 1000).toFixed(0)}K` : value)}
									/>
									<YAxis
										type="category"
										dataKey="vendedor"
										axisLine={false}
										tickLine={false}
										tick={{ fill: 'hsl(var(--foreground))', fontSize: 11 }}
										width={80}
									/>
								<Tooltip content={renderSellerTooltip} />
								<Legend wrapperStyle={{ fontSize: '12px', paddingTop: '6px' }} />
									<Bar
										dataKey="bruto"
										name="Valor bruto"
										stackId="total"
										barSize={14}
										radius={[0, 0, 0, 0]}
										fill={primaryColor}
									/>
									<Bar
										dataKey="liquido"
										name="Valor líquido"
										stackId="total"
										barSize={14}
										radius={[0, 0, 0, 0]}
										fill={secondaryColor}
									/>
							</BarChart>
						</ResponsiveContainer>
					</div>
				</Card>
			</Section>
			</div>

						<Section>
							<Card interactive={false} className="border border-border/30 bg-muted">
								{isSellerListCapped && (
									<p className="px-4 pt-4 text-xs text-muted-foreground">
										Exibindo Top 15 de {sellersSortedByRevenue.length} vendedores por faturamento.
									</p>
								)}
								{/* Mobile: stacked cards */}
								<div className="grid grid-cols-1 gap-3 p-3 md:hidden">
									{sellersForDisplay.length === 0 && (
										<p className="py-6 text-center text-sm text-muted-foreground">Nenhum vendedor encontrado.</p>
									)}
									{(sellersExpanded ? sellersForDisplay : sellersForDisplay.slice(0, SELLERS_INITIAL)).map((v) => {
										const topBruto = sellersForDisplay[0]?.bruto || 1;
										const barWidth = Math.round((v.bruto / topBruto) * 100);
										return (
										<div key={v.id} className="rounded-2xl border border-border/40 bg-card p-4">
											<p className="mb-1 text-base font-semibold text-foreground">{v.nome}</p>
											{/* Relative revenue bar — width proportional to top seller */}
											<div className="my-3 h-1 overflow-hidden rounded-full bg-muted">
												<div
													className="h-full rounded-full"
													style={{ width: `${barWidth}%`, backgroundColor: primaryColor }}
												/>
											</div>
											<dl className="divide-y divide-border/20 text-sm">
												<div className="flex items-center justify-between py-2">
													<dt className="text-muted-foreground">Valor bruto</dt>
													<dd className="tabular-nums font-medium text-foreground">R$ {v.bruto.toLocaleString('pt-BR')}</dd>
												</div>
												<div className="flex items-center justify-between py-2">
													<dt className="text-muted-foreground">Valor líquido</dt>
													<dd className="tabular-nums font-medium text-foreground">R$ {v.liquido.toLocaleString('pt-BR')}</dd>
												</div>
												<div className="flex items-center justify-between py-2">
													<dt className="text-muted-foreground">Itens</dt>
													<dd className="tabular-nums font-medium text-foreground">{v.itens}</dd>
												</div>
											</dl>
										</div>
										);
									})}
									{sellersForDisplay.length > SELLERS_INITIAL && (
										<button
											type="button"
											onClick={() => setSellersExpanded((v) => !v)}
											className="mt-1 w-full rounded-2xl border border-border/30 py-3 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground">
											{sellersExpanded
												? 'Ver menos'
												: `Ver mais ${sellersForDisplay.length - SELLERS_INITIAL} vendedores`}
										</button>
									)}
								</div>
								{/* Desktop: table */}
								<div className="hidden overflow-auto md:block">
									<table className="min-w-full divide-y divide-black/5 text-sm">
										<thead className="bg-muted text-left text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
											<tr>
												<th className="px-4 py-3">Vendedor(a)</th>
												<th className="px-4 py-3">Itens</th>
												<th className="px-4 py-3">Valor bruto</th>
												<th className="px-4 py-3">Valor líquido</th>
												<th className="px-4 py-3">Nº Boletos</th>
											</tr>
										</thead>
										<tbody className="divide-y divide-border/30 bg-card">
											{sellersForDisplay.map((v) => (
												<tr key={v.id} className="hover:bg-muted/60">
													<td className="px-4 py-3 font-semibold text-foreground">{v.nome}</td>
													<td className="px-4 py-3 text-foreground">{v.itens}</td>
													<td className="px-4 py-3 text-foreground">R$ {v.bruto.toLocaleString('pt-BR')}</td>
													<td className="px-4 py-3 text-foreground">R$ {v.liquido.toLocaleString('pt-BR')}</td>
													<td className="px-4 py-3 text-foreground">{v.boletos}</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</Card>
						</Section>
		</>
	);
};

export default SellersPage;
