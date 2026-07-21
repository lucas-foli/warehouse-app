export type ParsedCsv = {
	headers: string[];
	rows: string[][];
	delimiter: string;
};

const stripBom = (text: string) => text.replace(/^\uFEFF/, '');

const detectDelimiter = (headerLine: string) => {
	const candidates = [',', ';', '\t'] as const;
	let best: (typeof candidates)[number] = ',';
	let bestCount = 0;

	for (const delimiter of candidates) {
		let count = 0;
		let inQuotes = false;
		for (let i = 0; i < headerLine.length; i++) {
			const ch = headerLine[i];
			if (ch === '"') inQuotes = !inQuotes;
			if (!inQuotes && ch === delimiter) count++;
		}
		if (count > bestCount) {
			bestCount = count;
			best = delimiter;
		}
	}

	return best;
};

export const parseCsvText = (input: string): ParsedCsv => {
	const text = stripBom(input).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
	const headerLine = text.split('\n').find((line) => line.trim().length > 0) ?? '';
	const delimiter = detectDelimiter(headerLine);

	const rows: string[][] = [];
	let row: string[] = [];
	let cell = '';
	let inQuotes = false;

	const pushCell = () => {
		row.push(cell);
		cell = '';
	};

	const pushRow = () => {
		const isEmpty = row.every((c) => c.trim() === '');
		if (!isEmpty) rows.push(row);
		row = [];
	};

	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (inQuotes) {
			if (ch === '"') {
				const next = text[i + 1];
				if (next === '"') {
					cell += '"';
					i++;
				} else {
					inQuotes = false;
				}
				continue;
			}
			cell += ch;
			continue;
		}

		if (ch === '"') {
			inQuotes = true;
			continue;
		}

		if (ch === delimiter) {
			pushCell();
			continue;
		}

		if (ch === '\n') {
			pushCell();
			pushRow();
			continue;
		}

		cell += ch;
	}

	// flush remaining cell/row
	pushCell();
	pushRow();

	const headers = rows.shift()?.map((h) => h.trim()) ?? [];
	return { headers, rows, delimiter };
};

export type ProductUpsertRow = {
	tenant_id: string;
	sku: string;
	name: string;
	barcode?: string;
	status?: string;
	is_active?: boolean;
	location?: string;
	qty?: number;
	min?: number;
	price?: number;
	total_sold?: number;
	image_url?: string;
	// Legacy column kept for backward compatibility with older schemas.
	image?: string;
};

export type ClientUpsertRow = {
	tenant_id: string;
	external_id: string;
	name: string;
	email?: string;
	phone?: string;
	city?: string;
	last_purchase_at?: string;
};

export type SellerUpsertRow = {
	tenant_id: string;
	external_id: string;
	name: string;
	email?: string;
};

export type SalesOrderUpsertRow = {
	tenant_id: string;
	order_number: string;
	client_external_id?: string;
	seller_external_id?: string;
	status?: string;
	total_amount?: number;
	sold_at?: string;
	location?: string;
};

export type SalesItemUpsertRow = {
	tenant_id: string;
	order_number: string;
	sku?: string;
	qty?: number;
	unit_price?: number;
	total_price?: number;
};

const normalizeHeader = (value: string) =>
	value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');

type CanonicalField =
	| 'sku'
	| 'name'
	| 'barcode'
	| 'status'
	| 'is_active'
	| 'location'
	| 'qty'
	| 'min'
	| 'price'
	| 'total_sold'
	| 'image_url';

const HEADER_ALIASES: Record<string, CanonicalField> = {
	sku: 'sku',
	codigo: 'sku',
	cod: 'sku',
	referencia: 'sku',
	ref: 'sku',
	codigo_produto: 'sku',
	product_code: 'sku',
	id_produto: 'sku',

	name: 'name',
	nome: 'name',
	descricao: 'name',
	descrição: 'name',
	descricao_produto: 'name',
	produto: 'name',
	titulo: 'name',
	title: 'name',

	barcode: 'barcode',
	codigo_barras: 'barcode',
	codigo_de_barras: 'barcode',
	ean: 'barcode',
	gtin: 'barcode',

	status: 'status',
	situacao: 'status',
	estado: 'status',

	is_active: 'is_active',
	active: 'is_active',
	ativo: 'is_active',
	ativa: 'is_active',
	status_ativo: 'is_active',
	ativo_inativo: 'is_active',

	location: 'location',
	local: 'location',
	localizacao: 'location',
	localização: 'location',
	loja: 'location',

	qty: 'qty',
	quantidade: 'qty',
	estoque: 'qty',
	saldo: 'qty',
	quantidade_estoque: 'qty',
	total_estoque: 'qty',

	min: 'min',
	minimo: 'min',
	estoque_minimo: 'min',
	minimo_estoque: 'min',

	price: 'price',
	preco: 'price',
	preço: 'price',
	valor: 'price',
	preco_venda: 'price',
	valor_venda: 'price',

	total_sold: 'total_sold',
	totalvendido: 'total_sold',
	total_vendido: 'total_sold',
	vendidos: 'total_sold',
	qtd_vendida: 'total_sold',

	image: 'image_url',
	imagem: 'image_url',
	foto: 'image_url',
	photo: 'image_url',
	image_url: 'image_url',
	url_imagem: 'image_url',
};

