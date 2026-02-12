
import { useEffect, useMemo, useState } from 'react';
import { BiListCheck } from 'react-icons/bi';
import { FiUploadCloud } from 'react-icons/fi';
import { LuLogOut } from 'react-icons/lu';
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	Legend,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis
} from 'recharts';
import type { TooltipContentProps } from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { useTenant } from '../context/TenantContext';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabaseClient';
import type { CategorySale, Client, HistoryItem, KPIs, Product, Seller } from '../types';
import {
	buildCategorySalesFromItems,
	buildCategorySalesFromProducts,
	buildClientEvolutionFromClients,
	buildClientPurchasesTimelineFromClients,
	buildHistoryFromOrders,
	buildHistoryFromProducts,
	buildMultiSellerPerformance,
	resolveEasynumbersLogoStorageUrl,
	resolveEasynumbersLogoUrl,
	resolveMadeBySarkStorageUrl,
	resolveMadeBySarkUrl,
	resolveSarkLogoStorageUrl,
} from '../utils/helpers';
import { Card, ListItem, Metric, Section, Title } from './ui/Primitives';

const SAMPLE_CLIENT_EVOLUTION: HistoryItem[] = [
	{ month: 'Ago/25', value: 120 },
	{ month: 'Set/25', value: 180 },
	{ month: 'Out/25', value: 210 },
	{ month: 'Nov/25', value: 260 },
];

const SAMPLE_CLIENT_PURCHASES: HistoryItem[] = [
	{ month: '10 Nov', value: 18 },
	{ month: '11 Nov', value: 22 },
	{ month: '12 Nov', value: 25 },
	{ month: '13 Nov', value: 27 },
	{ month: '14 Nov', value: 31 },
];

