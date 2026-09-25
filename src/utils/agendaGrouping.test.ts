/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { groupAgenda } from './agendaGrouping';

// Fusos com DST são o caso que quebra aritmética de ms sobre dias — fixamos
// o fuso do runner num que TEM DST (o produto é US-first) para os testes de
// fronteira valerem em qualquer máquina.
process.env.TZ = 'America/New_York';

// "now" fixo: qua 2026-08-26 15:00 no fuso LOCAL do runner — o agrupamento é
// por dia local (o Elcy pensa em "hoje", não em UTC).
const now = new Date(2026, 7, 26, 15, 0, 0);
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).toISOString();

const item = (dueAt: string | null) => ({ nextStepDueAt: dueAt });

describe('groupAgenda', () => {
	it('ontem → overdue; hoje (mesmo mais tarde) → today', () => {
		// mata: fronteiras de ontem/hoje deslocadas (o floor do due virou
		// equivalente após o fix DST; o que este teste mata é a fronteira)
		const groups = groupAgenda([item(at(2026, 7, 25)), item(at(2026, 7, 26, 23))], now);
		expect(groups.overdue).toHaveLength(1);
		expect(groups.today).toHaveLength(1);
	});

	it('amanhã até +7 dias → week; além → later', () => {
		// mata: off-by-one no limite de 7 dias
		const groups = groupAgenda([item(at(2026, 8, 2)), item(at(2026, 8, 3))], now);
		expect(groups.week).toHaveLength(1);
		expect(groups.later).toHaveLength(1);
	});

	it('hoje de manhã (antes de now) ainda é today, não overdue', () => {
		// mata: comparação due < now em vez de due < startOfToday
		const groups = groupAgenda([item(at(2026, 7, 26, 8))], now);
		expect(groups.today).toHaveLength(1);
		expect(groups.overdue).toHaveLength(0);
	});

	it('sem data → fora de todos os grupos', () => {
		// mata: null cair em overdue por coerção
		const groups = groupAgenda([item(null)], now);
		expect(groups.overdue.length + groups.today.length + groups.week.length + groups.later.length).toBe(0);
	});

	it('ordena cada grupo por vencimento ascendente', () => {
		// mata: mutação que remove o sort
		const groups = groupAgenda([item(at(2026, 7, 24)), item(at(2026, 7, 23))], now);
		expect(groups.overdue.map((i) => i.nextStepDueAt)).toEqual([at(2026, 7, 23), at(2026, 7, 24)]);
	});

	it('spring forward: a janela da semana não engole um 8º dia', () => {
		// mata: aritmética todayStart + 8 * DAY_MS (dia de 23h no DST estica a janela)
		const dstNow = new Date(2026, 2, 4, 15, 0, 0);
		const groups = groupAgenda([item(at(2026, 2, 12))], dstNow);
		expect(groups.later).toHaveLength(1);
		expect(groups.week).toHaveLength(0);
	});

	it('spring forward: no domingo da virada, item de amanhã não vira "hoje"', () => {
		// mata: comparação por timestamp bruto em vez de dia de calendário (tomorrowStart deslocado 1h)
		const dstNow = new Date(2026, 2, 8, 15, 0, 0);
		const groups = groupAgenda([item(at(2026, 2, 9))], dstNow);
		expect(groups.week).toHaveLength(1);
		expect(groups.today).toHaveLength(0);
	});
});
