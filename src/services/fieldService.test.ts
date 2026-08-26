import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpcMock = vi.fn();
vi.mock('../lib/supabaseClient', () => ({
	supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

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
