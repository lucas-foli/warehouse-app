import {
	Area,
	AreaChart,
	CartesianGrid,
	Legend,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts';
import type { Client, HistoryItem } from '../types';
import {
	buildClientEvolutionFromClients,
	buildClientPurchasesTimelineFromClients,
} from '../utils/helpers';
import { Card, Metric, Section } from './ui/Primitives';

const ClientsPage = ({
	clientes,
	clientEvolution: clientEvolutionProp,
	primaryColor,
	secondaryColor,
}: {
	clientes: Client[];
	clientEvolution?: HistoryItem[];
	primaryColor: string;
	secondaryColor: string;
}) => {
	const formatMonthYear = (value?: string) => {
		if (!value) return '—';
		const parsed = new Date(value);
		if (!Number.isNaN(parsed.getTime())) {
			return parsed.toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' });
		}
		const direct = value.match(/^(\d{4})-(\d{2})/);
		if (direct) return `${direct[2]}/${direct[1]}`;
		return value;
	};

	const clientEvolution = clientEvolutionProp?.length
		? clientEvolutionProp
		: buildClientEvolutionFromClients(clientes);

	const lastPurchaseDate = clientes
		.map((c) => c.ultimaCompra)
		.filter(Boolean)
		.map((value) => new Date(value))
		.filter((date) => !Number.isNaN(date.getTime()))
		.sort((a, b) => b.getTime() - a.getTime())[0];
	const lastPurchaseLabel = lastPurchaseDate
		? lastPurchaseDate.toLocaleDateString('pt-BR', { dateStyle: 'short' })
		: '—';

	const clientPurchasesSeries = buildClientPurchasesTimelineFromClients(clientes);
	const clientPurchases = clientPurchasesSeries;
	const maxClientPurchasesValue = clientPurchases.reduce((max, h) => (h.value > max ? h.value : max), 0);

	return (
		<>
			<Section className="mt-8 grid items-stretch gap-8 md:grid-cols-2 xl:grid-cols-4">
				<Card>
					<Metric
						value={clientes.length ? clientes.length.toLocaleString('pt-BR') : 0}
						label="Clientes ativos"
					/>
				</Card>
				<Card>
					<Metric
						value={Array.from(new Set(clientes.map((c) => c.cidade))).length.toString()}
						label="Cidades atendidas"
					/>
				</Card>
				<Card>
					<Metric value={lastPurchaseLabel} label="Última compra registrada" />
				</Card>
				<Card>
					<Metric value={0} label="Novos no mês" />
				</Card>
			</Section>

			<Section className="grid gap-10 lg:grid-cols-2">
					<Card>
						<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
							Evolução de clientes
						</p>
					<div className="mt-4 h-64 w-full rounded-xl p-4 outline-none [&_.recharts-wrapper]:outline-none">
						<ResponsiveContainer width="100%" height="100%">
							<AreaChart data={clientEvolution}>
								<defs>
									<linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
										<stop offset="5%" stopColor={primaryColor} stopOpacity={0.3} />
										<stop offset="95%" stopColor={primaryColor} stopOpacity={0} />
									</linearGradient>
								</defs>
									<CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
								<XAxis
									dataKey="month"
									axisLine={false}
									tickLine={false}
									tick={{ fill: primaryColor, fontSize: 10 }}
									dy={10}
								/>
								<YAxis axisLine={false} tickLine={false} tick={{ fill: primaryColor, fontSize: 10 }} />
									<Tooltip
										contentStyle={{
											backgroundColor: 'hsl(var(--card))',
											borderRadius: '8px',
											border: '1px solid hsl(var(--border))',
											boxShadow: 'var(--shadow-card)',
										}}
										itemStyle={{ fontSize: '12px', fontWeight: 600, color: 'hsl(var(--foreground))' }}
										labelStyle={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', marginBottom: '8px' }}
										formatter={(value: number) => [value, 'Cliente']}
									/>
								<Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
								<Area
									type="monotone"
									dataKey="value"
									name="Cliente"
									stroke={primaryColor}
										strokeWidth={2}
										fillOpacity={1}
										fill="url(#colorValue)"
										dot={{ r: 4, fill: primaryColor, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
										activeDot={{ r: 6, strokeWidth: 0 }}
									/>
							</AreaChart>
						</ResponsiveContainer>
					</div>
				</Card>
					<Card>
						<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
							Últimas compras por data
						</p>
						<div className="mt-4 space-y-3">
							{clientPurchases.map((point) => {
							const width = maxClientPurchasesValue
								? Math.round((point.value / maxClientPurchasesValue) * 100)
								: 0;
								return (
									<div key={point.month} className="space-y-1">
										<div className="flex items-center justify-between text-sm text-foreground">
											<span>{point.month}</span>
											<span className="text-xs text-muted-foreground">
												{point.value.toLocaleString('pt-BR')} clientes
											</span>
										</div>
										<div className="h-2 overflow-hidden rounded-full bg-muted">
											<div
												className="h-full"
												style={{
													width: `${width}%`,
													backgroundImage: `linear-gradient(to right, ${primaryColor}, ${secondaryColor})`,
												}}
											/>
										</div>
									</div>
								);
							})}
						</div>
					</Card>
			</Section>

				<Section>
					<Card interactive={false} className="border border-border/30 bg-muted">
						<div className="overflow-auto">
							<table className="min-w-full divide-y divide-black/5 text-sm">
								<thead className="bg-muted text-left text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
									<tr>
										<th className="px-4 py-3">Nome</th>
										<th className="px-4 py-3">Cidade</th>
										<th className="px-4 py-3">Telefone</th>
										<th className="px-4 py-3">Última compra</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-border/30 bg-card">
									{clientes.map((c) => (
										<tr key={c.id} className="hover:bg-muted/60">
											<td className="px-4 py-3 font-semibold text-foreground">{c.nome}</td>
											<td className="px-4 py-3 text-foreground">{c.cidade}</td>
											<td className="px-4 py-3 text-foreground">{c.telefone ?? '—'}</td>
											<td className="px-4 py-3 text-foreground">{formatMonthYear(c.ultimaCompra)}</td>
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

export default ClientsPage;