const parseDecimal = (value: string) => {
	const trimmed = value.trim();
	if (!trimmed) return undefined;

	const cleaned = trimmed.replace(/[^\d.,-]/g, '');
	if (!cleaned) return undefined;

	const hasComma = cleaned.includes(',');
	const hasDot = cleaned.includes('.');

	let normalized = cleaned;
	if (hasComma && hasDot) {
		normalized = cleaned.replace(/\./g, '').replace(',', '.');
	} else if (hasComma && !hasDot) {
		normalized = cleaned.replace(',', '.');
	}

	const parsed = Number(normalized);
	return Number.isFinite(parsed) ? parsed : undefined;
};

const parseInteger = (value: string) => {
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	const match = trimmed.replace(/[^\d-]/g, '').match(/-?\d+/);
	if (!match) return undefined;
	const parsed = Number.parseInt(match[0], 10);
	return Number.isFinite(parsed) ? parsed : undefined;
};

const parseBoolean = (value: string) => {
	const normalized = value.trim().toLowerCase();
	if (!normalized) return undefined;
	if (['1', 'true', 't', 'yes', 'y', 'sim', 's', 'ativo', 'ativa'].includes(normalized)) return true;
	if (['0', 'false', 'f', 'no', 'n', 'nao', 'não', 'inativo', 'inativa'].includes(normalized)) return false;
	return undefined;
};

// Canonical form for managed-list values (product options AND store locations):
// trim, collapse internal whitespace, uppercase. Mirrors
// productOptions.normalizeOptionValue (kept local so this pure parser doesn't
// import the supabase-backed service). Every write path — the Onde/Local UI,
// the sale modal (which picks from the managed list), and these CSV importers —
// must land the SAME string, or the Dashboard store filter (strict === match)
// would split one real store across duplicate entries.
const normalizeManagedValue = (raw: string) => raw.trim().replace(/\s+/g, ' ').toUpperCase();

export type CsvProductsResult = {
	preview: Record<string, string>[];
	rows: ProductUpsertRow[];
	totalRows: number;
	validRows: number;
	skippedRows: number;
	warnings: string[];
};

export type CsvImportResult<T> = {
	preview: Record<string, string>[];
	rows: T[];
	totalRows: number;
	validRows: number;
	skippedRows: number;
	warnings: string[];
};

