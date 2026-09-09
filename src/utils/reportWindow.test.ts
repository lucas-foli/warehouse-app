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

	it('inclui a borda superior', () => {
		// mata: trocar >= por > (ou remover o guard) no limite superior — um instante
		// igual a `w.to` passaria a ficar fora da janela
		expect(inWindow('2026-09-08T12:00:00.000Z', w)).toBe(true);
	});

	it('exclui o instante posterior à borda superior', () => {
		// mata: remover o guard `t > to` (ou trocar por `t >= to`) — um instante
		// depois de `w.to` passaria a contar como dentro da janela
		expect(inWindow('2026-09-08T12:00:00.001Z', w)).toBe(false);
	});

	it('trata data inválida como fora, mesmo em "tudo"', () => {
		// mata: remover o guard `Number.isNaN(t)` — uma string não parseável
		// viraria `NaN`, e comparações com NaN são sempre `false`, então o
		// guard `t > to` deixaria passar e o resultado incorreto seria `true`
		expect(inWindow('não é data', resolveWindow('all', NOW))).toBe(false);
	});

	it('em "Tudo", inclui data futura (sem teto)', () => {
		// mata: aplicar o teto `t > to` também quando `from` é null — um
		// input type="date" sem `max` aceita data futura, e products.qty já
		// conta o fato; "Tudo" não pode escondê-lo
		expect(inWindow('2026-12-25T00:00:00.000Z', resolveWindow('all', NOW))).toBe(true);
	});

	it('em período limitado, mantém o teto mesmo com data futura', () => {
		// mata: remover o teto de vez (não só em "Tudo") — um fato futuro
		// passaria a contar em "30 dias" mesmo com from/to definidos
		expect(inWindow('2026-12-25T00:00:00.000Z', resolveWindow('30d', NOW))).toBe(false);
	});
});
