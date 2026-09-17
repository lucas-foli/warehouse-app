import type { InteractionKind } from '../../types';
import type { ReportPeriod } from '../../utils/reportWindow';
import { REPORT_PERIODS } from '../../utils/reportWindow';
import type { FieldActivity } from '../../utils/fieldActivity';
import type { FunnelRow } from '../../utils/funnelSummary';
import type { SampleSummary } from '../../utils/sampleCost';
import type { ReceivedVsSoldRow, SupplierReceivedRow } from '../../utils/receivedVsSold';
import type { NegativeBalance } from '../../utils/negativeBalances';

type Props = {
	period: ReportPeriod;
	onPeriodChange: (p: ReportPeriod) => void;
	locationLabel: string;
	activity: FieldActivity;
	newContacts: number;
	overdueFollowUps: number;
	funnel: { rows: FunnelRow[]; total: number };
	samples: SampleSummary;
	rows: ReceivedVsSoldRow[];
	bySupplier: SupplierReceivedRow[];
	negatives: NegativeBalance[];
};

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' });

const card = 'rounded-2xl border border-border bg-card p-4';
const pill = (active: boolean) =>
	`min-h-11 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
		active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground'
	}`;

const CHANNEL_LABELS: Record<InteractionKind, string> = {
	visit: 'Visita',
	call: 'Ligação',
	whatsapp: 'WhatsApp',
	email: 'E-mail',
};

const CHANNEL_ORDER: InteractionKind[] = ['visit', 'call', 'whatsapp', 'email'];

