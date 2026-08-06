import type { Client, HistoryItem, Product } from '../types';

export const isLocalhost = () => {
	if (typeof window === 'undefined') return false;
	const hostname = window.location.hostname.toLowerCase();
	return hostname === 'localhost' || /^127\\./.test(hostname) || /^\\d{1,3}(\\.\\d{1,3}){3}$/.test(hostname);
};

export const translateAuthError = (message: string) => {
	const normalized = message.toLowerCase();
	if (normalized.includes('invalid login credentials')) return 'E-mail ou senha inválidos.';
	if (normalized.includes('email not confirmed')) return 'Confirme seu e-mail antes de continuar.';
	if (normalized.includes('user already registered')) return 'Este e-mail já possui cadastro.';
	if (normalized.match(/^email address (.+) is invalid$/i)) return 'E-mail inválido.';
	if (normalized.includes('password should contain'))
		return 'A senha precisa ter\n• mínimo de 6 caracteres \n• 1 letra maiúscula\n• 1 letra minúscula\n• 1 número\n• 1 caractere especial';
	if (normalized.includes('password')) return 'Revise a senha informada e tente novamente.';
	if (normalized.includes('rate limit')) return 'Muitas tentativas recentes. Aguarde um instante e tente novamente.';
	return message.replace(/\\n/g, '\n');
};

export const resolveMadeBySarkUrl = () => {
	const explicit = import.meta.env.VITE_MADE_BY_SARK_URL ?? '';
	if (explicit) return explicit;

	const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
	const storageUrl = supabaseUrl
		? `${supabaseUrl}/storage/v1/object/public/tenant-logos/made-by-sark.png`
		: '';
	if (isLocalhost()) return '/made-by-sark.png';
	return storageUrl;
};

