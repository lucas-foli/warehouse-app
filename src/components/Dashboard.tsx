
import { useEffect, useMemo, useState } from 'react';
import { BiListCheck } from 'react-icons/bi';
import { FiUploadCloud } from 'react-icons/fi';
import { LuLogOut, LuMenu, LuSettings } from 'react-icons/lu';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTenant } from '../context/TenantContext';
import { useTheme } from '../context/ThemeContext';
import { useDashboardData } from '../hooks/useDashboardData';
import { listProductOptions } from '../services/productOptions';
import type { Product } from '../types';
import {
	buildCategorySalesFromItems,
	buildHistoryFromOrders,
	buildRecentDailySalesFromOrders,
	resolveEasynumbersLogoStorageUrl,
	resolveEasynumbersLogoUrl,
	resolveMadeBySarkStorageUrl,
	resolveMadeBySarkUrl,
	resolveSarkLogoStorageUrl,
} from '../utils/helpers';
import { filterSalesByLocation } from '../utils/salesByLocation';
import { buildStoreFilterOptions } from '../utils/storeFilterOptions';
import ClientsPage from './ClientsPage';
import OrdersPage from './OrdersPage';
import OverviewPage from './OverviewPage';
import ProductsPage from './ProductsPage';
import SellersPage from './SellersPage';
import { Title } from './ui/Primitives';
import { resolveDashboardView } from '../utils/dashboardView';

