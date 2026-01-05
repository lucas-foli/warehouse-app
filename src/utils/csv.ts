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
	location?: string;
	qty?: number;
	min?: number;
	price?: number;
	total_sold?: number;
	image?: string;
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
	| 'location'
	| 'qty'
	| 'min'
	| 'price'
	| 'total_sold'
	| 'image';

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

	image: 'image',
	imagem: 'image',
	foto: 'image',
	photo: 'image',
	image_url: 'image',
	url_imagem: 'image',
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

export type CsvProductsResult = {
	preview: Record<string, string>[];
	rows: ProductUpsertRow[];
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

		const location = (fields.location ?? '').trim();
		if (location) row.location = location;

		const qty = fields.qty ? parseInteger(fields.qty) : undefined;
		if (qty !== undefined) row.qty = qty;

		const min = fields.min ? parseInteger(fields.min) : undefined;
		if (min !== undefined) row.min = min;

		const price = fields.price ? parseDecimal(fields.price) : undefined;
		if (price !== undefined) row.price = price;

		const totalSold = fields.total_sold ? parseInteger(fields.total_sold) : undefined;
		if (totalSold !== undefined) row.total_sold = totalSold;

		const image = (fields.image ?? '').trim();
		if (image) row.image = image;

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