export const buildProductsFromCsvText = (csvText: string, tenantId: string): CsvProductsResult => {
	const { headers, rows } = parseCsvText(csvText);
	const warnings: string[] = [];

	if (!headers.length) {
		return { preview: [], rows: [], totalRows: 0, validRows: 0, skippedRows: 0, warnings: ['CSV sem cabeçalho.'] };
	}

	const canonicalByIndex: Array<CanonicalField | undefined> = headers.map((h) => {
		const normalized = normalizeHeader(h);
		const canonical = HEADER_ALIASES[normalized];
		return canonical;
	});

	const seenCanonicals = new Set(canonicalByIndex.filter(Boolean) as CanonicalField[]);
	if (!seenCanonicals.has('sku')) warnings.push('Coluna de SKU não detectada (ex: sku, código, referencia).');
	if (!seenCanonicals.has('name')) warnings.push('Coluna de nome não detectada (ex: name, nome, descrição).');

	const preview = rows.slice(0, 5).map((cols) => {
		return headers.reduce<Record<string, string>>((acc, header, idx) => {
			acc[header] = (cols[idx] ?? '').trim();
			return acc;
		}, {});
	});

	let skippedRows = 0;
	const productRows: ProductUpsertRow[] = [];

	for (const cols of rows) {
		const fields: Partial<Record<CanonicalField, string>> = {};
		for (let i = 0; i < cols.length; i++) {
			const canonical = canonicalByIndex[i];
			if (!canonical) continue;
			const existing = fields[canonical];
			const next = (cols[i] ?? '').trim();
			if (!existing && next) fields[canonical] = next;
		}

		const sku = (fields.sku ?? '').trim();
		const name = (fields.name ?? '').trim();
		if (!sku || !name) {
			skippedRows++;
			continue;
		}

		const row: ProductUpsertRow = {
			tenant_id: tenantId,
			sku,
			name,
		};

		const barcode = (fields.barcode ?? '').trim();
		if (barcode) row.barcode = barcode;

		const status = (fields.status ?? '').trim();
		if (status) row.status = status;

		const isActive = fields.is_active ? parseBoolean(fields.is_active) : undefined;
		if (typeof isActive === 'boolean') row.is_active = isActive;

		const location = normalizeManagedValue(fields.location ?? '');
		if (location) row.location = location;

		const qty = fields.qty ? parseInteger(fields.qty) : undefined;
		if (qty !== undefined) row.qty = qty;

		const min = fields.min ? parseInteger(fields.min) : undefined;
		if (min !== undefined) row.min = min;

		const price = fields.price ? parseDecimal(fields.price) : undefined;
		if (price !== undefined) row.price = price;

		const totalSold = fields.total_sold ? parseInteger(fields.total_sold) : undefined;
		if (totalSold !== undefined) row.total_sold = totalSold;

		const imageUrl = (fields.image_url ?? '').trim();
		if (imageUrl) {
			row.image_url = imageUrl;
			row.image = imageUrl;
		}

		productRows.push(row);
	}

	return {
		preview,
		rows: productRows,
		totalRows: rows.length,
		validRows: productRows.length,
		skippedRows,
		warnings,
	};
};

type ClientField = 'external_id' | 'name' | 'email' | 'phone' | 'city' | 'last_purchase_at';

const CLIENT_HEADER_ALIASES: Record<string, ClientField> = {
	external_id: 'external_id',
	cliente_id: 'external_id',
	client_id: 'external_id',
	codigo_cliente: 'external_id',
	cliente_codigo: 'external_id',
	documento: 'external_id',
	cpf: 'external_id',
	cnpj: 'external_id',
	id: 'external_id',

	name: 'name',
	nome: 'name',
	cliente: 'name',
	razao_social: 'name',
	fantasia: 'name',

	email: 'email',
	'e-mail': 'email',

	phone: 'phone',
	telefone: 'phone',
	celular: 'phone',
	fone: 'phone',

	city: 'city',
	cidade: 'city',
	municipio: 'city',

	last_purchase_at: 'last_purchase_at',
	ultima_compra: 'last_purchase_at',
	ultima_compra_em: 'last_purchase_at',
	data_ultima_compra: 'last_purchase_at',
	last_purchase: 'last_purchase_at',
};

export const buildClientsFromCsvText = (csvText: string, tenantId: string): CsvImportResult<ClientUpsertRow> => {
	const { headers, rows } = parseCsvText(csvText);
	const warnings: string[] = [];

	if (!headers.length) {
		return { preview: [], rows: [], totalRows: 0, validRows: 0, skippedRows: 0, warnings: ['CSV sem cabecalho.'] };
	}

	const canonicalByIndex: Array<ClientField | undefined> = headers.map((h) => {
		const normalized = normalizeHeader(h);
		return CLIENT_HEADER_ALIASES[normalized];
	});

	const seenCanonicals = new Set(canonicalByIndex.filter(Boolean) as ClientField[]);
	if (!seenCanonicals.has('name')) warnings.push('Coluna de nome nao detectada (ex: nome, name).');

	const preview = rows.slice(0, 5).map((cols) =>
		headers.reduce<Record<string, string>>((acc, header, idx) => {
			acc[header] = (cols[idx] ?? '').trim();
			return acc;
		}, {}),
	);

	let skippedRows = 0;
	const clientRows: ClientUpsertRow[] = [];

	for (const cols of rows) {
		const fields: Partial<Record<ClientField, string>> = {};
		for (let i = 0; i < cols.length; i++) {
			const canonical = canonicalByIndex[i];
			if (!canonical) continue;
			const existing = fields[canonical];
			const next = (cols[i] ?? '').trim();
			if (!existing && next) fields[canonical] = next;
		}

		const name = (fields.name ?? '').trim();
		if (!name) {
			skippedRows++;
			continue;
		}

		const external = (fields.external_id ?? '').trim();
		const email = (fields.email ?? '').trim();
		const phone = (fields.phone ?? '').trim();
		const city = (fields.city ?? '').trim();
		const lastPurchase = (fields.last_purchase_at ?? '').trim();
		const external_id = external || email || phone || name;

		if (!external_id) {
			skippedRows++;
			continue;
		}

		clientRows.push({
			tenant_id: tenantId,
			external_id,
			name,
			email: email || undefined,
			phone: phone || undefined,
			city: city || undefined,
			last_purchase_at: lastPurchase || undefined,
		});
	}

	return {
		preview,
		rows: clientRows,
		totalRows: rows.length,
		validRows: clientRows.length,
		skippedRows,
		warnings,
	};
};

