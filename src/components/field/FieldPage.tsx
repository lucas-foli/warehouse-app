import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FieldContact, Interaction, Product, Receipt, ReceiptItem } from '../../types';
import { fetchFieldContacts, fetchOpenAgenda, fetchContactCreatedAts, fetchInteractionsInWindow } from '../../services/fieldService';
import { fetchReceipts, fetchReceiptItems } from '../../services/receiptService';
import type { SalesItem, SalesOrder } from '../../services/dashboardService';
import { groupAgenda } from '../../utils/agendaGrouping';
import { inWindow, resolveWindow, type ReportPeriod } from '../../utils/reportWindow';
import { summarizeActivity } from '../../utils/fieldActivity';
import { summarizeFunnel } from '../../utils/funnelSummary';
import { summarizeSamples } from '../../utils/sampleCost';
import { buildReceivedVsSold, buildReceivedBySupplier } from '../../utils/receivedVsSold';
import { findNegativeBalances } from '../../utils/negativeBalances';
import AgendaView from './AgendaView';
import ContactSheet from './ContactSheet';
import FunnelView from './FunnelView';
import PanelView from './PanelView';
import { QuickLogModal } from './QuickLogModal';
import SuppliersView from './SuppliersView';

type FieldView = 'agenda' | 'funnel' | 'suppliers' | 'panel';

type Props = {
	tenantId?: string;
	products: Product[];
	onReload: () => void;
	locationFilter: 'all' | string;
	orders: SalesOrder[];
	salesItems: SalesItem[];
};

type PanelData = {
	interactions: Interaction[];
	receipts: Receipt[];
	receiptItems: ReceiptItem[];
	createdAts: string[];
};

const segClass = (active: boolean) =>
	`flex-1 rounded-xl px-3 py-2 text-center text-sm font-medium transition ${
		active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
	}`;

