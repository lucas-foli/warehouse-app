import { useCallback, useEffect, useRef, useState } from 'react';
import type { FieldContact, Interaction, Product } from '../../types';
import { fetchFieldContacts, fetchOpenAgenda } from '../../services/fieldService';
import AgendaView from './AgendaView';

type FieldView = 'agenda' | 'funnel' | 'suppliers';

type Props = {
	tenantId?: string;
	products: Product[];
	onReload: () => void;
};

const segClass = (active: boolean) =>
	`flex-1 rounded-xl px-3 py-2 text-center text-sm font-medium transition ${
		active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
	}`;

const FieldPage = ({ tenantId, products, onReload }: Props) => {
	const [view, setView] = useState<FieldView>('agenda');
	const [contacts, setContacts] = useState<FieldContact[]>([]);
	const [agenda, setAgenda] = useState<Interaction[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const loadIdRef = useRef(0);

	const reloadField = useCallback(async () => {
		if (!tenantId) {
			setLoading(false);
			return;
		}
		const loadId = ++loadIdRef.current;
		setLoading(true);
		setError('');
		try {
			const [nextContacts, nextAgenda] = await Promise.all([
				fetchFieldContacts(tenantId),
				fetchOpenAgenda(tenantId),
			]);
			if (loadId !== loadIdRef.current) return;
			setContacts(nextContacts);
			setAgenda(nextAgenda);
		} catch (err) {
			if (loadId !== loadIdRef.current) return;
			console.error('[campo] falha ao carregar', err);
			setError(err instanceof Error ? err.message : 'Não foi possível carregar o Campo.');
		} finally {
			if (loadId === loadIdRef.current) setLoading(false);
		}
	}, [tenantId]);

	useEffect(() => {
		void reloadField();
	}, [reloadField]);

	// products e onReload são consumidos pelas sub-visões das Tasks 10-13.
	void products;
	void onReload;

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

			{!loading && !error && view === 'agenda' && (
				<AgendaView agenda={agenda} contacts={contacts} onChanged={() => void reloadField()} />
			)}
			{!loading && !error && view === 'funnel' && (
				<p className="text-sm text-muted-foreground">
					{contacts.length === 0 ? 'Nenhum contato ainda.' : `${contacts.length} contatos.`}
				</p>
			)}
			{!loading && !error && view === 'suppliers' && (
				<p className="text-sm text-muted-foreground">
					{contacts.filter((c) => c.contactType === 'supplier').length === 0
						? 'Nenhum fornecedor cadastrado.'
						: `${contacts.filter((c) => c.contactType === 'supplier').length} fornecedores.`}
				</p>
			)}
		</div>
	);
};

export default FieldPage;