type SellerField = 'external_id' | 'name' | 'email';

const SELLER_HEADER_ALIASES: Record<string, SellerField> = {
	external_id: 'external_id',
	vendedor_id: 'external_id',
	seller_id: 'external_id',
	codigo_vendedor: 'external_id',
	id: 'external_id',

	name: 'name',
	nome: 'name',
	vendedor: 'name',
	seller: 'name',
	nome_vendedor: 'name',

	email: 'email',
	'e-mail': 'email',
};

export const buildSellersFromCsvText = (csvText: string, tenantId: string): CsvImportResult<SellerUpsertRow> => {
	const { headers, rows } = parseCsvText(csvText);
	const warnings: string[] = [];

	if (!headers.length) {
		return { preview: [], rows: [], totalRows: 0, validRows: 0, skippedRows: 0, warnings: ['CSV sem cabecalho.'] };
	}

	const canonicalByIndex: Array<SellerField | undefined> = headers.map((h) => {
		const normalized = normalizeHeader(h);
		return SELLER_HEADER_ALIASES[normalized];
	});

	const preview = rows.slice(0, 5).map((cols) =>
		headers.reduce<Record<string, string>>((acc, header, idx) => {
			acc[header] = (cols[idx] ?? '').trim();
			return acc;
		}, {}),
	);

	let skippedRows = 0;
	const sellerRows: SellerUpsertRow[] = [];

	for (const cols of rows) {
		const fields: Partial<Record<SellerField, string>> = {};
		for (let i = 0; i < cols.length; i++) {
			const canonical = canonicalByIndex[i];
			if (!canonical) continue;
			const existing = fields[canonical];
			const next = (cols[i] ?? '').trim();
			if (!existing && next) fields[canonical] = next;
		}

		const name = (fields.name ?? '').trim();
		if (!name) {
			skippedRows++;
			continue;
		}

		const external = (fields.external_id ?? '').trim();
		const email = (fields.email ?? '').trim();
		const external_id = external || email || name;

		if (!external_id) {
			skippedRows++;
			continue;
		}

		sellerRows.push({
			tenant_id: tenantId,
			external_id,
			name,
			email: email || undefined,
		});
	}

	return {
		preview,
		rows: sellerRows,
		totalRows: rows.length,
		validRows: sellerRows.length,
		skippedRows,
		warnings,
	};
};

type OrderField =
	| 'order_number'
	| 'client_external_id'
	| 'seller_external_id'
	| 'status'
	| 'total_amount'
	| 'sold_at'
	| 'location';

const ORDER_HEADER_ALIASES: Record<string, OrderField> = {
	order_number: 'order_number',
	numero_pedido: 'order_number',
	numero: 'order_number',
	pedido: 'order_number',
	n_pedido: 'order_number',
	order_id: 'order_number',

	client_external_id: 'client_external_id',
	cliente_id: 'client_external_id',
	client_id: 'client_external_id',
	cliente_codigo: 'client_external_id',
	cliente: 'client_external_id',

	seller_external_id: 'seller_external_id',
	vendedor_id: 'seller_external_id',
	seller_id: 'seller_external_id',
	vendedor: 'seller_external_id',

	status: 'status',
	situacao: 'status',
	situacao_pedido: 'status',
	estado: 'status',

	total_amount: 'total_amount',
	valor_total: 'total_amount',
	total: 'total_amount',
	total_venda: 'total_amount',
	total_pedido: 'total_amount',
	valor: 'total_amount',

	sold_at: 'sold_at',
	data_venda: 'sold_at',
	data_pedido: 'sold_at',
	data: 'sold_at',
	date: 'sold_at',
	created_at: 'sold_at',

	location: 'location',
	local: 'location',
	localizacao: 'location',
	localização: 'location',
	loja: 'location',
};

