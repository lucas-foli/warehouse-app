import { describe, expect, it } from 'vitest';
import type { FieldContact, Product, Receipt, ReceiptItem } from '../types';
import type { SalesItem, SalesOrder } from '../services/dashboardService';
import { resolveWindow } from './reportWindow';
import { buildReceivedVsSold, buildReceivedBySupplier } from './receivedVsSold';

const NOW = new Date('2026-09-08T12:00:00.000Z');
const W = resolveWindow('30d', NOW);

const product = (sku: string, qty: number, name = sku): Product => ({
	id: sku, name, sku, status: 'ativo', location: 'Miami', qty,
});

const receipt = (id: string, supplierId: string, receivedAt: string): Receipt => ({
	id, tenantId: 't1', receiptNumber: `R-${id}`, supplierId, receivedAt,
	document: null, note: null, totalCost: null, createdBy: null,
	createdAt: receivedAt, updatedAt: receivedAt,
});

const rItem = (receiptId: string, sku: string, qty: number): ReceiptItem => ({
	id: `${receiptId}-${sku}`, tenantId: 't1', receiptId, receiptNumber: `R-${receiptId}`,
	productId: null, sku, qty, unitCost: null, totalCost: null, createdAt: '2026-09-01T00:00:00.000Z',
});

const order = (orderNumber: string, soldAt: string): SalesOrder => ({
	id: orderNumber, order_number: orderNumber, location: 'Miami',
	total_amount: 0, sold_at: soldAt,
});

const sItem = (orderNumber: string, sku: string, qty: number): SalesItem => ({
	order_number: orderNumber, sku, qty,
});

const supplier = (id: string, name: string): FieldContact => ({
	contactType: 'supplier', id, tenantId: 't1', name, manualStage: null,
	stageOverriddenAt: null, lastInteractionAt: null, hasTransaction: false,
	lastOutcome: null, hasSamples: false, hasInteraction: false, lastFactAt: null,
});

const base = {
	products: [product('CAM-1620', 200, 'Camarão 16/20')],
	suppliers: [supplier('s1', 'Noronha Pescados'), supplier('s2', 'Atlântico Sul')],
	window: W,
};

describe('buildReceivedVsSold', () => {
	it('soma recebido e vendido da janela e usa o saldo de agora', () => {
		// mata: derivar o saldo de recebido-vendido (o número deixaria de bater
		// com a tela de Produtos, que mostra products.qty)
		const rows = buildReceivedVsSold({
			...base,
			receipts: [receipt('r1', 's1', '2026-09-01T00:00:00.000Z')],
			receiptItems: [rItem('r1', 'CAM-1620', 500)],
			orders: [order('o1', '2026-09-02T00:00:00.000Z')],
			salesItems: [sItem('o1', 'CAM-1620', 300)],
		});
		expect(rows).toEqual([{
			sku: 'CAM-1620', name: 'Camarão 16/20', received: 500, sold: 300,
			balance: 200, supplierName: 'Noronha Pescados', multipleSuppliers: false,
		}]);
	});

	it('exclui recebimento e venda fora da janela', () => {
		// mata: ignorar a janela num dos dois lados (o mais provável é sobrar
		// no lado das vendas, cujo filtro mora no pedido, não no item)
		const rows = buildReceivedVsSold({
			...base,
			receipts: [receipt('r1', 's1', '2026-01-01T00:00:00.000Z')],
			receiptItems: [rItem('r1', 'CAM-1620', 500)],
			orders: [order('o1', '2026-01-02T00:00:00.000Z')],
			salesItems: [sItem('o1', 'CAM-1620', 300)],
		});
		expect(rows[0]).toMatchObject({ received: 0, sold: 0, balance: 200 });
	});

	it('marca SKU com mais de um fornecedor e mostra o do recebimento mais recente', () => {
		// mata: pegar o primeiro fornecedor da lista, ou esquecer a marcação
		const rows = buildReceivedVsSold({
			...base,
			receipts: [
				receipt('r1', 's1', '2026-08-20T00:00:00.000Z'),
				receipt('r2', 's2', '2026-09-03T00:00:00.000Z'),
			],
			receiptItems: [rItem('r1', 'CAM-1620', 100), rItem('r2', 'CAM-1620', 50)],
			orders: [], salesItems: [],
		});
		expect(rows[0]).toMatchObject({
			received: 150, supplierName: 'Atlântico Sul', multipleSuppliers: true,
		});
	});

	it('inclui SKU vendido que nunca foi recebido', () => {
		// mata: montar as linhas só a partir dos recebimentos (o produto some
		// da tabela e a venda dele desaparece do painel)
		const rows = buildReceivedVsSold({
			...base,
			receipts: [], receiptItems: [],
			orders: [order('o1', '2026-09-02T00:00:00.000Z')],
			salesItems: [sItem('o1', 'CAM-1620', 30)],
		});
		expect(rows[0]).toMatchObject({ received: 0, sold: 30, supplierName: null });
	});

	it('descarta receiptItem cujo receiptId não tem recebimento correspondente (órfão)', () => {
		// mata: cair para qualquer data substituta em vez de descartar a linha —
		// mesma condição que sampleCost.lastKnownCostBySku agora também descarta,
		// pela mesma razão: sem o recebimento, não há data de fato conhecida.
		const rows = buildReceivedVsSold({
			...base,
			receipts: [], // 'r-orfao' não existe em `receipts`
			receiptItems: [rItem('r-orfao', 'CAM-1620', 500)],
			orders: [], salesItems: [],
		});
		expect(rows[0]).toMatchObject({ received: 0, supplierName: null, multipleSuppliers: false });
	});

	it('casa SKU com caixa e espaço diferentes', () => {
		// (ver abaixo o describe de buildReceivedBySupplier)
		// mata: comparar sku cru entre produto, recebimento e venda
		const rows = buildReceivedVsSold({
			...base,
			receipts: [receipt('r1', 's1', '2026-09-01T00:00:00.000Z')],
			receiptItems: [rItem('r1', ' cam-1620 ', 10)],
			orders: [order('o1', '2026-09-02T00:00:00.000Z')],
			salesItems: [sItem('o1', 'cam-1620', 4)],
		});
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ sku: 'CAM-1620', received: 10, sold: 4 });
	});
});

