import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ContactStage, FieldContact, Interaction, Product } from '../../types';
import { deriveStage, STAGE_LABELS, STAGE_ORDER } from '../../utils/stageDerivation';
import { fetchContactInteractions, setManualStage } from '../../services/fieldService';
import { QuickLogModal } from './QuickLogModal';

type Props = {
	open: boolean;
	tenantId?: string;
	contact: FieldContact | null;
	products: Product[];
	onClose: () => void;
	onChanged: () => void;
};

const KIND_LABELS: Record<Interaction['kind'], string> = {
	visit: 'Visita',
	call: 'Ligação',
	whatsapp: 'WhatsApp',
	email: 'E-mail',
};

const OUTCOME_LABELS: Record<NonNullable<Interaction['outcome']>, string> = {
	interested: 'interessado',
	proposal_requested: 'pediu proposta',
	undecided: 'indeciso',
	not_interested: 'sem interesse',
	buyer_absent: 'comprador ausente',
};

const dateLabel = (iso: string): string =>
	new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });

const ContactSheet = ({ open, tenantId, contact, products, onClose, onChanged }: Props) => {
	const [timeline, setTimeline] = useState<Interaction[]>([]);
	const [loading, setLoading] = useState(false);
	const [stagePickerOpen, setStagePickerOpen] = useState(false);
	const [logOpen, setLogOpen] = useState(false);
	const [error, setError] = useState('');
	const navigate = useNavigate();

	useEffect(() => {
		if (!open || !contact || !tenantId) return;
		setLoading(true);
		setError('');
		fetchContactInteractions(tenantId, contact.contactType, contact.id)
			.then(setTimeline)
			.catch((err) => setError(err instanceof Error ? err.message : 'Não foi possível carregar a timeline.'))
			.finally(() => setLoading(false));
	}, [open, contact, tenantId]);

	if (!open || !contact) return null;

	const { stage, overridden } = deriveStage(contact);

	const handleStage = async (next: ContactStage | null) => {
		setError('');
		try {
			await setManualStage(contact.contactType, contact.id, next);
			setStagePickerOpen(false);
			onChanged();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Não foi possível mudar o estágio.');
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6">
			<div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-card p-5 sm:rounded-3xl">
				<div className="mb-1 flex items-center justify-between">
					<h2 className="text-lg font-bold text-foreground">{contact.name}</h2>
					<button
						type="button"
						onClick={onClose}
						className="min-h-11 rounded-full bg-secondary px-3 text-sm">
						✕
					</button>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-semibold">
						{contact.contactType === 'client' ? 'cliente' : 'fornecedor'}
					</span>
					<button
						type="button"
						onClick={() => setStagePickerOpen((v) => !v)}
						className="min-h-11 rounded-full border border-border px-2.5 text-[11px] font-semibold text-foreground">
						{STAGE_LABELS[stage]}
						{overridden ? ' · à mão' : ''} ▾
					</button>
				</div>
				{stagePickerOpen && (
					<div className="mt-2 flex flex-wrap gap-2">
						{STAGE_ORDER.map((s) => (
							<button
								key={s}
								type="button"
								onClick={() => void handleStage(s)}
								className="min-h-11 rounded-full border border-border bg-card px-3 text-xs">
								{STAGE_LABELS[s]}
							</button>
						))}
						{overridden && (
							<button
								type="button"
								onClick={() => void handleStage(null)}
								className="min-h-11 rounded-full border border-border px-3 text-xs text-muted-foreground">
								voltar ao automático
							</button>
						)}
					</div>
				)}
				<p className="mt-2 text-xs text-muted-foreground">
					{[contact.city, contact.phone, contact.email].filter(Boolean).join(' · ') || 'sem dados de contato'}
				</p>

				<div className="mt-4 flex gap-2">
					<button
						type="button"
						onClick={() => setLogOpen(true)}
						className="min-h-11 flex-1 rounded-2xl bg-primary py-2.5 text-sm font-bold text-primary-foreground">
						+ Visita
					</button>
					{contact.contactType === 'client' && (
						<button
							type="button"
							onClick={() => navigate('/sales')}
							className="min-h-11 flex-1 rounded-2xl border border-border bg-secondary py-2.5 text-sm font-semibold text-secondary-foreground">
							Novo pedido
						</button>
					)}
				</div>

				{error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

				<h3 className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Timeline</h3>
				{loading && <p className="mt-2 text-sm text-muted-foreground">Carregando…</p>}
				{!loading && timeline.length === 0 && (
					<p className="mt-2 text-sm text-muted-foreground">Nenhuma interação registrada.</p>
				)}
				<div className="mt-2 space-y-2 border-l-2 border-border pl-4">
					{timeline.map((i) => (
						<div key={i.id} className="rounded-2xl border border-border bg-card p-3">
							<div className="flex items-center justify-between">
								<p className="text-sm font-semibold text-foreground">
									{KIND_LABELS[i.kind]}
									{i.outcome ? ` · ${OUTCOME_LABELS[i.outcome]}` : ''}
								</p>
								<span className="text-xs text-muted-foreground">{dateLabel(i.occurredAt)}</span>
							</div>
							{i.samples.length > 0 && (
								<p className="mt-1 text-xs text-muted-foreground">
									Amostras: {i.samples.map((s) => `${s.qty}× ${s.sku}`).join(', ')}
								</p>
							)}
							{i.nextStep && (
								<p className="mt-1 text-xs text-muted-foreground">
									Próximo passo: {i.nextStep}
									{i.nextStepDueAt ? ` (${dateLabel(i.nextStepDueAt)})` : ''}
									{i.nextStepDoneAt ? ' ✓' : ''}
								</p>
							)}
							{i.note && <p className="mt-1 text-xs text-muted-foreground">{i.note}</p>}
						</div>
					))}
				</div>
			</div>

			<QuickLogModal
				open={logOpen}
				tenantId={tenantId}
				contacts={[contact]}
				products={products}
				presetContact={contact}
				onClose={() => setLogOpen(false)}
				onSaved={onChanged}
			/>
		</div>
	);
};

export default ContactSheet;