export const buildSalesOrdersFromCsvText = (csvText: string, tenantId: string): CsvImportResult<SalesOrderUpsertRow> => {
	const { headers, rows } = parseCsvText(csvText);
	const warnings: string[] = [];

	if (!headers.length) {
		return { preview: [], rows: [], totalRows: 0, validRows: 0, skippedRows: 0, warnings: ['CSV sem cabecalho.'] };
	}

	const canonicalByIndex: Array<OrderField | undefined> = headers.map((h) => {
		const normalized = normalizeHeader(h);
		return ORDER_HEADER_ALIASES[normalized];
	});

	const seenCanonicals = new Set(canonicalByIndex.filter(Boolean) as OrderField[]);
	if (!seenCanonicals.has('order_number')) warnings.push('Coluna de numero do pedido nao detectada.');

	const preview = rows.slice(0, 5).map((cols) =>
		headers.reduce<Record<string, string>>((acc, header, idx) => {
			acc[header] = (cols[idx] ?? '').trim();
			return acc;
		}, {}),
	);

	let skippedRows = 0;
	const orderRows: SalesOrderUpsertRow[] = [];

	for (const cols of rows) {
		const fields: Partial<Record<OrderField, string>> = {};
		for (let i = 0; i < cols.length; i++) {
			const canonical = canonicalByIndex[i];
			if (!canonical) continue;
			const existing = fields[canonical];
			const next = (cols[i] ?? '').trim();
			if (!existing && next) fields[canonical] = next;
		}

		const orderNumber = (fields.order_number ?? '').trim();
		if (!orderNumber) {
			skippedRows++;
			continue;
		}

		const totalAmount = fields.total_amount ? parseDecimal(fields.total_amount) : undefined;

		orderRows.push({
			tenant_id: tenantId,
			order_number: orderNumber,
			client_external_id: (fields.client_external_id ?? '').trim() || undefined,
			seller_external_id: (fields.seller_external_id ?? '').trim() || undefined,
			status: (fields.status ?? '').trim() || undefined,
			total_amount: totalAmount,
			sold_at: (fields.sold_at ?? '').trim() || undefined,
			location: normalizeManagedValue(fields.location ?? '') || undefined,
		});
	}

	return {
		preview,
		rows: orderRows,
		totalRows: rows.length,
		validRows: orderRows.length,
		skippedRows,
		warnings,
	};
};

type ItemField = 'order_number' | 'sku' | 'qty' | 'unit_price' | 'total_price';

const ITEM_HEADER_ALIASES: Record<string, ItemField> = {
	order_number: 'order_number',
	numero_pedido: 'order_number',
	pedido: 'order_number',
	order_id: 'order_number',

	sku: 'sku',
	codigo_produto: 'sku',
	produto_id: 'sku',
	referencia: 'sku',
	ref: 'sku',
	codigo: 'sku',

	qty: 'qty',
	quantidade: 'qty',
	qtd: 'qty',
	quant: 'qty',

	unit_price: 'unit_price',
	preco_unitario: 'unit_price',
	valor_unitario: 'unit_price',
	preco: 'unit_price',
	valor: 'unit_price',

	total_price: 'total_price',
	total: 'total_price',
	valor_total: 'total_price',
	total_item: 'total_price',
};

