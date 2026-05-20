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
		<div className="flex items-center justify-between gap-3 rounded-t bg-slate-800 px-4 py-2 text-white">
			<span className="text-sm">{selectedCount} selected</span>
			<div className="flex gap-2">
				<button
					type="button"
					onClick={onEditField}
					disabled={busy}
					className="rounded bg-slate-700 px-3 py-1 text-sm hover:bg-slate-600 disabled:opacity-50"
				>
					Edit field…
				</button>
				<button
					type="button"
					onClick={onDelete}
					disabled={busy}
					className="rounded bg-red-600 px-3 py-1 text-sm hover:bg-red-700 disabled:opacity-50"
				>
					Delete
				</button>
				<button
					type="button"
					onClick={onClear}
					disabled={busy}
					className="rounded bg-transparent px-3 py-1 text-sm underline hover:bg-slate-700"
				>
					Clear
				</button>
			</div>
		</div>
	);
};
