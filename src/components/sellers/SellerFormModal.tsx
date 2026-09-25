import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Modal } from '../ui/Modal';
import type { Seller } from '../../types';
import {
	buildSellerInsert,
	buildSellerUpdate,
	deleteBlockMessage,
	emailDuplicateError,
	emptySellerDraft,
	nameDuplicateWarning,
	sellerToDraft,
	validateSellerDraft,
	type SellerDraft,
} from '../../utils/clientSellerForms';

type Props = {
	open: boolean;
	tenantId?: string;
	seller?: Seller | null;
	onClose: () => void;
	onSaved: () => void;
};

const labelClass = 'block text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground';
const fieldClass =
	'mt-2 block w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring/60 focus:ring-2 focus:ring-ring/25';

export const SellerFormModal = ({ open, tenantId, seller, onClose, onSaved }: Props) => {
	const isEdit = !!seller;
	const [draft, setDraft] = useState<SellerDraft>(emptySellerDraft());
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [nameWarning, setNameWarning] = useState('');

	useEffect(() => {
		if (!open) return;
		setDraft(seller ? sellerToDraft(seller) : emptySellerDraft());
		setError('');
		setConfirmDelete(false);
		setSaving(false);
		setNameWarning('');
	}, [open, seller]);

	const update = (partial: Partial<SellerDraft>) => setDraft((c) => ({ ...c, ...partial }));

	const save = async (force = false) => {
		if (!tenantId) return;
		const validationError = validateSellerDraft(draft);
		if (validationError) {
			setError(validationError);
			return;
		}
		setSaving(true);
		setError('');
		try {
			// E-mail único (hard): bloqueia sempre — no criar e no editar. Roda mesmo com force,
			// porque forçar vale só para o aviso de nome, não para o e-mail.
			if (draft.email.trim()) {
				let emailQuery = supabase
					.from('sellers')
					.select('id', { count: 'exact', head: true })
					.eq('tenant_id', tenantId)
					.ilike('email', draft.email.trim().replace(/([%_\\])/g, '\\$1'));
				if (isEdit && seller) emailQuery = emailQuery.neq('id', seller.id);
				const { count: emailCount, error: emailErr } = await emailQuery;
				if (emailErr) throw emailErr;
				if (emailCount && emailCount > 0) {
					setError(emailDuplicateError('vendedor'));
					setSaving(false);
					return;
				}
			}
			// Aviso soft: nome igual (case-insensitive) já existe? Não bloqueia — confirma.
			if (!force) {
				let dupQuery = supabase
					.from('sellers')
					.select('id', { count: 'exact', head: true })
					.eq('tenant_id', tenantId)
					.ilike('name', draft.nome.trim().replace(/([%_\\])/g, '\\$1'));
				if (isEdit && seller) dupQuery = dupQuery.neq('id', seller.id);
				const { count, error: dupErr } = await dupQuery;
				if (dupErr) throw dupErr;
				if (count && count > 0) {
					setNameWarning(nameDuplicateWarning('vendedor', draft.nome.trim()));
					setSaving(false);
					return;
				}
			}
			if (isEdit && seller) {
				const { error: err } = await supabase
					.from('sellers')
					.update(buildSellerUpdate(draft))
					.eq('tenant_id', tenantId)
					.eq('id', seller.id);
				if (err) throw err;
			} else {
				const { error: err } = await supabase.from('sellers').insert(buildSellerInsert(draft, tenantId));
				if (err) {
					if (err.code === '23505') {
						setError('Já existe um vendedor com esse e-mail/nome. Adicione um e-mail para diferenciar.');
						setSaving(false);
						return;
					}
					throw err;
				}
			}
			onSaved();
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Não foi possível salvar o vendedor.');
		} finally {
			setSaving(false);
		}
	};

	const remove = async () => {
		if (!tenantId || !seller) return;
		setSaving(true);
		setError('');
		try {
			const { count, error: countErr } = await supabase
				.from('sales_orders')
				.select('id', { count: 'exact', head: true })
				.eq('tenant_id', tenantId)
				.eq('seller_id', seller.id);
			if (countErr) throw countErr;
			if (count && count > 0) {
				setError(deleteBlockMessage('vendedor', count));
				setConfirmDelete(false);
				setSaving(false);
				return;
			}
			const { error: delErr } = await supabase
				.from('sellers')
				.delete()
				.eq('tenant_id', tenantId)
				.eq('id', seller.id);
			if (delErr) throw delErr;
			onSaved();
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Não foi possível excluir o vendedor.');
		} finally {
			setSaving(false);
		}
	};

	return (
		<Modal open={open} onClose={onClose} size="md" labelledById="seller-form-title">
			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6 pt-2 sm:pt-6">
				<div className="flex items-start justify-between gap-4">
					<div>
						<p
							id="seller-form-title"
							className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
							{isEdit ? 'Editar vendedor' : 'Novo vendedor'}
						</p>
						<p className="mt-2 text-sm text-muted-foreground">
							{isEdit ? 'Atualize os dados do vendedor.' : 'Cadastre um vendedor manualmente.'}
						</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="rounded-full border border-border/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground transition hover:bg-muted">
						Fechar
					</button>
				</div>

				<div className="mt-6 grid gap-4">
					<div>
						<label className={labelClass}>Nome *</label>
						<input
							value={draft.nome}
							onChange={(e) => {
								update({ nome: e.target.value });
								setNameWarning('');
							}}
							autoFocus
							className={fieldClass}
						/>
					</div>
					<div>
						<label className={labelClass}>E-mail</label>
						<input type="email" value={draft.email} onChange={(e) => update({ email: e.target.value })} className={fieldClass} />
					</div>
					{nameWarning && <p className="text-xs text-amber-600">{nameWarning}</p>}
					{error && <p className="text-xs text-rose-500">{error}</p>}
				</div>
			</div>

			<div className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-border/20 px-6 py-4">
				{confirmDelete ? (
					<div className="flex w-full items-center justify-between gap-3">
						<span className="text-xs text-muted-foreground">Excluir este vendedor?</span>
						<div className="flex gap-2">
							<button
								type="button"
								onClick={() => setConfirmDelete(false)}
								className="rounded-full border border-border/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground transition hover:bg-muted">
								Cancelar
							</button>
							<button
								type="button"
								onClick={remove}
								disabled={saving}
								className="rounded-full bg-rose-500 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white transition hover:opacity-90 disabled:opacity-50">
								Confirmar exclusão
							</button>
						</div>
					</div>
				) : (
					<>
						<div>
							{isEdit && (
								<button
									type="button"
									onClick={() => {
										setError('');
										setNameWarning('');
										setConfirmDelete(true);
									}}
									className="rounded-full border border-rose-500/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-rose-500 transition hover:bg-rose-500/10">
									Excluir
								</button>
							)}
						</div>
						<div className="flex gap-3">
							<button
								type="button"
								onClick={onClose}
								className="rounded-full border border-border/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground transition hover:bg-muted">
								Cancelar
							</button>
							<button
								type="button"
								onClick={() => save(Boolean(nameWarning))}
								disabled={saving || !tenantId}
								className="rounded-full bg-primary px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
								{saving ? 'Salvando…' : nameWarning ? 'Salvar mesmo assim' : isEdit ? 'Salvar' : 'Criar vendedor'}
							</button>
						</div>
					</>
				)}
			</div>
		</Modal>
	);
};
