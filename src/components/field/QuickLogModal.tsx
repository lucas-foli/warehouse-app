import { useEffect, useMemo, useState } from 'react';
import type { ContactType, FieldContact, InteractionKind, InteractionOutcome, Product } from '../../types';
import { mergeSamples, quickCreateContact, registerInteraction, type SampleInput } from '../../services/fieldService';

type Props = {
	open: boolean;
	tenantId?: string;
	contacts: FieldContact[];
	products: Product[];
	presetContact?: FieldContact | null;
	onClose: () => void;
	onSaved: () => void;
};

const KINDS: { value: InteractionKind; label: string }[] = [
	{ value: 'visit', label: 'Visita' },
	{ value: 'call', label: 'Ligação' },
	{ value: 'whatsapp', label: 'WhatsApp' },
	{ value: 'email', label: 'E-mail' },
];

const OUTCOMES: { value: InteractionOutcome; label: string }[] = [
	{ value: 'interested', label: 'Interessado' },
	{ value: 'proposal_requested', label: 'Pediu proposta' },
	{ value: 'undecided', label: 'Indeciso' },
	{ value: 'not_interested', label: 'Sem interesse' },
	{ value: 'buyer_absent', label: 'Comprador ausente' },
];

const NEXT_STEP_PRESETS: { label: string; days: number }[] = [
	{ label: 'amanhã', days: 1 },
	{ label: 'em 3 dias', days: 3 },
	{ label: 'próx. semana', days: 7 },
];

const chipClass = (active: boolean) =>
	`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
		active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground'
	}`;

const labelClass = 'block text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground';
const fieldBase =
	'rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring/60 focus:ring-2 focus:ring-ring/25';
const fieldClass = `mt-2 block w-full ${fieldBase}`;

const inDays = (days: number): string => {
	const d = new Date();
	d.setDate(d.getDate() + days);
	d.setHours(12, 0, 0, 0);
	return d.toISOString();
};

