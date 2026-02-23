import { useMemo, useState } from 'react';
import type { Product } from '../types';
import { Card, Section } from './ui/Primitives';

const ProductsPage = ({
	products,
	loading,
	onBack,
}: {
	products: Product[];
	loading: boolean;
	onBack: () => void;
}) => {
	const [productQuery, setProductQuery] = useState('');
	const [productStatusFilter, setProductStatusFilter] = useState<'all' | 'critical' | 'no-photo' | 'zero-stock'>(
		'all',
	);
	const [productLocationFilter, setProductLocationFilter] = useState<'all' | string>('all');

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

	return (
		<Section className="mt-8 space-y-8">
			<div className="flex flex-wrap items-center justify-between gap-4">
					<div>
						<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
							Lista completa de produtos
						</p>
					</div>
					<button
						type="button"
						onClick={onBack}
						className="rounded-full border border-border/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-foreground transition hover:bg-primary hover:text-primary-foreground">
						Voltar ao dashboard
					</button>
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
				<Card interactive={false} className="border border-border/30 bg-muted">
					<div className="overflow-auto max-h-[640px]">
						<table className="min-w-full divide-y divide-black/5 text-sm">
							<thead className="sticky top-0 z-10 bg-muted text-left text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
								<tr>
								<th className="px-4 py-3">Foto</th>
								<th className="px-4 py-3">SKU</th>
								<th className="px-4 py-3">Produto</th>
								<th className="px-4 py-3">Status</th>
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
										<td colSpan={10} className="px-4 py-6 text-center text-muted-foreground">
											Carregando…
										</td>
									</tr>
								)}
								{!loading &&
									filteredProducts.map((product) => (
										<tr key={product.id} className="hover:bg-muted/60">
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
									))}
								{!loading && filteredProducts.length === 0 && (
									<tr>
										<td colSpan={10} className="px-4 py-6 text-center text-muted-foreground">
											Nenhum produto encontrado com os filtros atuais.
										</td>
									</tr>
								)}
						</tbody>
					</table>
				</div>
			</Card>
		</Section>
	);
};

export default ProductsPage;
