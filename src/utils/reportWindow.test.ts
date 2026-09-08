import { describe, expect, it } from 'vitest';
import { inWindow, resolveWindow } from './reportWindow';

const NOW = new Date('2026-09-08T12:00:00.000Z');

describe('resolveWindow', () => {
	it('7d volta exatamente 7 dias a partir de now', () => {
		// mata: usar 7*24h+1, mês corrente, ou ignorar o `now` recebido
		expect(resolveWindow('7d', NOW)).toEqual({
			from: '2026-09-01T12:00:00.000Z',
			to: '2026-09-08T12:00:00.000Z',
		});
	});

	it('all não tem limite inferior', () => {
		// mata: devolver uma data antiga qualquer no lugar de null
		expect(resolveWindow('all', NOW).from).toBeNull();
	});
});

describe('inWindow', () => {
	const w = resolveWindow('7d', NOW);

	it('inclui a borda inferior', () => {
		// mata: trocar >= por > no limite inferior (o fato do primeiro dia sumiria)
		expect(inWindow('2026-09-01T12:00:00.000Z', w)).toBe(true);
	});

	it('exclui o instante anterior à borda', () => {
		// mata: ignorar o `from` e aceitar tudo
		expect(inWindow('2026-09-01T11:59:59.999Z', w)).toBe(false);
	});

	it('trata data ausente como fora', () => {
		// mata: `null` virar epoch 0 e passar a contar como dentro de "tudo"
		expect(inWindow(null, resolveWindow('all', NOW))).toBe(false);
	});
});
