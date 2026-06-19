import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { fetchProducts } from '../services/dashboardService';
import { listProductOptions } from '../services/productOptions';
import type { Client, Product, Seller } from '../types';
import { aggregateBulkResults, chunked, type BulkResult } from '../utils/bulk';
import { BulkActionBar } from './products/BulkActionBar';
import { BulkEditFieldPopover, type BulkEditableField } from './products/BulkEditFieldPopover';
import { BulkResultDialog } from './products/BulkResultDialog';
import { ConfirmDialog } from './products/ConfirmDialog';
import { SaleOrderModal } from './products/SaleOrderModal';
import { Card, Section } from './ui/Primitives';

type ProductDraft = {
	id: string;
	name: string;
	sku: string;
	status: string;
	location: string;
	qty: string;
	min: string;
	price: string;
	barcode: string;
	image: string;
};

const ProductsPage = ({
	products,
	clients = [],
	sellers = [],
	loading,
	onBack,
	tenantId,
	onProductUpdated,
	onSaleRegistered,
}: {
	products: Product[];
	clients?: Client[];
	sellers?: Seller[];
	loading: boolean;
	onBack: () => void;
	tenantId?: string;
	onProductUpdated?: (product: Product) => void;
	onSaleRegistered?: () => void;
}) => {
	const [productQuery, setProductQuery] = useState('');
	const [productStatusFilter, setProductStatusFilter] = useState<'all' | 'critical' | 'no-photo' | 'zero-stock'>(
		'all',
	);
	const [productLocationFilter, setProductLocationFilter] = useState<'all' | string>('all');
	const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
	const [editDraft, setEditDraft] = useState<ProductDraft | null>(null);
	const [editDirty, setEditDirty] = useState(false);
	const [editSaving, setEditSaving] = useState(false);
	const [editError, setEditError] = useState('');
	const [isEditPanelOpen, setIsEditPanelOpen] = useState(false);
	const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
	const [fkBlockOpen, setFkBlockOpen] = useState(false);
	const [drawerMode, setDrawerMode] = useState<'edit' | 'create' | null>(null);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [bulkEditOpen, setBulkEditOpen] = useState(false);
	const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);
	const [bulkResultAction, setBulkResultAction] = useState<'updated' | 'deleted'>('updated');
	const [bulkBusy, setBulkBusy] = useState(false);
	const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
	const [saleOrderModalOpen, setSaleOrderModalOpen] = useState(false);
	const [ondeOptions, setOndeOptions] = useState<string[]>([]);
	const [localOptions, setLocalOptions] = useState<string[]>([]);

	useEffect(() => {
		if (!tenantId) return;
		void listProductOptions(tenantId, 'onde').then(setOndeOptions).catch(() => {});
		void listProductOptions(tenantId, 'local').then(setLocalOptions).catch(() => {});
	}, [tenantId]);

	const toggleSelection = (id: string) => {
		setSelectedIds((current) => {
			const next = new Set(current);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	useEffect(() => {
		setSelectedIds(new Set());
	}, [productQuery, productStatusFilter, productLocationFilter]);

	const isCriticalProduct = (p: Product) => {
		const zeroStock = (p.qty || 0) <= 0;
		const noPhoto = !p.image;
		const status = (p.status || '').toLowerCase();
		const criticalStatus =
			status.includes('sem giro') || status.includes('stockout') || status.includes('comprar') || status.includes('em risco');
		return zeroStock || noPhoto || criticalStatus;
	};

	const locations = useMemo(
		() => Array.from(new Set(products.map((p) => p.location))).filter(Boolean),
		[products],
	);

	const statusOptions = useMemo(
		() => Array.from(new Set(products.map((p) => p.status))).filter(Boolean).sort(),
		[products],
	);

	const filteredProducts = useMemo(() => {
		const query = productQuery.trim().toLowerCase();
		return products.filter((p) => {
			if (productLocationFilter !== 'all' && p.location !== productLocationFilter) return false;

			if (productStatusFilter === 'critical' && !isCriticalProduct(p)) return false;
			if (productStatusFilter === 'no-photo' && p.image) return false;
			if (productStatusFilter === 'zero-stock' && (p.qty || 0) > 0) return false;

			if (!query) return true;

			const haystack = `${p.sku} ${p.name} ${p.status} ${p.location}`.toLowerCase();
			return haystack.includes(query);
		});
	}, [products, productLocationFilter, productQuery, productStatusFilter]);

	const startEditProduct = (product: Product) => {
		setSelectedProductId(product.id);
		setEditDraft({
			id: product.id,
			name: product.name,
			sku: product.sku,
			status: product.status || 'ESTOQUE',
			location: product.location || 'Loja principal',
			qty: Number.isFinite(product.qty) ? String(product.qty) : '0',
			min: product.min !== undefined ? String(product.min) : '',
			price: product.price !== undefined ? String(product.price) : '',
			barcode: product.barcode ?? '',
			image: product.image ?? '',
		});
		setEditDirty(false);
		setEditError('');
		setIsEditPanelOpen(true);
		setDrawerMode('edit');
	};

	const startCreateProduct = () => {
		setSelectedProductId(null);
		setEditDraft({
			id: '',
			name: '',
			sku: '',
			status: 'ESTOQUE',
			location: 'Loja principal',
			qty: '0',
			min: '',
			price: '',
			barcode: '',
			image: '',
		});
		setEditDirty(false);
		setEditError('');
		setIsEditPanelOpen(true);
		setDrawerMode('create');
	};

	const updateDraft = (partial: Partial<ProductDraft>) => {
		setEditDraft((current) => (current ? { ...current, ...partial } : current));
		setEditDirty(true);
	};

	const resetDraft = () => {
		if (!selectedProductId) return;
		const product = products.find((item) => item.id === selectedProductId);
		if (product) startEditProduct(product);
	};

	const closeEditPanel = () => {
		setIsEditPanelOpen(false);
		setSelectedProductId(null);
		setEditDraft(null);
		setEditDirty(false);
		setEditError('');
		setDrawerMode(null);
	};

	const parseOptionalNumber = (value: string) => {
		const trimmed = value.trim().replace(',', '.');
		if (!trimmed) return null;
		const parsed = Number(trimmed);
		return Number.isFinite(parsed) ? parsed : null;
	};

	const parseOptionalInteger = (value: string) => {
		const trimmed = value.trim();
		if (!trimmed) return null;
		const parsed = Number.parseInt(trimmed, 10);
		return Number.isFinite(parsed) ? parsed : null;
	};

	const handleSaveDraft = async () => {
		if (!tenantId || !editDraft) return;
		setEditSaving(true);
		setEditError('');

		const qty = parseOptionalInteger(editDraft.qty) ?? 0;
		const min = parseOptionalInteger(editDraft.min);
		const price = parseOptionalNumber(editDraft.price);
		const status = editDraft.status.trim() || 'ESTOQUE';
		const location = editDraft.location.trim() || 'Loja principal';
		const barcode = editDraft.barcode.trim();
		const image = editDraft.image.trim();
		const sku = editDraft.sku.trim();
		const name = editDraft.name.trim();

		if (drawerMode === 'create' && (!sku || !name)) {
			setEditError('SKU and Name are required.');
			setEditSaving(false);
			return;
		}

		const payload = { status, location, qty, min, price, barcode: barcode || null, image: image || null };

		try {
			if (drawerMode === 'create') {
				const { data, error } = await supabase
					.from('products')
					.insert({ ...payload, sku, name, tenant_id: tenantId, is_active: true })
					.select()
					.single();
				if (error) {
					if (error.code === '23505') {
						setEditError(`A product with SKU "${sku}" already exists.`);
					} else {
						throw error;
					}
					return;
				}
				if (data && onProductUpdated) onProductUpdated(data as Product);
				closeEditPanel();
				return;
			}

			const { error } = await supabase
				.from('products')
				.update(payload)
				.eq('id', editDraft.id)
				.eq('tenant_id', tenantId);
			if (error) throw error;

			const existing = products.find((item) => item.id === editDraft.id);
			if (existing && onProductUpdated) {
				onProductUpdated({
					...existing,
					status,
					location,
					qty,
					min: min ?? undefined,
					price: price ?? undefined,
					barcode: barcode || undefined,
					image: image || undefined,
				});
			}
			setEditDirty(false);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Save failed.';
			setEditError(message);
		} finally {
			setEditSaving(false);
		}
	};

	const handleDeleteProduct = async () => {
		if (!tenantId || !editDraft || drawerMode !== 'edit') return;
		setEditSaving(true);
		setEditError('');
		try {
			const { data, error } = await supabase
				.from('products')
				.delete()
				.eq('id', editDraft.id)
				.eq('tenant_id', tenantId)
				.select('id');
			if (error) {
				if (error.code === '23503') {
					setDeleteConfirmOpen(false);
					setFkBlockOpen(true);
					return;
				}
				throw error;
			}
			if (!data || data.length === 0) {
				setEditError("You don't have permission to delete this product.");
				return;
			}
			if (onProductUpdated) {
				const existing = products.find((item) => item.id === editDraft.id);
				// `_deleted` is a signal to Dashboard's onProductUpdated handler to remove the row from state.
				if (existing) onProductUpdated({ ...existing, _deleted: true } as Product & { _deleted: true });
			}
			setDeleteConfirmOpen(false);
			closeEditPanel();
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Delete failed.';
			setEditError(message);
		} finally {
			setEditSaving(false);
		}
	};

	const handleSetInactiveFromFkBlock = async () => {
		if (!tenantId || !editDraft) return;
		setEditSaving(true);
		try {
			const { data, error } = await supabase
				.from('products')
				.update({ is_active: false })
				.eq('id', editDraft.id)
				.eq('tenant_id', tenantId)
				.select('id');
			if (error) throw error;
			if (!data || data.length === 0) {
				setEditError("You don't have permission to update this product.");
				return;
			}
			const existing = products.find((item) => item.id === editDraft.id);
			if (existing && onProductUpdated) onProductUpdated({ ...existing, is_active: false } as Product);
			setFkBlockOpen(false);
			closeEditPanel();
		} catch (err) {
			setEditError(err instanceof Error ? err.message : 'Update failed.');
		} finally {
			setEditSaving(false);
		}
	};

	const handleBulkDelete = async () => {
		if (!tenantId || selectedIds.size === 0) return;
		setBulkBusy(true);
		setBulkDeleteConfirmOpen(false);
		const ids = Array.from(selectedIds);
		const perChunk: BulkResult[] = [];

		for (const chunk of chunked(ids, 500)) {
			// Delete one at a time within the chunk so FK-blocked rows don't fail the whole chunk.
			let succeeded = 0;
			const failed: { id: string; reason: string }[] = [];
			for (const id of chunk) {
				const { data, error } = await supabase
					.from('products')
					.delete()
					.eq('id', id)
					.eq('tenant_id', tenantId)
					.select('id');
				if (error) {
					if (error.code === '23503') {
						failed.push({ id, reason: 'Referenced by sales records' });
					} else {
						failed.push({ id, reason: error.message });
					}
				} else if (!data || data.length === 0) {
					failed.push({ id, reason: 'No permission or row not found' });
				} else {
					succeeded += 1;
				}
			}
			perChunk.push({ succeeded, failed });
		}

		const result = aggregateBulkResults(perChunk);
		setBulkResult(result);
		setBulkResultAction('deleted');
		setBulkBusy(false);

		if (onProductUpdated) {
			const failedSet = new Set(result.failed.map((f) => f.id));
			products.forEach((p) => {
				if (selectedIds.has(p.id) && !failedSet.has(p.id)) {
					onProductUpdated({ ...p, _deleted: true } as Product & { _deleted: true });
				}
			});
		}
		setSelectedIds(new Set());
	};

	const handleBulkEditField = async (field: BulkEditableField, value: unknown) => {
		if (!tenantId || selectedIds.size === 0) return;
		setBulkBusy(true);
		setBulkEditOpen(false);
		const ids = Array.from(selectedIds);
		const perChunk: BulkResult[] = [];

		for (const chunk of chunked(ids, 500)) {
			const { data, error } = await supabase
				.from('products')
				.update({ [field]: value })
				.in('id', chunk)
				.eq('tenant_id', tenantId)
				.select('id');
			if (error) {
				perChunk.push({ succeeded: 0, failed: chunk.map((id) => ({ id, reason: error.message })) });
			} else {
				const updatedIds = new Set((data ?? []).map((r) => r.id));
				const failed = chunk.filter((id) => !updatedIds.has(id)).map((id) => ({ id, reason: 'No permission or row not found' }));
				perChunk.push({ succeeded: updatedIds.size, failed });
			}
		}

		const result = aggregateBulkResults(perChunk);
		setBulkResult(result);
		setBulkResultAction('updated');
		setBulkBusy(false);

		if (onProductUpdated) {
			products.forEach((p) => {
				if (selectedIds.has(p.id) && !result.failed.some((f) => f.id === p.id)) {
					onProductUpdated({ ...p, [field]: value } as Product);
				}
			});
		}
		setSelectedIds(new Set());
	};

	// A multi-line order moves stock for several SKUs at once; the RPC returns the
	// order, not products, so refetch the affected products and patch them in place.
	const handleOrderRegistered = async (affectedSkus: string[]) => {
		// Recompute the seller/client rollups (Vendedores/Clientes tabs) so the new
		// sale shows up without a manual reload.
		onSaleRegistered?.();
		if (!tenantId || !onProductUpdated) return;
		const wanted = new Set(affectedSkus.map((s) => s.trim().toUpperCase()));
		try {
			const fresh = await fetchProducts(tenantId);
			fresh.forEach((p) => {
				if (wanted.has(p.sku.trim().toUpperCase())) onProductUpdated(p);
			});
		} catch {
			/* a failed refresh just leaves stale stock numbers until the next load */
		}
	};

	return (
		<Section className="mt-8 space-y-8">
			<div className="flex flex-wrap items-center justify-between gap-4">
					<div>
						<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
							Lista completa de produtos
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							onClick={onBack}
							className="rounded-full border border-border/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-foreground transition hover:bg-primary hover:text-primary-foreground">
							Voltar ao dashboard
						</button>
						<button
							type="button"
							onClick={startCreateProduct}
							className="rounded-full border border-border/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-foreground transition hover:bg-primary hover:text-primary-foreground">
							Novo produto
						</button>
						<button
							type="button"
							onClick={() => setSaleOrderModalOpen(true)}
							className="rounded-full bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary-foreground transition hover:opacity-90">
							Registrar venda
						</button>
					</div>
				</div>
				<div className="flex flex-wrap items-center gap-3">
				<input
					type="search"
					value={productQuery}
						onChange={(e) => setProductQuery(e.target.value)}
						placeholder="Buscar por SKU, nome ou status"
						className="min-w-[260px] flex-1 rounded-full border border-input bg-muted px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none transition focus:border-ring/60 focus:bg-card"
					/>
				<div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.2em]">
					{[
						{ key: 'all', label: 'Todos' },
						{ key: 'critical', label: 'Críticos' },
						{ key: 'no-photo', label: 'Sem foto' },
						{ key: 'zero-stock', label: 'Estoque zerado' },
					].map((filter) => (
						<button
							key={filter.key}
								type="button"
								onClick={() => setProductStatusFilter(filter.key as typeof productStatusFilter)}
								className={`rounded-full border px-3 py-1 font-semibold transition ${productStatusFilter === filter.key
									? 'border-primary bg-primary text-primary-foreground'
									: 'border-border/40 bg-muted text-muted-foreground hover:text-foreground'
									}`}>
								{filter.label}
							</button>
						))}
				</div>
				{locations.length > 1 && (
							<select
								value={productLocationFilter}
								onChange={(e) => setProductLocationFilter(e.target.value === 'all' ? 'all' : e.target.value)}
								className="h-9 cursor-pointer rounded-full border border-input bg-muted px-3 text-[11px] uppercase tracking-[0.3em] text-muted-foreground outline-none transition hover:border-border/70 focus:border-ring/60 focus:bg-card">
								<option value="all">Todos os locais</option>
								{locations.map((loc) => (
									<option key={loc} value={loc}>
										{loc}
							</option>
						))}
					</select>
				)}
			</div>
				<div className={`grid grid-cols-1 gap-6 ${isEditPanelOpen ? 'lg:grid-cols-[minmax(0,1fr)_340px]' : ''}`}>
					<Card interactive={false} className="border border-border/30 bg-muted">
						<div className="md:max-h-[640px] md:overflow-auto">
							<BulkActionBar
								selectedCount={selectedIds.size}
								busy={bulkBusy}
								onEditField={() => setBulkEditOpen(true)}
								onDelete={() => setBulkDeleteConfirmOpen(true)}
								onClear={() => setSelectedIds(new Set())}
							/>
							{/* Mobile: stacked cards — the wide table is unusable on phones */}
							<div className="grid grid-cols-1 gap-3 md:hidden">
								{loading && (
									<p className="px-1 py-6 text-center text-muted-foreground">Carregando…</p>
								)}
								{!loading && filteredProducts.length === 0 && (
									<p className="px-1 py-6 text-center text-muted-foreground">
										Nenhum produto encontrado com os filtros atuais.
									</p>
								)}
								{!loading &&
									filteredProducts.map((product) => {
										const isSelected = selectedProductId === product.id;
										return (
											<div
												key={product.id}
												role="button"
												tabIndex={0}
												onClick={() => startEditProduct(product)}
												onKeyDown={(e) => {
													if (e.key === 'Enter' || e.key === ' ') {
														e.preventDefault();
														startEditProduct(product);
													}
												}}
												className={`flex cursor-pointer flex-col gap-3 rounded-2xl border border-border/40 bg-card p-4 text-left transition hover:bg-muted/60 ${isSelected ? 'ring-2 ring-primary/40' : ''}`}>
												<div className="flex items-start gap-3">
													<span className="pt-1" onClick={(e) => e.stopPropagation()}>
														<input
															type="checkbox"
															aria-label={`Select ${product.sku}`}
															checked={selectedIds.has(product.id)}
															onChange={() => toggleSelection(product.id)}
														/>
													</span>
													<div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-black/5">
														{product.image ? (
															<img
																src={product.image}
																alt={product.name}
																className="h-full w-full object-cover"
																loading="lazy"
															/>
														) : (
															<div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
																—
															</div>
														)}
													</div>
													<div className="min-w-0 flex-1">
														<p className="line-clamp-2 text-sm font-semibold text-foreground">{product.name}</p>
														<div className="mt-1 flex flex-wrap items-center gap-2">
															<span className="rounded-full bg-black/5 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-foreground">
																{product.status}
															</span>
															<span className="truncate text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
																SKU {product.sku}
															</span>
														</div>
													</div>
												</div>
												<dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
													<div className="flex min-w-0 justify-between gap-2">
														<dt className="text-muted-foreground">Local</dt>
														<dd className="min-w-0 truncate text-right text-foreground">{product.location}</dd>
													</div>
													<div className="flex min-w-0 justify-between gap-2">
														<dt className="text-muted-foreground">Qtd</dt>
														<dd className="text-foreground">{product.qty}</dd>
													</div>
													<div className="flex min-w-0 justify-between gap-2">
														<dt className="text-muted-foreground">Mínimo</dt>
														<dd className="text-foreground">{product.min ?? '—'}</dd>
													</div>
													<div className="flex min-w-0 justify-between gap-2">
														<dt className="text-muted-foreground">Preço</dt>
														<dd className="text-foreground">
															{product.price ? `R$ ${product.price.toLocaleString('pt-BR')}` : '—'}
														</dd>
													</div>
													<div className="flex min-w-0 justify-between gap-2">
														<dt className="text-muted-foreground">Vendido</dt>
														<dd className="text-foreground">
															{product.totalSold ? product.totalSold.toLocaleString('pt-BR') : '—'}
														</dd>
													</div>
													<div className="flex min-w-0 justify-between gap-2">
														<dt className="text-muted-foreground">Cód. barras</dt>
														<dd className="min-w-0 truncate text-right text-foreground">{product.barcode ?? '—'}</dd>
													</div>
												</dl>
											</div>
										);
									})}
							</div>
							<table className="hidden min-w-full divide-y divide-black/5 text-sm md:table">
								<thead className="sticky top-0 z-10 bg-muted text-left text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
									<tr>
									<th className="w-10 px-2 py-2">
										<input
											type="checkbox"
											aria-label="Select all on page"
											checked={filteredProducts.length > 0 && filteredProducts.every((p) => selectedIds.has(p.id))}
											onChange={(e) => {
												if (e.target.checked) setSelectedIds(new Set(filteredProducts.map((p) => p.id)));
												else setSelectedIds(new Set());
											}}
										/>
									</th>
									<th className="px-4 py-3">Foto</th>
									<th className="px-4 py-3">SKU</th>
									<th className="px-4 py-3">Produto</th>
									<th className="px-4 py-3">Onde</th>
									<th className="px-4 py-3">Local</th>
									<th className="px-4 py-3">Qtd</th>
									<th className="px-4 py-3">Mínimo</th>
									<th className="px-4 py-3">Preço</th>
									<th className="px-4 py-3">Total vendido</th>
									<th className="px-4 py-3">Código de barras</th>
								</tr>
							</thead>
								<tbody className="divide-y divide-border/30 bg-card">
									{loading && (
										<tr>
											<td colSpan={11} className="px-4 py-6 text-center text-muted-foreground">
												Carregando…
											</td>
										</tr>
									)}
									{!loading &&
										filteredProducts.map((product) => {
											const isSelected = selectedProductId === product.id;
											return (
												<tr
													key={product.id}
													onClick={() => startEditProduct(product)}
													className={`cursor-pointer hover:bg-muted/60 ${isSelected ? 'bg-primary/10' : ''}`}>
													<td className="w-10 px-2 py-2" onClick={(e) => e.stopPropagation()}>
														<input
															type="checkbox"
															aria-label={`Select ${product.sku}`}
															checked={selectedIds.has(product.id)}
															onChange={() => toggleSelection(product.id)}
														/>
													</td>
													<td className="px-4 py-3">
														<div className="h-12 w-12 overflow-hidden rounded-xl bg-black/5">
															{product.image ? (
																<img
																	src={product.image}
																	alt={product.name}
																	className="h-full w-full object-cover"
																	loading="lazy"
																/>
															) : (
																<div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
																	—
																</div>
															)}
														</div>
													</td>
													<td className="px-4 py-3 font-semibold text-foreground">{product.sku}</td>
													<td className="px-4 py-3 text-foreground">{product.name}</td>
													<td className="px-4 py-3">
														<span className="rounded-full bg-black/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground">
															{product.status}
														</span>
													</td>
													<td className="px-4 py-3 text-foreground">{product.location}</td>
													<td className="px-4 py-3 text-foreground">{product.qty}</td>
													<td className="px-4 py-3 text-foreground">{product.min ?? '—'}</td>
													<td className="px-4 py-3 text-foreground">
														{product.price ? `R$ ${product.price.toLocaleString('pt-BR')}` : '—'}
													</td>
													<td className="px-4 py-3 text-foreground">
														{product.totalSold ? product.totalSold.toLocaleString('pt-BR') : '—'}
													</td>
													<td className="px-4 py-3 text-foreground">{product.barcode ?? '—'}</td>
												</tr>
											);
										})}
									{!loading && filteredProducts.length === 0 && (
										<tr>
											<td colSpan={11} className="px-4 py-6 text-center text-muted-foreground">
												Nenhum produto encontrado com os filtros atuais.
											</td>
										</tr>
									)}
							</tbody>
						</table>
					</div>
				</Card>
				{isEditPanelOpen && (
					<>
						{/* Mobile backdrop */}
						<div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={closeEditPanel} />
						{/* Bottom sheet on mobile, inline sidebar on desktop */}
						<div className="fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] overflow-y-auto md:contents">
						<Card interactive={false} className="rounded-b-none rounded-t-2xl border-0 bg-card md:rounded-[var(--radius-card)] md:border md:border-border/30 md:bg-muted">
						{/* Drag handle – mobile only */}
						<div className="flex justify-center py-2 md:hidden">
							<div className="h-1 w-10 rounded-full bg-border" />
						</div>
						<div className="space-y-6">
							<div className="flex items-start justify-between gap-4">
								<div>
									<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
										{drawerMode === 'create' ? 'New product' : 'Edit product'}
									</p>
									<p className="mt-2 text-sm text-muted-foreground">
										Atualize estoque, status e preço sem depender de CSV.
									</p>
								</div>
								<button
									type="button"
									onClick={closeEditPanel}
									className="rounded-full border border-border/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground transition hover:bg-card">
									Fechar
								</button>
							</div>

							{editDraft ? (
								<>
									{drawerMode === 'edit' && (
										<div className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3">
											<div className="h-12 w-12 overflow-hidden rounded-xl bg-black/5">
												{editDraft.image ? (
													<img
														src={editDraft.image}
														alt={editDraft.name}
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
												<p className="text-sm font-semibold text-foreground">{editDraft.name}</p>
												<p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
													SKU {editDraft.sku}
												</p>
											</div>
										</div>
									)}

									<div className="grid gap-4">
										{drawerMode === 'create' && (
											<>
												<div>
													<label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
														SKU
													</label>
													<input
														value={editDraft.sku}
														onChange={(event) => updateDraft({ sku: event.target.value })}
														placeholder="e.g. STN-001"
														className="mt-2 block w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring/60 focus:ring-2 focus:ring-ring/25"
													/>
												</div>
												<div>
													<label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
														Name
													</label>
													<input
														value={editDraft.name}
														onChange={(event) => updateDraft({ name: event.target.value })}
														placeholder="Product name"
														className="mt-2 block w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring/60 focus:ring-2 focus:ring-ring/25"
													/>
												</div>
											</>
										)}
										<div>
											<label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
												Onde
											</label>
											<select
												value={editDraft.status}
												onChange={(event) => updateDraft({ status: event.target.value })}
												className="mt-2 block w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring/60 focus:ring-2 focus:ring-ring/25">
												{!ondeOptions.includes(editDraft.status) && (
													<option value={editDraft.status}>{editDraft.status || 'Selecione…'}</option>
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
												value={editDraft.location}
												onChange={(event) => updateDraft({ location: event.target.value })}
												className="mt-2 block w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring/60 focus:ring-2 focus:ring-ring/25">
												{!localOptions.includes(editDraft.location) && (
													<option value={editDraft.location}>{editDraft.location || 'Selecione…'}</option>
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
													value={editDraft.qty}
													onChange={(event) => updateDraft({ qty: event.target.value })}
													className="mt-2 block w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring/60 focus:ring-2 focus:ring-ring/25"
												/>
											</div>
											<div>
												<label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
													Mínimo
												</label>
												<input
													type="number"
													value={editDraft.min}
													onChange={(event) => updateDraft({ min: event.target.value })}
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
													value={editDraft.price}
													onChange={(event) => updateDraft({ price: event.target.value })}
													className="mt-2 block w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring/60 focus:ring-2 focus:ring-ring/25"
												/>
											</div>
											<div>
												<label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
													Código de barras
												</label>
												<input
													value={editDraft.barcode}
													onChange={(event) => updateDraft({ barcode: event.target.value })}
													className="mt-2 block w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring/60 focus:ring-2 focus:ring-ring/25"
												/>
											</div>
										</div>
										<div>
											<label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
												URL da imagem
											</label>
											<input
												value={editDraft.image}
												onChange={(event) => updateDraft({ image: event.target.value })}
												className="mt-2 block w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring/60 focus:ring-2 focus:ring-ring/25"
											/>
										</div>
									</div>

									{drawerMode === 'edit' && (
										<div className="mt-8 rounded border border-red-500/30 bg-red-500/10 p-4">
											<h4 className="text-sm font-semibold text-red-500">Danger zone</h4>
											<p className="mt-1 text-xs text-red-500/80">
												Deleting a product is permanent. Products referenced by sales records can't be deleted.
											</p>
											<button
												type="button"
												onClick={() => setDeleteConfirmOpen(true)}
												className="mt-3 rounded border border-red-500/40 bg-transparent px-3 py-1.5 text-sm font-medium text-red-500 hover:bg-red-500/10 disabled:opacity-50"
												disabled={editSaving}
											>
												Delete product
											</button>
										</div>
									)}

									<div className="flex flex-wrap items-center gap-2">
										<button
											type="button"
											onClick={handleSaveDraft}
											disabled={!editDirty || editSaving || !tenantId}
											className="rounded-full bg-primary px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
											{editSaving ? 'Salvando…' : 'Salvar ajustes'}
										</button>
										<button
											type="button"
											onClick={resetDraft}
											disabled={!editDirty || editSaving}
											className="rounded-full border border-border/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">
											Descartar
										</button>
										{editDirty && !editSaving && (
											<span className="text-xs text-muted-foreground">Alterações pendentes</span>
										)}
									</div>

									{editError && <p className="text-xs text-rose-500">{editError}</p>}
								</>
							) : (
								<div className="rounded-2xl border border-dashed border-border/60 bg-card px-4 py-6 text-sm text-muted-foreground">
									Selecione um produto na lista para ajustar.
								</div>
							)}
						</div>
					</Card>
					</div>{/* end bottom-sheet wrapper */}
				</>
				)}
			</div>
		<ConfirmDialog
			open={deleteConfirmOpen}
			title="Delete product?"
			message={`Delete "${editDraft?.name}"? This cannot be undone.`}
			confirmLabel="Delete"
			destructive
			onConfirm={handleDeleteProduct}
			onCancel={() => setDeleteConfirmOpen(false)}
		/>
		<ConfirmDialog
			open={fkBlockOpen}
			title="Can't delete"
			message={`"${editDraft?.name}" has sales records and can't be deleted. Set it inactive instead?`}
			confirmLabel="Set inactive"
			onConfirm={handleSetInactiveFromFkBlock}
			onCancel={() => setFkBlockOpen(false)}
		/>
		<ConfirmDialog
			open={bulkDeleteConfirmOpen}
			title={`Delete ${selectedIds.size} products?`}
			message="This cannot be undone. Products referenced by sales records will be skipped."
			confirmLabel="Delete"
			destructive
			onConfirm={handleBulkDelete}
			onCancel={() => setBulkDeleteConfirmOpen(false)}
		/>
		<BulkEditFieldPopover
			open={bulkEditOpen}
			count={selectedIds.size}
			statusOptions={ondeOptions.length ? ondeOptions : statusOptions}
			locationOptions={localOptions.length ? localOptions : locations}
			onApply={handleBulkEditField}
			onCancel={() => setBulkEditOpen(false)}
		/>
		<SaleOrderModal
			open={saleOrderModalOpen}
			products={products}
			clients={clients}
			sellers={sellers}
			initialProductId={selectedProductId}
			tenantId={tenantId}
			onClose={() => setSaleOrderModalOpen(false)}
			onRegistered={handleOrderRegistered}
		/>
		<BulkResultDialog
			open={bulkResult !== null}
			result={bulkResult}
			action={bulkResultAction}
			onClose={() => setBulkResult(null)}
		/>
		</Section>
	);
};

export default ProductsPage;