const PanelView = ({
	period,
	onPeriodChange,
	locationLabel,
	activity,
	newContacts,
	overdueFollowUps,
	funnel,
	samples,
	rows,
	bySupplier,
	negatives,
}: Props) => (
	<div className="space-y-4">
		<div className="flex flex-wrap gap-2">
			{REPORT_PERIODS.map((p) => (
				<button
					key={p.value}
					type="button"
					className={pill(period === p.value)}
					onClick={() => onPeriodChange(p.value)}>
					{p.label}
				</button>
			))}
		</div>

		{/* O filtro de loja não alcança campo nem recebimento: dizer isso é o que
		    impede o sócio de ler um número global como número da loja. */}
		<p className="text-xs text-muted-foreground">
			Loja: {locationLabel} · o filtro de loja afeta apenas as vendas
		</p>

		<div className="grid grid-cols-2 gap-3">
			<div className={card}>
				<b className="block text-2xl">{activity.total}</b>
				<span className="text-xs text-muted-foreground">Interações</span>
			</div>
			<div className={card}>
				<b className="block text-2xl">{newContacts}</b>
				<span className="text-xs text-muted-foreground">Contatos novos</span>
			</div>
			<div className={card}>
				<b className="block text-2xl">{samples.totalQty} un</b>
				<span className="text-xs text-muted-foreground">Amostras entregues</span>
				{/* Vazio não é zero: sem nenhuma amostra no período, não há valor a
				    estimar. Com amostra e cobertura parcial, o valor precisa dizer
				    que é parcial — nunca aparecer com cara de fato fechado. */}
				{samples.totalQty > 0 && (
					<p className="mt-1 text-xs text-muted-foreground">
						~{money.format(samples.cost)} (est.{samples.skusWithoutCost > 0 ? ', parcial' : ''})
					</p>
				)}
			</div>
			<div className={card}>
				<b className="block text-2xl text-red-600">{overdueFollowUps}</b>
				<span className="text-xs text-muted-foreground">Follow-ups vencidos · hoje</span>
			</div>
		</div>

		<section className={card}>
			<p className="mb-3 text-sm font-semibold">Por canal</p>
			{activity.total === 0 ? (
				<p className="text-sm text-muted-foreground">Nenhuma interação no período.</p>
			) : (
				CHANNEL_ORDER.map((kind) => (
					<div key={kind} className="mb-2.5 flex items-center justify-between last:mb-0">
						<span className="text-sm">{CHANNEL_LABELS[kind]}</span>
						<span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-bold">
							{activity.byChannel[kind]}
						</span>
					</div>
				))
			)}
		</section>

		<section className={card}>
			<p className="mb-3 text-sm font-semibold">Funil por estágio · hoje</p>
			{funnel.total === 0 ? (
				<p className="text-sm text-muted-foreground">Nenhum contato cadastrado.</p>
			) : (
				funnel.rows.map((row) => (
					<div key={row.stage} className="mb-2.5 last:mb-0">
						<div className="flex items-center justify-between">
							<span className="text-sm">{row.label}</span>
							<span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-bold">{row.count}</span>
						</div>
						<div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
							<div
								className="h-full rounded-full bg-primary"
								style={{ width: `${funnel.total ? (row.count / funnel.total) * 100 : 0}%` }}
							/>
						</div>
					</div>
				))
			)}
		</section>

		<section className={card}>
			<p className="mb-3 text-sm font-semibold">Amostras entregues</p>
			{samples.byContact.length === 0 ? (
				<p className="text-sm text-muted-foreground">Nenhuma amostra entregue no período.</p>
			) : (
				samples.byContact.map((row) => (
					<div key={row.key} className="mb-1.5 flex items-center justify-between last:mb-0">
						<span className="text-sm">{row.name}</span>
						<span className="text-sm text-muted-foreground">
							{row.qty} un · {money.format(row.cost)}
							{row.partial ? ' (parcial)' : ''}
						</span>
					</div>
				))
			)}
			{samples.skusWithoutCost > 0 && (
				<p className="mt-3 text-xs text-muted-foreground">
					Custo estimado pelo último recebimento — {samples.skusWithoutCost} de {samples.skusTotal} SKUs
					sem custo conhecido.
				</p>
			)}
		</section>

		<section className={card}>
			<p className="mb-3 text-sm font-semibold">Recebido x vendido por produto</p>
			{/* buildReceivedVsSold cria uma linha por produto do catálogo, então
			    `rows.length === 0` só é verdade sem catálogo — um tenant com
			    produtos e zero movimento no período veria a tabela inteira
			    zerada em vez desta frase. O vazio de verdade é nenhuma linha com
			    recebido ou vendido no período (o que também cobre catálogo vazio,
			    já que `.some` em array vazio é `false`). */}
			{!rows.some((row) => row.received > 0 || row.sold > 0) ? (
				<p className="text-sm text-muted-foreground">Nenhum recebimento nem venda no período.</p>
			) : (
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead>
							<tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
								<th className="pb-2 pr-3 font-medium">Produto</th>
								<th className="pb-2 pr-3 font-medium">Procedência</th>
								<th className="pb-2 pr-3 font-medium">Receb.</th>
								<th className="pb-2 pr-3 font-medium">Vend.</th>
								<th className="pb-2 font-medium">Saldo hoje</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((row) => (
								<tr key={row.sku} className="border-t border-border">
									<td className="py-2 pr-3">
										{row.name}
										<span className="block text-xs text-muted-foreground">{row.sku}</span>
									</td>
									<td className="py-2 pr-3">
										{row.supplierName ?? '—'}
										{row.multipleSuppliers && (
											<span className="ml-1 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
												+1
											</span>
										)}
									</td>
									<td className="py-2 pr-3">{row.received}</td>
									<td className="py-2 pr-3">{row.sold}</td>
									<td className={`py-2 font-semibold ${row.balance < 0 ? 'text-red-600' : ''}`}>{row.balance}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</section>

		<section className={card}>
			<p className="mb-3 text-sm font-semibold">Recebido por fornecedor</p>
			{bySupplier.length === 0 ? (
				<p className="text-sm text-muted-foreground">Nenhum recebimento no período.</p>
			) : (
				bySupplier.map((row) => (
					<div key={row.supplierId} className="mb-1.5 flex items-center justify-between last:mb-0">
						<span className="text-sm">{row.name}</span>
						<span className="text-sm text-muted-foreground">
							{row.qty} un
							{row.cost !== 0 ? ` · ${money.format(row.cost)}${row.partial ? ' (parcial)' : ''}` : ''}
						</span>
					</div>
				))
			)}
		</section>

		{negatives.length > 0 && (
			<section className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
				<p className="text-sm font-bold text-red-700">Saldo negativo · hoje</p>
				<p className="mt-1 text-xs text-red-700">
					Amostra registrada sem estoque deixa o saldo abaixo de zero. Confira a contagem física.
				</p>
				{negatives.map((n) => (
					<p key={n.sku} className="mt-2 text-sm font-semibold text-red-700">
						{n.name} · {n.qty}
					</p>
				))}
			</section>
		)}
	</div>
);

export default PanelView;
