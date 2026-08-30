import { useMemo, useState } from 'react';
import type { FieldContact, Interaction } from '../../types';
import { groupAgenda } from '../../utils/agendaGrouping';
import { markNextStepDone, rescheduleNextStep } from '../../services/fieldService';

type Props = {
	agenda: Interaction[];
	contacts: FieldContact[];
	onChanged: () => void;
};

const GROUP_TITLES: { key: 'overdue' | 'today' | 'week' | 'later'; title: string; accent?: string }[] = [
	{ key: 'overdue', title: 'Atrasados', accent: 'text-red-600' },
	{ key: 'today', title: 'Hoje' },
	{ key: 'week', title: 'Esta semana' },
	{ key: 'later', title: 'Mais tarde' },
];

const dueLabel = (iso: string | null): string => {
	if (!iso) return '';
	return new Date(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
};

const AgendaView = ({ agenda, contacts, onChanged }: Props) => {
	const [busyId, setBusyId] = useState<string | null>(null);
	const [laterOpen, setLaterOpen] = useState(false);
	const [error, setError] = useState('');

	const contactById = useMemo(() => {
		const map = new Map<string, FieldContact>();
		for (const c of contacts) map.set(`${c.contactType}:${c.id}`, c);
		return map;
	}, [contacts]);

	const groups = useMemo(() => groupAgenda(agenda, new Date()), [agenda]);

	const contactOf = (i: Interaction): FieldContact | undefined =>
		i.clientId ? contactById.get(`client:${i.clientId}`) : contactById.get(`supplier:${i.supplierId}`);

	const handleDone = async (i: Interaction) => {
		setBusyId(i.id);
		setError('');
		try {
			await markNextStepDone(i.id);
			onChanged();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Não foi possível marcar como feito.');
		} finally {
			setBusyId(null);
		}
	};

	const handleReschedule = async (i: Interaction, days: number) => {
		setBusyId(i.id);
		setError('');
		try {
			const base = new Date();
			base.setDate(base.getDate() + days);
			base.setHours(12, 0, 0, 0);
			await rescheduleNextStep(i.id, base.toISOString());
			onChanged();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Não foi possível reagendar.');
		} finally {
			setBusyId(null);
		}
	};

	const renderItem = (i: Interaction) => {
		const contact = contactOf(i);
		return (
			<div key={i.id} className="rounded-2xl border border-border bg-card p-4">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<p className="truncate text-sm font-semibold text-foreground">{contact?.name ?? 'Contato não identificado'}</p>
						{contact && (
							<span className="mt-1 inline-block rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-semibold text-secondary-foreground">
								{contact.contactType === 'client' ? 'cliente' : 'fornecedor'}
							</span>
						)}
						<p className="mt-1 text-sm text-muted-foreground">{i.nextStep || 'Follow-up sem descrição'}</p>
						<p className="mt-1 text-xs text-muted-foreground">{dueLabel(i.nextStepDueAt)}</p>
					</div>
					<div className="flex shrink-0 flex-col items-end gap-3">
						<button
							type="button"
							disabled={busyId === i.id}
							onClick={() => void handleDone(i)}
							className="min-h-11 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-50">
							Feito
						</button>
						<button
							type="button"
							disabled={busyId === i.id}
							onClick={() => void handleReschedule(i, 1)}
							className="min-h-11 rounded-xl border border-border px-4 text-xs font-medium text-muted-foreground disabled:opacity-50">
							+1 dia
						</button>
					</div>
				</div>
			</div>
		);
	};

	const isEmpty = agenda.length === 0;

	return (
		<div className="space-y-5">
			{error && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
			{isEmpty && <p className="text-sm text-muted-foreground">Nenhum follow-up marcado.</p>}
			{GROUP_TITLES.map(({ key, title, accent }) => {
				const items = groups[key];
				if (items.length === 0) return null;
				if (key === 'later' && !laterOpen) {
					return (
						<button
							key={key}
							type="button"
							onClick={() => setLaterOpen(true)}
							aria-expanded={false}
							className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
							Mais tarde · {items.length} — mostrar
						</button>
					);
				}
				if (key === 'later' && laterOpen) {
					return (
						<section key={key} className="space-y-2">
							<button
								type="button"
								onClick={() => setLaterOpen(false)}
								aria-expanded={true}
								className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
								{title} · {items.length} — ocultar
							</button>
							{items.map(renderItem)}
						</section>
					);
				}
				return (
					<section key={key} className="space-y-2">
						<h3 className={`text-xs font-semibold uppercase tracking-[0.2em] ${accent ?? 'text-muted-foreground'}`}>
							{title} · {items.length}
						</h3>
						{items.map(renderItem)}
					</section>
				);
			})}
		</div>
	);
};

export default AgendaView;
