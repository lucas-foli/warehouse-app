import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpcMock = vi.fn();
const rangeMock = vi.fn();
// Páginas que o `from(...).range(...)` mockado devolve, uma por chamada, na
// ordem em que os testes de paginação as definem. Sobra `[]` para chamadas
// além do que o teste configurou.
let fromPages: Record<string, unknown>[][] = [];

// Instrumentação da query montada pela última chamada a `.select(...)` e a
// cada filtro (`eq`/`gte`/`lte`) — sem isso um teste não consegue provar que
// o filtro certo foi ao banco, só que *alguma* query rodou.
let lastSelect: string | null = null;
let lastFilters: [string, string, unknown][] = [];

// Nome de cada tabela passada a `supabase.from(...)`, na ordem das chamadas —
// sem isso nenhum teste provava QUAL tabela foi consultada, só que alguma foi.
let fromCalls: string[] = [];

vi.mock('../lib/supabaseClient', () => {
	const makeBuilder = () => {
		const builder: Record<string, unknown> = {};
		builder.select = (sel: string) => {
			lastSelect = sel;
			return builder;
		};
		const filter = (op: string) => (col: string, val: unknown) => {
			lastFilters.push([op, col, val]);
			return builder;
		};
		builder.eq = filter('eq');
		builder.gte = filter('gte');
		builder.lte = filter('lte');
		builder.order = () => builder;
		builder.range = (...args: unknown[]) => {
			rangeMock(...args);
			const page = fromPages[rangeMock.mock.calls.length - 1] ?? [];
			return Promise.resolve({ data: page, error: null });
		};
		return builder;
	};
	return {
		supabase: {
			rpc: (...args: unknown[]) => rpcMock(...args),
			from: (table: string) => {
				fromCalls.push(table);
				return makeBuilder();
			},
		},
	};
});

import { mergeSamples } from './fieldService';

describe('mergeSamples', () => {
	it('soma quantidades de SKUs duplicados (case/espaço-insensível)', () => {
		// mata: mutação que não agrega ou não normaliza o SKU
		expect(
			mergeSamples([
				{ sku: 'pop-401', qty: 2 },
				{ sku: ' POP-401 ', qty: 1 },
				{ sku: 'POP-114', qty: 1 },
			]),
		).toEqual([
			{ sku: 'POP-401', qty: 3 },
			{ sku: 'POP-114', qty: 1 },
		]);
	});

	it('descarta linhas sem SKU ou com qty <= 0', () => {
		// mata: mutação que deixa lixo passar para a RPC
		expect(
			mergeSamples([
				{ sku: '  ', qty: 2 },
				{ sku: 'POP-401', qty: 0 },
				{ sku: 'POP-401', qty: -1 },
				{ sku: 'POP-401', qty: 1.5 },
			]),
		).toEqual([]);
	});

	it('preserva a ordem da primeira ocorrência', () => {
		// mata: mutação que reordena (a UI mostra a lista na ordem digitada)
		expect(
			mergeSamples([
				{ sku: 'B', qty: 1 },
				{ sku: 'A', qty: 1 },
				{ sku: 'B', qty: 1 },
			]).map((s) => s.sku),
		).toEqual(['B', 'A']);
	});
});

describe('registerInteraction', () => {
	beforeEach(() => rpcMock.mockReset());

	it('traduz código de erro da RPC para pt-BR', async () => {
		// mata: mutação que quebra um código do mapa (operador veria erro cru do Postgres)
		rpcMock.mockResolvedValue({ data: null, error: { message: 'interaction_sample_sku_unknown em contexto' } });
		const { registerInteraction } = await import('./fieldService');
		await expect(
			registerInteraction({ tenantId: 't1', clientId: 'c1', kind: 'visit' }),
		).rejects.toThrow('SKU de amostra não encontrado neste catálogo.');
	});

	it('devolve negativeSkus sem lançar e envia p_samples mergeado', async () => {
		// mata: mutação que fixa negativeSkus=[] (aviso de estoque negativo sumiria em silêncio)
		rpcMock.mockResolvedValue({ data: { interaction_id: 'i1', negative_skus: ['POP-401'] }, error: null });
		const { registerInteraction } = await import('./fieldService');
		const result = await registerInteraction({
			tenantId: 't1',
			clientId: 'c1',
			kind: 'visit',
			samples: [
				{ sku: 'pop-401', qty: 2 },
				{ sku: ' POP-401 ', qty: 1 },
			],
		});
		expect(result).toEqual({ interactionId: 'i1', negativeSkus: ['POP-401'] });
		expect(rpcMock).toHaveBeenCalledWith(
			'register_interaction',
			expect.objectContaining({ p_samples: [{ sku: 'POP-401', qty: 3 }] }),
		);
	});
});