describe('buildReceivedBySupplier', () => {
	it('soma quantidade e custo por fornecedor dentro da janela', () => {
		// mata: somar tudo num fornecedor só, ou ignorar a janela
		const rows = buildReceivedBySupplier({
			receipts: [
				receipt('r1', 's1', '2026-09-01T00:00:00.000Z'),
				receipt('r2', 's2', '2026-09-02T00:00:00.000Z'),
				receipt('r3', 's1', '2026-01-01T00:00:00.000Z'),
			],
			receiptItems: [
				{ ...rItem('r1', 'CAM-1620', 100), unitCost: 2 },
				{ ...rItem('r2', 'TIL-FIL', 40), unitCost: 3 },
				{ ...rItem('r3', 'CAM-1620', 999), unitCost: 9 },
			],
			suppliers: base.suppliers,
			window: W,
		});
		expect(rows).toEqual([
			{ supplierId: 's1', name: 'Noronha Pescados', qty: 100, cost: 200, partial: false },
			{ supplierId: 's2', name: 'Atlântico Sul', qty: 40, cost: 120, partial: false },
		]);
	});

	it('conta a quantidade mesmo sem custo na linha', () => {
		// mata: descartar a linha sem custo (o recebido do fornecedor sumiria)
		const rows = buildReceivedBySupplier({
			receipts: [receipt('r1', 's1', '2026-09-01T00:00:00.000Z')],
			receiptItems: [rItem('r1', 'CAM-1620', 100)],
			suppliers: base.suppliers,
			window: W,
		});
		expect(rows[0]).toMatchObject({ qty: 100, cost: 0 });
	});

	it('marca o total como parcial quando alguma linha do fornecedor não tem custo', () => {
		// mata: não marcar `partial` (o card exibiria um total incompleto com
		// cara de valor fechado — a regra "total parcial sempre que N > 0" vale
		// aqui como vale para amostras)
		const rows = buildReceivedBySupplier({
			receipts: [receipt('r1', 's1', '2026-09-01T00:00:00.000Z')],
			receiptItems: [
				{ ...rItem('r1', 'CAM-1620', 100), unitCost: 2 },
				{ ...rItem('r1', 'TIL-FIL', 40), unitCost: null },
			],
			suppliers: base.suppliers,
			window: W,
		});
		expect(rows[0]).toMatchObject({ qty: 140, cost: 200, partial: true });
	});
});