const Dashboard = ({
	onLogout,
	onOpenStatusForm,
	onOpenImport,
	canImport,
	canOpenStatusForm = false,
	canOpenSettings = false,
	isAdmin = false,
}: {
	onLogout: () => void;
	onOpenStatusForm: () => void;
	onOpenImport: () => void;
	canImport: boolean;
	canOpenStatusForm?: boolean;
	canOpenSettings?: boolean;
	isAdmin?: boolean;
}) => {
	const navigate = useNavigate();
	const location = useLocation();
	const { tenant } = useTenant();
	const tenantId = tenant?.id;
	const { logoUrl, primaryColor, secondaryColor, companyName, uiPreset } = useTheme();
	const madeBySarkUrl = resolveMadeBySarkUrl();
	const madeByFallbackUrl = resolveMadeBySarkStorageUrl();
	const brandLogoFallback = resolveSarkLogoStorageUrl(uiPreset);
	const easynumbersLogo = resolveEasynumbersLogoUrl(uiPreset);
	const easynumbersFallback = resolveEasynumbersLogoStorageUrl(uiPreset);
	const [brandLogoSrc, setBrandLogoSrc] = useState(logoUrl);
	const [madeBySrc, setMadeBySrc] = useState(madeBySarkUrl);
	const [easynumbersSrc, setEasynumbersSrc] = useState(easynumbersLogo);
	const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
	// View is derived from the URL, not local state. This is what makes the
	// browser back/forward buttons work: a history pop changes the path, which
	// re-renders this component with a new resolved view. The in-app tabs and
	// surface toggles below simply navigate(); the URL is the single source of
	// truth for which page/surface is shown.
	const { page, surface } = resolveDashboardView(location.pathname);

	const {
		products,
		setProducts,
		clientes,
		vendedores,
		categorySales,
		history,
		salesTrend,
		clientEvolution,
		salesOrders,
		setSalesOrders,
		salesItems,
		reload,
		loading,
	} = useDashboardData(tenantId);

	const [managedLocations, setManagedLocations] = useState<string[]>([]);
	useEffect(() => {
		if (!tenantId) return;
		void listProductOptions(tenantId, 'local').then(setManagedLocations).catch(() => {});
	}, [tenantId]);

	const locations = useMemo(
		() =>
			buildStoreFilterOptions(
				managedLocations,
				salesOrders.map((o) => o.location),
				products.map((p) => p.location),
			),
		[managedLocations, salesOrders, products],
	);

	const [locationFilter, setLocationFilter] = useState<'all' | string>('all');

	const visibleProducts = useMemo(
		() => (locationFilter === 'all' ? products : products.filter((p) => p.location === locationFilter)),
		[products, locationFilter],
	);

	const visibleSales = useMemo(
		() => filterSalesByLocation(salesOrders, salesItems, locationFilter),
		[salesOrders, salesItems, locationFilter],
	);
	const statusBySku = useMemo(
		() => new Map(products.map((p) => [p.sku, p.status])),
		[products],
	);
	const visibleCategorySales = useMemo(() => {
		if (locationFilter === 'all') return categorySales;
		const voidedNumbers = new Set(
			salesOrders.filter((o) => o.status === 'voided').map((o) => o.order_number),
		);
		const activeItems = visibleSales.items.filter((i) => !voidedNumbers.has(i.order_number));
		return buildCategorySalesFromItems(activeItems, statusBySku);
	}, [locationFilter, categorySales, visibleSales, statusBySku, salesOrders]);
	const visibleHistory = useMemo(() => {
		if (locationFilter === 'all') return history;
		return buildHistoryFromOrders(visibleSales.orders.filter((o) => o.status !== 'voided'));
	}, [locationFilter, history, visibleSales]);
	const visibleSalesTrend = useMemo(() => {
		if (locationFilter === 'all') return salesTrend;
		return buildRecentDailySalesFromOrders(visibleSales.orders.filter((o) => o.status !== 'voided'), 20);
	}, [locationFilter, salesTrend, visibleSales]);

	useEffect(() => {
		setBrandLogoSrc(logoUrl);
	}, [logoUrl]);

	useEffect(() => {
		setMadeBySrc(madeBySarkUrl);
	}, [madeBySarkUrl]);

	useEffect(() => {
		setEasynumbersSrc(easynumbersLogo);
	}, [easynumbersLogo]);

	return (
		<div className="flex min-h-screen flex-col overflow-x-clip bg-background text-foreground">
			<header className="border-b border-border/30 bg-card">
				<div className="flex w-full flex-col gap-4 px-4 py-5 sm:px-10 lg:px-16">
					<div className="flex w-full flex-wrap items-center gap-4">
								<div className="flex items-center gap-5">
							{brandLogoSrc ? (
								<img
									src={brandLogoSrc}
									alt={companyName}
									className="h-8 w-auto object-contain sm:h-9"
									onError={() => {
										if (brandLogoFallback && brandLogoSrc !== brandLogoFallback) {
											setBrandLogoSrc(brandLogoFallback);
										}
									}}
								/>
								) : (
									<h1 className="text-xl font-bold tracking-tight text-foreground">{companyName}</h1>
								)}
								<select
									value={locationFilter}
									onChange={(e) => setLocationFilter(e.target.value)}
									className="hidden sm:block h-9 cursor-pointer rounded-full border border-border/40 bg-card px-3 text-[11px] uppercase tracking-[0.3em] text-muted-foreground outline-none transition hover:border-border/70 focus:border-ring/60 focus:ring-1 focus:ring-ring/20">
									<option value="all">Todos os locais</option>
									{locations.map((loc) => (
										<option key={loc} value={loc}>
											{loc}
										</option>
									))}
								</select>
							</div>
							<div className="ml-auto flex items-center gap-3 text-foreground">
								{easynumbersSrc ? (
									<img
										src={easynumbersSrc}
										alt="EasyNumbers"
										className="pointer-events-none h-8 w-auto sm:h-10 scale-[5.75] z-[-0.5] mr-2"
										onError={() => {
											if (easynumbersFallback && easynumbersSrc !== easynumbersFallback) {
												setEasynumbersSrc(easynumbersFallback);
											}
										}}
									/>
								) : null}
								{/* Desktop: individual icon buttons */}
								<div className="hidden sm:flex items-center gap-3">
									{canImport && (
										<button
											type="button"
											onClick={onOpenImport}
											className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/50 text-xl transition hover:border-border"
											title="Importar dados"
											aria-label="Importar dados">
											<FiUploadCloud />
										</button>
									)}
									{canOpenStatusForm && (
										<button
											type="button"
											onClick={onOpenStatusForm}
											className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/50 text-xl transition hover:border-border"
											title="Atualizar status"
											aria-label="Atualizar status">
											<BiListCheck />
										</button>
									)}
									{canOpenSettings && (
										<button
											type="button"
											onClick={() => navigate('/settings')}
											className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/50 text-xl transition hover:border-border"
											title="Configurações"
											aria-label="Configurações">
											<LuSettings />
										</button>
									)}
									<button
										type="button"
										onClick={onLogout}
										className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/50 text-xl text-muted-foreground transition hover:border-border hover:text-foreground"
										title="Sair"
										aria-label="Sair">
										<LuLogOut />
									</button>
								</div>
								{/* Mobile: hamburger menu */}
								<div className="relative sm:hidden">
									<button
										type="button"
										onClick={() => setHeaderMenuOpen((v) => !v)}
										className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/50 text-xl transition hover:border-border"
										aria-label="Menu">
										<LuMenu />
									</button>
									{headerMenuOpen && (
										<>
											<div
												className="fixed inset-0 z-40"
												onClick={() => setHeaderMenuOpen(false)}
											/>
											<div className="absolute right-0 top-12 z-50 min-w-[200px] rounded-2xl border border-border/40 bg-card py-2 shadow-lg">
												<div className="border-b border-border/20 px-4 py-3">
													<select
														value={locationFilter}
														onChange={(e) => setLocationFilter(e.target.value)}
														className="w-full cursor-pointer bg-transparent text-sm font-medium text-foreground outline-none">
														<option value="all">Todos os locais</option>
														{(locations.length ? locations : ['Loja principal']).map((loc) => (
															<option key={loc} value={loc}>{loc}</option>
														))}
													</select>
												</div>
												{canImport && (
													<button
														type="button"
														onClick={() => { onOpenImport(); setHeaderMenuOpen(false); }}
														className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted">
														<FiUploadCloud className="text-base" />
														Importar dados
													</button>
												)}
												{canOpenStatusForm && (
													<button
														type="button"
														onClick={() => { onOpenStatusForm(); setHeaderMenuOpen(false); }}
														className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted">
														<BiListCheck className="text-base" />
														Atualizar status
													</button>
												)}
												{canOpenSettings && (
													<button
														type="button"
														onClick={() => { navigate('/settings'); setHeaderMenuOpen(false); }}
														className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted">
														<LuSettings className="text-base" />
														Configurações
													</button>
												)}
												<div className="mt-1 border-t border-border/20 pt-1">
													<button
														type="button"
														onClick={() => { onLogout(); setHeaderMenuOpen(false); }}
														className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-muted">
														<LuLogOut className="text-base" />
														Sair
													</button>
												</div>
											</div>
										</>
									)}
								</div>
						</div>
					</div>
				</div>
			</header>

			<main className="flex flex-1 items-stretch px-4 py-8 sm:px-10 lg:px-16">
				<div className="w-full space-y-10 rounded-[var(--radius-card)] border border-border/30 bg-card p-8 shadow-[var(--shadow-card)] sm:p-10">
					<div className="flex flex-wrap items-center justify-between gap-4">
						<div>
							<Title>
								{page === 'overview' && surface === 'dashboard' && 'Como está a operação hoje?'}
								{page === 'overview' && surface === 'products' && 'Produtos'}
								{page === 'clientes' && 'Clientes'}
								{page === 'vendedores' && 'Vendedores'}
								{page === 'vendas' && 'Vendas'}
							</Title>
						</div>
							<div className="w-full overflow-x-auto sm:w-auto">
								<div className="inline-flex rounded-full bg-muted p-1 text-xs font-medium uppercase tracking-[0.25em] text-foreground whitespace-nowrap">
									{(
										[
											{ key: 'overview', label: 'Dashboard', path: '/' },
											{ key: 'clientes', label: 'Clientes', path: '/clients' },
											{ key: 'vendedores', label: 'Vendedores', path: '/sellers' },
											{ key: 'vendas', label: 'Vendas', path: '/sales' },
										] as const
									).map((tab) => (
										<button
											key={tab.key}
											type="button"
											onClick={() => navigate(tab.path)}
											className={`rounded-full px-4 py-2 transition ${page === tab.key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
												}`}>
											{tab.label}
										</button>
									))}
								</div>
							</div>
					</div>

					{page === 'overview' && surface === 'dashboard' && (
						<OverviewPage
							products={visibleProducts}
							categorySales={visibleCategorySales}
							history={visibleHistory}
							salesTrend={visibleSalesTrend}
							primaryColor={primaryColor}
							secondaryColor={secondaryColor}
							onViewAllProducts={() => navigate('/products')}
						/>
					)}

					{page === 'overview' && surface === 'products' && (
						<ProductsPage
							products={visibleProducts}
							clients={clientes}
							sellers={vendedores}
							loading={loading}
							tenantId={tenantId}
							onProductUpdated={(updated) =>
								setProducts((current) => {
									if ((updated as Product & { _deleted?: boolean })._deleted) {
										return current.filter((item) => item.id !== updated.id);
									}
									const idx = current.findIndex((item) => item.id === updated.id);
									if (idx === -1) return [...current, updated];
									const next = [...current];
									next[idx] = { ...next[idx], ...updated };
									return next;
								})
							}
							onSaleRegistered={reload}
							onBack={() => navigate('/')}
						/>
					)}

					{page === 'clientes' && (
						<ClientsPage
							clientes={clientes}
							clientEvolution={clientEvolution}
							primaryColor={primaryColor}
							secondaryColor={secondaryColor}
						/>
					)}

					{page === 'vendedores' && (
						<SellersPage
							vendedores={vendedores}
							primaryColor={primaryColor}
							secondaryColor={secondaryColor}
						/>
					)}

					{page === 'vendas' && (
						<OrdersPage
							salesOrders={salesOrders}
							clientes={clientes}
							vendedores={vendedores}
							tenantId={tenantId}
							isAdmin={isAdmin}
							onVoided={(orderId) => {
								// Optimistic status flip for instant feedback…
								setSalesOrders((cur) =>
									cur.map((o) => (o.id === orderId ? { ...o, status: 'voided' } : o)),
								);
								// …then re-run the loader so restored product stock is reflected.
								reload();
							}}
						/>
					)}
				</div>
			</main>

			<footer className="flex items-center justify-center border-t border-border/20 bg-card px-6 py-4 text-xs uppercase tracking-[0.3em] text-muted-foreground sm:px-10">
				{madeBySrc ? (
					<img
						src={madeBySrc}
						alt="Made by SARK"
						className="h-6 w-auto object-contain sm:h-8 scale-[0.50]"
						onError={() => {
							if (madeByFallbackUrl && madeBySrc !== madeByFallbackUrl) {
								setMadeBySrc(madeByFallbackUrl);
							}
						}}
					/>
				) : (
					<span>Made by SARK</span>
				)}
			</footer>
		</div>
	);
};

export default Dashboard;
