import { useEffect, useMemo, useState } from 'react';
import type { Client, Product, Seller } from '../../types';
import { registerSaleOrder } from '../../services/salesService';
import { mergeCartLines, type CartLine } from '../../utils/cart';

type Props = {
	open: boolean;
	products: Product[];
	clients?: Client[];
	sellers?: Seller[];
	tenantId?: string;
	onClose: () => void;
	// The RPC returns the order, not products; the page refetches these SKUs' stock.
	onRegistered: (affectedSkus: string[]) => void;
};

const todayISODate = () => new Date().toISOString().slice(0, 10);

const formatBRL = (value: number) =>
	`R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const SaleOrderModal = ({
	open,
	products,
	clients = [],
	sellers = [],
	tenantId,
	onClose,
	onRegistered,
}: Props) => {
	const [lines, setLines] = useState<CartLine[]>([]);
	const [productId, setProductId] = useState('');
	const [qty, setQty] = useState('1');
	const [unitPrice, setUnitPrice] = useState('');
	const [soldAt, setSoldAt] = useState(todayISODate());
	const [clientId, setClientId] = useState('');
	const [sellerId, setSellerId] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState('');
	const [notice, setNotice] = useState('');

	const sellableProducts = useMemo(() => products.filter((p) => p.is_active !== false), [products]);

	const selectedProduct = useMemo(
		() => products.find((p) => p.id === productId) ?? null,
		[products, productId],
	);

	// Look up a product by its (normalized) SKU so cart lines can show name + stock.
	const productBySku = useMemo(() => {
		const map = new Map<string, Product>();
		products.forEach((p) => map.set(p.sku.trim().toUpperCase(), p));
		return map;
	}, [products]);

	const sortedClients = useMemo(
		() => [...clients].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
		[clients],
	);
	const sortedSellers = useMemo(
		() => [...sellers].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
		[sellers],
	);

	// Reset the whole cart whenever the modal opens.
	useEffect(() => {
		if (!open) return;
		const seed = sellableProducts[0] ?? null;
		setLines([]);
		setProductId(seed?.id ?? '');
		setUnitPrice(seed?.price !== undefined ? String(seed.price) : '');
		setQty('1');
		setSoldAt(todayISODate());
		setClientId('');
		setSellerId('');
		setError('');
		setNotice('');
		setSubmitting(false);
	}, [open, sellableProducts]);

	// Default the unit price to the product's list price when the editor product changes.
	useEffect(() => {
		if (selectedProduct) setUnitPrice(selectedProduct.price !== undefined ? String(selectedProduct.price) : '');
	}, [selectedProduct]);

	if (!open) return null;

	const labelClass = 'block text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground';
	const fieldClass =
		'mt-2 block w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring/60 focus:ring-2 focus:ring-ring/25';

	const editorQty = Number.parseInt(qty, 10);
	const editorPrice = unitPrice.trim() === '' ? null : Number(unitPrice.replace(',', '.'));
	const canAddLine =
		!!selectedProduct &&
		Number.isFinite(editorQty) &&
		editorQty > 0 &&
		(editorPrice === null || Number.isFinite(editorPrice));

	const addLine = () => {
		if (!canAddLine || !selectedProduct) return;
		const sku = selectedProduct.sku.trim().toUpperCase();
		const alreadyInCart = lines.some((l) => l.sku.trim().toUpperCase() === sku);
		const merged = mergeCartLines([...lines, { sku: selectedProduct.sku, qty: editorQty, unitPrice: editorPrice }]);
		setLines(merged);
		setNotice(
			alreadyInCart
				? `Item já no carrinho: somamos a quantidade${editorPrice !== null ? ' e atualizamos o preço para o último informado' : ''}.`
				: '',
		);
		setQty('1');
		setError('');
	};

	const removeLine = (sku: string) => {
		setLines((current) => current.filter((l) => l.sku !== sku));
		setNotice('');
	};

	const lineTotal = (l: CartLine) => (l.unitPrice !== null ? l.unitPrice * l.qty : null);
	const everyLineHasPrice = lines.length > 0 && lines.every((l) => l.unitPrice !== null);
	const orderTotal = everyLineHasPrice ? lines.reduce((sum, l) => sum + l.unitPrice! * l.qty, 0) : null;

	const canSubmit = !!tenantId && lines.length > 0 && !submitting;

	const submit = async () => {
		if (!canSubmit || !tenantId) return;
		setSubmitting(true);
		setError('');
		try {
			await registerSaleOrder({
				tenantId,
				items: mergeCartLines(lines),
				soldAt: new Date(`${soldAt}T12:00:00`).toISOString(),
				clientId: clientId || null,
				sellerId: sellerId || null,
			});
			onRegistered(lines.map((l) => l.sku));
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Não foi possível registrar a venda.');
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
			<div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-[var(--radius-card)] bg-card p-6 shadow-xl">
				<div className="flex items-start justify-between gap-4">
					<div>
						<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
							Nova venda (vários itens)
						</p>
						<p className="mt-2 text-sm text-muted-foreground">
							Monte o carrinho e registre uma única venda com vários produtos.
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
					{/* Line editor */}
					<div className="grid gap-3 rounded-2xl border border-border/40 bg-muted/40 p-4">
						<div>
							<label className={labelClass}>Produto</label>
							<select
								value={productId}
								onChange={(e) => setProductId(e.target.value)}
								className={`${fieldClass} cursor-pointer`}>
								{sellableProducts.length === 0 && <option value="">Nenhum produto disponível</option>}
								{sellableProducts.map((p) => (
									<option key={p.id} value={p.id}>
										{p.sku} — {p.name}
									</option>
								))}
							</select>
							{selectedProduct && (
								<p className="mt-1 text-[11px] text-muted-foreground">Em estoque: {selectedProduct.qty}</p>
							)}
						</div>
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
								<label className={labelClass}>Preço unitário</label>
								<input
									type="number"
									step="0.01"
									value={unitPrice}
									onChange={(e) => setUnitPrice(e.target.value)}
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
						{notice && <p className="text-[11px] text-muted-foreground">{notice}</p>}
					</div>

					{/* Cart lines */}
					<div className="rounded-2xl border border-border/40">
						{lines.length === 0 ? (
							<p className="px-4 py-6 text-center text-sm text-muted-foreground">
								Nenhum item no carrinho. Adicione produtos acima.
							</p>
						) : (
							<ul className="divide-y divide-border/30">
								{lines.map((l) => {
									const product = productBySku.get(l.sku.trim().toUpperCase());
									const overStock = !!product && l.qty > product.qty;
									const total = lineTotal(l);
									return (
										<li key={l.sku} className="flex items-center gap-3 px-4 py-3">
											<div className="min-w-0 flex-1">
												<p className="truncate text-sm font-semibold text-foreground">
													{l.sku}
													{product ? ` — ${product.name}` : ''}
												</p>
												<p className="text-[11px] text-muted-foreground">
													{l.qty} × {l.unitPrice !== null ? formatBRL(l.unitPrice) : '—'}
													{overStock && (
														<span className="ml-2 text-amber-600">
															Atenção: maior que o estoque ({product!.qty}).
														</span>
													)}
												</p>
											</div>
											<span className="text-sm font-semibold text-foreground">
												{total !== null ? formatBRL(total) : '—'}
											</span>
											<button
												type="button"
												onClick={() => removeLine(l.sku)}
												aria-label={`Remover ${l.sku}`}
												className="rounded-full border border-border/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground transition hover:bg-muted">
												Remover
											</button>
										</li>
									);
								})}
							</ul>
						)}
					</div>

					{/* Shared fields */}
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
						<div>
							<label className={labelClass}>Cliente</label>
							<select
								value={clientId}
								onChange={(e) => setClientId(e.target.value)}
								className={`${fieldClass} cursor-pointer`}>
								<option value="">Sem cliente</option>
								{sortedClients.map((c) => (
									<option key={c.id} value={c.id}>
										{c.cidade && c.cidade !== '—' ? `${c.nome} — ${c.cidade}` : c.nome}
									</option>
								))}
							</select>
						</div>
						<div>
							<label className={labelClass}>Vendedor</label>
							<select
								value={sellerId}
								onChange={(e) => setSellerId(e.target.value)}
								className={`${fieldClass} cursor-pointer`}>
								<option value="">Sem vendedor</option>
								{sortedSellers.map((s) => (
									<option key={s.id} value={s.id}>
										{s.nome}
									</option>
								))}
							</select>
						</div>
						<div>
							<label className={labelClass}>Data da venda</label>
							<input
								type="date"
								value={soldAt}
								onChange={(e) => setSoldAt(e.target.value)}
								className={fieldClass}
							/>
						</div>
					</div>

					<div className="flex items-center justify-between rounded-xl bg-muted px-4 py-3">
						<span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
							Total da venda
						</span>
						<span className="text-base font-semibold text-foreground">
							{orderTotal !== null ? formatBRL(orderTotal) : '—'}
						</span>
					</div>

					{error && <p className="text-xs text-rose-500">{error}</p>}
				</div>

				<div className="mt-6 flex justify-end gap-3">
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
						{submitting ? 'Registrando…' : 'Registrar venda'}
					</button>
				</div>
			</div>
		</div>
	);
};
