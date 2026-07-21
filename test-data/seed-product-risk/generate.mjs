#!/usr/bin/env node
// (Re)gera os CSVs deste seed a partir de OFFSETS EM DIAS relativos a "agora"
// (o instante em que este script roda), nunca de datas fixas escritas à mão.
// Rode de novo sempre que as datas tiverem envelhecido:
//   node test-data/seed-product-risk/generate.mjs
//
// Por que timestamps ISO completos (com hora) em vez de "YYYY-MM-DD":
// `getProductRisk` compara `daysSince(sold_at, now) > 30` com `now = new Date()`
// calculado ao vivo, no instante em que a tela é aberta — que é sempre um pouco
// DEPOIS do instante em que este gerador rodou. Para os dois cenários de
// fronteira (RSK-009 "quase 30 dias" e RSK-010 "31 dias"), isso importa:
//   - RSK-010 (deve ficar crítico) usa uma folga grande (31 dias) — o tempo só
//     empurra `daysSince` para MAIS longe de 30, nunca de volta pra baixo, então
//     fica seguro para sempre depois de gerado.
//   - RSK-009 (deve ficar NÃO crítico) usa 29,5 dias (29 dias e 12h) em vez de
//     exatos 30,0 — dá ~12h de folga entre "gerar o CSV" e "importar e olhar a
//     tela" antes de `daysSince` ultrapassar 30 e o cenário virar crítico sem
//     querer. Se você gerar de manhã e só for testar à noite (ou no dia
//     seguinte), rode o gerador de novo pouco antes de importar.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = dirname(fileURLToPath(import.meta.url));
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NOW = new Date();

/** ISO timestamp `daysAgo` dias (pode ser fracionário) antes de NOW. */
const isoDaysAgo = (daysAgo) => new Date(NOW.getTime() - daysAgo * MS_PER_DAY).toISOString();

const STORE = 'LOJA RISCO';
const PRICE = 50;

// ---------------------------------------------------------------------------
// Produtos (um por cenário da tabela do README). `image` controla se
// image_url vai preenchido (qualquer URL placeholder — o conteúdo não importa,
// só o campo estar presente/ausente, que é o que `getProductRisk` olha).
// `min: null` deixa a coluna vazia no CSV (min NÃO definido, não é zero).
// ---------------------------------------------------------------------------
const PRODUCTS = [
	{ sku: 'RSK-001', name: 'Controle saudavel', status: 'ESTOQUE', qty: 50, min: 10, image: true },
	{ sku: 'RSK-002', name: 'Vitrine sem giro', status: 'VITRINE', qty: 50, min: 10, image: true },
	{ sku: 'RSK-003', name: 'Vitrine precisa comprar', status: 'VITRINE', qty: 5, min: 10, image: true },
	{ sku: 'RSK-004', name: 'Estoque zerado sem minimo', status: 'ESTOQUE', qty: 0, min: null, image: true },
	{ sku: 'RSK-005', name: 'Sem foto cadastrada', status: 'ESTOQUE', qty: 50, min: 10, image: false },
	{ sku: 'RSK-006', name: 'Nunca vendido recem cadastrado', status: 'ESTOQUE', qty: 50, min: 10, image: true },
	{ sku: 'RSK-007', name: 'Nunca vendido antigo (exige SQL)', status: 'ESTOQUE', qty: 50, min: 10, image: true },
	{ sku: 'RSK-008', name: 'Venda recente estornada', status: 'ESTOQUE', qty: 50, min: 10, image: true },
	{ sku: 'RSK-009', name: 'Fronteira quase 30 dias', status: 'ESTOQUE', qty: 50, min: 10, image: true },
	{ sku: 'RSK-010', name: 'Fronteira 31 dias', status: 'ESTOQUE', qty: 50, min: 10, image: true },
];

