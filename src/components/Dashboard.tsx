
import { useEffect, useMemo, useState } from 'react';
import { BiListCheck } from 'react-icons/bi';
import { FiUploadCloud } from 'react-icons/fi';
import { LuLogOut } from 'react-icons/lu';
import { useNavigate } from 'react-router-dom';
import { useTenant } from '../context/TenantContext';
import { useTheme } from '../context/ThemeContext';
import { useDashboardData } from '../hooks/useDashboardData';
import {
	resolveEasynumbersLogoStorageUrl,
	resolveEasynumbersLogoUrl,
	resolveMadeBySarkStorageUrl,
	resolveMadeBySarkUrl,
	resolveSarkLogoStorageUrl,
} from '../utils/helpers';
import ClientsPage from './ClientsPage';
import OverviewPage from './OverviewPage';
import ProductsPage from './ProductsPage';
import SellersPage from './SellersPage';
import { Title } from './ui/Primitives';

const Dashboard = ({
	onLogout,
	onOpenStatusForm,
	onOpenImport,
	canImport,
	canOpenStatusForm = false,
	initialPage = 'overview',
	initialSurface = 'dashboard',
}: {
	onLogout: () => void;
	onOpenStatusForm: () => void;
	onOpenImport: () => void;
	canImport: boolean;
	canOpenStatusForm?: boolean;
	initialPage?: 'overview' | 'clientes' | 'vendedores';
	initialSurface?: 'dashboard' | 'products';
}) => {
	const navigate = useNavigate();
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
	const [page, setPage] = useState<'overview' | 'clientes' | 'vendedores'>(initialPage);
	const [surface, setSurface] = useState<'dashboard' | 'products'>(initialSurface);

	const { products, clientes, vendedores, categorySales, history, salesTrend, loading } =
		useDashboardData(tenantId);

	const locations = useMemo(
		() => Array.from(new Set(products.map((p) => p.location))).filter(Boolean),
		[products],
	);

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
		<div className="flex min-h-screen flex-col bg-background text-foreground">
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
									value="all"
									onChange={() => {}}
									className="h-9 cursor-pointer rounded-full border border-border/40 bg-card px-3 text-[11px] uppercase tracking-[0.3em] text-muted-foreground outline-none transition hover:border-border/70 focus:border-ring/60 focus:ring-1 focus:ring-ring/20">
									<option value="all">Todos os locais</option>
									{(locations.length ? locations : ['Loja principal']).map((loc) => (
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
								<button
									type="button"
									onClick={onLogout}
									className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/50 text-xl text-muted-foreground transition hover:border-border hover:text-foreground"
									title="Sair"
									aria-label="Sair">
									<LuLogOut />
								</button>
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
							</Title>
						</div>
							<div className="flex items-center gap-3 text-sm text-muted-foreground">
								<div className="inline-flex rounded-full bg-muted p-1 text-xs font-medium uppercase tracking-[0.25em] text-foreground">
									{(
										[
											{ key: 'overview', label: 'Dashboard', path: '/' },
											{ key: 'clientes', label: 'Clientes', path: '/clients' },
											{ key: 'vendedores', label: 'Vendedores', path: '/sellers' },
										] as const
									).map((tab) => (
										<button
											key={tab.key}
											type="button"
											onClick={() => {
												setPage(tab.key);
												if (tab.key !== 'overview') setSurface('dashboard');
												navigate(tab.path);
											}}
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
							products={products}
							categorySales={categorySales}
							history={history}
							salesTrend={salesTrend}
							primaryColor={primaryColor}
							secondaryColor={secondaryColor}
							onViewAllProducts={() => {
								setSurface('products');
								navigate('/products');
							}}
						/>
					)}

					{page === 'overview' && surface === 'products' && (
						<ProductsPage
							products={products}
							loading={loading}
							onBack={() => {
								setSurface('dashboard');
								navigate('/');
							}}
						/>
					)}

					{page === 'clientes' && (
						<ClientsPage
							clientes={clientes}
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