const todayInput = (): string => {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const QuickLogModal = ({ open, tenantId, contacts, products, presetContact, onClose, onSaved }: Props) => {
	const [contact, setContact] = useState<FieldContact | null>(null);
	const [search, setSearch] = useState('');
	const [creating, setCreating] = useState(false);
	const [newName, setNewName] = useState('');
	const [newCity, setNewCity] = useState('');
	const [newType, setNewType] = useState<ContactType>('client');
	const [occurredOn, setOccurredOn] = useState(todayInput());
	const [kind, setKind] = useState<InteractionKind>('visit');
	const [outcome, setOutcome] = useState<InteractionOutcome | null>(null);
	const [samples, setSamples] = useState<SampleInput[]>([]);
	const [sampleSku, setSampleSku] = useState('');
	const [sampleQty, setSampleQty] = useState('1');
	const [nextStep, setNextStep] = useState('');
	const [dueAt, setDueAt] = useState<string | null>(null);
	const [dueDays, setDueDays] = useState<number | null>(null);
	const [note, setNote] = useState('');
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');
	const [warning, setWarning] = useState('');

	useEffect(() => {
		if (!open) return;
		setContact(presetContact ?? null);
		setSearch('');
		setCreating(false);
		setNewName('');
		setNewCity('');
		setNewType('client');
		setOccurredOn(todayInput());
		setKind('visit');
		setOutcome(null);
		setSamples([]);
		setSampleSku('');
		setSampleQty('1');
		setNextStep('');
		setDueAt(null);
		setDueDays(null);
		setNote('');
		setSaving(false);
		setError('');
		setWarning('');
		// Dep por identidade (contactType+id), não pela referência: o reload
		// do FieldPage troca a referência de presetContact a cada volta, e
		// isso limparia o formulário no meio da digitação se a dep fosse o
		// objeto inteiro.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, presetContact?.contactType, presetContact?.id]);

	useEffect(() => {
		if (nextStep.trim() && !dueAt) {
			setDueDays(1);
			setDueAt(inDays(1));
		}
	}, [nextStep, dueAt]);

	const stockBySku = useMemo(() => {
		const map = new Map<string, number>();
		for (const p of products) map.set(p.sku.trim().toUpperCase(), p.qty);
		return map;
	}, [products]);

	const matches = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return [];
		return contacts.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 6);
	}, [contacts, search]);

	const merged = useMemo(() => mergeSamples(samples), [samples]);
	const lowStock = merged
		.filter((s) => {
			const stock = stockBySku.get(s.sku);
			return stock !== undefined && stock < s.qty;
		})
		.map((s) => s.sku);

	if (!open) return null;

	const removeSample = (sku: string) => {
		setSamples((current) => current.filter((s) => s.sku.trim().toUpperCase() !== sku));
	};

	const addSample = () => {
		const qty = Number(sampleQty);
		if (!sampleSku.trim()) return;
		if (!Number.isInteger(qty) || qty <= 0) {
			setError('A quantidade da amostra deve ser um número inteiro maior que zero.');
			return;
		}
		setError('');
		setSamples((current) => [...current, { sku: sampleSku, qty }]);
		setSampleSku('');
		setSampleQty('1');
	};

	const handleSave = async () => {
		if (!tenantId) return;
		setSaving(true);
		setError('');
		try {
			if (occurredOn > todayInput()) {
				throw new Error('A data da visita não pode ser no futuro.');
			}
			let target = contact;
			if (!target && creating) {
				if (!newName.trim()) throw new Error('Informe o nome do novo contato.');
				const created = await quickCreateContact(tenantId, newType, newName, newCity);
				target = {
					contactType: newType,
					id: created.id,
					tenantId,
					name: newName.trim(),
					manualStage: null,
					stageOverriddenAt: null,
					lastInteractionAt: null,
					hasTransaction: false,
					lastOutcome: null,
					hasSamples: false,
					hasInteraction: false,
					lastFactAt: null,
				};
				setContact(target);
				setCreating(false);
			}
			if (!target) throw new Error('Escolha ou crie um contato.');

			const result = await registerInteraction({
				tenantId,
				clientId: target.contactType === 'client' ? target.id : null,
				supplierId: target.contactType === 'supplier' ? target.id : null,
				kind,
				outcome,
				note: note || null,
				occurredAt:
					occurredOn === todayInput()
						? new Date().toISOString()
						: new Date(`${occurredOn}T12:00:00`).toISOString(),
				nextStep: nextStep || null,
				nextStepDueAt: dueAt,
				samples,
			});
			if (result.negativeSkus.length > 0) {
				setWarning(`Estoque ficou negativo: ${result.negativeSkus.join(', ')}.`);
				onSaved();
				return;
			}
			onSaved();
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Não foi possível registrar.');
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="fixed inset-0 z-50 !mt-0 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6">
			<div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-card p-5 sm:rounded-3xl">
				<div className="mb-4 flex items-center justify-between">
					<h2 className="text-lg font-bold text-foreground">Registrar visita</h2>
					<button
						type="button"
						onClick={onClose}
						disabled={saving}
						className="min-h-11 rounded-full bg-secondary px-4 text-sm">
						✕
					</button>
				</div>

				<div className="space-y-4">
					<div>
						<span className={labelClass}>Contato</span>
						{contact ? (
							<div className="mt-2 flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2">
								<span className="text-sm font-medium">{contact.name}</span>
								{!presetContact && (
									<button type="button" className="text-xs text-muted-foreground" onClick={() => setContact(null)}>
										trocar
									</button>
								)}
							</div>
						) : creating ? (
							<div className="mt-2 space-y-2">
								<input className={fieldClass} placeholder="Nome" value={newName} onChange={(e) => setNewName(e.target.value)} />
								<input className={fieldClass} placeholder="Cidade" value={newCity} onChange={(e) => setNewCity(e.target.value)} />
								<div className="flex gap-2">
									<button type="button" className={chipClass(newType === 'client')} onClick={() => setNewType('client')}>
										Cliente
									</button>
									<button type="button" className={chipClass(newType === 'supplier')} onClick={() => setNewType('supplier')}>
										Fornecedor
									</button>
									<button type="button" className="ml-auto text-xs text-muted-foreground" onClick={() => setCreating(false)}>
										cancelar
									</button>
								</div>
							</div>
						) : (
							<div className="mt-2">
								<input
									className={fieldClass}
									placeholder="Buscar por nome…"
									value={search}
									onChange={(e) => setSearch(e.target.value)}
								/>
								{matches.map((m) => (
									<button
										key={`${m.contactType}:${m.id}`}
										type="button"
										onClick={() => setContact(m)}
										className="mt-1 flex w-full items-center justify-between rounded-xl border border-border bg-card px-3 py-2 text-left text-sm">
										<span>{m.name}</span>
										<span className="text-[11px] text-muted-foreground">
											{m.contactType === 'client' ? 'cliente' : 'fornecedor'}
										</span>
									</button>
								))}
								<button type="button" className="mt-2 text-xs font-semibold text-foreground" onClick={() => setCreating(true)}>
									+ novo contato
								</button>
							</div>
						)}
					</div>

					<div className="flex items-center justify-between gap-3">
						<span className={labelClass}>Quando</span>
						<input
							type="date"
							value={occurredOn}
							max={todayInput()}
							onChange={(e) => setOccurredOn(e.target.value || todayInput())}
							className={`${fieldBase} w-auto`}
						/>
					</div>

					<div>
						<span className={labelClass}>Tipo</span>
						<div className="mt-2 flex flex-wrap gap-2">
							{KINDS.map((k) => (
								<button key={k.value} type="button" className={chipClass(kind === k.value)} onClick={() => setKind(k.value)}>
									{k.label}
								</button>
							))}
						</div>
					</div>

					<div>
						<span className={labelClass}>Resultado</span>
						<div className="mt-2 flex flex-wrap gap-2">
							{OUTCOMES.map((o) => (
								<button
									key={o.value}
									type="button"
									className={chipClass(outcome === o.value)}
									onClick={() => setOutcome(outcome === o.value ? null : o.value)}>
									{o.label}
								</button>
							))}
						</div>
					</div>

					<div>
						<span className={labelClass}>Amostras deixadas (baixa o estoque)</span>
						{merged.map((s) => (
							<div key={s.sku} className="mt-2 flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2 text-sm">
								<span>{s.sku}</span>
								<span className="flex items-center gap-3">
									<span className="font-semibold">{s.qty}</span>
									<button
										type="button"
										onClick={() => removeSample(s.sku)}
										aria-label={`Remover amostra ${s.sku}`}
										className="min-h-11 px-2 text-muted-foreground">
										✕
									</button>
								</span>
							</div>
						))}
						{lowStock.length > 0 && (
							<p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
								Estoque insuficiente no app: {lowStock.join(', ')} — o registro segue mesmo assim.
							</p>
						)}
						<div className="mt-2 flex gap-2">
							<input
								className={`${fieldBase} min-w-0 flex-1`}
								placeholder="SKU"
								list="field-skus"
								value={sampleSku}
								onChange={(e) => setSampleSku(e.target.value)}
							/>
							<datalist id="field-skus">
								{products.map((p) => (
									<option key={p.id} value={p.sku}>{p.name}</option>
								))}
							</datalist>
							<input
								className={`${fieldBase} w-20 shrink-0 text-center`}
								type="number"
								min={1}
								step={1}
								value={sampleQty}
								onChange={(e) => setSampleQty(e.target.value)}
							/>
							<button type="button" onClick={addSample} className="shrink-0 min-h-11 rounded-xl border border-border px-3 text-sm">
								+
							</button>
						</div>
					</div>

					<div>
						<span className={labelClass}>Próximo passo (opcional)</span>
						<input
							className={fieldClass}
							placeholder="O que fazer em seguida…"
							value={nextStep}
							onChange={(e) => setNextStep(e.target.value)}
						/>
						<div className="mt-2 flex flex-wrap items-center gap-2">
							{NEXT_STEP_PRESETS.map((p) => (
								<button
									key={p.days}
									type="button"
									className={chipClass(dueDays === p.days)}
									onClick={() => {
										setDueDays(p.days);
										setDueAt(inDays(p.days));
									}}>
									{p.label}
								</button>
							))}
							<input
								type="date"
								className={`${fieldBase} w-auto`}
								value={dueDays === null && dueAt ? dueAt.slice(0, 10) : ''}
								onChange={(e) => {
									setDueDays(null);
									setDueAt(e.target.value ? new Date(`${e.target.value}T12:00:00`).toISOString() : null);
								}}
							/>
						</div>
					</div>

					<div>
						<span className={labelClass}>Nota (opcional)</span>
						<textarea className={fieldClass} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
					</div>

					{error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
					{warning && (
						<div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
							<p className="text-sm font-semibold text-amber-800">Visita registrada.</p>
							<p className="mt-1 text-sm text-amber-700">{warning}</p>
						</div>
					)}

					<button
						type="button"
						disabled={saving}
						onClick={warning ? onClose : () => void handleSave()}
						className="min-h-11 w-full rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50">
						{saving ? 'Salvando…' : warning ? 'Entendi, fechar' : 'Salvar visita'}
					</button>
				</div>
			</div>
		</div>
	);
};