// ---------------------------------------------------------------------------
// Vendas. RSK-006 e RSK-007 propositalmente NÃO aparecem aqui (nunca vendidos).
// RSK-008 tem duas: a venda válida de 60 dias atrás (a que deve contar) e uma
// venda de só 3 dias atrás só que ESTORNADA (não pode contar como giro).
// ---------------------------------------------------------------------------
const SALES = [
	{ order: 'RSK-ORD-001', sku: 'RSK-001', daysAgo: 5, status: 'manual' },
	{ order: 'RSK-ORD-002', sku: 'RSK-002', daysAgo: 60, status: 'manual' },
	{ order: 'RSK-ORD-003', sku: 'RSK-003', daysAgo: 3, status: 'manual' },
	{ order: 'RSK-ORD-004', sku: 'RSK-004', daysAgo: 2, status: 'manual' },
	{ order: 'RSK-ORD-005', sku: 'RSK-005', daysAgo: 5, status: 'manual' },
	{ order: 'RSK-ORD-008A', sku: 'RSK-008', daysAgo: 60, status: 'manual' },
	{ order: 'RSK-ORD-008B', sku: 'RSK-008', daysAgo: 3, status: 'voided' },
	{ order: 'RSK-ORD-009', sku: 'RSK-009', daysAgo: 29.5, status: 'manual' },
	{ order: 'RSK-ORD-010', sku: 'RSK-010', daysAgo: 31, status: 'manual' },
];

const CLIENT_EXTERNAL_ID = 'RSK-CLI';
const SELLER_EXTERNAL_ID = 'RSK-VEND';

const csvEscape = (value) => {
	const str = String(value ?? '');
	return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

const toCsv = (headers, rows) => [headers.join(','), ...rows.map((row) => row.map(csvEscape).join(','))].join('\n') + '\n';

const write = (filename, content) => {
	writeFileSync(join(DIR, filename), content, 'utf8');
	console.log(`wrote ${filename}`);
};

// 1_options.csv — Locais / Campos (Onde / Local)
write(
	'1_options.csv',
	toCsv(
		['kind', 'value', 'sort_order'],
		[
			['local', STORE, 1],
			['onde', 'ESTOQUE', 1],
			['onde', 'VITRINE', 2],
		],
	),
);

// 2_products.csv
write(
	'2_products.csv',
	toCsv(
		['sku', 'name', 'status', 'location', 'qty', 'min', 'price', 'image_url', 'is_active'],
		PRODUCTS.map((p) => [
			p.sku,
			p.name,
			p.status,
			STORE,
			p.qty,
			p.min === null ? '' : p.min,
			PRICE,
			p.image ? `https://placehold.co/200x200?text=${p.sku}` : '',
			'true',
		]),
	),
);

// 3_clients.csv
write('3_clients.csv', toCsv(['name', 'external_id', 'city'], [['Cliente Risco', CLIENT_EXTERNAL_ID, 'Brasilia']]));

// 4_sellers.csv
write('4_sellers.csv', toCsv(['name', 'external_id'], [['Vendedor Risco', SELLER_EXTERNAL_ID]]));

// 5_sales_orders.csv
write(
	'5_sales_orders.csv',
	toCsv(
		['order_number', 'client_external_id', 'seller_external_id', 'status', 'total_amount', 'sold_at', 'location'],
		SALES.map((s) => [s.order, CLIENT_EXTERNAL_ID, SELLER_EXTERNAL_ID, s.status, PRICE, isoDaysAgo(s.daysAgo), STORE]),
	),
);

// 6_sales_items.csv
write(
	'6_sales_items.csv',
	toCsv(
		['order_number', 'sku', 'qty', 'unit_price', 'total_price'],
		SALES.map((s) => [s.order, s.sku, 1, PRICE, PRICE]),
	),
);

console.log(`\nGerado em: ${NOW.toISOString()}`);
console.log('Offsets (dias atrás) por venda:');
SALES.forEach((s) => console.log(`  ${s.order} (${s.sku}, ${s.status}): ${s.daysAgo}d -> ${isoDaysAgo(s.daysAgo)}`));