export const buildSalesItemsFromCsvText = (csvText: string, tenantId: string): CsvImportResult<SalesItemUpsertRow> => {
	const { headers, rows } = parseCsvText(csvText);
	const warnings: string[] = [];

	if (!headers.length) {
		return { preview: [], rows: [], totalRows: 0, validRows: 0, skippedRows: 0, warnings: ['CSV sem cabecalho.'] };
	}

	const canonicalByIndex: Array<ItemField | undefined> = headers.map((h) => {
		const normalized = normalizeHeader(h);
		return ITEM_HEADER_ALIASES[normalized];
	});

	const seenCanonicals = new Set(canonicalByIndex.filter(Boolean) as ItemField[]);
	if (!seenCanonicals.has('order_number')) warnings.push('Coluna de numero do pedido nao detectada.');
	if (!seenCanonicals.has('sku')) warnings.push('Coluna de SKU nao detectada.');

	const preview = rows.slice(0, 5).map((cols) =>
		headers.reduce<Record<string, string>>((acc, header, idx) => {
			acc[header] = (cols[idx] ?? '').trim();
			return acc;
		}, {}),
	);

	let skippedRows = 0;
	const itemRows: SalesItemUpsertRow[] = [];

	for (const cols of rows) {
		const fields: Partial<Record<ItemField, string>> = {};
		for (let i = 0; i < cols.length; i++) {
			const canonical = canonicalByIndex[i];
			if (!canonical) continue;
			const existing = fields[canonical];
			const next = (cols[i] ?? '').trim();
			if (!existing && next) fields[canonical] = next;
		}

		const orderNumber = (fields.order_number ?? '').trim();
		const sku = (fields.sku ?? '').trim();
		if (!orderNumber || !sku) {
			skippedRows++;
			continue;
		}

		const qty = fields.qty ? parseInteger(fields.qty) : undefined;
		const unitPrice = fields.unit_price ? parseDecimal(fields.unit_price) : undefined;
		const totalPrice = fields.total_price ? parseDecimal(fields.total_price) : undefined;

		itemRows.push({
			tenant_id: tenantId,
			order_number: orderNumber,
			sku,
			qty: qty ?? undefined,
			unit_price: unitPrice ?? undefined,
			total_price: totalPrice ?? undefined,
		});
	}

	return {
		preview,
		rows: itemRows,
		totalRows: rows.length,
		validRows: itemRows.length,
		skippedRows,
		warnings,
	};
};

// ---- Product options (Onde / Local) import --------------------------------

export type ProductOptionUpsertRow = {
	tenant_id: string;
	kind: 'onde' | 'local';
	value: string;
	sort_order?: number;
};

type OptionField = 'kind' | 'value' | 'sort_order';

const OPTION_HEADER_ALIASES: Record<string, OptionField> = {
	kind: 'kind',
	tipo: 'kind',
	lista: 'kind',

	value: 'value',
	valor: 'value',
	nome: 'value',
	name: 'value',

	sort_order: 'sort_order',
	ordem: 'sort_order',
	sort: 'sort_order',
};

const OPTION_KINDS = new Set(['onde', 'local']);

export const buildProductOptionsFromCsvText = (
	csvText: string,
	tenantId: string,
): CsvImportResult<ProductOptionUpsertRow> => {
	const { headers, rows } = parseCsvText(csvText);
	const warnings: string[] = [];

	if (!headers.length) {
		return { preview: [], rows: [], totalRows: 0, validRows: 0, skippedRows: 0, warnings: ['CSV sem cabecalho.'] };
	}

	const canonicalByIndex: Array<OptionField | undefined> = headers.map((h) => {
		const normalized = normalizeHeader(h);
		return OPTION_HEADER_ALIASES[normalized];
	});

	const seenCanonicals = new Set(canonicalByIndex.filter(Boolean) as OptionField[]);
	if (!seenCanonicals.has('kind')) warnings.push('Coluna de tipo (kind) nao detectada.');
	if (!seenCanonicals.has('value')) warnings.push('Coluna de valor (value) nao detectada.');

	const preview = rows.slice(0, 5).map((cols) =>
		headers.reduce<Record<string, string>>((acc, header, idx) => {
			acc[header] = (cols[idx] ?? '').trim();
			return acc;
		}, {}),
	);

	let skippedRows = 0;
	const optionRows: ProductOptionUpsertRow[] = [];

	for (const cols of rows) {
		const fields: Partial<Record<OptionField, string>> = {};
		for (let i = 0; i < cols.length; i++) {
			const canonical = canonicalByIndex[i];
			if (!canonical) continue;
			const existing = fields[canonical];
			const next = (cols[i] ?? '').trim();
			if (!existing && next) fields[canonical] = next;
		}

		const kind = (fields.kind ?? '').trim().toLowerCase();
		const value = normalizeManagedValue(fields.value ?? '');
		if (!OPTION_KINDS.has(kind) || !value) {
			skippedRows++;
			continue;
		}

		const sortOrder = fields.sort_order ? parseInteger(fields.sort_order) : undefined;

		optionRows.push({
			tenant_id: tenantId,
			kind: kind as 'onde' | 'local',
			value,
			sort_order: sortOrder ?? undefined,
		});
	}

	return {
		preview,
		rows: optionRows,
		totalRows: rows.length,
		validRows: optionRows.length,
		skippedRows,
		warnings,
	};
};