const FieldPage = ({ tenantId, products, onReload, locationFilter, orders, salesItems }: Props) => {
	const [view, setView] = useState<FieldView>('agenda');
	const [contacts, setContacts] = useState<FieldContact[]>([]);
	const [agenda, setAgenda] = useState<Interaction[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [loadedOnce, setLoadedOnce] = useState(false);
	const [logOpen, setLogOpen] = useState(false);
	const [sheetContact, setSheetContact] = useState<FieldContact | null>(null);
	const loadIdRef = useRef(0);

	const [period, setPeriod] = useState<ReportPeriod>('30d');
	const [panelData, setPanelData] = useState<PanelData | null>(null);
	const [panelLoading, setPanelLoading] = useState(false);
	const windowRef = useMemo(() => resolveWindow(period, new Date()), [period]);

	const reloadField = useCallback(async (opts?: { silent?: boolean }): Promise<boolean> => {
		if (!tenantId) {
			setLoading(false);
			setLoadedOnce(false);
			return false;
		}
		const loadId = ++loadIdRef.current;
		if (!opts?.silent) setLoading(true);
		setError('');
		try {
			const [nextContacts, nextAgenda] = await Promise.all([
				fetchFieldContacts(tenantId),
				fetchOpenAgenda(tenantId),
			]);
			if (loadId !== loadIdRef.current) return false;
			setContacts(nextContacts);
			setAgenda(nextAgenda);
			setLoadedOnce(true);
			// A ficha aberta precisa acompanhar o recarregamento: sem isso ela
			// segue com a foto de quando abriu (timeline sem o override recém
			// marcado, e estágio errado depois de "voltar ao automático").
			setSheetContact((current) =>
				current
					? (nextContacts.find((c) => c.contactType === current.contactType && c.id === current.id) ?? current)
					: current,
			);
			return true;
		} catch (err) {
			if (loadId !== loadIdRef.current) return false;
			console.error('[campo] falha ao carregar', err);
			const raw = err instanceof Error ? err.message : '';
			const code = (err as { code?: string })?.code;
			const message =
				code === 'PGRST205' || raw.includes('schema cache')
					? 'O módulo Campo ainda não está configurado neste workspace. As migrations precisam ser aplicadas.'
					: err instanceof Error
						? err.message
						: 'Não foi possível carregar o Campo.';
			setError(message);
			return false;
		} finally {
			if (loadId === loadIdRef.current) setLoading(false);
		}
	}, [tenantId]);

	useEffect(() => {
		// tenantId novo: a lista do anterior não pode sobreviver a um load que falhe.
		setLoadedOnce(false);
		void reloadField();
	}, [reloadField]);

	// O painel lê quatro fontes a mais; carregar isso na montagem do Campo faria
	// a Agenda (tela de trabalho diária do Elcy) esperar por dado que ela não usa.
	// Por isso só busca quando a sub-view Painel abre.
	useEffect(() => {
		if (view !== 'panel' || !tenantId) return;
		let alive = true;
		setPanelLoading(true);
		Promise.all([
			fetchInteractionsInWindow(tenantId, windowRef),
			fetchReceipts(tenantId),
			fetchReceiptItems(tenantId),
			fetchContactCreatedAts(tenantId),
		])
			.then(([interactions, receipts, receiptItems, createdAts]) => {
				if (!alive) return;
				setPanelData({ interactions, receipts, receiptItems, createdAts });
			})
			.catch((err) => {
				if (!alive) return;
				console.error('[campo] falha ao carregar o painel', err);
				setError('Não foi possível carregar o painel.');
			})
			.finally(() => {
				if (alive) setPanelLoading(false);
			});
		return () => {
			alive = false;
		};
	}, [view, tenantId, windowRef]);

	// Mesma fonte que a sub-view Agenda usa para "Atrasados": duas contagens de
	// atraso divergindo dentro da mesma aba seria defeito, não detalhe.
	const overdueFollowUps = useMemo(() => groupAgenda(agenda, new Date()).overdue.length, [agenda]);

	return (
		<div className="space-y-6">
			<div className="flex rounded-2xl bg-muted p-1">
				<button type="button" className={segClass(view === 'agenda')} onClick={() => setView('agenda')}>
					Agenda
				</button>
				<button type="button" className={segClass(view === 'funnel')} onClick={() => setView('funnel')}>
					Funil
				</button>
				<button type="button" className={segClass(view === 'suppliers')} onClick={() => setView('suppliers')}>
					Fornecedores
				</button>
				<button type="button" className={segClass(view === 'panel')} onClick={() => setView('panel')}>
					Painel
				</button>
			</div>

			{error && (
				<div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3">
					<p className="text-sm text-red-700">{error}</p>
					<button
						type="button"
						onClick={() => void reloadField()}
						className="mt-2 text-xs font-semibold text-red-700 underline">
						Tentar de novo
					</button>
				</div>
			)}
			{loading && <p className="text-sm text-muted-foreground">Carregando…</p>}

			{!loading && (!error || loadedOnce) && view === 'agenda' && (
				<AgendaView agenda={agenda} contacts={contacts} onChanged={() => void reloadField({ silent: true })} />
			)}
			{!loading && (!error || loadedOnce) && view === 'funnel' && (
				<FunnelView contacts={contacts} onOpenContact={(c) => setSheetContact(c)} />
			)}
			{!loading && (!error || loadedOnce) && view === 'suppliers' && (
				<SuppliersView
					suppliers={contacts.filter((c) => c.contactType === 'supplier')}
					tenantId={tenantId}
					onOpenContact={(c) => setSheetContact(c)}
					onCreated={() => void reloadField({ silent: true })}
				/>
			)}
			{!loading &&
				(!error || loadedOnce) &&
				view === 'panel' &&
				(panelLoading || !panelData ? (
					<p className="text-sm text-muted-foreground">Carregando…</p>
				) : (
					<PanelView
						period={period}
						onPeriodChange={setPeriod}
						locationLabel={locationFilter === 'all' ? 'Todos os locais' : locationFilter}
						activity={summarizeActivity(panelData.interactions, windowRef)}
						newContacts={panelData.createdAts.filter((at) => inWindow(at, windowRef)).length}
						overdueFollowUps={overdueFollowUps}
						funnel={summarizeFunnel(contacts)}
						samples={summarizeSamples({
							interactions: panelData.interactions,
							contacts,
							receipts: panelData.receipts,
							receiptItems: panelData.receiptItems,
							window: windowRef,
						})}
						rows={buildReceivedVsSold({
							products,
							receipts: panelData.receipts,
							receiptItems: panelData.receiptItems,
							orders,
							salesItems,
							suppliers: contacts.filter((c) => c.contactType === 'supplier'),
							window: windowRef,
						})}
						bySupplier={buildReceivedBySupplier({
							receipts: panelData.receipts,
							receiptItems: panelData.receiptItems,
							suppliers: contacts.filter((c) => c.contactType === 'supplier'),
							window: windowRef,
						})}
						negatives={findNegativeBalances(products)}
					/>
				))}

			<button
				type="button"
				onClick={() => setLogOpen(true)}
				className="fixed bottom-6 left-1/2 z-40 min-h-11 w-[calc(100%-3rem)] max-w-md -translate-x-1/2 rounded-2xl bg-primary py-3.5 text-center text-sm font-bold text-primary-foreground shadow-[var(--shadow-card)] sm:static sm:translate-x-0 sm:w-auto sm:px-6">
				+ Registrar visita
			</button>
			<QuickLogModal
				open={logOpen}
				tenantId={tenantId}
				contacts={contacts}
				products={products}
				onClose={() => setLogOpen(false)}
				onSaved={() => {
					void reloadField({ silent: true });
					onReload();
				}}
			/>
			<ContactSheet
				open={sheetContact !== null}
				tenantId={tenantId}
				contact={sheetContact}
				products={products}
				onClose={() => setSheetContact(null)}
				onChanged={async () => {
					const ok = await reloadField({ silent: true });
					onReload();
					return ok;
				}}
			/>
		</div>
	);
};

export default FieldPage;
