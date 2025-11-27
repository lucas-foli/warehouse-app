import type { Client, HistoryItem, Product, Seller } from '../types';

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

export const buildCategorySalesFromProducts = (
	items: Array<{
		status: string;
		price?: number;
		totalSold?: number;
	}>,
) => {
	const byStatus = new Map<string, { venda: number; custo: number }>();

	for (const p of items) {
		if (!p.price || !p.totalSold) continue;
		const venda = p.price * p.totalSold;
		const custo = venda * 0.4;
		const key = p.status || 'Outros';
		const acc = byStatus.get(key) ?? { venda: 0, custo: 0 };
		acc.venda += venda;
		acc.custo += custo;
		byStatus.set(key, acc);
	}

	const totalVenda = Array.from(byStatus.values()).reduce((sum, c) => sum + c.venda, 0);
	if (!totalVenda) return [];

	return Array.from(byStatus.entries()).map(([name, { venda, custo }]) => ({
		name,
		venda,
		custo,
		share: (venda / totalVenda) * 100,
	}));
};

export const buildHistoryFromProducts = (
	items: Array<{
		price?: number;
		totalSold?: number;
	}>,
) => {
	if (!items.length) return [];
	const totalVenda = items.reduce((sum, p) => {
		if (!p.price || !p.totalSold) return sum;
		return sum + p.price * p.totalSold;
	}, 0);

	const totalQty = items.reduce((sum, p) => sum + (p.totalSold || 0), 0);

	if (!totalVenda) return [];

	// distribui o faturamento em 5 meses fictícios
	return [
		{ month: 'Jul/25', value: totalVenda * 0.18, quantity: Math.round(totalQty * 0.18) },
		{ month: 'Ago/25', value: totalVenda * 0.22, quantity: Math.round(totalQty * 0.22) },
		{ month: 'Set/25', value: totalVenda * 0.20, quantity: Math.round(totalQty * 0.20) },
		{ month: 'Out/25', value: totalVenda * 0.19, quantity: Math.round(totalQty * 0.19) },
		{ month: 'Nov/25', value: totalVenda * 0.21, quantity: Math.round(totalQty * 0.21) },
	];
};

export const buildClientEvolutionFromClients = (clients: Client[]): HistoryItem[] => {
	if (!clients.length) return [];

	const byMonth = new Map<
		string,
		{
			key: string;
			label: string;
			value: number;
		}
	>();

	for (const c of clients) {
		if (!c.ultimaCompra) continue;
		const date = new Date(c.ultimaCompra);
		if (Number.isNaN(date.getTime())) continue;

		const year = date.getFullYear();
		const month = date.getMonth(); // 0-based
		const key = `${year}-${String(month + 1).padStart(2, '0')}`;
		const label = `${date.toLocaleString('pt-BR', { month: 'short' })}/${String(year).slice(-2)}`;

		const current = byMonth.get(key);
		if (current) {
			current.value += 1;
		} else {
			byMonth.set(key, { key, label, value: 1 });
		}
	}

	const items = Array.from(byMonth.values());
	if (!items.length) return [];

	items.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

	return items.map((i) => ({ month: i.label, value: i.value }));
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

export const buildSellerPerformanceFromSellers = (sellers: Seller[]): HistoryItem[] => {
	if (!sellers.length) return [];

	const totalBruto = sellers.reduce((sum, s) => sum + (s.bruto || 0), 0);
	if (!totalBruto) return [];

	return [
		{ month: 'Ago/25', value: totalBruto * 0.23 },
		{ month: 'Set/25', value: totalBruto * 0.24 },
		{ month: 'Out/25', value: totalBruto * 0.26 },
		{ month: 'Nov/25', value: totalBruto * 0.27 },
	];
};

export const buildMultiSellerPerformance = (sellers: Seller[]) => {
	if (!sellers.length) return [];

	// Generate daily data for the last 30 days
	const days = 30;
	const today = new Date();
	const result = [];

	for (let i = days - 1; i >= 0; i--) {
		const date = new Date(today);
		date.setDate(date.getDate() - i);
		const dayLabel = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

		const data: any = { month: dayLabel };
		sellers.forEach((seller) => {
			// Generate varying daily performance with some randomness
			const baseValue = (seller.bruto || 0) / 30; // Average daily value
			const variance = 0.5 + Math.random() * 1.0; // 0.5 to 1.5 multiplier
			const trend = 1 + (i / days) * 0.3; // Slight upward trend over time
			data[seller.nome] = Math.round(baseValue * variance * trend);
		});
		result.push(data);
	}

	return result;
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
