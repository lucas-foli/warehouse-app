import { Modal } from '../ui/Modal';
import { canSaveProduct, type ProductDraft } from '../../utils/productForm';

type ProductFormModalProps = {
	open: boolean;
	mode: 'create' | 'edit';
	draft: ProductDraft | null;
	saving: boolean;
	error: string;
	dirty: boolean;
	hasTenant: boolean;
	ondeOptions: string[];
	localOptions: string[];
	onChange: (partial: Partial<ProductDraft>) => void;
	onSave: () => void;
	onReset: () => void;
	onClose: () => void;
	onRequestDelete: () => void;
};

const ProductFormModal = ({
	open,
	mode,
	draft,
	saving,
	error,
	dirty,
	hasTenant,
	ondeOptions,
	localOptions,
	onChange,
	onSave,
	onReset,
	onClose,
	onRequestDelete,
}: ProductFormModalProps) => {
	return (
		<Modal open={open} onClose={onClose} size="lg" mobileSheet labelledById="product-form-title">
			<div className="space-y-6 p-6">
				<div className="flex items-start justify-between gap-4">
					<div>
						<p
							id="product-form-title"
							className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
							{mode === 'create' ? 'New product' : 'Edit product'}
						</p>
						<p className="mt-2 text-sm text-muted-foreground">
							Atualize estoque, status e preço sem depender de CSV.
						</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="rounded-full border border-border/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground transition hover:bg-card">
						Fechar
					</button>
				</div>

				{draft ? (
					<>
						{mode === 'edit' && (
							<div className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3">
								<div className="h-12 w-12 overflow-hidden rounded-xl bg-black/5">
									{draft.image ? (
										<img
											src={draft.image}
											alt={draft.name}
											className="h-full w-full object-cover"
											loading="lazy"
										/>
									) : (
										<div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
											—
										</div>
									)}
								</div>
								<div>
									<p className="text-sm font-semibold text-foreground">{draft.name}</p>
									<p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
										SKU {draft.sku}
									</p>
								</div>
							</div>
						)}

						<div className="grid gap-4">
							{mode === 'create' && (
								<>
									<div>
										<label
											htmlFor="pf-sku"
											className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
											SKU *
										</label>
										<input
											id="pf-sku"
											aria-required="true"
											value={draft.sku}
											onChange={(event) => onChange({ sku: event.target.value })}
											placeholder="e.g. STN-001"
											className={`mt-2 block w-full rounded-xl border bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring/60 focus:ring-2 focus:ring-ring/25 ${!draft.sku.trim() ? 'border-rose-400' : 'border-input'}`}
										/>
									</div>
									<div>
										<label
											htmlFor="pf-name"
											className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
											Name *
										</label>
										<input
											id="pf-name"
											aria-required="true"
											value={draft.name}
											onChange={(event) => onChange({ name: event.target.value })}
											placeholder="Product name"
											className={`mt-2 block w-full rounded-xl border bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring/60 focus:ring-2 focus:ring-ring/25 ${!draft.name.trim() ? 'border-rose-400' : 'border-input'}`}
										/>
									</div>
								</>
							)}
							<div>
								<label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
									Onde
								</label>
								<select
									value={draft.status}
									onChange={(event) => onChange({ status: event.target.value })}
									className="mt-2 block w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring/60 focus:ring-2 focus:ring-ring/25">
									{!ondeOptions.includes(draft.status) && (
										<option value={draft.status}>{draft.status || 'Selecione…'}</option>
									)}
									{ondeOptions.map((opt) => (
										<option key={opt} value={opt}>{opt}</option>
									))}
								</select>
							</div>
							<div>
								<label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
									Local
								</label>
								<select
									value={draft.location}
									onChange={(event) => onChange({ location: event.target.value })}
									className="mt-2 block w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring/60 focus:ring-2 focus:ring-ring/25">
									{!localOptions.includes(draft.location) && (
										<option value={draft.location}>{draft.location || 'Selecione…'}</option>
									)}
									{localOptions.map((opt) => (
										<option key={opt} value={opt}>{opt}</option>
									))}
								</select>
							</div>
							<div className="grid grid-cols-2 gap-3">
								<div>
									<label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
										Qtd
									</label>
									<input
										type="number"
										value={draft.qty}
										onChange={(event) => onChange({ qty: event.target.value })}
										className="mt-2 block w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring/60 focus:ring-2 focus:ring-ring/25"
									/>
								</div>
								<div>
									<label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
										Mínimo
									</label>
									<input
										type="number"
										value={draft.min}
										onChange={(event) => onChange({ min: event.target.value })}
										className="mt-2 block w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring/60 focus:ring-2 focus:ring-ring/25"
									/>
								</div>
							</div>
							<div className="grid grid-cols-2 gap-3">
								<div>
									<label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
										Preço
									</label>
									<input
										type="number"
										step="0.01"
										value={draft.price}
										onChange={(event) => onChange({ price: event.target.value })}
										className="mt-2 block w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring/60 focus:ring-2 focus:ring-ring/25"
									/>
								</div>
								<div>
									<label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
										Código de barras
									</label>
									<input
										value={draft.barcode}
										onChange={(event) => onChange({ barcode: event.target.value })}
										className="mt-2 block w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring/60 focus:ring-2 focus:ring-ring/25"
									/>
								</div>
							</div>
							<div>
								<label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
									URL da imagem
								</label>
								<input
									value={draft.image}
									onChange={(event) => onChange({ image: event.target.value })}
									className="mt-2 block w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring/60 focus:ring-2 focus:ring-ring/25"
								/>
							</div>
						</div>

						{mode === 'edit' && (
							<div className="mt-8 rounded border border-red-500/30 bg-red-500/10 p-4">
								<h4 className="text-sm font-semibold text-red-500">Danger zone</h4>
								<p className="mt-1 text-xs text-red-500/80">
									Deleting a product is permanent. Products referenced by sales records can't be deleted.
								</p>
								<button
									type="button"
									onClick={onRequestDelete}
									className="mt-3 rounded border border-red-500/40 bg-transparent px-3 py-1.5 text-sm font-medium text-red-500 hover:bg-red-500/10 disabled:opacity-50"
									disabled={saving}
								>
									Delete product
								</button>
							</div>
						)}

						<div className="flex flex-wrap items-center gap-2">
							<button
								type="button"
								onClick={onSave}
								disabled={!canSaveProduct(mode, draft, dirty, saving, hasTenant)}
								className="rounded-full bg-primary px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
								{saving ? 'Salvando…' : 'Salvar ajustes'}
							</button>
							<button
								type="button"
								onClick={onReset}
								disabled={!dirty || saving}
								className="rounded-full border border-border/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">
								Descartar
							</button>
							{dirty && !saving && (
								<span className="text-xs text-muted-foreground">Alterações pendentes</span>
							)}
						</div>

						{error && <p className="text-xs text-rose-500">{error}</p>}
					</>
				) : (
					<div className="rounded-2xl border border-dashed border-border/60 bg-card px-4 py-6 text-sm text-muted-foreground">
						Selecione um produto na lista para ajustar.
					</div>
				)}
			</div>
		</Modal>
	);
};

export default ProductFormModal;
