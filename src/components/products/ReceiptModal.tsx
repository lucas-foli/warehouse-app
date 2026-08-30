import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { Product } from '../../types';
import { registerReceipt } from '../../services/receiptService';
import { mergeReceiptLines, receiptTotal, linesNeedingName, type ReceiptLine } from '../../utils/receiptCart';
import { formatCurrency } from '../../utils/currency';
import { Modal } from '../ui/Modal';

type SupplierOption = { id: string; name: string };

type Props = {
	open: boolean;
	products: Product[];
	tenantId?: string;
	onClose: () => void;
	// The RPC returns the receipt, not products; the page refetches these SKUs' stock.
	onRegistered: (affectedSkus: string[]) => void;
};

const todayISODate = () => new Date().toISOString().slice(0, 10);

export const ReceiptModal = ({ open, products, tenantId, onClose, onRegistered }: Props) => {
	// Raw, unmerged pushes — one entry per "Adicionar item" click. Merging this
	// into state on every add (the way `mergeCartLines` does for the sale cart)
	// would tie the merged shape to whatever's mid-edit in the add-item block;
	// merge only happens at read time (display / total / submit), never at write time.
	const [lines, setLines] = useState<ReceiptLine[]>([]);
	const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
	const [supplierId, setSupplierId] = useState('');
	const [receivedAt, setReceivedAt] = useState(todayISODate());
	const [documentNo, setDocumentNo] = useState('');
	const [note, setNote] = useState('');
	const [sku, setSku] = useState('');
	const [qty, setQty] = useState('1');
	const [unitCost, setUnitCost] = useState('');
	const [name, setName] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState('');

	// Look up a product by its (normalized) SKU so lines can show catalog name + balance.
	const productBySku = useMemo(() => {
		const map = new Map<string, Product>();
		products.forEach((p) => map.set(p.sku.trim().toUpperCase(), p));
		return map;
	}, [products]);

	// linesNeedingName normalizes this set internally — pass the catalog SKUs as-is.
	const knownSkus = useMemo(() => new Set(products.map((p) => p.sku)), [products]);

	const sortedSuppliers = useMemo(
		() => [...suppliers].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
		[suppliers],
	);

	useEffect(() => {
		if (!tenantId) return;
		let cancelled = false;
		(async () => {
			const { data, error: fetchError } = await supabase
				.from('suppliers')
				.select('id, name')
				.eq('tenant_id', tenantId);
			if (cancelled || fetchError || !data) return;
			setSuppliers(data as SupplierOption[]);
		})();
		return () => {
			cancelled = true;
		};
	}, [tenantId]);

	// Reset the whole draft whenever the modal opens.
	useEffect(() => {
		if (!open) return;
		setLines([]);
		setSupplierId('');
		setReceivedAt(todayISODate());
		setDocumentNo('');
		setNote('');
		setSku('');
		setQty('1');
		setUnitCost('');
		setName('');
		setError('');
		setSubmitting(false);
	}, [open]);

	const labelClass = 'block text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground';
	const fieldClass =
		'mt-2 block w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring/60 focus:ring-2 focus:ring-ring/25';

	const skuNorm = sku.trim().toUpperCase();
	const matchedProduct = skuNorm ? (productBySku.get(skuNorm) ?? null) : null;
	const isNewSku = skuNorm !== '' && !matchedProduct;

	const editorQty = Number.parseInt(qty, 10);
	const editorCost = unitCost.trim() === '' ? null : Number(unitCost.replace(',', '.'));
	// A brand-new SKU has no catalog name to fall back on, so the name has to be
	// captured here, before the line is added — there's no later per-line editor.
	const canAddLine =
		skuNorm !== '' &&
		Number.isInteger(editorQty) &&
		editorQty > 0 &&
		(editorCost === null || Number.isFinite(editorCost)) &&
		(!isNewSku || name.trim() !== '');

	const addLine = () => {
		if (!canAddLine) return;
		setLines((current) => [
			...current,
			{ sku, qty: editorQty, unitCost: editorCost, name: isNewSku ? name.trim() : '' },
		]);
		setSku('');
		setQty('1');
		setUnitCost('');
		setName('');
		setError('');
	};

	// Removes the whole merged group for a SKU, in case the user added it more than once.
	const removeLine = (targetSku: string) => {
		const norm = targetSku.trim().toUpperCase();
		setLines((current) => current.filter((l) => l.sku.trim().toUpperCase() !== norm));
	};

	// Merged view for display, totals and validation — never fed back into `lines`.
	const displayLines = useMemo(() => mergeReceiptLines(lines), [lines]);
	const needingName = useMemo(() => linesNeedingName(lines, knownSkus), [lines, knownSkus]);
	const batchTotal = useMemo(() => receiptTotal(displayLines), [displayLines]);

	const canSubmit = !!tenantId && !!supplierId && lines.length > 0 && needingName.length === 0 && !submitting;

	const submit = async () => {
		if (!canSubmit || !tenantId) return;
		setSubmitting(true);
		setError('');
		try {
			await registerReceipt({
				tenantId,
				supplierId,
				items: lines,
				receivedAt: new Date(`${receivedAt}T12:00:00`).toISOString(),
				document: documentNo || null,
				note: note || null,
			});
			onRegistered(displayLines.map((l) => l.sku));
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Não foi possível registrar a entrada.');
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Modal open={open} onClose={onClose} size="lg" labelledById="receipt-title">
			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6 pt-2 sm:pt-6">
				<div className="flex items-start justify-between gap-4">
					<div>
						<p
							id="receipt-title"
							className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
							Novo recebimento
						</p>
						<p className="mt-2 text-sm text-muted-foreground">
							Registre um lote de mercadoria recebida de um fornecedor.
						</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="rounded-full border border-border/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground transition hover:bg-muted">
						Fechar
					</button>
				</div>

				<div className="mt-6 grid gap-4 overflow-y-auto pr-1">
					{/* Header fields */}
					<div>
						<label className={labelClass}>Fornecedor *</label>
						<select
							value={supplierId}
							onChange={(e) => setSupplierId(e.target.value)}
							className={`${fieldClass} cursor-pointer`}>
							<option value="">Selecione um fornecedor</option>
							{sortedSuppliers.map((s) => (
								<option key={s.id} value={s.id}>
									{s.name}
								</option>
							))}
						</select>
					</div>
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
						<div>
							<label className={labelClass}>Chegou em *</label>
							<input
								type="date"
								value={receivedAt}
								onChange={(e) => setReceivedAt(e.target.value)}
								className={fieldClass}
							/>
						</div>
						<div>
							<label className={labelClass}>Documento</label>
							<input
								value={documentNo}
								onChange={(e) => setDocumentNo(e.target.value)}
								placeholder="NF 4471"
								className={fieldClass}
							/>
						</div>
					</div>
					<div>
						<label className={labelClass}>Observação</label>
						<input
							value={note}
							onChange={(e) => setNote(e.target.value)}
							placeholder="Opcional"
							className={fieldClass}
						/>
					</div>

					{/* Lines */}
					<div>
						<p className={labelClass}>Itens · {displayLines.length}</p>
						<div className="mt-2 grid gap-2">
							{displayLines.length === 0 ? (
								<p className="rounded-2xl border border-border/40 px-4 py-6 text-center text-sm text-muted-foreground">
									Nenhum item no lote. Adicione produtos abaixo.
								</p>
							) : (
								displayLines.map((l) => {
									const product = productBySku.get(l.sku) ?? null;
									const isNew = !product;
									const isReactivation = !!product && product.is_active === false;
									return (
										<div key={l.sku} className="grid gap-2">
											{isNew && (
												<div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
													<strong>{l.sku}</strong> não existe no cadastro. Vai ser criado agora, com
													saldo {l.qty} e sem preço de venda. Confira o código antes de salvar. Ele
													também nasce sem local definido — vai aparecer só em &quot;Todos os
													locais&quot; até você editar o cadastro e escolher uma loja.
												</div>
											)}
											{isReactivation && (
												<div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
													<strong>{l.sku}</strong> está desativado. Registrar esta entrada reativa o
													produto e ele volta a aparecer na lista.
												</div>
											)}
											<div className="flex items-center gap-3 rounded-2xl border border-border/40 px-4 py-3">
												<div className="min-w-0 flex-1">
													<p className="truncate text-sm font-semibold text-foreground">
														{l.sku}
														{product ? ` — ${product.name}` : isNew ? ` — ${l.name}` : ''}
													</p>
													<p className="text-[11px] text-muted-foreground">
														{product ? `saldo ${product.qty}` : 'novo produto'}
													</p>
												</div>
												<div className="text-right">
													<p className="text-sm font-semibold text-foreground">+{l.qty}</p>
													<p className="text-[11px] text-muted-foreground">
														{l.unitCost !== null ? `${formatCurrency(l.unitCost)} un` : '—'}
													</p>
												</div>
												<button
													type="button"
													onClick={() => removeLine(l.sku)}
													aria-label={`Remover ${l.sku}`}
													className="rounded-full border border-border/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground transition hover:bg-muted">
													Remover
												</button>
											</div>
										</div>
									);
								})
							)}
						</div>
					</div>

					{/* Add-item block */}
					<div className="grid gap-3 rounded-2xl border border-border/40 bg-muted/40 p-4">
						<div>
							<label className={labelClass}>SKU</label>
							<input
								value={sku}
								onChange={(e) => setSku(e.target.value)}
								placeholder="Digite o SKU"
								className={fieldClass}
							/>
							{skuNorm && (
								<p className="mt-1 text-[11px] text-muted-foreground">
									{matchedProduct
										? `${matchedProduct.name} · saldo atual ${matchedProduct.qty}${
												matchedProduct.is_active === false ? ' · desativado (reativa ao salvar)' : ''
											}`
										: 'SKU novo — o produto será criado ao salvar.'}
								</p>
							)}
						</div>
						{isNewSku && (
							<div>
								<label className={labelClass}>Nome do produto *</label>
								<input
									value={name}
									onChange={(e) => setName(e.target.value)}
									placeholder="Nome do novo produto"
									className={fieldClass}
								/>
							</div>
						)}
						<div className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
							<div>
								<label className={labelClass}>Quantidade</label>
								<input
									type="number"
									min={1}
									value={qty}
									onChange={(e) => setQty(e.target.value)}
									className={fieldClass}
								/>
							</div>
							<div>
								<label className={labelClass}>Custo unitário</label>
								<input
									type="number"
									step="0.01"
									value={unitCost}
									onChange={(e) => setUnitCost(e.target.value)}
									className={fieldClass}
								/>
							</div>
							<button
								type="button"
								onClick={addLine}
								disabled={!canAddLine}
								className="h-[42px] rounded-full bg-primary px-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
								Adicionar item
							</button>
						</div>
					</div>

					{batchTotal !== null && (
						<div className="flex items-center justify-between rounded-xl bg-muted px-4 py-3">
							<span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
								Custo do lote
							</span>
							<span className="text-base font-semibold text-foreground">{formatCurrency(batchTotal)}</span>
						</div>
					)}

					{needingName.length > 0 && (
						<p className="text-xs text-amber-600">
							Informe o nome do produto para: {needingName.join(', ')}.
						</p>
					)}

					{error && <p className="text-xs text-rose-500">{error}</p>}
				</div>
			</div>
			{/* end scrollable body */}
			<div className="flex flex-shrink-0 justify-end gap-3 border-t border-border/20 px-6 py-4">
				<button
					type="button"
					onClick={onClose}
					className="rounded-full border border-border/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground transition hover:bg-muted">
					Cancelar
				</button>
				<button
					type="button"
					onClick={submit}
					disabled={!canSubmit}
					className="rounded-full bg-primary px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
					{submitting ? 'Registrando…' : 'Registrar entrada'}
				</button>
			</div>
		</Modal>
	);
};
