type BulkActionBarProps = {
	selectedCount: number;
	onEditField: () => void;
	onDelete: () => void;
	onClear: () => void;
	busy?: boolean;
};

export const BulkActionBar = ({ selectedCount, onEditField, onDelete, onClear, busy }: BulkActionBarProps) => {
	if (selectedCount === 0) return null;
	return (
		<div className="flex flex-wrap items-center justify-between gap-3 rounded-t-[var(--radius-card)] bg-primary px-5 py-3 text-primary-foreground">
			<span className="text-[11px] font-semibold uppercase tracking-[0.25em]">
				{selectedCount} {selectedCount === 1 ? 'selecionado' : 'selecionados'}
			</span>
			<div className="flex flex-wrap items-center gap-2">
				<button
					type="button"
					onClick={onEditField}
					disabled={busy}
					className="rounded-full border border-primary-foreground/30 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] transition hover:bg-primary-foreground hover:text-primary disabled:opacity-50"
				>
					Editar campo
				</button>
				<button
					type="button"
					onClick={onDelete}
					disabled={busy}
					className="rounded-full bg-red-500 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-red-600 disabled:opacity-50"
				>
					Excluir
				</button>
				<button
					type="button"
					onClick={onClear}
					disabled={busy}
					className="rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-foreground/70 transition hover:text-primary-foreground disabled:opacity-50"
				>
					Limpar
				</button>
			</div>
		</div>
	);
};