describe('fetchFieldContacts paginação', () => {
	beforeEach(() => {
		rangeMock.mockClear();
		fromPages = [];
	});

	const makeContactRow = (i: number): Record<string, unknown> => ({
		contact_type: 'supplier',
		id: `id-${String(i).padStart(5, '0')}`,
		tenant_id: 't1',
		name: `Fornecedor ${i}`,
		city: null,
		phone: null,
		email: null,
		manual_stage: null,
		stage_overridden_at: null,
		last_interaction_at: null,
		has_transaction: false,
		last_outcome: null,
		has_samples: false,
		has_interaction: false,
		last_fact_at: null,
	});

	it('busca todas as páginas quando o tenant passa de 1000 contatos', async () => {
		// mata: fetch sem range (devolveria só a primeira página, que é o bug do e2e)
		const page1 = Array.from({ length: 1000 }, (_, i) => makeContactRow(i));
		const page2 = Array.from({ length: 3 }, (_, i) => makeContactRow(1000 + i));
		fromPages = [page1, page2];
		const { fetchFieldContacts } = await import('./fieldService');

		const result = await fetchFieldContacts('t1');

		expect(result).toHaveLength(1003);
		expect(rangeMock).toHaveBeenCalledTimes(2);
	});

	it('para na primeira página incompleta', async () => {
		// mata: loop infinito ou chamada extra desnecessária
		fromPages = [Array.from({ length: 3 }, (_, i) => makeContactRow(i))];
		const { fetchFieldContacts } = await import('./fieldService');

		const result = await fetchFieldContacts('t1');

		expect(result).toHaveLength(3);
		expect(rangeMock).toHaveBeenCalledTimes(1);
	});
});

describe('fetchInteractionsInWindow', () => {
	beforeEach(() => {
		rangeMock.mockClear();
		fromPages = [];
		lastSelect = null;
		lastFilters = [];
	});

	it('pede ao banco só o que está na janela, com as amostras juntas', async () => {
		// mata: buscar tudo e filtrar no cliente (traria meses de histórico por
		// página de 1000 linhas), ou esquecer o join de interaction_samples
		const { fetchInteractionsInWindow } = await import('./fieldService');
		const w = { from: '2026-09-01T00:00:00.000Z', to: '2026-09-08T00:00:00.000Z' };
		await fetchInteractionsInWindow('t1', w);
		expect(lastSelect).toContain('interaction_samples');
		expect(lastFilters).toContainEqual(['gte', 'occurred_at', w.from]);
	});

	it('não manda filtro inferior quando a janela é "tudo"', async () => {
		// mata: mandar `gte occurred_at null`, que o PostgREST rejeita
		const { fetchInteractionsInWindow } = await import('./fieldService');
		await fetchInteractionsInWindow('t1', { from: null, to: '2026-09-08T00:00:00.000Z' });
		expect(lastFilters.some(([op, col]) => op === 'gte' && col === 'occurred_at')).toBe(false);
	});
});

describe('fetchContactCreatedAts', () => {
	beforeEach(() => {
		rangeMock.mockClear();
		fromPages = [];
		fromCalls = [];
	});

	it('lê clients e suppliers e junta as datas de cadastro das duas', async () => {
		// mata: apagar a leitura de `suppliers` (ou de `clients`) do Promise.all —
		// o KPI "contatos novos" mostraria um número menor, sem erro nenhum
		fromPages = [
			[{ id: 'c1', created_at: '2026-09-01T00:00:00.000Z' }],
			[{ id: 's1', created_at: '2026-09-02T00:00:00.000Z' }],
		];
		const { fetchContactCreatedAts } = await import('./fieldService');
		const result = await fetchContactCreatedAts('t1');
		expect(fromCalls).toEqual(expect.arrayContaining(['clients', 'suppliers']));
		expect(result).toEqual(
			expect.arrayContaining(['2026-09-01T00:00:00.000Z', '2026-09-02T00:00:00.000Z']),
		);
		expect(result).toHaveLength(2);
	});

	it('descarta created_at nulo em vez de incluir null/vazio na lista', async () => {
		// mata: remover o `.filter((at): at is string => Boolean(at))` — um
		// created_at nulo viraria `null` ou string vazia na lista de datas
		fromPages = [
			[
				{ id: 'c1', created_at: '2026-09-01T00:00:00.000Z' },
				{ id: 'c2', created_at: null },
			],
			[],
		];
		const { fetchContactCreatedAts } = await import('./fieldService');
		const result = await fetchContactCreatedAts('t1');
		expect(result).toEqual(['2026-09-01T00:00:00.000Z']);
	});
});