const Dashboard = ({
	onLogout,
	onOpenStatusForm,
	onOpenImport,
	canImport,
}: {
	onLogout: () => void;
	onOpenStatusForm: () => void;
	onOpenImport: () => void;
	canImport: boolean;
}) => {
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
	useEffect(() => {
		setBrandLogoSrc(logoUrl);
	}, [logoUrl]);

	useEffect(() => {
		setMadeBySrc(madeBySarkUrl);
	}, [madeBySarkUrl]);

	useEffect(() => {
		setEasynumbersSrc(easynumbersLogo);
	}, [easynumbersLogo]);
	const [history, setHistory] = useState<HistoryItem[]>([]);
	const [clientes, setClientes] = useState<Client[]>([]);
	const [vendedores, setVendedores] = useState<Seller[]>([]);

	useEffect(() => {
		const loadData = async () => {
			if (!tenantId) return;
			setLoading(true);

			// Placeholder: substitua por fetch/Supabase.
				const sample = [
					{
						id: '1',
						name: 'Produto Exemplo A',
						sku: 'SKU-001',
						barcode: '7891234567890',
						status: 'ESTOQUE',
						location: 'Loja principal',
						qty: 12,
						min: 2,
						price: 259,
						totalSold: 132,
					},
					{
						id: '2',
						name: 'Produto Exemplo B',
						sku: 'SKU-002',
						barcode: '7899876543210',
						status: 'VM/GAVETA',
						location: 'Loja principal',
						qty: 5,
						min: 3,
						price: 189,
						totalSold: 89,
						image: 'https://images.unsplash.com/photo-1526402462921-9e9c8fbd1430?auto=format&fit=crop&w=400&q=60',
					},
					{
						id: '3',
						name: 'Produto Exemplo C',
						sku: 'SKU-003',
						barcode: '7890001112223',
						status: 'ESTOQUE',
						location: 'Loja principal',
						qty: 8,
						min: 1,
						price: 299,
						totalSold: 54,
						image: 'https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=400&q=60',
					},
				];
				const sampleCategory = [
					{ name: 'Categoria A', venda: 240000, custo: 139000, share: 38.8 },
					{ name: 'Categoria B', venda: 86000, custo: 51000, share: 36.6 },
					{ name: 'Categoria C', venda: 28000, custo: 14000, share: 8.5 },
					{ name: 'Categoria D', venda: 9000, custo: 4000, share: 5.1 },
					{ name: 'Outros', venda: 13000, custo: 8000, share: 11.0 },
				];
			// const sampleHistory = [
			// 	{ month: 'Jul/25', value: 120000, quantity: 450 },
			// 	{ month: 'Ago/25', value: 144000, quantity: 520 },
			// 	{ month: 'Set/25', value: 131000, quantity: 480 },
			// 	{ month: 'Out/25', value: 118000, quantity: 430 },
			// 	{ month: 'Nov/25', value: 149000, quantity: 550 },
			// ];
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
			let parsedProducts: Product[] = [];
			let parsedClients: Client[] = [];
			let parsedSellers: Seller[] = [];
			let salesOrders: Array<{
				order_number: string;
				client_id?: string;
				client_external_id?: string;
				seller_id?: string;
				seller_external_id?: string;
				status?: string;
				total_amount?: number;
				sold_at?: string;
			}> = [];
			let salesItems: Array<{
				order_number: string;
				sku?: string;
				qty?: number;
				unit_price?: number;
				total_price?: number;
			}> = [];

			const toText = (value: unknown) => {
				if (typeof value === 'string') return value.trim();
				if (typeof value === 'number') return String(value);
				return '';
			};

			// Fetch products from Supabase
			try {
				let query = supabase.from('products').select('*');
				query = query.eq('tenant_id', tenantId);

				const { data, error } = await query;

				if (error) {
					console.error('Supabase error:', error);
					throw error;
				}

				console.log('Supabase data received:', data?.length || 0, 'products');

				if (data && data.length > 0) {
					// Map Supabase data to Product interface
					parsedProducts = (data as Record<string, unknown>[]).map((row) => {
						const str = (...keys: string[]) => {
							for (const key of keys) {
								const value = row[key];
								if (typeof value === 'string' && value.trim()) return value.trim();
								if (typeof value === 'number') return String(value);
							}
							return '';
						};

						const num = (...keys: string[]) => {
							const value = str(...keys);
							const parsed = Number(value);
							return Number.isFinite(parsed) ? parsed : undefined;
						};

						const currency = (...keys: string[]) => {
							const value = str(...keys);
							if (!value) return undefined;
							const parsed = Number(value.replace(/[^\d,.-]/g, '').replace(',', '.'));
							return Number.isFinite(parsed) ? parsed : undefined;
						};

						return {
							id: str('id') || str('sku') || crypto.randomUUID(),
							name: str('name', 'descricao', 'Descrição'),
							sku: str('sku', 'SKU') || '—',
							barcode: str('barcode', 'Barcode', 'BARCODE', 'codigo_barras') || undefined,
							status: str('status', 'Status') || 'ESTOQUE',
							location: str('location', 'local', 'Local') || 'Loja principal',
							qty:
								num('qty', 'quantidade_estoque', 'Quantidade_Estoque', 'total_estoque', 'Total_Estoque') ?? 0,
							min: num('min', 'estoque_minimo', 'Estoque_Minimo') ?? undefined,
							price: num('price') ?? currency('preco_venda', 'Preço de Venda Normal') ?? undefined,
							totalSold: num('total_sold') ?? undefined,
							image: str('image_url', 'image', 'foto', 'Foto') || undefined,
						};
					});
					console.log('Parsed products:', parsedProducts.length);
				}
			} catch (err) {
				console.error('Failed to load products from Supabase, using mock data.', err);
			}

			// Fetch clients
			try {
				const { data, error } = await supabase.from('clients').select('*').eq('tenant_id', tenantId);
				if (error) throw error;
				parsedClients =
					data?.map((row) => ({
						id: toText(row.id) || crypto.randomUUID(),
						externalId: toText(row.external_id) || undefined,
						nome: toText(row.name) || toText(row.nome) || 'Cliente',
						cidade: toText(row.city) || toText(row.cidade) || '—',
						telefone: toText(row.phone) || toText(row.telefone) || undefined,
						ultimaCompra: toText(row.last_purchase_at) || '',
					})) ?? [];
			} catch (err) {
				console.error('Failed to load clients from Supabase.', err);
			}

			// Fetch sellers
			try {
				const { data, error } = await supabase.from('sellers').select('*').eq('tenant_id', tenantId);
				if (error) throw error;
				parsedSellers =
					data?.map((row) => ({
						id: toText(row.id) || crypto.randomUUID(),
						externalId: toText(row.external_id) || undefined,
						nome: toText(row.name) || toText(row.nome) || toText(row.external_id) || 'Vendedor',
						itens: 0,
						bruto: 0,
						liquido: 0,
						boletos: 0,
					})) ?? [];
			} catch (err) {
				console.error('Failed to load sellers from Supabase.', err);
			}

			// Fetch sales orders
			try {
				const { data, error } = await supabase.from('sales_orders').select('*').eq('tenant_id', tenantId);
				if (error) throw error;
				salesOrders =
					data?.map((row) => ({
						order_number: toText(row.order_number),
						client_id: toText(row.client_id) || undefined,
						client_external_id: toText(row.client_external_id) || undefined,
						seller_id: toText(row.seller_id) || undefined,
						seller_external_id: toText(row.seller_external_id) || undefined,
						status: toText(row.status) || undefined,
						total_amount: Number(row.total_amount),
						sold_at: toText(row.sold_at) || undefined,
					})) ?? [];
			} catch (err) {
				console.error('Failed to load sales orders from Supabase.', err);
			}

			// Fetch sales items
			try {
				const { data, error } = await supabase.from('sales_items').select('*').eq('tenant_id', tenantId);
				if (error) throw error;
				salesItems =
					data?.map((row) => ({
						order_number: toText(row.order_number),
						sku: toText(row.sku) || undefined,
						qty: Number(row.qty),
						unit_price: row.unit_price !== null && row.unit_price !== undefined ? Number(row.unit_price) : undefined,
						total_price: row.total_price !== null && row.total_price !== undefined ? Number(row.total_price) : undefined,
					})) ?? [];
			} catch (err) {
				console.error('Failed to load sales items from Supabase.', err);
			}

			if (salesItems.length) {
				const soldBySku = new Map<string, number>();
				salesItems.forEach((item) => {
					if (!item.sku) return;
					const qty = Number.isFinite(item.qty) ? Number(item.qty) : 0;
					const current = soldBySku.get(item.sku) ?? 0;
					soldBySku.set(item.sku, current + qty);
				});

				parsedProducts = parsedProducts.map((product) => ({
					...product,
					totalSold: soldBySku.get(product.sku) ?? product.totalSold,
				}));
			}

			const hasProductsFromCsv = parsedProducts.length > 0;
			const productsToUse = hasProductsFromCsv ? parsedProducts : sample;
			setProducts(productsToUse);

			const statusBySku = new Map(productsToUse.map((product) => [product.sku, product.status]));
			const categoryFromItems = salesItems.length ? buildCategorySalesFromItems(salesItems, statusBySku) : [];
			const categoryFromProducts = hasProductsFromCsv ? buildCategorySalesFromProducts(parsedProducts) : [];

			const historyFromOrders = salesOrders.length ? buildHistoryFromOrders(salesOrders) : [];
			const historyFromProducts = hasProductsFromCsv ? buildHistoryFromProducts(parsedProducts) : [];

			setCategorySales(
				categoryFromItems.length ? categoryFromItems : categoryFromProducts.length ? categoryFromProducts : sampleCategory,
			);
			setHistory(historyFromOrders.length ? historyFromOrders : historyFromProducts.length ? historyFromProducts : SAMPLE_CLIENT_EVOLUTION);

			if (salesOrders.length) {
				const lastPurchaseByKey = new Map<string, string>();
				salesOrders.forEach((order) => {
					const key = order.client_id || order.client_external_id;
					if (!key || !order.sold_at) return;
					const current = lastPurchaseByKey.get(key);
					if (!current || new Date(order.sold_at) > new Date(current)) {
						lastPurchaseByKey.set(key, order.sold_at);
					}
				});

				if (parsedClients.length) {
					parsedClients = parsedClients.map((client) => {
						if (client.ultimaCompra) return client;
						const key = client.id || client.externalId;
						const lastPurchase = key ? lastPurchaseByKey.get(key) : undefined;
						return lastPurchase ? { ...client, ultimaCompra: lastPurchase } : client;
					});
				}
			}

			const clientsToUse = parsedClients.length ? parsedClients : sampleClientes;
			setClientes(clientsToUse);

			const sellerMap = new Map<string, Seller>();
			parsedSellers.forEach((seller) => {
				const key = seller.externalId || seller.id;
				if (key) sellerMap.set(key, { ...seller });
			});

			const ordersByNumber = new Map<string, { sellerKey?: string }>();
			salesOrders.forEach((order) => {
				const sellerKey = order.seller_external_id || order.seller_id;
				if (order.order_number) ordersByNumber.set(order.order_number, { sellerKey });
				if (!sellerKey) return;
				if (!sellerMap.has(sellerKey)) {
					sellerMap.set(sellerKey, {
						id: sellerKey,
						externalId: order.seller_external_id,
						nome: order.seller_external_id || sellerKey,
						itens: 0,
						bruto: 0,
						liquido: 0,
						boletos: 0,
					});
				}
				const seller = sellerMap.get(sellerKey);
				if (seller && Number.isFinite(order.total_amount)) {
					seller.bruto += Number(order.total_amount);
					seller.liquido = seller.bruto;
				}
				if (seller && order.status && order.status.toLowerCase().includes('boleto')) {
					seller.boletos += 1;
				}
			});

			salesItems.forEach((item) => {
				const orderMeta = ordersByNumber.get(item.order_number);
				const sellerKey = orderMeta?.sellerKey;
				if (!sellerKey) return;
				const seller = sellerMap.get(sellerKey);
				if (!seller) return;
				const qty = Number.isFinite(item.qty) ? Number(item.qty) : 0;
				seller.itens += qty;
			});

			const sellersToUse = sellerMap.size ? Array.from(sellerMap.values()) : sampleVendedores;
			setVendedores(sellersToUse);

			setLoading(false);
		};

		loadData();
	}, [tenantId]);

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
			{ id: 'top-1', name: 'Produto Exemplo A', sku: 'SKU-001', status: 'ESTOQUE', location: 'Loja principal', qty: 5, totalSold: 220 },
			{ id: 'top-2', name: 'Produto Exemplo B', sku: 'SKU-002', status: 'ESTOQUE', location: 'Loja principal', qty: 6, totalSold: 185 },
			{ id: 'top-3', name: 'Produto Exemplo C', sku: 'SKU-003', status: 'ESTOQUE', location: 'Loja principal', qty: 4, totalSold: 160 },
			{ id: 'top-4', name: 'Produto Exemplo D', sku: 'SKU-004', status: 'OK', location: 'Loja principal', qty: 61, totalSold: 140 },
			{ id: 'top-5', name: 'Produto Exemplo E', sku: 'SKU-005', status: 'ESTOQUE', location: 'Loja principal', qty: 4, totalSold: 120 },
		];
	}, [products]);

	const clientEvolutionSeries = buildClientEvolutionFromClients(clientes);
	const clientEvolution = clientEvolutionSeries.length ? clientEvolutionSeries : SAMPLE_CLIENT_EVOLUTION;


	const clientPurchasesSeries = buildClientPurchasesTimelineFromClients(clientes);
	const clientPurchases = clientPurchasesSeries.length ? clientPurchasesSeries : SAMPLE_CLIENT_PURCHASES;
	const maxClientPurchasesValue = clientPurchases.reduce((max, h) => (h.value > max ? h.value : max), 0);

	const sellersSortedByRevenue = useMemo(
		() => [...vendedores].sort((a, b) => (b.bruto || 0) - (a.bruto || 0)),
		[vendedores],
	);
	const sellersForDisplay = useMemo(
		() => (sellersSortedByRevenue.length > 15 ? sellersSortedByRevenue.slice(0, 15) : sellersSortedByRevenue),
		[sellersSortedByRevenue],
	);
	const isSellerListCapped = sellersSortedByRevenue.length > 15;

	const sellerPerformanceSeries = buildMultiSellerPerformance(sellersForDisplay);
	const sellerPerformance = sellerPerformanceSeries.length ? sellerPerformanceSeries : [];

	const sellerBarData = useMemo(
		() =>
			sellersForDisplay.map((v) => ({
				vendedor: v.nome,
				bruto: v.bruto,
				liquido: v.liquido,
			})),
		[sellersForDisplay],
	);

	const formatCurrency = (value: number) =>
		`R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

	const formatMonthYear = (value?: string) => {
		if (!value) return '—';
		const parsed = new Date(value);
		if (!Number.isNaN(parsed.getTime())) {
			return parsed.toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' });
		}
		const direct = value.match(/^(\d{4})-(\d{2})/);
		if (direct) return `${direct[2]}/${direct[1]}`;
		return value;
	};

	const renderSellerTooltip = ({ active, payload, label }: TooltipContentProps<ValueType, NameType>) => {
		if (!active || !payload?.length) return null;
		const bruto = Number(payload.find((p) => p.dataKey === 'bruto')?.value ?? 0) || 0;
		const liquido = Number(payload.find((p) => p.dataKey === 'liquido')?.value ?? 0) || 0;
		const total = bruto + liquido;

			return (
				<div className="rounded-xl border border-border/40 bg-card px-4 py-3 text-xs shadow-[var(--shadow-card)]">
					<p className="mb-2 text-sm font-semibold text-foreground">{label}</p>
					<div className="space-y-1">
						<div className="flex items-center justify-between gap-6">
							<span className="text-muted-foreground">Valor bruto</span>
							<span className="font-semibold text-foreground">{formatCurrency(bruto)}</span>
						</div>
						<div className="flex items-center justify-between gap-6">
							<span className="text-muted-foreground">Valor líquido</span>
							<span className="font-semibold text-foreground">{formatCurrency(liquido)}</span>
						</div>
						<div className="mt-2 flex items-center justify-between gap-6 border-t border-border/30 pt-2">
							<span className="text-muted-foreground">Total</span>
							<span className="font-semibold text-foreground">{formatCurrency(total)}</span>
						</div>
					</div>
				</div>
			);
	};

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
											value={productLocationFilter === 'all' ? 'all' : productLocationFilter}
											onChange={(e) => setProductLocationFilter(e.target.value === 'all' ? 'all' : e.target.value)}
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
								<button
									type="button"
									onClick={onOpenStatusForm}
									className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/50 text-xl transition hover:border-border"
									title="Atualizar status"
									aria-label="Atualizar status">
									<BiListCheck />
								</button>
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
											className={`rounded-full px-4 py-2 transition ${page === tab.key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
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
								<Card className="text-white shadow-lg" style={{ background: `linear-gradient(to bottom right, ${primaryColor}, ${secondaryColor})` }}>
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
										label="Faturamento Total"
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
									<Metric
										value={operationStatusLabel}
										label="Status da operação"
										detail={operationStatusDetail}
										valueClassName="text-3xl sm:text-4xl"
									/>
								</Card>
							</Section>

							{/* Nível 2 — Seções com propósito */}
							<Section className="grid items-stretch gap-10 xl:grid-cols-2">
									<Card>
										<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
											Alertas importantes
										</p>
										<div className="mt-5 space-y-3 text-sm">
											<ListItem>
												<div className="flex flex-col">
													<span className="text-foreground">Itens com estoque baixo</span>
												</div>
												<span className="text-base font-semibold text-foreground">{estoqueBaixo}</span>
											</ListItem>
											<ListItem>
												<div className="flex flex-col">
													<span className="text-foreground">Itens sem foto</span>
												</div>
												<span className="text-base font-semibold text-foreground">{semFoto}</span>
											</ListItem>
											<ListItem>
												<div className="flex flex-col">
													<span className="text-foreground">Itens sem estoque</span>
												</div>
												<span className="text-base font-semibold text-foreground">{estoqueZerado}</span>
											</ListItem>
										</div>
									</Card>

									<Card>
										<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
											Categorias — vendas e custos
										</p>
									<div className="mt-5 space-y-4">
										{categorySales.slice(0, 5).map((cat) => {
											const share = Math.min(100, cat.share || 0);
											return (
												<div key={cat.name} className="space-y-1.5">
														<div className="flex items-center justify-between text-sm" style={{ color: primaryColor }}>
															<span>{cat.name}</span>
															<span className="text-xs text-muted-foreground/80">R$ {cat.venda.toLocaleString('pt-BR')}</span>
														</div>
														<div className="flex h-2 overflow-hidden rounded-full bg-card">
															<div style={{ width: `${share}%`, backgroundColor: primaryColor }} />
														</div>
														<div className="flex justify-between text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80">
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
										<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
											Tendência mensal
										</p>
										<div className="mt-4 h-56 w-full rounded-xl bg-muted/60 p-4">
										<ResponsiveContainer width="100%" height="100%">
											<AreaChart data={history}>
												<defs>
													<linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
														<stop offset="5%" stopColor={primaryColor} stopOpacity={0.3} />
														<stop offset="95%" stopColor={primaryColor} stopOpacity={0} />
													</linearGradient>
												</defs>
												<XAxis
													dataKey="month"
													axisLine={false}
													tickLine={false}
													tick={{ fill: primaryColor, fontSize: 10 }}
													dy={10}
												/>
												<YAxis
													axisLine={false}
													tickLine={false}
													tick={{ fill: primaryColor, fontSize: 10 }}
													tickFormatter={(value) => (value >= 1000 ? `${(value / 1000).toFixed(0)}K` : value)}
												/>
													<Tooltip
														contentStyle={{
															backgroundColor: 'hsl(var(--card))',
															borderRadius: '10px',
															border: '1px solid hsl(var(--border))',
															boxShadow: 'var(--shadow-card)',
														}}
														itemStyle={{ fontSize: '12px', fontWeight: 600 }}
														labelStyle={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', marginBottom: '8px' }}
														formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR')}`, 'Faturamento']}
													/>
												<Area
													type="monotone"
													dataKey="value"
													stroke={primaryColor}
													strokeWidth={2.5}
													fill="url(#colorRevenue)"
													dot={{ r: 3, fill: primaryColor }}
													activeDot={{ r: 5, strokeWidth: 0 }}
												/>
											</AreaChart>
										</ResponsiveContainer>
									</div>
								</Card>

									<Card>
										<div className="flex items-center justify-between gap-4">
											<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
												Top 5 produtos
											</p>
											<button
												type="button"
												onClick={() => {
													setSurface('products');
													setProductStatusFilter('all');
												}}
												className="rounded-full border border-border/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground transition hover:bg-primary hover:text-primary-foreground">
												Ver todos os produtos
											</button>
										</div>
										<div className="mt-5 space-y-3">
											{topProducts.map((product, index) => (
												<ListItem key={product.id}>
													<div className="flex items-center gap-3">
														<span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">
															{index + 1}
														</span>
														<div className="flex flex-col">
															<span className="font-semibold text-foreground">{product.name}</span>
															<span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/80">
																SKU {product.sku}
															</span>
														</div>
													</div>
													<div className="text-right">
														<p className="text-xs uppercase tracking-[0.18em] text-muted-foreground/80">Vendidos</p>
														<p className="text-sm font-semibold text-foreground">
															{product.totalSold?.toLocaleString('pt-BR') ?? '—'}
														</p>
													</div>
												</ListItem>
											))}
											{!topProducts.length && (
												<p className="text-xs text-muted-foreground/80">Sem dados suficientes para calcular o ranking.</p>
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
										<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
											Lista completa de produtos
										</p>
									</div>
									<button
										type="button"
										onClick={() => setSurface('dashboard')}
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
										<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
											Evolução de clientes
										</p>
									<div className="mt-4 h-64 w-full rounded-xl p-4 outline-none [&_.recharts-wrapper]:outline-none">
										<ResponsiveContainer width="100%" height="100%">
											<AreaChart data={clientEvolution}>
												<defs>
													<linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
														<stop offset="5%" stopColor={primaryColor} stopOpacity={0.3} />
														<stop offset="95%" stopColor={primaryColor} stopOpacity={0} />
													</linearGradient>
												</defs>
													<CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
												<XAxis
													dataKey="month"
													axisLine={false}
													tickLine={false}
													tick={{ fill: primaryColor, fontSize: 10 }}
													dy={10}
												/>
												<YAxis axisLine={false} tickLine={false} tick={{ fill: primaryColor, fontSize: 10 }} />
													<Tooltip
														contentStyle={{
															backgroundColor: 'hsl(var(--card))',
															borderRadius: '8px',
															border: '1px solid hsl(var(--border))',
															boxShadow: 'var(--shadow-card)',
														}}
														itemStyle={{ fontSize: '12px', fontWeight: 600, color: 'hsl(var(--foreground))' }}
														labelStyle={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', marginBottom: '8px' }}
														formatter={(value: number) => [value, 'Cliente']}
													/>
												<Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
												<Area
													type="monotone"
													dataKey="value"
													name="Cliente"
													stroke={primaryColor}
														strokeWidth={2}
														fillOpacity={1}
														fill="url(#colorValue)"
														dot={{ r: 4, fill: primaryColor, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
														activeDot={{ r: 6, strokeWidth: 0 }}
													/>
											</AreaChart>
										</ResponsiveContainer>
									</div>
								</Card>
									<Card>
										<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
											Últimas compras por data
										</p>
										<div className="mt-4 space-y-3">
											{clientPurchases.map((point) => {
											const width = maxClientPurchasesValue
												? Math.round((point.value / maxClientPurchasesValue) * 100)
												: 0;
												return (
													<div key={point.month} className="space-y-1">
														<div className="flex items-center justify-between text-sm text-foreground">
															<span>{point.month}</span>
															<span className="text-xs text-muted-foreground">
																{point.value.toLocaleString('pt-BR')} clientes
															</span>
														</div>
														<div className="h-2 overflow-hidden rounded-full bg-muted">
															<div
																className="h-full"
																style={{
																	width: `${width}%`,
																	backgroundImage: `linear-gradient(to right, ${primaryColor}, ${secondaryColor})`,
																}}
															/>
														</div>
													</div>
												);
											})}
										</div>
									</Card>
							</Section>

								<Section>
									<Card interactive={false} className="border border-border/30 bg-muted">
										<div className="max-h-[420px] overflow-auto">
											<table className="min-w-full divide-y divide-black/5 text-sm">
												<thead className="bg-muted text-left text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
													<tr>
														<th className="px-4 py-3">Nome</th>
														<th className="px-4 py-3">Cidade</th>
														<th className="px-4 py-3">Telefone</th>
														<th className="px-4 py-3">Última compra</th>
													</tr>
												</thead>
												<tbody className="divide-y divide-border/30 bg-card">
													{clientes.map((c) => (
														<tr key={c.id} className="hover:bg-muted/60">
															<td className="px-4 py-3 font-semibold text-foreground">{c.nome}</td>
															<td className="px-4 py-3 text-foreground">{c.cidade}</td>
															<td className="px-4 py-3 text-foreground">{c.telefone ?? '—'}</td>
															<td className="px-4 py-3 text-foreground">{formatMonthYear(c.ultimaCompra)}</td>
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
									<Metric value={sellersSortedByRevenue[0]?.nome ?? '—'} label="Maior faturamento" />
								</Card>
								<Card>
									<Metric value="—" label="Abaixo da meta" />
								</Card>
							</Section>

								<Section className="grid gap-10 lg:grid-cols-2">
									<Card>
										<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
											Performance por período
										</p>
									<div className="mt-4 h-64 w-full rounded-xl p-4 outline-none [&_.recharts-wrapper]:outline-none">
										<ResponsiveContainer width="100%" height="100%">
											<AreaChart data={sellerPerformance}>
													<defs>
														{sellersForDisplay.map((v) => (
															<linearGradient key={v.id} id={`color${v.id}`} x1="0" y1="0" x2="0" y2="1">
																<stop offset="5%" stopColor={primaryColor} stopOpacity={0.3} />
																<stop offset="95%" stopColor={primaryColor} stopOpacity={0} />
															</linearGradient>
														))}
													</defs>
													<CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
													<XAxis
														dataKey="month"
														axisLine={false}
														tickLine={false}
														tick={{ fill: primaryColor, fontSize: 10 }}
														dy={10}
													/>
													<YAxis
														axisLine={false}
														tickLine={false}
														tick={{ fill: primaryColor, fontSize: 10 }}
														tickFormatter={(value) => (value >= 1000 ? `${(value / 1000).toFixed(0)}K` : value)}
													/>
													<Tooltip
														contentStyle={{
															backgroundColor: 'hsl(var(--card))',
															borderRadius: '8px',
															border: '1px solid hsl(var(--border))',
															boxShadow: 'var(--shadow-card)',
														}}
														itemStyle={{ fontSize: '12px', fontWeight: 600 }}
														labelStyle={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', marginBottom: '8px' }}
													/>
													<Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
													{sellersForDisplay.map((v) => (
														<Area
															key={v.id}
															type="monotone"
															dataKey={v.nome}
															name={v.nome}
															stroke={primaryColor}
															strokeWidth={2}
															fillOpacity={1}
															fill={`url(#color${v.id})`}
															dot={{
																r: 4,
																fill: primaryColor,
																strokeWidth: 2,
																stroke: 'hsl(var(--card))',
															}}
															activeDot={{ r: 6, strokeWidth: 0 }}
														/>
													))}
											</AreaChart>
										</ResponsiveContainer>
									</div>
								</Card>
									<Card>
										<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
											Faturamento por vendedor
										</p>
									<div className="mt-4 h-64 w-full rounded-xl p-4 outline-none [&_.recharts-wrapper]:outline-none">
										<ResponsiveContainer width="100%" height="100%">
													<BarChart
														data={sellerBarData}
														layout="vertical"
														margin={{ top: 8, right: 24, bottom: 8, left: 0 }}>
													<CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
													<XAxis
														type="number"
														axisLine={false}
														tickLine={false}
														tick={{ fill: primaryColor, fontSize: 10 }}
														tickFormatter={(value) => (value >= 1000 ? `${(value / 1000).toFixed(0)}K` : value)}
													/>
													<YAxis
														type="category"
														dataKey="vendedor"
														axisLine={false}
														tickLine={false}
														tick={{ fill: 'hsl(var(--foreground))', fontSize: 11 }}
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
														fill={primaryColor}
													/>
													<Bar
														dataKey="liquido"
														name="Valor líquido"
														stackId="total"
														barSize={14}
														radius={[0, 0, 0, 0]}
														fill={secondaryColor}
													/>
											</BarChart>
										</ResponsiveContainer>
									</div>
								</Card>
							</Section>

									<Section>
										<Card interactive={false} className="border border-border/30 bg-muted">
											{isSellerListCapped && (
												<p className="px-4 pt-4 text-xs text-muted-foreground">
													Exibindo Top 15 de {sellersSortedByRevenue.length} vendedores por faturamento.
												</p>
											)}
											<div className="overflow-auto">
												<table className="min-w-full divide-y divide-black/5 text-sm">
												<thead className="bg-muted text-left text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
													<tr>
														<th className="px-4 py-3">Vendedor(a)</th>
														<th className="px-4 py-3">Itens</th>
														<th className="px-4 py-3">Valor bruto</th>
														<th className="px-4 py-3">Valor líquido</th>
														<th className="px-4 py-3">Nº Boletos</th>
													</tr>
												</thead>
												<tbody className="divide-y divide-border/30 bg-card">
													{sellersForDisplay.map((v) => (
														<tr key={v.id} className="hover:bg-muted/60">
															<td className="px-4 py-3 font-semibold text-foreground">{v.nome}</td>
															<td className="px-4 py-3 text-foreground">{v.itens}</td>
															<td className="px-4 py-3 text-foreground">R$ {v.bruto.toLocaleString('pt-BR')}</td>
															<td className="px-4 py-3 text-foreground">R$ {v.liquido.toLocaleString('pt-BR')}</td>
															<td className="px-4 py-3 text-foreground">{v.boletos}</td>
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
