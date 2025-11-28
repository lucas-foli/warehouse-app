
import { useEffect, useMemo, useState } from 'react';
import { BiListCheck } from 'react-icons/bi';
import { LuLogOut } from 'react-icons/lu';
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	Legend,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts';
import type { CategorySale, Client, HistoryItem, KPIs, Product, Seller } from '../types';
import {
	buildCategorySalesFromProducts,
	buildClientEvolutionFromClients,
	buildClientPurchasesTimelineFromClients,
	buildHistoryFromProducts,
	buildMultiSellerPerformance,
	parseCsv,
} from '../utils/helpers';
import { Card, ListItem, Metric, Section, Title } from './ui/Primitives';

const Dashboard = ({ onLogout, onOpenStatusForm }: { onLogout: () => void; onOpenStatusForm: () => void }) => {
	const [loading, setLoading] = useState(false);
	const [page, setPage] = useState<'overview' | 'clientes' | 'vendedores'>('overview');
	const [surface, setSurface] = useState<'dashboard' | 'products'>('dashboard');
	const [productQuery, setProductQuery] = useState('');
	const [productStatusFilter, setProductStatusFilter] = useState<'all' | 'critical' | 'no-photo' | 'zero-stock'>(
		'all',
	);
	const [productLocationFilter, setProductLocationFilter] = useState<'all' | string>('all');
	const [products, setProducts] = useState<Product[]>([]);
	const [kpis] = useState<KPIs>({
		faturamento: 574661,
		totalCusto: 53789,
		quantidadeTotal: 2307,
		produtosDistintos: 214,
	});
	const [categorySales, setCategorySales] = useState<CategorySale[]>([]);
	const [history, setHistory] = useState<HistoryItem[]>([]);
	const [clientes, setClientes] = useState<Client[]>([]);
	const [vendedores, setVendedores] = useState<Seller[]>([]);
	const sellerColors = ['#121213', '#afafafff', '#9a9a9a', '#d4d4d4'];

	useEffect(() => {
		const loadData = async () => {
			setLoading(true);

			// Placeholder: substitua por fetch/Supabase.
			const sample = [
				{
					id: '1',
					name: 'Garrafa Térmica 710ml',
					sku: 'GT-710',
					barcode: '7891234567890',
					status: 'ESTOQUE',
					location: 'Brasília Shopping',
					qty: 12,
					min: 2,
					price: 259,
					totalSold: 132,
				},
				{
					id: '2',
					name: 'Copo Térmico 473ml',
					sku: 'CP-473',
					barcode: '7899876543210',
					status: 'VM/GAVETA',
					location: 'Brasília Shopping',
					qty: 5,
					min: 3,
					price: 189,
					totalSold: 89,
					image: 'https://images.unsplash.com/photo-1526402462921-9e9c8fbd1430?auto=format&fit=crop&w=400&q=60',
				},
				{
					id: '3',
					name: 'Mug 1L',
					sku: 'MG-1000',
					barcode: '7890001112223',
					status: 'ESTOQUE',
					location: 'Brasília Shopping',
					qty: 8,
					min: 1,
					price: 299,
					totalSold: 54,
					image: 'https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=400&q=60',
				},
			];
			const sampleCategory = [
				{ name: 'Garrafas', venda: 240000, custo: 139000, share: 38.8 },
				{ name: 'Copos', venda: 86000, custo: 51000, share: 36.6 },
				{ name: 'Canecas', venda: 28000, custo: 14000, share: 8.5 },
				{ name: 'Cuias', venda: 9000, custo: 4000, share: 5.1 },
				{ name: 'Outros', venda: 13000, custo: 8000, share: 11.0 },
			];
			const sampleHistory = [
				{ month: 'Jul/25', value: 120000, quantity: 450 },
				{ month: 'Ago/25', value: 144000, quantity: 520 },
				{ month: 'Set/25', value: 131000, quantity: 480 },
				{ month: 'Out/25', value: 118000, quantity: 430 },
				{ month: 'Nov/25', value: 149000, quantity: 550 },
			];
			const sampleClientes = [
				{ id: 'c1', nome: 'Ana Paula', cidade: 'Brasília/DF', telefone: '(61) 99999-1111', ultimaCompra: '2025-11-14' },
				{
					id: 'c2',
					nome: 'Francine',
					cidade: 'Aparecida de Goiânia/GO',
					telefone: '(61) 99190-8080',
					ultimaCompra: '2025-11-11',
				},
				{ id: 'c3', nome: 'Anselmo', cidade: 'Goiânia/GO', telefone: '(62) 99941-8303', ultimaCompra: '2025-10-20' },
				{ id: 'c4', nome: 'João', cidade: 'Goiânia/GO', telefone: '(62) 99941-8303', ultimaCompra: '2025-11-20' },
				{ id: 'c5', nome: 'Maria', cidade: 'Goiânia/GO', telefone: '(62) 99941-8303', ultimaCompra: '2025-09-20' },
				{ id: 'c6', nome: 'Pedro', cidade: 'Goiânia/GO', telefone: '(62) 99941-8303', ultimaCompra: '2025-09-20' },
			];
			const sampleVendedores = [
				{ id: 'v1', nome: 'Michelle', itens: 792, bruto: 136752.52, liquido: 135451.02, boletos: 426 },
				{ id: 'v2', nome: 'Maria', itens: 776, bruto: 134580.19, liquido: 133203.84, boletos: 409 },
				{ id: 'v3', nome: 'Cecilia', itens: 289, bruto: 31591, liquido: 31497.17, boletos: 111 },
			];
			let parsedProducts: Product[] | [] = [];

			const csvUrl = '/products.csv';
			try {
				const response = await fetch(csvUrl);
				if (!response.ok) throw new Error('Erro ao ler products.csv.');
				const csv = await response.text();
				const parsed = parseCsv(csv);
				parsedProducts = parsed;
			} catch (err) {
				console.error('Falha ao carregar planilha, usando dados mock.', err);
			}

			const hasProductsFromCsv = parsedProducts.length > 0;
			const productsToUse = hasProductsFromCsv ? parsedProducts : sample;
			setProducts(productsToUse);

			const categoryFromCsv = hasProductsFromCsv ? buildCategorySalesFromProducts(parsedProducts) : [];
			const historyFromCsv = hasProductsFromCsv ? buildHistoryFromProducts(parsedProducts) : [];

			setCategorySales(categoryFromCsv.length ? categoryFromCsv : sampleCategory);
			setHistory(historyFromCsv.length ? historyFromCsv : sampleHistory);

			// Fallback independente para clientes e vendedores:
			// se ainda não houver dados reais carregados, usa os mocks.
			setClientes((current) => (current && current.length ? current : sampleClientes));
			setVendedores((current) => (current && current.length ? current : sampleVendedores));

			setLoading(false);
		};

		loadData();
	}, []);

	const estoqueBaixo = products.filter((p) => p.min !== undefined && p.qty < (p.min ?? 0)).length;
	const semFoto = products.filter((p) => !p.image).length;

	const isCriticalProduct = (p: Product) => {
		const zeroStock = (p.qty || 0) <= 0;
		const noPhoto = !p.image;
		const status = (p.status || '').toLowerCase();
		const criticalStatus =
			status.includes('sem giro') || status.includes('stockout') || status.includes('comprar') || status.includes('em risco');
		return zeroStock || noPhoto || criticalStatus;
	};

	const criticalProductIds = new Set(products.filter(isCriticalProduct).map((p) => p.id));
	const criticalItems = criticalProductIds.size;
	const estoqueZerado = products.filter((p) => (p.qty || 0) === 0).length;

	const latestMonth = history[history.length - 1];
	const previousMonth = history[history.length - 2];
	const monthlyRevenue = latestMonth?.value ?? kpis.faturamento;
	const dailyRevenue = monthlyRevenue / 30;
	const monthlyChange =
		latestMonth && previousMonth && previousMonth.value
			? (latestMonth.value - previousMonth.value) / previousMonth.value
			: 0;

	const operationStatusLabel =
		monthlyChange > 0.08 ? 'Acelerando' : monthlyChange < -0.05 ? 'Em atenção' : 'Em linha';
	const operationStatusDetail =
		monthlyChange === 0
			? 'Tendência estável no mês.'
			: monthlyChange > 0
			? `Crescimento de ${(monthlyChange * 100).toFixed(1)}% vs mês anterior.`
			: `Queda de ${Math.abs(monthlyChange * 100).toFixed(1)}% vs mês anterior.`;

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

	const topProducts = useMemo(() => {
		const withSales = [...products]
			.filter((p) => p.totalSold)
			.sort((a, b) => (b.totalSold || 0) - (a.totalSold || 0));

		if (withSales.length) return withSales.slice(0, 5);

		// Mock simples quando não há dados suficientes no CSV
		return [
			{ id: 'top-1', name: 'Quencher Term Text 2.0 Wisteria', sku: '08707', status: 'ESTOQUE', location: 'Brasília Shopping', qty: 5, totalSold: 220 },
			{ id: 'top-2', name: 'Quencher Protour Black Fade', sku: '08659', status: 'ESTOQUE', location: 'Brasília Shopping', qty: 6, totalSold: 185 },
			{ id: 'top-3', name: 'Copo Quencher Sea Foam', sku: '08591', status: 'ESTOQUE', location: 'Brasília Shopping', qty: 4, totalSold: 160 },
			{ id: 'top-4', name: 'Copo Beer Pint Hammertone Green', sku: '08364', status: 'OK', location: 'Brasília Shopping', qty: 61, totalSold: 140 },
			{ id: 'top-5', name: 'Quencher Protour Rose Quartz', sku: '08662', status: 'ESTOQUE', location: 'Brasília Shopping', qty: 4, totalSold: 120 },
		];
	}, [products]);

	const sampleClientEvolution: HistoryItem[] = [
		{ month: 'Ago/25', value: 120 },
		{ month: 'Set/25', value: 180 },
		{ month: 'Out/25', value: 210 },
		{ month: 'Nov/25', value: 260 },
	];

	const sampleClientPurchases: HistoryItem[] = [
		{ month: '10 Nov', value: 18 },
		{ month: '11 Nov', value: 22 },
		{ month: '12 Nov', value: 25 },
		{ month: '13 Nov', value: 27 },
		{ month: '14 Nov', value: 31 },
	];


	const clientEvolutionSeries = buildClientEvolutionFromClients(clientes);
	const clientEvolution = clientEvolutionSeries.length ? clientEvolutionSeries : sampleClientEvolution;


	const clientPurchasesSeries = buildClientPurchasesTimelineFromClients(clientes);
	const clientPurchases = clientPurchasesSeries.length ? clientPurchasesSeries : sampleClientPurchases;
	const maxClientPurchasesValue = clientPurchases.reduce((max, h) => (h.value > max ? h.value : max), 0);

	const sellerPerformanceSeries = buildMultiSellerPerformance(vendedores);
	const sellerPerformance = sellerPerformanceSeries.length ? sellerPerformanceSeries : [];

	const sellerBarData = useMemo(
		() =>
			vendedores.map((v) => ({
				vendedor: v.nome,
				bruto: v.bruto,
				liquido: v.liquido,
			})),
		[vendedores],
	);

	const formatCurrency = (value: number) =>
		`R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

	const renderSellerTooltip = (props: any) => {
		if (!props?.active || !props.payload?.length) return null;
		const { label, payload } = props;
		const bruto = payload.find((p: any) => p.dataKey === 'bruto')?.value ?? 0;
		const liquido = payload.find((p: any) => p.dataKey === 'liquido')?.value ?? 0;
		const total = bruto + liquido;

		return (
			<div className="rounded-xl border border-black/10 bg-white px-4 py-3 text-xs shadow-[0_12px_30px_rgba(0,0,0,0.12)]">
				<p className="mb-2 text-sm font-semibold text-[#1A1A1A]">{label}</p>
				<div className="space-y-1">
					<div className="flex items-center justify-between gap-6">
						<span className="text-[#1f2937]">Valor bruto</span>
						<span className="font-semibold text-[#1f2937]">{formatCurrency(bruto)}</span>
					</div>
					<div className="flex items-center justify-between gap-6">
						<span className="text-[#4b5563]">Valor líquido</span>
						<span className="font-semibold text-[#4b5563]">{formatCurrency(liquido)}</span>
					</div>
					<div className="mt-2 flex items-center justify-between gap-6 border-t border-black/5 pt-2">
						<span className="text-[#1A1A1A]">Total</span>
						<span className="font-semibold text-[#1A1A1A]">{formatCurrency(total)}</span>
					</div>
				</div>
			</div>
		);
	};

	return (
		<div className="flex min-h-screen flex-col bg-[#f9f9f7] text-[#121213]">
			<header className="border-b border-black/5 bg-white">
				<div className="flex w-full flex-col gap-4 px-4 py-5 sm:px-10 lg:px-16">
					<div className="flex w-full flex-wrap items-center gap-4">
						<div className="flex items-center gap-5">
							<img
								src="/Stanley Brandmark Horizontal.avif"
								alt="Stanley"
								className="h-6 w-auto object-contain sm:h-7"
							/>
							<select
								defaultValue="brasilia-shopping"
								className="h-9 rounded-full border border-black/10 bg-white px-3 text-[11px] uppercase tracking-[0.3em] text-[#6f6f6f] outline-none transition hover:border-black/25 focus:border-black/40 focus:ring-1 focus:ring-black/10">
								<option value="brasilia-shopping">Brasília Shopping</option>
								<option value="df-plaza">DF Plaza</option>
							</select>
						</div>
						<div className="ml-auto flex items-center gap-3 text-[#2b2b2b]">
							<img
								src="/easynumbers.png"
								alt="EasyNumbers"
								className="pointer-events-none h-8 w-auto sm:h-10 scale-[5.75] z-[-0.5] mr-2"
							/>
							<button
								type="button"
								onClick={onOpenStatusForm}
								className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/15 text-xl transition hover:border-black/40"
								title="Atualizar status"
								aria-label="Atualizar status">
								<BiListCheck />
							</button>
							<button
								type="button"
								onClick={onLogout}
								className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/15 text-xl text-[#6f6f6f] transition hover:border-black/40 hover:text-black"
								title="Sair"
								aria-label="Sair">
								<LuLogOut />
							</button>
						</div>
					</div>
				</div>
			</header>

			<main className="flex flex-1 items-stretch px-4 py-8 sm:px-10 lg:px-16">
				<div className="w-full space-y-10 rounded-[32px] border border-black/5 bg-white p-8 shadow-[0_35px_90px_rgba(0,0,0,0.08)] sm:p-10">
					<div className="flex flex-wrap items-center justify-between gap-4">
						<div>
							<Title>
								{page === 'overview' && surface === 'dashboard' && 'Como está a operação hoje?'}
								{page === 'overview' && surface === 'products' && 'Produtos'}
								{page === 'clientes' && 'Clientes'}
								{page === 'vendedores' && 'Vendedores'}
							</Title>
						</div>
						<div className="flex items-center gap-3 text-sm text-[#6f6f6f]">
							<div className="inline-flex rounded-full bg-[#F5F5F7] p-1 text-xs font-medium uppercase tracking-[0.25em] text-[#2b2b2b]">
								{(
									[
										{ key: 'overview', label: 'Dashboard' },
										{ key: 'clientes', label: 'Clientes' },
										{ key: 'vendedores', label: 'Vendedores' },
									] as const
								).map((tab) => (
									<button
										key={tab.key}
										type="button"
										onClick={() => {
											setPage(tab.key);
											if (tab.key !== 'overview') setSurface('dashboard');
										}}
										className={`rounded-full px-4 py-2 transition ${
											page === tab.key ? 'bg-[#121213] text-white shadow-sm' : 'text-[#6f6f6f] hover:text-black'
										}`}>
										{tab.label}
									</button>
								))}
							</div>
						</div>
					</div>

					{page === 'overview' && surface === 'dashboard' && (
						<>
							{/* Nível 1 — Overview absoluto */}
							<Section className="mt-8 grid items-stretch gap-8 md:grid-cols-2 xl:grid-cols-4">
								<Card>
									<Metric
										value={Math.max(0, dailyRevenue || 0).toLocaleString('pt-BR', {
											maximumFractionDigits: 0,
										})}
										label="Faturamento do dia"
										prefix="R$ "
										detail={monthlyChange >= 0 ? '⬆︎ Tendência positiva' : '⬇︎ Tendência em atenção'}
									/>
								</Card>
								<Card>
									<Metric
										value={Math.max(0, monthlyRevenue || 0).toLocaleString('pt-BR')}
										label="Faturamento do mês"
										prefix="R$ "
										detail="Visão consolidada do mês atual"
									/>
								</Card>
								<Card>
									<Metric
										value={String(criticalItems)}
										label="Itens críticos"
										detail={`${estoqueZerado} sem estoque • ${semFoto} sem foto • ${estoqueBaixo} abaixo do mínimo`}
									/>
								</Card>
								<Card>
									<Metric value={operationStatusLabel} label="Status da operação" detail={operationStatusDetail} />
								</Card>
							</Section>

							{/* Nível 2 — Seções com propósito */}
							<Section className="grid items-stretch gap-10 xl:grid-cols-2">
								<Card>
									<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#6f6f6f]">
										Alertas importantes
									</p>
									<div className="mt-5 space-y-3 text-sm">
										<ListItem>
											<div className="flex flex-col">
												<span className="text-[#1A1A1A]">Itens com estoque baixo</span>
											</div>
											<span className="text-base font-semibold text-[#1A1A1A]">{estoqueBaixo}</span>
										</ListItem>
										<ListItem>
											<div className="flex flex-col">
												<span className="text-[#1A1A1A]">Itens sem foto</span>
											</div>
											<span className="text-base font-semibold text-[#1A1A1A]">{semFoto}</span>
										</ListItem>
										<ListItem>
											<div className="flex flex-col">
												<span className="text-[#1A1A1A]">Itens sem estoque</span>
											</div>
											<span className="text-base font-semibold text-[#1A1A1A]">{estoqueZerado}</span>
										</ListItem>
									</div>
								</Card>

								<Card>
									<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#6f6f6f]">
										Categorias — vendas e custos
									</p>
									<div className="mt-5 space-y-4">
										{categorySales.slice(0, 5).map((cat) => {
											const share = Math.min(100, cat.share || 0);
											return (
												<div key={cat.name} className="space-y-1.5">
													<div className="flex items-center justify-between text-sm text-[#1A1A1A]">
														<span>{cat.name}</span>
														<span className="text-xs text-[#8a8a8a]">R$ {cat.venda.toLocaleString('pt-BR')}</span>
													</div>
													<div className="flex h-2 overflow-hidden rounded-full bg-white">
														<div className="bg-[#1A1A1A]" style={{ width: `${share}%` }} />
													</div>
													<div className="flex justify-between text-[10px] uppercase tracking-[0.18em] text-[#8a8a8a]">
														<span>Custo: R$ {cat.custo.toLocaleString('pt-BR')}</span>
														<span>Share: {share.toFixed(1)}%</span>
													</div>
												</div>
											);
										})}
									</div>
								</Card>
							</Section>

							<Section className="grid gap-10 xl:grid-cols-2">
								<Card>
									<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#6f6f6f]">
										Tendência mensal
									</p>
									<div className="mt-4 h-56 w-full rounded-xl bg-white/60 p-4">
										<ResponsiveContainer width="100%" height="100%">
											<LineChart data={history}>
												<XAxis
													dataKey="month"
													axisLine={false}
													tickLine={false}
													tick={{ fill: '#6f6f6f', fontSize: 10 }}
													dy={10}
												/>
												<YAxis
													axisLine={false}
													tickLine={false}
													tick={{ fill: '#6f6f6f', fontSize: 10 }}
													tickFormatter={(value) => (value >= 1000 ? `${(value / 1000).toFixed(0)}K` : value)}
												/>
												<Tooltip
													contentStyle={{
														backgroundColor: '#fff',
														borderRadius: '10px',
														border: '1px solid #f0f0f0',
														boxShadow: '0 12px 30px rgba(0,0,0,0.12)',
													}}
													itemStyle={{ fontSize: '12px', fontWeight: 600 }}
													labelStyle={{ fontSize: '12px', color: '#6f6f6f', marginBottom: '8px' }}
													formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR')}`, 'Faturamento']}
												/>
												<Line
													type="monotone"
													dataKey="value"
													stroke="#121213"
													strokeWidth={2.5}
													dot={{ r: 3, fill: '#121213' }}
													activeDot={{ r: 5, strokeWidth: 0 }}
												/>
											</LineChart>
										</ResponsiveContainer>
									</div>
								</Card>

								<Card>
									<div className="flex items-center justify-between gap-4">
										<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#6f6f6f]">
											Top 5 produtos
										</p>
										<button
											type="button"
											onClick={() => {
												setSurface('products');
												setProductStatusFilter('all');
											}}
											className="rounded-full border border-black/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1A1A1A] transition hover:bg-black hover:text-white">
											Ver todos os produtos
										</button>
									</div>
									<div className="mt-5 space-y-3">
										{topProducts.map((product, index) => (
											<ListItem key={product.id}>
												<div className="flex items-center gap-3">
													<span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#F5F5F7] text-[11px] font-semibold text-[#1A1A1A]">
														{index + 1}
													</span>
													<div className="flex flex-col">
														<span className="font-semibold text-[#1A1A1A]">{product.name}</span>
														<span className="text-[11px] uppercase tracking-[0.18em] text-[#8a8a8a]">
															SKU {product.sku}
														</span>
													</div>
												</div>
												<div className="text-right">
													<p className="text-xs uppercase tracking-[0.18em] text-[#8a8a8a]">Vendidos</p>
													<p className="text-sm font-semibold text-[#1A1A1A]">
														{product.totalSold?.toLocaleString('pt-BR') ?? '—'}
													</p>
												</div>
											</ListItem>
										))}
										{!topProducts.length && (
											<p className="text-xs text-[#8a8a8a]">Sem dados suficientes para calcular o ranking.</p>
										)}
									</div>
								</Card>
							</Section>
						</>
					)}

					{page === 'overview' && surface === 'products' && (
						<Section className="mt-8 space-y-8">
							<div className="flex flex-wrap items-center justify-between gap-4">
								<div>
									<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#6f6f6f]">
										Lista completa de produtos
									</p>
								</div>
								<button
									type="button"
									onClick={() => setSurface('dashboard')}
									className="rounded-full border border-black/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#1A1A1A] transition hover:bg-black hover:text-white">
									Voltar ao dashboard
								</button>
							</div>
							<div className="flex flex-wrap items-center gap-3">
								<input
									type="search"
									value={productQuery}
									onChange={(e) => setProductQuery(e.target.value)}
									placeholder="Buscar por SKU, nome ou status"
									className="min-w-[260px] flex-1 rounded-full border border-black/10 bg-[#F5F5F7] px-4 py-2.5 text-sm text-[#1A1A1A] placeholder:text-[#b0b0b0] outline-none transition focus:border-black/40 focus:bg-white"
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
											className={`rounded-full border px-3 py-1 font-semibold transition ${
												productStatusFilter === filter.key
													? 'border-[#121213] bg-[#121213] text-white'
													: 'border-black/10 bg-[#F5F5F7] text-[#6f6f6f] hover:text-[#1A1A1A]'
											}`}>
											{filter.label}
										</button>
									))}
								</div>
								{locations.length > 1 && (
									<select
										value={productLocationFilter}
										onChange={(e) => setProductLocationFilter(e.target.value === 'all' ? 'all' : e.target.value)}
										className="h-9 rounded-full border border-black/10 bg-[#F5F5F7] px-3 text-[11px] uppercase tracking-[0.3em] text-[#6f6f6f] outline-none transition hover:border-black/25 focus:border-black/40 focus:bg-white">
										<option value="all">Todos os locais</option>
										{locations.map((loc) => (
											<option key={loc} value={loc}>
												{loc}
											</option>
										))}
									</select>
								)}
							</div>
							<Card interactive={false} className="border border-black/5 bg-[#F5F5F7]">
								<div className="overflow-auto max-h-[640px]">
									<table className="min-w-full divide-y divide-black/5 text-sm">
										<thead className="sticky top-0 z-10 bg-[#F5F5F7] text-left text-[11px] uppercase tracking-[0.25em] text-[#6f6f6f]">
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
										<tbody className="divide-y divide-black/5 bg-white">
											{loading && (
												<tr>
													<td colSpan={10} className="px-4 py-6 text-center text-[#6f6f6f]">
														Carregando…
													</td>
												</tr>
											)}
											{!loading &&
												filteredProducts.map((product) => (
													<tr key={product.id} className="hover:bg-[#F5F5F7]">
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
																	<div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-[0.2em] text-[#9a9a9a]">
																		—
																	</div>
																)}
															</div>
														</td>
														<td className="px-4 py-3 font-semibold text-[#121213]">{product.sku}</td>
														<td className="px-4 py-3 text-[#2b2b2b]">{product.name}</td>
														<td className="px-4 py-3">
															<span className="rounded-full bg-black/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#121213]">
																{product.status}
															</span>
														</td>
														<td className="px-4 py-3 text-[#2b2b2b]">{product.location}</td>
														<td className="px-4 py-3 text-[#2b2b2b]">{product.qty}</td>
														<td className="px-4 py-3 text-[#2b2b2b]">{product.min ?? '—'}</td>
														<td className="px-4 py-3 text-[#2b2b2b]">
															{product.price ? `R$ ${product.price.toLocaleString('pt-BR')}` : '—'}
														</td>
														<td className="px-4 py-3 text-[#2b2b2b]">
															{product.totalSold ? product.totalSold.toLocaleString('pt-BR') : '—'}
														</td>
														<td className="px-4 py-3 text-[#2b2b2b]">{product.barcode ?? '—'}</td>
													</tr>
												))}
											{!loading && filteredProducts.length === 0 && (
												<tr>
													<td colSpan={10} className="px-4 py-6 text-center text-[#6f6f6f]">
														Nenhum produto encontrado com os filtros atuais.
													</td>
												</tr>
											)}
										</tbody>
									</table>
								</div>
							</Card>
						</Section>
					)}

					{page === 'clientes' && (
						<>
							<Section className="mt-8 grid items-stretch gap-8 sm:grid-cols-2 lg:grid-cols-4">
								<Card>
									<Metric
										value={clientes.length ? clientes.length.toLocaleString('pt-BR') : 0}
										label="Clientes ativos"
									/>
								</Card>
								<Card>
									<Metric
										value={Array.from(new Set(clientes.map((c) => c.cidade))).length.toString()}
										label="Cidades atendidas"
									/>
								</Card>
								<Card>
									<Metric value={new Date(clientes[0]?.ultimaCompra).toLocaleDateString('pt-BR', {
										dateStyle: 'short',
									}) ?? 0} label="Última compra registrada" />
								</Card>
								<Card>
									<Metric value={0} label="Novos no mês" />
								</Card>
							</Section>

							<Section className="grid gap-10 lg:grid-cols-2">
								<Card>
									<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#6f6f6f]">
										Evolução de clientes
									</p>
									<div className="mt-4 h-64 w-full rounded-xl p-4 outline-none [&_.recharts-wrapper]:outline-none">
										<ResponsiveContainer width="100%" height="100%">
											<AreaChart data={clientEvolution}>
												<defs>
													<linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
														<stop offset="5%" stopColor="#121213" stopOpacity={0.12} />
														<stop offset="95%" stopColor="#121213" stopOpacity={0} />
													</linearGradient>
												</defs>
												<CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
												<XAxis
													dataKey="month"
													axisLine={false}
													tickLine={false}
													tick={{ fill: '#6f6f6f', fontSize: 10 }}
													dy={10}
												/>
												<YAxis axisLine={false} tickLine={false} tick={{ fill: '#6f6f6f', fontSize: 10 }} />
												<Tooltip
													contentStyle={{
														backgroundColor: '#fff',
														borderRadius: '8px',
														border: '1px solid #f0f0f0',
														boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
													}}
													itemStyle={{ fontSize: '12px', fontWeight: 600, color: '#121213' }}
													labelStyle={{ fontSize: '12px', color: '#6f6f6f', marginBottom: '8px' }}
													formatter={(value: number) => [value, 'Cliente']}
												/>
												<Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
												<Area
													type="monotone"
													dataKey="value"
													name="Cliente"
													stroke="#121213"
													strokeWidth={2}
													fillOpacity={1}
													fill="url(#colorValue)"
													dot={{ r: 4, fill: '#121213', strokeWidth: 2, stroke: '#fff' }}
													activeDot={{ r: 6, strokeWidth: 0 }}
												/>
											</AreaChart>
										</ResponsiveContainer>
									</div>
								</Card>
								<Card>
									<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#6f6f6f]">
										Últimas compras por data
									</p>
									<div className="mt-4 space-y-3">
										{clientPurchases.map((point) => {
											const width = maxClientPurchasesValue
												? Math.round((point.value / maxClientPurchasesValue) * 100)
												: 0;
											return (
												<div key={point.month} className="space-y-1">
													<div className="flex items-center justify-between text-sm text-[#2b2b2b]">
														<span>{point.month}</span>
														<span className="text-xs text-[#6f6f6f]">
															{point.value.toLocaleString('pt-BR')} clientes
														</span>
													</div>
													<div className="h-2 overflow-hidden rounded-full bg-white">
														<div
															className="h-full bg-gradient-to-r from-[#121213] to-[#4b4b4b]"
															style={{ width: `${width}%` }}
														/>
													</div>
												</div>
											);
										})}
									</div>
								</Card>
							</Section>

							<Section>
								<Card interactive={false} className="border border-black/10 bg-[#F5F5F7]">
									<div className="max-h-[420px] overflow-auto">
										<table className="min-w-full divide-y divide-black/5 text-sm">
											<thead className="bg-[#f6f6f2] text-left text-[11px] uppercase tracking-[0.25em] text-[#6f6f6f]">
												<tr>
													<th className="px-4 py-3">Nome</th>
													<th className="px-4 py-3">Cidade</th>
													<th className="px-4 py-3">Telefone</th>
													<th className="px-4 py-3">Última compra</th>
												</tr>
											</thead>
											<tbody className="divide-y divide-black/5 bg-white">
												{clientes.map((c) => (
													<tr key={c.id} className="hover:bg-[#f9f9f7]">
														<td className="px-4 py-3 font-semibold text-[#121213]">{c.nome}</td>
														<td className="px-4 py-3 text-[#2b2b2b]">{c.cidade}</td>
														<td className="px-4 py-3 text-[#2b2b2b]">{c.telefone ?? '—'}</td>
														<td className="px-4 py-3 text-[#2b2b2b]">{c.ultimaCompra}</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
								</Card>
							</Section>
						</>
					)}

					{page === 'vendedores' && (
						<>
							<Section className="mt-8 grid items-stretch gap-8 sm:grid-cols-2 lg:grid-cols-4">
								<Card>
									<Metric value={vendedores.length.toString()} label="Vendedores ativos" />
								</Card>
								<Card>
									<Metric
										value={
											vendedores.length
												? `R$ ${vendedores.reduce((sum, v) => sum + (v.bruto || 0), 0).toLocaleString('pt-BR')}`
												: '—'
										}
										label="Faturamento combinado"
									/>
								</Card>
								<Card>
									<Metric value={vendedores[0]?.nome ?? '—'} label="Maior faturamento" />
								</Card>
								<Card>
									<Metric value="—" label="Abaixo da meta" />
								</Card>
							</Section>

							<Section className="grid gap-10 lg:grid-cols-2">
								<Card>
									<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#6f6f6f]">
										Performance por período
									</p>
									<div className="mt-4 h-64 w-full rounded-xl p-4 outline-none [&_.recharts-wrapper]:outline-none">
										<ResponsiveContainer width="100%" height="100%">
											<AreaChart data={sellerPerformance}>
												<defs>
													{vendedores.map((v, i) => (
														// usa uma paleta neutra alinhada ao app (preto e cinzas)
														<linearGradient key={v.id} id={`color${v.id}`} x1="0" y1="0" x2="0" y2="1">
															<stop offset="5%" stopColor={sellerColors[i % sellerColors.length]} stopOpacity={0.1} />
															<stop offset="95%" stopColor={sellerColors[i % sellerColors.length]} stopOpacity={0} />
														</linearGradient>
													))}
												</defs>
												<CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
												<XAxis
													dataKey="month"
													axisLine={false}
													tickLine={false}
													tick={{ fill: '#6f6f6f', fontSize: 10 }}
													dy={10}
												/>
												<YAxis
													axisLine={false}
													tickLine={false}
													tick={{ fill: '#6f6f6f', fontSize: 10 }}
													tickFormatter={(value) => (value >= 1000 ? `${(value / 1000).toFixed(0)}K` : value)}
												/>
												<Tooltip
													contentStyle={{
														backgroundColor: '#fff',
														borderRadius: '8px',
														border: '1px solid #f0f0f0',
														boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
													}}
													itemStyle={{ fontSize: '12px', fontWeight: 600 }}
													labelStyle={{ fontSize: '12px', color: '#6f6f6f', marginBottom: '8px' }}
												/>
												<Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
												{vendedores.map((v, i) => (
													<Area
														key={v.id}
														type="monotone"
														dataKey={v.nome}
														name={v.nome}
														stroke={sellerColors[i % sellerColors.length]}
														strokeWidth={2}
														fillOpacity={1}
														fill={`url(#color${v.id})`}
														dot={{
															r: 4,
															fill: sellerColors[i % sellerColors.length],
															strokeWidth: 2,
															stroke: '#fff',
														}}
														activeDot={{ r: 6, strokeWidth: 0 }}
													/>
												))}
											</AreaChart>
										</ResponsiveContainer>
									</div>
								</Card>
								<Card>
									<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#6f6f6f]">
										Faturamento por vendedor
									</p>
									<div className="mt-4 h-64 w-full rounded-xl p-4 outline-none [&_.recharts-wrapper]:outline-none">
										<ResponsiveContainer width="100%" height="100%">
											<BarChart
												data={sellerBarData}
												layout="vertical"
												margin={{ top: 8, right: 24, bottom: 8, left: 0 }}>
												<CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
												<XAxis
													type="number"
													axisLine={false}
													tickLine={false}
													tick={{ fill: '#6f6f6f', fontSize: 10 }}
													tickFormatter={(value) => (value >= 1000 ? `${(value / 1000).toFixed(0)}K` : value)}
												/>
												<YAxis
													type="category"
													dataKey="vendedor"
													axisLine={false}
													tickLine={false}
													tick={{ fill: '#2b2b2b', fontSize: 11 }}
													width={80}
												/>
												<Tooltip content={renderSellerTooltip} />
												<Legend wrapperStyle={{ fontSize: '12px', paddingTop: '6px' }} />
												<Bar
													dataKey="bruto"
													name="Valor bruto"
													stackId="total"
													barSize={14}
													radius={[0, 0, 0, 0]}
													fill="#1f2937"
												/>
												<Bar
													dataKey="liquido"
													name="Valor líquido"
													stackId="total"
													barSize={14}
													radius={[0, 0, 0, 0]}
													fill="#4b5563"
												/>
											</BarChart>
										</ResponsiveContainer>
									</div>
								</Card>
							</Section>

							<Section>
								<Card interactive={false} className="border border-black/10 bg-[#F5F5F7]">
									<div className="overflow-auto">
										<table className="min-w-full divide-y divide-black/5 text-sm">
											<thead className="bg-[#f6f6f2] text-left text-[11px] uppercase tracking-[0.25em] text-[#6f6f6f]">
												<tr>
													<th className="px-4 py-3">Vendedor(a)</th>
													<th className="px-4 py-3">Itens</th>
													<th className="px-4 py-3">Valor bruto</th>
													<th className="px-4 py-3">Valor líquido</th>
													<th className="px-4 py-3">Nº Boletos</th>
												</tr>
											</thead>
											<tbody className="divide-y divide-black/5 bg-white">
												{vendedores.map((v) => (
													<tr key={v.id} className="hover:bg-[#f9f9f7]">
														<td className="px-4 py-3 font-semibold text-[#121213]">{v.nome}</td>
														<td className="px-4 py-3 text-[#2b2b2b]">{v.itens}</td>
														<td className="px-4 py-3 text-[#2b2b2b]">R$ {v.bruto.toLocaleString('pt-BR')}</td>
														<td className="px-4 py-3 text-[#2b2b2b]">R$ {v.liquido.toLocaleString('pt-BR')}</td>
														<td className="px-4 py-3 text-[#2b2b2b]">{v.boletos}</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
								</Card>
							</Section>
						</>
					)}
				</div>
			</main>

			<footer className="flex items-center justify-center border-t border-black/5 bg-white px-6 py-4 text-xs uppercase tracking-[0.3em] text-[#6f6f6f] sm:px-10">
				<img src="/made-by-sark.jpeg" alt="Made by SARK" className="h-6 w-auto object-contain sm:h-8 scale-[0.50]" />
			</footer>
		</div>
	);
};

export default Dashboard;
