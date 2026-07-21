import { useCallback, useEffect, useState } from 'react';
import {
	fetchClients,
	fetchProducts,
	fetchSalesItems,
	fetchSalesOrders,
	fetchSellers,
} from '../services/dashboardService';
import type { SalesItem, SalesOrder } from '../services/dashboardService';
import type { CategorySale, Client, HistoryItem, Product, Seller } from '../types';
import {
	buildCategorySalesFromItems,
	buildCategorySalesFromProducts,
	buildClientEvolutionFromClients,
	buildClientEvolutionFromOrders,
	buildHistoryFromOrders,
	buildHistoryFromProducts,
	buildRecentDailySalesFromOrders,
} from '../utils/helpers';
import { aggregateSellers } from '../utils/sellerRollup';
import { buildLastSaleBySku } from '../utils/lastSaleBySku';

export const useDashboardData = (tenantId: string | undefined) => {
	const [products, setProducts] = useState<Product[]>([]);
	const [clientes, setClientes] = useState<Client[]>([]);
	const [vendedores, setVendedores] = useState<Seller[]>([]);
	const [categorySales, setCategorySales] = useState<CategorySale[]>([]);
	const [history, setHistory] = useState<HistoryItem[]>([]);
	const [salesTrend, setSalesTrend] = useState<HistoryItem[]>([]);
	const [clientEvolution, setClientEvolution] = useState<HistoryItem[]>([]);
	const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
	const [rawSalesItems, setRawSalesItems] = useState<SalesItem[]>([]);
	const [lastSaleBySku, setLastSaleBySku] = useState<Map<string, string>>(new Map());
	const [loading, setLoading] = useState(false);

	const reload = useCallback(async () => {
		const loadData = async () => {
			if (!tenantId) return;
			setLoading(true);

			let parsedProducts: Product[] = [];
			let parsedClients: Client[] = [];
			let parsedSellers: Seller[] = [];

			try { parsedProducts = await fetchProducts(tenantId); } catch { /* empty */ }
			try { parsedClients = await fetchClients(tenantId); } catch { /* empty */ }
			try { parsedSellers = await fetchSellers(tenantId); } catch { /* empty */ }

			let orders: SalesOrder[] = [];
			let salesItems: SalesItem[] = [];
			try { orders = await fetchSalesOrders(tenantId); } catch { /* empty */ }
			try { salesItems = await fetchSalesItems(tenantId); } catch { /* empty */ }

			setSalesOrders(orders);
			setRawSalesItems(salesItems);

			// Exclude voided orders/items from every rollup. Slice 4 reverses stock
			// but leaves these derived aggregates inflated; filter them here once.
			const voidedOrderNumbers = new Set(
				orders.filter((o) => o.status === 'voided').map((o) => o.order_number),
			);
			const activeOrders = orders.filter((o) => o.status !== 'voided');
			const activeItems = salesItems.filter((i) => !voidedOrderNumbers.has(i.order_number));

			// Enrich products with sold quantities from sales items
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

			setProducts(parsedProducts);

			// Build category sales
			const statusBySku = new Map(parsedProducts.map((p) => [p.sku, p.status]));
			const categoryFromItems = activeItems.length ? buildCategorySalesFromItems(activeItems, statusBySku) : [];
			const categoryFromProducts = parsedProducts.length ? buildCategorySalesFromProducts(parsedProducts) : [];
			setCategorySales(categoryFromItems.length ? categoryFromItems : categoryFromProducts);

			// Build history
			const historyFromOrders = activeOrders.length ? buildHistoryFromOrders(activeOrders) : [];
			const historyFromProducts = parsedProducts.length ? buildHistoryFromProducts(parsedProducts) : [];
			setHistory(historyFromOrders.length ? historyFromOrders : historyFromProducts);
			setSalesTrend(buildRecentDailySalesFromOrders(activeOrders, 20));

			// Enrich clients with last purchase dates from orders.
			// Orders may link to a client by resolved UUID (client_id) or by the
			// imported external_id, so index under both and look up under both.
			if (activeOrders.length && parsedClients.length) {
				const lastPurchaseByKey = new Map<string, string>();
				const remember = (key: string | undefined, soldAt: string) => {
					if (!key) return;
					const current = lastPurchaseByKey.get(key);
					if (!current || new Date(soldAt) > new Date(current)) {
						lastPurchaseByKey.set(key, soldAt);
					}
				};
				activeOrders.forEach((order) => {
					if (!order.sold_at) return;
					remember(order.client_id, order.sold_at);
					remember(order.client_external_id, order.sold_at);
				});

				parsedClients = parsedClients.map((client) => {
					if (client.ultimaCompra) return client;
					const lastPurchase =
						(client.id ? lastPurchaseByKey.get(client.id) : undefined) ??
						(client.externalId ? lastPurchaseByKey.get(client.externalId) : undefined);
					return lastPurchase ? { ...client, ultimaCompra: lastPurchase } : client;
				});
			}

			setClientes(parsedClients);

			// Last sale date per SKU, used downstream to flag "no turnover" risk.
			// See src/utils/lastSaleBySku.ts.
			const nextLastSaleBySku = buildLastSaleBySku(activeOrders, activeItems);
			setLastSaleBySku(nextLastSaleBySku);

			// Client-base growth: prefer orders (real multi-month dates); fall back
			// to the clients table's last_purchase_at when there are no orders.
			const evolutionFromOrders = activeOrders.length ? buildClientEvolutionFromOrders(activeOrders) : [];
			setClientEvolution(
				evolutionFromOrders.length ? evolutionFromOrders : buildClientEvolutionFromClients(parsedClients),
			);

			// Build seller aggregates from active orders + items (dual-key match,
			// voided excluded). See src/utils/sellerRollup.ts.
			setVendedores(aggregateSellers(parsedSellers, activeOrders, activeItems));

			setLoading(false);
		};

		await loadData();
	}, [tenantId]);

	useEffect(() => {
		reload();
	}, [reload]);

	return { products, setProducts, clientes, vendedores, categorySales, history, salesTrend, clientEvolution, salesOrders, setSalesOrders, salesItems: rawSalesItems, lastSaleBySku, reload, loading };
};
