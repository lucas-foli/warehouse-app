import { useState } from 'react';
import type { FieldContact } from '../../types';
import { quickCreateContact } from '../../services/fieldService';

type Props = {
	suppliers: FieldContact[];
	tenantId?: string;
	onOpenContact: (c: FieldContact) => void;
	onCreated: () => void;
};

const fieldClass =
	'mt-2 block w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring/60 focus:ring-2 focus:ring-ring/25';

const SuppliersView = ({ suppliers, tenantId, onOpenContact, onCreated }: Props) => {
	const [creating, setCreating] = useState(false);
	const [name, setName] = useState('');
	const [city, setCity] = useState('');
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');

	const handleCreate = async () => {
		if (!tenantId || !name.trim()) return;
		setSaving(true);
		setError('');
		try {
			await quickCreateContact(tenantId, 'supplier', name, city);
			setCreating(false);
			setName('');
			setCity('');
			onCreated();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Não foi possível criar o fornecedor.');
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="space-y-3">
			{suppliers.map((s) => (
				<button
					key={s.id}
					type="button"
					onClick={() => onOpenContact(s)}
					className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-left">
					<div className="min-w-0">
						<p className="truncate text-sm font-semibold text-foreground">{s.name}</p>
						<p className="text-xs text-muted-foreground">{s.city || '—'}</p>
					</div>
				</button>
			))}
			{suppliers.length === 0 && !creating && (
				<p className="text-sm text-muted-foreground">Nenhum fornecedor cadastrado.</p>
			)}

			{creating ? (
				<div className="rounded-2xl border border-border bg-card p-4">
					<input className={fieldClass} placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
					<input className={fieldClass} placeholder="Cidade" value={city} onChange={(e) => setCity(e.target.value)} />
					{error && <p className="mt-2 text-sm text-red-700">{error}</p>}
					<div className="mt-3 flex gap-2">
						<button
							type="button"
							disabled={saving}
							onClick={() => void handleCreate()}
							className="min-h-11 flex-1 rounded-xl bg-primary py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">
							Salvar
						</button>
						<button
							type="button"
							onClick={() => setCreating(false)}
							className="min-h-11 rounded-xl border border-border px-4 text-sm text-muted-foreground">
							Cancelar
						</button>
					</div>
				</div>
			) : (
				<button
					type="button"
					onClick={() => setCreating(true)}
					className="min-h-11 text-sm font-semibold text-foreground">
					+ Novo fornecedor
				</button>
			)}
		</div>
	);
};

export default SuppliersView;
