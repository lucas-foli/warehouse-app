
import { useEffect, useState } from 'react';
import { BiListCheck } from 'react-icons/bi';
import { LuLogOut } from 'react-icons/lu';
import {
	Area,
	AreaChart,
	Bar,
	CartesianGrid,
	ComposedChart,
	Legend,
	Line,
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

const Dashboard = ({ onLogout, onOpenStatusForm }: { onLogout: () => void; onOpenStatusForm: () => void }) => {
	const [loading, setLoading] = useState(false);
	const [page, setPage] = useState<'overview' | 'clientes' | 'vendedores'>('overview');
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

	const totalEstoque = products.reduce((acc, cur) => acc + (cur.qty || 0), 0);
	const produtosDistintos = products.length;
	const estoqueBaixo = products.filter((p) => p.min !== undefined && p.qty < (p.min ?? 0)).length;
	const semFoto = products.filter((p) => !p.image).length;
	const maxHistoryValue = history.reduce((max, h) => (h.value > max ? h.value : max), 0);

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
	// const maxSellerPerformanceValue = sellerPerformance.reduce((max, h) => (h.value > max ? h.value : max), 0);

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

			<main className="flex flex-1 items-stretch px-4 py-6 sm:px-10 lg:px-16">
				<div className="w-full space-y-6 rounded-[32px] border border-black/10 bg-white p-6 shadow-[0_35px_70px_rgba(0,0,0,0.08)] sm:p-8">
					<div className="flex flex-wrap items-center justify-between gap-4">
						<div>
							<h2 className="text-2xl font-semibold text-[#121213]">
								Dashboard | {page === 'overview' ? 'Produtos' : page === 'clientes' ? 'Clientes' : 'Vendedores'}
							</h2>
							<p className="text-sm text-[#6f6f6f]">
								{page === 'overview' && 'Resumo rápido do estoque'}
								{page === 'clientes' && 'Informações de clientes e últimas compras'}
								{page === 'vendedores' && 'Performance e detalhamento por vendedor'}
							</p>
						</div>
						<div className="flex items-center gap-3 text-sm text-[#6f6f6f]">
							<div className="inline-flex rounded-full border border-black/10 bg-[#f3f3f1] p-1 text-xs font-semibold uppercase tracking-[0.25em] text-[#2b2b2b]">
								{(
									[
										{ key: 'overview', label: 'Produtos' },
										{ key: 'clientes', label: 'Clientes' },
										{ key: 'vendedores', label: 'Vendedores' },
									] as const
								).map((tab) => (
									<button
										key={tab.key}
										type="button"
										onClick={() => setPage(tab.key)}
										className={`rounded-full px-4 py-2 transition ${
											page === tab.key ? 'bg-[#121213] text-white shadow' : 'text-[#6f6f6f] hover:text-black'
										}`}>
										{tab.label}
									</button>
								))}
							</div>
							<span className="inline-flex h-9 items-center rounded-full bg-[#f6f6f2] px-4 font-semibold uppercase tracking-[0.2em] text-[#2b2b2b]">
								Brasília Shopping
							</span>
						</div>
					</div>

					{page === 'overview' && (
						<>
							<div className="grid gap-4 lg:grid-cols-4">
								{[
									{ label: 'Faturamento total', value: kpis.faturamento, prefix: 'R$ ' },
									{ label: 'Total Custo', value: kpis.totalCusto, prefix: 'R$ ' },
									{ label: 'Qtde em Estoque', value: totalEstoque },
									{ label: 'Produtos Distintos', value: produtosDistintos },
								].map((item) => (
									<div key={item.label} className="rounded-2xl border border-black/10 bg-[#f6f6f2] p-4">
										<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#6f6f6f]">{item.label}</p>
										<p className="mt-2 text-3xl font-semibold text-[#121213]">
											{item.prefix ?? ''}
											{item.value.toLocaleString('pt-BR')}
										</p>
									</div>
								))}
							</div>

							<div className="grid gap-4 lg:grid-cols-3">
								<div className="lg:col-span-2 rounded-2xl border border-black/10 bg-[#f6f6f2] p-4 ">
									<div className="flex items-center justify-between">
										<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#6f6f6f]">Vendas</p>
										<span className="text-[11px] uppercase tracking-[0.2em] text-[#9a9a9a]">Histórico</span>
									</div>
									<div className="mt-4 h-64 w-full rounded-xl p-4 outline-none [&_.recharts-wrapper]:outline-none">
										<ResponsiveContainer width="100%" height="100%">
											<ComposedChart data={history}>
												<CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
												<XAxis
													dataKey="month"
													axisLine={false}
													tickLine={false}
													tick={{ fill: '#6f6f6f', fontSize: 10 }}
													dy={10}
												/>
												<YAxis
													yAxisId="left"
													orientation="left"
													axisLine={false}
													tickLine={false}
													tick={{ fill: '#6f6f6f', fontSize: 10 }}
													tickFormatter={(value) =>
														value >= 1000 ? `${(value / 1000).toFixed(0)}K` : value
													}
												/>
												<YAxis
													yAxisId="right"
													orientation="right"
													axisLine={false}
													tickLine={false}
													tick={{ fill: '#6f6f6f', fontSize: 10 }}
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
													formatter={(value: number, name: string) => {
														if (name === 'Venda')
															return [`R$ ${value.toLocaleString('pt-BR')}`, 'Venda'];
														return [value, 'Qtde'];
													}}
												/>
												<Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
												<Bar
													yAxisId="right"
													dataKey="quantity"
													name="Qtde"
													fill="#3e4c5e"
													radius={[4, 4, 0, 0]}
													barSize={30}
												/>
												<Line
													yAxisId="left"
													type="monotone"
													dataKey="value"
													name="Venda"
													stroke="#2563eb"
													strokeWidth={3}
													dot={{ r: 4, fill: '#2563eb', strokeWidth: 2, stroke: '#fff' }}
													activeDot={{ r: 6, strokeWidth: 0 }}
												/>
											</ComposedChart>
										</ResponsiveContainer>
									</div>
								</div>
								<div className="rounded-2xl border border-black/10 bg-[#f6f6f2] p-4">
									<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#6f6f6f]">
										Vendas e Custos por categoria
									</p>
									<div className="mt-4 space-y-3">
										{categorySales.map((cat) => (
											<div key={cat.name} className="space-y-1">
												<div className="flex items-center justify-between text-sm text-[#2b2b2b]">
													<span>{cat.name}</span>
													<span className="text-xs text-[#6f6f6f]">R$ {cat.venda.toLocaleString('pt-BR')}</span>
												</div>
												<div className="flex h-2 overflow-hidden rounded-full bg-white">
													<div
														className="bg-[#121213]"
														style={{ width: `${Math.min(100, (cat.venda / (kpis.faturamento || 1)) * 100)}%` }}
													/>
												</div>
											</div>
										))}
									</div>
								</div>
							</div>

							<div className="grid gap-4 lg:grid-cols-3">
								<div className="rounded-2xl border border-black/10 bg-[#f6f6f2] p-4">
									<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#6f6f6f]">Alertas</p>
									<div className="mt-3 space-y-3 text-sm">
										<div className="flex items-center justify-between rounded-xl bg-white/80 px-3 py-2">
											<span className="text-[#2b2b2b]">Itens com estoque baixo</span>
											<span className="text-base font-semibold text-[#121213]">{estoqueBaixo}</span>
										</div>
										<div className="flex items-center justify-between rounded-xl bg-white/80 px-3 py-2">
											<span className="text-[#2b2b2b]">Itens sem foto</span>
											<span className="text-base font-semibold text-[#121213]">{semFoto}</span>
										</div>
									</div>
								</div>
								<div className="lg:col-span-2 rounded-2xl border border-black/10 bg-[#f6f6f2] p-4">
									<div className="flex items-center justify-between">
										<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#6f6f6f]">
											Faturamento acumulado (últimos meses)
										</p>
										<span className="text-[11px] uppercase tracking-[0.2em] text-[#9a9a9a]">Tendência</span>
									</div>
									<div className="mt-4 space-y-4">
										{history.map((point) => {
											const width = maxHistoryValue ? Math.round((point.value / maxHistoryValue) * 100) : 0;
											return (
												<div key={point.month} className="space-y-1">
													<div className="flex items-center justify-between text-sm text-[#2b2b2b]">
														<span>{point.month}</span>
														<span className="text-xs text-[#6f6f6f]">R$ {point.value.toLocaleString('pt-BR')}</span>
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
								</div>
							</div>

							{/* <div className="space-y-3">
								<div className="flex items-center justify-between">
									<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#6f6f6f]">Produtos</p>
									<span className="text-[11px] uppercase tracking-[0.2em] text-[#9a9a9a]">Imagens direto do CSV</span>
								</div>
								<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 overflow-auto max-h-[600px]">
									{products.map((product) => (
										<div
											key={product.id}
											className="flex items-center gap-3 rounded-2xl border border-black/10 bg-[#f6f6f2] p-3">
											<div className="h-14 w-14 overflow-hidden rounded-xl bg-white/70">
												{product.image ? (
													<img
														src={product.image}
														alt={product.name}
														className="h-full w-full object-cover"
														loading="lazy"
													/>
												) : (
													<div className="flex h-full w-full items-center justify-center text-[11px] uppercase tracking-[0.2em] text-[#9a9a9a]">
														SEM FOTO
													</div>
												)}
											</div>
											<div className="space-y-1 text-sm">
												<p className="font-semibold text-[#121213]">{product.name}</p>
												<p className="text-[11px] uppercase tracking-[0.2em] text-[#6f6f6f]">SKU {product.sku}</p>
												<div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.15em] text-[#6f6f6f]">
													<span className="rounded-full bg-black/5 px-2 py-[3px] font-semibold text-[#121213]">
														{product.status}
													</span>
													<span>Estoque: {product.qty}</span>
													<span>Estoque: {product.qty}</span>
													<span>Estoque: {product.qty}</span>
													<span>Estoque: {product.qty}</span>
												</div>
											</div>
										</div>
									))}
									</div>
							</div> */}

							<div className="rounded-2xl border border-black/10">
								<div className="overflow-auto max-h-[600px]">
									<table className="min-w-full divide-y divide-black/5 text-sm">
										<thead className="bg-[#f6f6f2] text-left text-[11px] uppercase tracking-[0.25em] text-[#6f6f6f]">
											<tr>
												<th className="px-4 py-3">Foto</th>
												<th className="px-4 py-3">SKU</th>
												<th className="px-4 py-3">Produto</th>
												<th className="px-4 py-3">Status</th>
												<th className="px-4 py-3">Local</th>
												<th className="px-4 py-3">Qtd</th>
												<th className="px-4 py-3">Mínimo</th>
												<th className="px-4 py-3">Preço</th>
												<th className="px-4 py-3">Total Vendido</th>
												<th className="px-4 py-3">Código de barras</th>
											</tr>
										</thead>
										<tbody className="divide-y divide-black/5">
											{loading && (
												<tr>
													<td colSpan={10} className="px-4 py-6 text-center text-[#6f6f6f]">
														Carregando…
													</td>
												</tr>
											)}
											{!loading &&
												products.map((product) => (
													<tr key={product.id} className="hover:bg-[#f9f9f7]">
														<td className="px-4 py-3">
															<div className="h-12 w-12 overflow-hidden rounded-lg bg-black/5">
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
											{!loading && products.length === 0 && (
												<tr>
													<td colSpan={10} className="px-4 py-6 text-center text-[#6f6f6f]">
														Nenhum produto encontrado.
													</td>
												</tr>
											)}
										</tbody>
									</table>
								</div>
							</div>
						</>
					)}

					{page === 'clientes' && (
						<>
							<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
								{[
									{ label: 'Quantidade de Clientes', value: 743 },
									{ label: 'Cidades', value: 42 },
									{ label: 'Última Compra', value: '14 Nov 2025' },
									{ label: 'Último Cadastro', value: '14 Nov 2025' },
								].map((item) => (
									<div key={item.label} className="rounded-2xl border border-black/10 bg-[#f6f6f2] p-4">
										<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#6f6f6f]">{item.label}</p>
										<p className="mt-2 text-2xl font-semibold text-[#121213]">{item.value}</p>
									</div>
								))}
							</div>
							<div className="grid gap-4 lg:grid-cols-2">
								<div className="rounded-2xl border border-black/10 bg-[#f6f6f2] p-4">
									<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#6f6f6f]">
										Evolução de clientes
									</p>
									<div className="mt-4 h-64 w-full rounded-xl p-4 outline-none [&_.recharts-wrapper]:outline-none">
										<ResponsiveContainer width="100%" height="100%">
											<AreaChart data={clientEvolution}>
												<defs>
													<linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
														<stop offset="5%" stopColor="#2563eb" stopOpacity={0.1} />
														<stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
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
												<YAxis
													axisLine={false}
													tickLine={false}
													tick={{ fill: '#6f6f6f', fontSize: 10 }}
												/>
												<Tooltip
													contentStyle={{
														backgroundColor: '#fff',
														borderRadius: '8px',
														border: '1px solid #f0f0f0',
														boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
													}}
													itemStyle={{ fontSize: '12px', fontWeight: 600, color: '#2563eb' }}
													labelStyle={{ fontSize: '12px', color: '#6f6f6f', marginBottom: '8px' }}
													formatter={(value: number) => [value, 'Cliente']}
												/>
												<Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
												<Area
													type="monotone"
													dataKey="value"
													name="Cliente"
													stroke="#2563eb"
													strokeWidth={2}
													fillOpacity={1}
													fill="url(#colorValue)"
													dot={{ r: 4, fill: '#2563eb', strokeWidth: 2, stroke: '#fff' }}
													activeDot={{ r: 6, strokeWidth: 0 }}
												/>
											</AreaChart>
										</ResponsiveContainer>
									</div>
								</div>
								<div className="rounded-2xl border border-black/10 bg-[#f6f6f2] p-4">
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
								</div>
							</div>
							<div className="rounded-2xl border border-black/10">
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
										<tbody className="divide-y divide-black/5">
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
							</div>
						</>
					)}

					{page === 'vendedores' && (
						<>
							<div className="grid gap-4 lg:grid-cols-2">
								<div className="rounded-2xl border border-black/10 bg-[#f6f6f2] p-4">
									<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#6f6f6f]">
										Performance por período
									</p>
									<div className="mt-4 h-64 w-full rounded-xl p-4 outline-none [&_.recharts-wrapper]:outline-none">
										<ResponsiveContainer width="100%" height="100%">
											<AreaChart data={sellerPerformance}>
												<defs>
													{vendedores.map((v, i) => (
														<linearGradient key={v.id} id={`color${v.id}`} x1="0" y1="0" x2="0" y2="1">
															<stop
																offset="5%"
																stopColor={`hsl(${i * 60}, 70%, 50%)`}
																stopOpacity={0.1}
															/>
															<stop
																offset="95%"
																stopColor={`hsl(${i * 60}, 70%, 50%)`}
																stopOpacity={0}
															/>
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
													tickFormatter={(value) =>
														value >= 1000 ? `${(value / 1000).toFixed(0)}K` : value
													}
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
												<Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}/>
												{vendedores.map((v, i) => (
													<Area
														key={v.id}
														type="monotone"
														dataKey={v.nome}
														name={v.nome}
														stroke={`hsl(${i * 60}, 70%, 50%)`}
														strokeWidth={2}
														fillOpacity={1}
														fill={`url(#color${v.id})`}
														dot={{
															r: 4,
															fill: `hsl(${i * 60}, 70%, 50%)`,
															strokeWidth: 2,
															stroke: '#fff',
														}}
														activeDot={{ r: 6, strokeWidth: 0 }}
													/>
												))}
											</AreaChart>
										</ResponsiveContainer>
									</div>
								</div>
								<div className="rounded-2xl border border-black/10 bg-[#f6f6f2] p-4">
									<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#6f6f6f]">
										Faturamento por vendedor (mock)
									</p>
									<div className="mt-4 space-y-3">
										{vendedores.map((v) => (
											<div key={v.id}>
												<div className="flex items-center justify-between text-sm text-[#2b2b2b]">
													<span>{v.nome}</span>
													<span className="text-xs text-[#6f6f6f]">R$ {v.liquido.toLocaleString('pt-BR')}</span>
												</div>
												<div className="flex h-2 overflow-hidden rounded-full bg-white">
													<div
														className="bg-[#121213]"
														style={{ width: `${Math.min(100, (v.bruto / kpis.faturamento) * 100)}%` }}
													/>
												</div>
											</div>
										))}
									</div>
								</div>
							</div>
							<div className="rounded-2xl border border-black/10">
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
										<tbody className="divide-y divide-black/5">
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
							</div>
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
