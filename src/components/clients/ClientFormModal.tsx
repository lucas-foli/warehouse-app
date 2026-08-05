import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { Client } from '../../types';
import {
	buildClientInsert,
	buildClientUpdate,
	clientToDraft,
	deleteBlockMessage,
	emptyClientDraft,
	nameDuplicateWarning,
	validateClientDraft,
	type ClientDraft,
} from '../../utils/clientSellerForms';

type Props = {
	open: boolean;
	tenantId?: string;
	client?: Client | null;
	onClose: () => void;
	onSaved: () => void;
};

const labelClass = 'block text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground';
const fieldClass =
	'mt-2 block w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring/60 focus:ring-2 focus:ring-ring/25';

export const ClientFormModal = ({ open, tenantId, client, onClose, onSaved }: Props) => {
	const isEdit = !!client;
	const [draft, setDraft] = useState<ClientDraft>(emptyClientDraft());
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [nameWarning, setNameWarning] = useState('');

	useEffect(() => {
		if (!open) return;
		setDraft(client ? clientToDraft(client) : emptyClientDraft());
		setError('');
		setConfirmDelete(false);
		setSaving(false);
		setNameWarning('');
	}, [open, client]);

	if (!open) return null;

	const update = (partial: Partial<ClientDraft>) => setDraft((c) => ({ ...c, ...partial }));

	const save = async (force = false) => {
		if (!tenantId) return;
		const validationError = validateClientDraft(draft);
		if (validationError) {
			setError(validationError);
			return;
		}
		setSaving(true);
		setError('');
		try {
			// Aviso soft: nome igual (case-insensitive) já existe? Não bloqueia — confirma.
			if (!force) {
				let dupQuery = supabase
					.from('clients')
					.select('id', { count: 'exact', head: true })
					.eq('tenant_id', tenantId)
					.ilike('name', draft.nome.trim());
				if (isEdit && client) dupQuery = dupQuery.neq('id', client.id);
				const { count, error: dupErr } = await dupQuery;
				if (dupErr) throw dupErr;
				if (count && count > 0) {
					setNameWarning(nameDuplicateWarning('cliente', draft.nome.trim()));
					setSaving(false);
					return;
				}
			}
			if (isEdit && client) {
				const { error: err } = await supabase
					.from('clients')
					.update(buildClientUpdate(draft))
					.eq('tenant_id', tenantId)
					.eq('id', client.id);
				if (err) throw err;
			} else {
				const { error: err } = await supabase.from('clients').insert(buildClientInsert(draft, tenantId));
				if (err) {
					if (err.code === '23505') {
						setError('Já existe um cliente com esse e-mail/telefone/nome. Adicione um e-mail para diferenciar.');
						setSaving(false);
						return;
					}
					throw err;
				}
			}
			onSaved();
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Não foi possível salvar o cliente.');
		} finally {
			setSaving(false);
		}
	};

	const remove = async () => {
		if (!tenantId || !client) return;
		setSaving(true);
		setError('');
		try {
			// FK é on delete set null: excluir não gera erro, apenas desvincula em silêncio.
			// Por isso a checagem é proativa — bloqueia se houver vendas vinculadas.
			const { count, error: countErr } = await supabase
				.from('sales_orders')
				.select('id', { count: 'exact', head: true })
				.eq('tenant_id', tenantId)
				.eq('client_id', client.id);
			if (countErr) throw countErr;
			if (count && count > 0) {
				setError(deleteBlockMessage('cliente', count));
				setConfirmDelete(false);
				setSaving(false);
				return;
			}
			const { error: delErr } = await supabase
				.from('clients')
				.delete()
				.eq('tenant_id', tenantId)
				.eq('id', client.id);
			if (delErr) throw delErr;
			onSaved();
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Não foi possível excluir o cliente.');
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="fixed inset-0 z-50 bg-black/60 sm:flex sm:items-center sm:justify-center sm:p-4">
			<div className="absolute inset-x-0 bottom-0 flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-card shadow-xl sm:static sm:max-h-[90vh] sm:max-w-lg sm:rounded-[var(--radius-card)]">
				<div className="flex flex-shrink-0 justify-center py-3 sm:hidden">
					<div className="h-1 w-10 rounded-full bg-border" />
				</div>
				<div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6 pt-2 sm:pt-6">
					<div className="flex items-start justify-between gap-4">
						<div>
							<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
								{isEdit ? 'Editar cliente' : 'Novo cliente'}
							</p>
							<p className="mt-2 text-sm text-muted-foreground">
								{isEdit ? 'Atualize os dados do cliente.' : 'Cadastre um cliente manualmente.'}
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
							<label className={labelClass}>Cidade</label>
							<input value={draft.cidade} onChange={(e) => update({ cidade: e.target.value })} className={fieldClass} />
						</div>
						<div>
							<label className={labelClass}>Telefone</label>
							<input value={draft.telefone} onChange={(e) => update({ telefone: e.target.value })} className={fieldClass} />
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
							<span className="text-xs text-muted-foreground">Excluir este cliente?</span>
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
									{saving ? 'Salvando…' : nameWarning ? 'Criar mesmo assim' : isEdit ? 'Salvar' : 'Criar cliente'}
								</button>
							</div>
						</>
					)}
				</div>
			</div>
		</div>
	);
};
