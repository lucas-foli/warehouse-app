import { useMemo, useState } from 'react';
import type { ContactStage, FieldContact } from '../../types';
import { deriveStage, STAGE_LABELS, STAGE_ORDER } from '../../utils/stageDerivation';

type Props = {
	contacts: FieldContact[];
	onOpenContact: (c: FieldContact) => void;
};

type RoleFilter = 'all' | 'client' | 'supplier';

const STALE_DAYS = 5; // ⚠ visual a partir de 5 dias sem contato (constante de UI, spec)

const daysSince = (iso: string | null): number | null => {
	if (!iso) return null;
	return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
};

const chipClass = (active: boolean) =>
	`min-h-11 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
		active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground'
	}`;

const FunnelView = ({ contacts, onOpenContact }: Props) => {
	const [role, setRole] = useState<RoleFilter>('all');

	const grouped = useMemo(() => {
		const groups = new Map<ContactStage, { contact: FieldContact; overridden: boolean }[]>();
		for (const stage of STAGE_ORDER) groups.set(stage, []);
		for (const contact of contacts) {
			if (role !== 'all' && contact.contactType !== role) continue;
			const { stage, overridden } = deriveStage(contact);
			groups.get(stage)?.push({ contact, overridden });
		}
		return groups;
	}, [contacts, role]);

	return (
		<div className="space-y-5">
			<div className="flex gap-2">
				<button type="button" className={chipClass(role === 'all')} onClick={() => setRole('all')}>
					Todos
				</button>
				<button type="button" className={chipClass(role === 'client')} onClick={() => setRole('client')}>
					Clientes
				</button>
				<button type="button" className={chipClass(role === 'supplier')} onClick={() => setRole('supplier')}>
					Fornecedores
				</button>
			</div>

			{STAGE_ORDER.map((stage) => {
				const items = grouped.get(stage) ?? [];
				if (items.length === 0) return null;
				return (
					<section key={stage} className="space-y-2">
						<div className="flex items-center justify-between">
							<h3 className="text-sm font-semibold text-foreground">{STAGE_LABELS[stage]}</h3>
							<span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold">{items.length}</span>
						</div>
						{items.map(({ contact, overridden }) => {
							const days = daysSince(contact.lastInteractionAt);
							return (
								<button
									key={`${contact.contactType}:${contact.id}`}
									type="button"
									onClick={() => onOpenContact(contact)}
									className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-left">
									<div className="min-w-0">
										<p className="truncate text-sm font-semibold text-foreground">{contact.name}</p>
										<p className="text-xs text-muted-foreground">
											{days === null
												? 'sem interação'
												: `há ${days} ${days === 1 ? 'dia' : 'dias'}${days >= STALE_DAYS ? ' ⚠' : ''}`}
											{overridden ? ' · marcado à mão' : ''}
										</p>
									</div>
									<span className="ml-3 shrink-0 rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-semibold">
										{contact.contactType === 'client' ? 'cliente' : 'fornecedor'}
									</span>
								</button>
							);
						})}
					</section>
				);
			})}

			{contacts.length === 0 && <p className="text-sm text-muted-foreground">Nenhum contato ainda.</p>}
		</div>
	);
};

export default FunnelView;