export const resolveMadeBySarkStorageUrl = () => {
	const explicit = import.meta.env.VITE_MADE_BY_SARK_URL ?? '';
	if (explicit) return explicit;

	const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
	return supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/tenant-logos/made-by-sark.png` : '';
};

export const resolveSarkLogoStorageUrl = (preset?: string | null) => {
	const isDark = (preset || '').toLowerCase() === 'dark';
	const explicit = isDark
		? import.meta.env.VITE_SARK_LOGO_WHITE_URL
		: import.meta.env.VITE_SARK_LOGO_BLACK_URL;
	if (explicit) return explicit;

	const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
	if (!supabaseUrl) return '';
	return `${supabaseUrl}/storage/v1/object/public/tenant-logos/${isDark ? 'sark-branco.png' : 'sark-preto.png'}`;
};

export const resolveSarkLogoLocalUrl = (preset?: string | null) => {
	const isDark = (preset || '').toLowerCase() === 'dark';
	return isDark ? '/sark-branco.png' : '/sark-preto.png';
};

export const resolveSarkLogoUrl = (preset?: string | null) =>
	isLocalhost() ? resolveSarkLogoLocalUrl(preset) : resolveSarkLogoStorageUrl(preset);

export const resolveEasynumbersLogoStorageUrl = (preset?: string | null) => {
	const isDark = (preset || '').toLowerCase() === 'dark';
	const explicit = isDark
		? import.meta.env.VITE_EASYNUMBERS_LOGO_WHITE_URL
		: import.meta.env.VITE_EASYNUMBERS_LOGO_URL;
	if (explicit) return explicit;

	const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
	if (!supabaseUrl) return '';
	return `${supabaseUrl}/storage/v1/object/public/tenant-logos/${isDark ? 'easynumbers-white.png' : 'easynumbers.png'}`;
};

export const resolveEasynumbersLogoLocalUrl = (preset?: string | null) => {
	const isDark = (preset || '').toLowerCase() === 'dark';
	return isDark ? '/easynumbers-white.png' : '/easynumbers.png';
};

export const resolveEasynumbersLogoUrl = (preset?: string | null) =>
	isLocalhost() ? resolveEasynumbersLogoLocalUrl(preset) : resolveEasynumbersLogoStorageUrl(preset);

export const buildCategorySalesFromProducts = (
	items: Array<{
		status: string;
		price?: number;
		totalSold?: number;
	}>,
) => {
	const byStatus = new Map<string, { venda: number }>();

	for (const p of items) {
		if (!p.price || !p.totalSold) continue;
		const venda = p.price * p.totalSold;
		const key = p.status || 'Outros';
		const acc = byStatus.get(key) ?? { venda: 0 };
		acc.venda += venda;
		byStatus.set(key, acc);
	}

	const totalVenda = Array.from(byStatus.values()).reduce((sum, c) => sum + c.venda, 0);
	if (!totalVenda) return [];

	return Array.from(byStatus.entries()).map(([name, { venda }]) => ({
		name,
		venda,
		share: (venda / totalVenda) * 100,
	}));
};

export const buildCategorySalesFromItems = (
	items: Array<{
		sku?: string;
		qty?: number;
		unit_price?: number;
		total_price?: number;
	}>,
	statusBySku: Map<string, string>,
) => {
	const byStatus = new Map<string, { venda: number }>();

	for (const item of items) {
		const qty = item.qty ?? 0;
		const amount =
			item.total_price ?? (item.unit_price !== undefined ? item.unit_price * (qty || 1) : undefined);
		if (!amount) continue;
		const sku = item.sku ?? '';
		const key = statusBySku.get(sku) || 'Outros';
		const acc = byStatus.get(key) ?? { venda: 0 };
		acc.venda += amount;
		byStatus.set(key, acc);
	}

	const totalVenda = Array.from(byStatus.values()).reduce((sum, c) => sum + c.venda, 0);
	if (!totalVenda) return [];

	return Array.from(byStatus.entries()).map(([name, { venda }]) => ({
		name,
		venda,
		share: (venda / totalVenda) * 100,
	}));
};

export const buildHistoryFromOrders = (
	orders: Array<{
		sold_at?: string;
		total_amount?: number;
	}>,
) => {
	if (!orders.length) return [];

	const byMonth = new Map<string, { label: string; value: number }>();

	for (const order of orders) {
		if (!order.total_amount) continue;
		const date = order.sold_at ? new Date(order.sold_at) : null;
		if (!date || Number.isNaN(date.getTime())) continue;
		const year = date.getFullYear();
		const month = date.getMonth();
		const key = `${year}-${String(month + 1).padStart(2, '0')}`;
		const label = `${date.toLocaleString('pt-BR', { month: 'short' })}/${String(year).slice(-2)}`;
		const acc = byMonth.get(key) ?? { label, value: 0 };
		acc.value += order.total_amount;
		byMonth.set(key, acc);
	}

	const items = Array.from(byMonth.entries());
	if (!items.length) return [];

	items.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

	return items.map(([, value]) => ({ month: value.label, value: value.value }));
};

export const buildRecentDailySalesFromOrders = (
	orders: Array<{
		sold_at?: string;
		total_amount?: number;
	}>,
	daysBack = 20,
	referenceDate?: Date,
): HistoryItem[] => {
	const today = referenceDate ? new Date(referenceDate) : new Date();
	today.setHours(0, 0, 0, 0);

	const start = new Date(today);
	start.setDate(start.getDate() - daysBack);

	const byDay = new Map<string, number>();

	for (const order of orders) {
		if (!Number.isFinite(order.total_amount)) continue;
		const parsed = order.sold_at ? new Date(order.sold_at) : null;
		if (!parsed || Number.isNaN(parsed.getTime())) continue;
		parsed.setHours(0, 0, 0, 0);
		if (parsed < start || parsed > today) continue;

		const key = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(
			parsed.getDate(),
		).padStart(2, '0')}`;
		byDay.set(key, (byDay.get(key) ?? 0) + Number(order.total_amount));
	}

	const series: HistoryItem[] = [];
	for (let offset = daysBack; offset >= 0; offset--) {
		const date = new Date(today);
		date.setDate(today.getDate() - offset);
		const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
			date.getDate(),
		).padStart(2, '0')}`;
		series.push({
			month: date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
			value: byDay.get(key) ?? 0,
		});
	}

	return series;
};

export const buildClientEvolutionFromClients = (clients: Client[]): HistoryItem[] => {
	if (!clients.length) return [];

	// Count clients by the month of their last purchase (YYYY-MM).
	const countByMonth = new Map<string, number>();
	for (const c of clients) {
		if (!c.ultimaCompra) continue;
		const date = new Date(c.ultimaCompra);
		if (Number.isNaN(date.getTime())) continue;

		const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
		countByMonth.set(key, (countByMonth.get(key) ?? 0) + 1);
	}

	if (!countByMonth.size) return [];

	const keys = Array.from(countByMonth.keys()).sort();
	const [startYear, startMonth] = keys[0].split('-').map(Number);
	const [endYear, endMonth] = keys[keys.length - 1].split('-').map(Number);

	// Walk every month in range, carrying a running total so the line shows
	// the client base growing over time (cumulative), with no gaps on the axis.
	const series: HistoryItem[] = [];
	let cumulative = 0;
	let year = startYear;
	let month = startMonth; // 1-based

	while (year < endYear || (year === endYear && month <= endMonth)) {
		const key = `${year}-${String(month).padStart(2, '0')}`;
		cumulative += countByMonth.get(key) ?? 0;

		const label = `${new Date(year, month - 1, 1).toLocaleDateString('pt-BR', {
			month: 'short',
		})}/${String(year).slice(-2)}`;
		series.push({ month: label, value: cumulative });

		month += 1;
		if (month > 12) {
			month = 1;
			year += 1;
		}
	}

	return series;
};

/**
 * Client-base growth from sales orders: cumulative count of distinct clients by
 * the month of their first purchase. Uses orders (which carry real, multi-month
 * dates) rather than the clients table's often-empty last_purchase_at.
 */
export const buildClientEvolutionFromOrders = (
	orders: Array<{
		sold_at?: string;
		client_id?: string;
		client_external_id?: string;
	}>,
): HistoryItem[] => {
	if (!orders.length) return [];

	// First-purchase month (YYYY-MM) per distinct client.
	const firstMonthByClient = new Map<string, string>();
	for (const order of orders) {
		const clientKey = order.client_id || order.client_external_id;
		if (!clientKey || !order.sold_at) continue;
		const date = new Date(order.sold_at);
		if (Number.isNaN(date.getTime())) continue;

		const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
		const existing = firstMonthByClient.get(clientKey);
		if (!existing || key < existing) firstMonthByClient.set(clientKey, key);
	}

	if (!firstMonthByClient.size) return [];

	const newByMonth = new Map<string, number>();
	for (const month of firstMonthByClient.values()) {
		newByMonth.set(month, (newByMonth.get(month) ?? 0) + 1);
	}

	const keys = Array.from(newByMonth.keys()).sort();
	const [startYear, startMonth] = keys[0].split('-').map(Number);
	const [endYear, endMonth] = keys[keys.length - 1].split('-').map(Number);

	const series: HistoryItem[] = [];
	let cumulative = 0;
	let year = startYear;
	let month = startMonth; // 1-based

	while (year < endYear || (year === endYear && month <= endMonth)) {
		const key = `${year}-${String(month).padStart(2, '0')}`;
		cumulative += newByMonth.get(key) ?? 0;

		const label = `${new Date(year, month - 1, 1).toLocaleDateString('pt-BR', {
			month: 'short',
		})}/${String(year).slice(-2)}`;
		series.push({ month: label, value: cumulative });

		month += 1;
		if (month > 12) {
			month = 1;
			year += 1;
		}
	}

	return series;
};

export const buildClientPurchasesTimelineFromClients = (clients: Client[]): HistoryItem[] => {
	if (!clients.length) return [];

	const byDay = new Map<
		string,
		{
			date: Date;
			label: string;
			value: number;
		}
	>();

	for (const c of clients) {
		if (!c.ultimaCompra) continue;
		const date = new Date(c.ultimaCompra);
		if (Number.isNaN(date.getTime())) continue;

		const key = date.toISOString().slice(0, 10); // YYYY-MM-DD
		const label = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

		const current = byDay.get(key);
		if (current) {
			current.value += 1;
		} else {
			byDay.set(key, { date, label, value: 1 });
		}
	}

	const items = Array.from(byDay.values());
	if (!items.length) return [];

	items.sort((a, b) => a.date.getTime() - b.date.getTime());

	return items.map((i) => ({ month: i.label, value: i.value }));
};

export const parseCsv = (csv: string): Product[] => {
	const [headerLine, ...rows] = csv.trim().split('\n');
	const headers = headerLine.split(',').map((h) => h.trim().toLowerCase());
	return rows
		.map((line) => line.split(','))
		// ignora linhas totalmente vazias para que possamos cair no mock
		.filter((cols) => cols.some((c) => c.trim() !== ''))
		.map((cols) => {
			const get = (key: string) => {
				const idx = headers.indexOf(key.toLowerCase());
				return idx >= 0 ? cols[idx]?.trim() : '';
			};
			return {
				id: get('id') || crypto.randomUUID(),
				name: get('name') || get('descricao') || 'Produto',
				sku: get('sku') || '—',
				barcode: get('barcode') || get('codigo_de_barras') || undefined,
				status: get('status') || 'ESTOQUE',
				location: get('location') || get('local') || 'Brasília Shopping',
				qty: Number(get('qty') || get('estoque') || 0) || 0,
				min: Number(get('min') || get('minimo') || 0) || undefined,
				price: Number(get('price') || get('preco') || 0) || undefined,
				totalSold: Number(get('total_sold') || get('totalvendido') || 0) || undefined,
				image: get('image') || get('foto') || get('photo') || undefined,
			};
		});
};
