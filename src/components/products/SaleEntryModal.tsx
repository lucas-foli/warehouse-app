import { useEffect, useMemo, useState } from 'react';
import type { Client, Product, Seller } from '../../types';
import { registerSale } from '../../services/salesService';

type Props = {
	open: boolean;
	products: Product[];
	clients?: Client[];
	sellers?: Seller[];
	initialProductId?: string | null;
	tenantId?: string;
	onClose: () => void;
	onRegistered: (updated: Product) => void;
};

const todayISODate = () => new Date().toISOString().slice(0, 10);

export const SaleEntryModal = ({
	open,
	products,
	clients = [],
	sellers = [],
	initialProductId,
	tenantId,
	onClose,
	onRegistered,
}: Props) => {
	const [productId, setProductId] = useState('');
	const [qty, setQty] = useState('1');
	const [unitPrice, setUnitPrice] = useState('');
	const [soldAt, setSoldAt] = useState(todayISODate());
	const [clientId, setClientId] = useState('');
	const [sellerId, setSellerId] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState('');

	const sellableProducts = useMemo(
		() => products.filter((p) => p.is_active !== false),
		[products],
	);

	const selectedProduct = useMemo(
		() => products.find((p) => p.id === productId) ?? null,
		[products, productId],
	);

	const sortedClients = useMemo(
		() => [...clients].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
		[clients],
	);
	const sortedSellers = useMemo(
		() => [...sellers].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
		[sellers],
	);

	// Seed the form when the modal opens (default to the row the user clicked).
	useEffect(() => {
		if (!open) return;
		const seed =
			(initialProductId && products.find((p) => p.id === initialProductId)) || sellableProducts[0] || null;
		setProductId(seed?.id ?? '');
		setUnitPrice(seed?.price !== undefined ? String(seed.price) : '');
		setQty('1');
		setSoldAt(todayISODate());
		setClientId('');
		setSellerId('');
		setError('');
		setSubmitting(false);
	}, [open, initialProductId, products, sellableProducts]);

	// Default the unit price to the product's list price when the product changes.
	useEffect(() => {
		if (selectedProduct) setUnitPrice(selectedProduct.price !== undefined ? String(selectedProduct.price) : '');
	}, [selectedProduct]);

	if (!open) return null;

	const qtyNumber = Number.parseInt(qty, 10);
	const priceNumber = unitPrice.trim() === '' ? null : Number(unitPrice.replace(',', '.'));
	const total =
		priceNumber !== null && Number.isFinite(qtyNumber) ? priceNumber * qtyNumber : null;
	const overStock = !!selectedProduct && Number.isFinite(qtyNumber) && qtyNumber > selectedProduct.qty;
	const canSubmit =
		!!tenantId && !!selectedProduct && Number.isFinite(qtyNumber) && qtyNumber > 0 && !submitting;

	const labelClass =
		'block text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground';
	const fieldClass =
		'mt-2 block w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring/60 focus:ring-2 focus:ring-ring/25';

	const submit = async () => {
		if (!canSubmit || !selectedProduct || !tenantId) return;
		setSubmitting(true);
		setError('');
		try {
			const updated = await registerSale({
				tenantId,
				sku: selectedProduct.sku,
				qty: qtyNumber,
				unitPrice: priceNumber,
				soldAt: new Date(`${soldAt}T12:00:00`).toISOString(),
				clientId: clientId || null,
				sellerId: sellerId || null,
			});
			onRegistered(updated);
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Não foi possível registrar a venda.');
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
			<div className="w-full max-w-md rounded-[var(--radius-card)] bg-card p-6 shadow-xl">
				<div className="flex items-start justify-between gap-4">
					<div>
						<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
							Registrar venda
						</p>
						<p className="mt-2 text-sm text-muted-foreground">
							Baixa o estoque e registra a venda no histórico.
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
							<p className="mt-1 text-[11px] text-muted-foreground">
								Em estoque: {selectedProduct.qty}
							</p>
						)}
					</div>

					<div className="grid grid-cols-2 gap-3">
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
					</div>

					<div className="grid grid-cols-2 gap-3">
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

					<div className="flex items-center justify-between rounded-xl bg-muted px-4 py-3">
						<span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
							Total
						</span>
						<span className="text-base font-semibold text-foreground">
							{total !== null ? `R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
						</span>
					</div>

					{overStock && (
						<p className="text-[11px] text-amber-600">
							Atenção: quantidade maior que o estoque atual. O estoque ficará negativo.
						</p>
					)}
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
