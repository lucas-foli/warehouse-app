import { useEffect, useState } from 'react';
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

export const useDashboardData = (tenantId: string | undefined) => {
	const [products, setProducts] = useState<Product[]>([]);
	const [clientes, setClientes] = useState<Client[]>([]);
	const [vendedores, setVendedores] = useState<Seller[]>([]);
	const [categorySales, setCategorySales] = useState<CategorySale[]>([]);
	const [history, setHistory] = useState<HistoryItem[]>([]);
	const [salesTrend, setSalesTrend] = useState<HistoryItem[]>([]);
	const [clientEvolution, setClientEvolution] = useState<HistoryItem[]>([]);
	const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
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
			const categoryFromItems = salesItems.length ? buildCategorySalesFromItems(salesItems, statusBySku) : [];
			const categoryFromProducts = parsedProducts.length ? buildCategorySalesFromProducts(parsedProducts) : [];
			setCategorySales(categoryFromItems.length ? categoryFromItems : categoryFromProducts);

			// Build history
			const historyFromOrders = orders.length ? buildHistoryFromOrders(orders) : [];
			const historyFromProducts = parsedProducts.length ? buildHistoryFromProducts(parsedProducts) : [];
			setHistory(historyFromOrders.length ? historyFromOrders : historyFromProducts);
			setSalesTrend(buildRecentDailySalesFromOrders(orders, 20));

			// Enrich clients with last purchase dates from orders.
			// Orders may link to a client by resolved UUID (client_id) or by the
			// imported external_id, so index under both and look up under both.
			if (orders.length && parsedClients.length) {
				const lastPurchaseByKey = new Map<string, string>();
				const remember = (key: string | undefined, soldAt: string) => {
					if (!key) return;
					const current = lastPurchaseByKey.get(key);
					if (!current || new Date(soldAt) > new Date(current)) {
						lastPurchaseByKey.set(key, soldAt);
					}
				};
				orders.forEach((order) => {
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

			// Client-base growth: prefer orders (real multi-month dates); fall back
			// to the clients table's last_purchase_at when there are no orders.
			const evolutionFromOrders = orders.length ? buildClientEvolutionFromOrders(orders) : [];
			setClientEvolution(
				evolutionFromOrders.length ? evolutionFromOrders : buildClientEvolutionFromClients(parsedClients),
			);

			// Build seller aggregates from orders + items
			const sellerMap = new Map<string, Seller>();
			parsedSellers.forEach((seller) => {
				const key = seller.externalId || seller.id;
				if (key) sellerMap.set(key, { ...seller });
			});

			const ordersByNumber = new Map<string, { sellerKey?: string }>();
			orders.forEach((order) => {
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

			setVendedores(sellerMap.size ? Array.from(sellerMap.values()) : parsedSellers);

			setLoading(false);
		};

		loadData();
	}, [tenantId]);

	return { products, setProducts, clientes, vendedores, categorySales, history, salesTrend, clientEvolution, salesOrders, setSalesOrders, loading };
};
