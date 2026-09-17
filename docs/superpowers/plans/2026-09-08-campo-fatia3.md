# Campo fatia 3 — Painel de campo: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** entregar o Painel de campo — visão consolidada para os sócios da
Global, como 4ª sub-view da aba Campo.

**Architecture:** leitura pura sobre o que as fatias 1 e 2 criaram, sem
migration. Seis módulos puros em `src/utils/` fazem toda a derivação e são
testados isoladamente; os serviços só buscam e mapeiam; a UI só compõe. A
janela de tempo entra como parâmetro em todo módulo — nunca `Date.now()` por
dentro.

**Tech Stack:** React 18 + TypeScript, Supabase JS, Vitest + Testing Library,
Tailwind. Nada novo é adicionado (em especial: **nenhuma lib de gráfico**).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-09-08-campo-fatia3-design.md`. Onde o
  plano e a spec divergirem, pare e pergunte — não escolha sozinho.
- **Nenhuma migration.** Se uma task parecer precisar de uma, é sinal de que a
  premissa está errada: pare e reporte.
- **Nenhuma dependência nova** no `package.json`.
- **Todo módulo puro recebe a janela como parâmetro.** `Date.now()` e
  `new Date()` sem argumento são proibidos dentro de `src/utils/` — o teste
  precisa fixar o tempo.
- **Todo teste anota `mata:`** em comentário: qual mutação do código ele
  detecta. Teste sem `mata:` não é aceito na revisão.
- **Nomes de SKU são comparados normalizados** com `sku.trim().toUpperCase()`,
  como `receiptCart.ts` e a RPC `register_receipt` já fazem.
- **Idioma da UI:** pt-BR. Moeda: **US$** (o app é US-first).
- **A sub-view se chama "Painel"**, nunca "Relatório".
- Rodar a suíte: `npm test`. Typecheck: `npx tsc -b` (NÃO `tsc --noEmit`, que
  não checa nada neste repo).
- Commit ao fim de cada task, com mensagem em pt-BR.

## Estrutura de arquivos

**Criar:**

| Arquivo | Responsabilidade |
|---|---|
| `src/utils/reportWindow.ts` | período → janela; teste de pertinência |
| `src/utils/fieldActivity.ts` | interações da janela, por canal |
| `src/utils/funnelSummary.ts` | contagem por estágio (foto de agora) |
| `src/utils/sampleCost.ts` | amostras por contato + último custo por SKU |
| `src/utils/receivedVsSold.ts` | por SKU: recebido, vendido, saldo, procedência |
| `src/utils/negativeBalances.ts` | produtos com saldo negativo |
| `src/components/field/PanelView.tsx` | apresentação; recebe tudo já derivado |
| `docs/superpowers/runbooks/2026-09-08-campo-fatia3-e2e.md` | runbook manual |
| `*.test.ts` de cada módulo | suíte por módulo |

**Modificar:**

| Arquivo | Mudança |
|---|---|
| `src/types/index.ts:103-131` | `Receipt`/`ReceiptItem` viram camelCase |
| `src/services/receiptService.ts` | mapeamento + leitura (`fetchReceipts`, `fetchReceiptItems`) |
| `src/services/fieldService.ts` | `fetchInteractionsInWindow`, `fetchContactCreatedAts` |
| `src/components/field/FieldPage.tsx` | 4ª sub-view, carga do painel |
| `src/components/Dashboard.tsx:466` | passa `locationFilter` ao Campo |
| `docs/backlog.md` | duas entradas novas |

---

### Task 1: Janela de tempo (`reportWindow`)

**Files:**
- Create: `src/utils/reportWindow.ts`
- Test: `src/utils/reportWindow.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `type ReportPeriod = '7d' | '30d' | '90d' | 'all'`;
  `type ReportWindow = { from: string | null; to: string }`;
  `REPORT_PERIODS: { value: ReportPeriod; label: string }[]`;
  `resolveWindow(period: ReportPeriod, now: Date): ReportWindow`;
  `inWindow(at: string | null | undefined, w: ReportWindow): boolean`.
  Todas as tasks seguintes importam daqui.

- [ ] **Step 1: Escrever o teste que falha**

```ts
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/utils/reportWindow.test.ts`
Expected: FAIL — "Failed to resolve import './reportWindow'".

- [ ] **Step 3: Implementar**

```ts
export type ReportPeriod = '7d' | '30d' | '90d' | 'all';

export type ReportWindow = {
	/** ISO inclusivo; null = sem limite inferior ("tudo"). */
	from: string | null;
	/** ISO inclusivo; o instante em que a tela foi montada. */
	to: string;
};

export const REPORT_PERIODS: { value: ReportPeriod; label: string }[] = [
	{ value: '7d', label: '7 dias' },
	{ value: '30d', label: '30 dias' },
	{ value: '90d', label: '90 dias' },
	{ value: 'all', label: 'Tudo' },
];

const DAYS: Record<Exclude<ReportPeriod, 'all'>, number> = { '7d': 7, '30d': 30, '90d': 90 };

// `now` é sempre parâmetro: módulo puro não lê o relógio (a suíte precisa
// fixar o tempo, e a página passa o mesmo instante para todos os blocos).
export const resolveWindow = (period: ReportPeriod, now: Date): ReportWindow => {
	const to = now.toISOString();
	if (period === 'all') return { from: null, to };
	const from = new Date(now.getTime() - DAYS[period] * 24 * 60 * 60 * 1000);
	return { from: from.toISOString(), to };
};

export const inWindow = (at: string | null | undefined, w: ReportWindow): boolean => {
	if (!at) return false;
	const t = new Date(at).getTime();
	if (Number.isNaN(t)) return false;
	if (t > new Date(w.to).getTime()) return false;
	if (!w.from) return true;
	return t >= new Date(w.from).getTime();
};
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/utils/reportWindow.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/utils/reportWindow.ts src/utils/reportWindow.test.ts
git commit -m "feat(campo): janela de tempo do painel como módulo puro"
```

---

### Task 2: Atividade por canal (`fieldActivity`)

**Files:**
- Create: `src/utils/fieldActivity.ts`
- Test: `src/utils/fieldActivity.test.ts`

**Interfaces:**
- Consumes: `ReportWindow`, `inWindow` (Task 1); `Interaction` de `../types`.
- Produces: `type FieldActivity = { total: number; byChannel: Record<InteractionKind, number> }`;
  `summarizeActivity(interactions: Interaction[], w: ReportWindow): FieldActivity`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from 'vitest';
import type { Interaction, InteractionKind } from '../types';
import { resolveWindow } from './reportWindow';
import { summarizeActivity } from './fieldActivity';

const NOW = new Date('2026-09-08T12:00:00.000Z');
const W = resolveWindow('7d', NOW);

const it_ = (kind: InteractionKind, occurredAt: string): Interaction => ({
	id: `${kind}-${occurredAt}`, tenantId: 't1', clientId: 'c1', supplierId: null,
	kind, outcome: null, note: null, occurredAt,
	nextStep: null, nextStepDueAt: null, nextStepDoneAt: null, samples: [],
});

describe('summarizeActivity', () => {
	it('conta por canal só o que está na janela', () => {
		// mata: ignorar a janela, ou somar todos os canais num balde só
		const r = summarizeActivity([
			it_('visit', '2026-09-07T10:00:00.000Z'),
			it_('whatsapp', '2026-09-07T11:00:00.000Z'),
			it_('whatsapp', '2026-09-06T11:00:00.000Z'),
			it_('call', '2026-08-01T10:00:00.000Z'),
		], W);
		expect(r.total).toBe(3);
		expect(r.byChannel).toEqual({ visit: 1, call: 0, whatsapp: 2, email: 0 });
	});

	it('conta a interação exatamente na borda inferior', () => {
		// mata: trocar >= por > na comparação da janela
		expect(summarizeActivity([it_('visit', W.from as string)], W).total).toBe(1);
	});

	it('devolve todos os canais zerados quando não há interação', () => {
		// mata: devolver objeto vazio (a UI renderizaria undefined)
		expect(summarizeActivity([], W)).toEqual({
			total: 0, byChannel: { visit: 0, call: 0, whatsapp: 0, email: 0 },
		});
	});
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/utils/fieldActivity.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```ts
import type { Interaction, InteractionKind } from '../types';
import { inWindow, type ReportWindow } from './reportWindow';

export type FieldActivity = {
	total: number;
	byChannel: Record<InteractionKind, number>;
};

const emptyChannels = (): Record<InteractionKind, number> => ({
	visit: 0, call: 0, whatsapp: 0, email: 0,
});

export const summarizeActivity = (
	interactions: Interaction[],
	w: ReportWindow,
): FieldActivity => {
	const byChannel = emptyChannels();
	let total = 0;
	for (const i of interactions) {
		if (!inWindow(i.occurredAt, w)) continue;
		// Canal desconhecido (schema mudou sem o app saber) não vira balde novo
		// nem quebra a soma: fica fora da quebra, mas conta no total.
		if (i.kind in byChannel) byChannel[i.kind] += 1;
		total += 1;
	}
	return { total, byChannel };
};
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/utils/fieldActivity.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/utils/fieldActivity.ts src/utils/fieldActivity.test.ts
git commit -m "feat(campo): atividade do painel quebrada por canal"
```

---

### Task 3: Funil por estágio (`funnelSummary`)

**Files:**
- Create: `src/utils/funnelSummary.ts`
- Test: `src/utils/funnelSummary.test.ts`

**Interfaces:**
- Consumes: `deriveStage`, `STAGE_ORDER`, `STAGE_LABELS` de `./stageDerivation`;
  `FieldContact` de `../types`.
- Produces: `type FunnelRow = { stage: ContactStage; label: string; count: number }`;
  `summarizeFunnel(contacts: FieldContact[]): { rows: FunnelRow[]; total: number }`.

**Nota de escopo (Emenda 1 da spec):** o funil é **foto de agora**, sem janela.
Não receba `ReportWindow` aqui — se parecer que precisa, pare e releia a emenda.

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from 'vitest';
import type { FieldContact } from '../types';
import { summarizeFunnel } from './funnelSummary';

const contact = (over: Partial<FieldContact> = {}): FieldContact => ({
	contactType: 'client', id: 'c1', tenantId: 't1', name: 'Popeye Seafood',
	manualStage: null, stageOverriddenAt: null, lastInteractionAt: null,
	hasTransaction: false, lastOutcome: null, hasSamples: false,
	hasInteraction: false, lastFactAt: null, ...over,
});

describe('summarizeFunnel', () => {
	it('conta cada contato no estágio derivado, na ordem do funil', () => {
		// mata: contar em ordem alfabética, ou perder o contato "novo"
		const r = summarizeFunnel([
			contact({ id: 'a', hasTransaction: true }),
			contact({ id: 'b', hasSamples: true, hasInteraction: true }),
			contact({ id: 'c' }),
		]);
		expect(r.total).toBe(3);
		expect(r.rows.map((x) => [x.stage, x.count])).toEqual([
			['negotiating', 0], ['sample_delivered', 1], ['active', 1],
			['contacted', 0], ['new', 1], ['lost', 0],
		]);
	});

	it('respeita o override manual ainda válido', () => {
		// mata: chamar deriveStage e jogar fora o override (o funil discordaria
		// da sub-view Funil, que usa a mesma derivação)
		const r = summarizeFunnel([
			contact({ manualStage: 'negotiating', stageOverriddenAt: '2026-09-01T00:00:00.000Z' }),
		]);
		expect(r.rows.find((x) => x.stage === 'negotiating')?.count).toBe(1);
	});

	it('expira o override quando há fato posterior', () => {
		// mata: tratar manualStage como verdade absoluta
		const r = summarizeFunnel([
			contact({
				manualStage: 'negotiating', stageOverriddenAt: '2026-09-01T00:00:00.000Z',
				lastFactAt: '2026-09-05T00:00:00.000Z', hasTransaction: true,
			}),
		]);
		expect(r.rows.find((x) => x.stage === 'active')?.count).toBe(1);
		expect(r.rows.find((x) => x.stage === 'negotiating')?.count).toBe(0);
	});

	it('devolve todas as linhas mesmo sem contato nenhum', () => {
		// mata: devolver [] (a UI mostraria um funil vazio sem explicar)
		expect(summarizeFunnel([]).rows).toHaveLength(6);
	});
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/utils/funnelSummary.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```ts
import type { ContactStage, FieldContact } from '../types';
import { deriveStage, STAGE_LABELS, STAGE_ORDER } from './stageDerivation';

export type FunnelRow = { stage: ContactStage; label: string; count: number };

// Foto de agora, sem janela: estágio é estado presente e o app não guarda
// histórico de mudança (Emenda 1 da spec). Importa deriveStage em vez de
// reimplementar a regra — a sub-view Funil usa a mesma fonte.
export const summarizeFunnel = (
	contacts: FieldContact[],
): { rows: FunnelRow[]; total: number } => {
	const counts = new Map<ContactStage, number>(STAGE_ORDER.map((s) => [s, 0]));
	for (const c of contacts) {
		const { stage } = deriveStage(c);
		counts.set(stage, (counts.get(stage) ?? 0) + 1);
	}
	return {
		rows: STAGE_ORDER.map((stage) => ({
			stage, label: STAGE_LABELS[stage], count: counts.get(stage) ?? 0,
		})),
		total: contacts.length,
	};
};
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/utils/funnelSummary.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/utils/funnelSummary.ts src/utils/funnelSummary.test.ts
git commit -m "feat(campo): funil por estágio do painel"
```

---

### Task 4: Custo das amostras (`sampleCost`)

**Files:**
- Create: `src/utils/sampleCost.ts`
- Test: `src/utils/sampleCost.test.ts`

**Interfaces:**
- Consumes: `ReportWindow`, `inWindow` (Task 1); `Interaction`, `FieldContact`,
  `Receipt`, `ReceiptItem` de `../types` — **na forma camelCase da Task 7**.
  Esta task é escrita contra os tipos camelCase; se `Receipt` ainda estiver em
  snake_case quando você começar, execute a Task 7 antes.
- Produces:
  `lastKnownCostBySku(receipts: Receipt[], items: ReceiptItem[]): Map<string, number>`;
  `type SampleContactRow = { key: string; name: string; qty: number; cost: number; partial: boolean }`;
  `type SampleSummary = { totalQty: number; cost: number; skusTotal: number; skusWithoutCost: number; byContact: SampleContactRow[] }`;
  `summarizeSamples(input: SampleInput): SampleSummary`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from 'vitest';
import type { FieldContact, Interaction, Receipt, ReceiptItem } from '../types';
import { resolveWindow } from './reportWindow';
import { lastKnownCostBySku, summarizeSamples } from './sampleCost';

const NOW = new Date('2026-09-08T12:00:00.000Z');
const W = resolveWindow('30d', NOW);

const receipt = (id: string, receivedAt: string): Receipt => ({
	id, tenantId: 't1', receiptNumber: `R-${id}`, supplierId: 's1', receivedAt,
	document: null, note: null, totalCost: null, createdBy: null,
	createdAt: receivedAt, updatedAt: receivedAt,
});

const item = (receiptId: string, sku: string, unitCost: number | null): ReceiptItem => ({
	id: `${receiptId}-${sku}`, tenantId: 't1', receiptId, receiptNumber: `R-${receiptId}`,
	productId: null, sku, qty: 10, unitCost, totalCost: null, createdAt: '2026-09-01T00:00:00.000Z',
});

const interaction = (over: Partial<Interaction> = {}): Interaction => ({
	id: 'i1', tenantId: 't1', clientId: 'c1', supplierId: null, kind: 'visit',
	outcome: null, note: null, occurredAt: '2026-09-05T00:00:00.000Z',
	nextStep: null, nextStepDueAt: null, nextStepDoneAt: null, samples: [], ...over,
});

const contact = (id: string, name: string): FieldContact => ({
	contactType: 'client', id, tenantId: 't1', name, manualStage: null,
	stageOverriddenAt: null, lastInteractionAt: null, hasTransaction: false,
	lastOutcome: null, hasSamples: true, hasInteraction: true, lastFactAt: null,
});

describe('lastKnownCostBySku', () => {
	it('usa o custo do recebimento mais recente por received_at', () => {
		// mata: ordenar por created_at do item, ou pegar o primeiro que aparecer
		const map = lastKnownCostBySku(
			[receipt('r1', '2026-08-01T00:00:00.000Z'), receipt('r2', '2026-09-01T00:00:00.000Z')],
			[item('r1', 'CAM-1620', 9), item('r2', 'CAM-1620', 12)],
		);
		expect(map.get('CAM-1620')).toBe(12);
	});

	it('ignora linha sem custo em vez de tratá-la como zero', () => {
		// mata: `unitCost ?? 0` — o SKU passaria a "custar" zero, silenciosamente
		const map = lastKnownCostBySku(
			[receipt('r1', '2026-08-01T00:00:00.000Z'), receipt('r2', '2026-09-01T00:00:00.000Z')],
			[item('r1', 'CAM-1620', 9), item('r2', 'CAM-1620', null)],
		);
		expect(map.get('CAM-1620')).toBe(9);
	});

	it('normaliza o SKU', () => {
		// mata: chavear pelo sku cru (cam-1620 e CAM-1620 viram dois custos)
		const map = lastKnownCostBySku([receipt('r1', '2026-08-01T00:00:00.000Z')], [item('r1', ' cam-1620 ', 7)]);
		expect(map.get('CAM-1620')).toBe(7);
	});
});

describe('summarizeSamples', () => {
	const base = {
		contacts: [contact('c1', 'Popeye Seafood'), contact('c2', 'Bayou Foods')],
		receipts: [receipt('r1', '2026-09-01T00:00:00.000Z')],
		receiptItems: [item('r1', 'CAM-1620', 10)],
		window: W,
	};

	it('soma quantidade por contato e custeia com o último custo', () => {
		// mata: somar interações em vez de unidades, ou trocar o contato pelo id cru
		const r = summarizeSamples({
			...base,
			interactions: [
				interaction({ id: 'i1', clientId: 'c1', samples: [{ sku: 'CAM-1620', qty: 3 }] }),
				interaction({ id: 'i2', clientId: 'c1', samples: [{ sku: 'CAM-1620', qty: 2 }] }),
			],
		});
		expect(r.totalQty).toBe(5);
		expect(r.cost).toBe(50);
		expect(r.byContact).toEqual([
			{ key: 'client:c1', name: 'Popeye Seafood', qty: 5, cost: 50, partial: false },
		]);
	});

	it('conta SKU sem custo na cobertura e marca o total como parcial', () => {
		// mata: contar SKU sem custo como custo zero (o aviso sumiria da tela)
		const r = summarizeSamples({
			...base,
			interactions: [
				interaction({ clientId: 'c1', samples: [{ sku: 'CAM-1620', qty: 1 }, { sku: 'LAG-CDA', qty: 4 }] }),
			],
		});
		expect(r.totalQty).toBe(5);
		expect(r.cost).toBe(10);
		expect(r.skusTotal).toBe(2);
		expect(r.skusWithoutCost).toBe(1);
		expect(r.byContact[0].partial).toBe(true);
	});

	it('ignora amostra fora da janela', () => {
		// mata: esquecer a janela (o custo de aquisição do período viraria all-time)
		const r = summarizeSamples({
			...base,
			interactions: [interaction({ occurredAt: '2026-01-01T00:00:00.000Z', samples: [{ sku: 'CAM-1620', qty: 9 }] })],
		});
		expect(r.totalQty).toBe(0);
		expect(r.byContact).toEqual([]);
	});

	it('resolve o nome de fornecedor pelo supplierId', () => {
		// mata: procurar todo contato como cliente (fornecedor viraria "—")
		const supplier: FieldContact = { ...contact('s9', 'Noronha Pescados'), contactType: 'supplier' };
		const r = summarizeSamples({
			...base,
			contacts: [supplier],
			interactions: [interaction({ clientId: null, supplierId: 's9', samples: [{ sku: 'CAM-1620', qty: 2 }] })],
		});
		expect(r.byContact[0]).toMatchObject({ key: 'supplier:s9', name: 'Noronha Pescados' });
	});
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/utils/sampleCost.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```ts
import type { FieldContact, Interaction, Receipt, ReceiptItem } from '../types';
import { inWindow, type ReportWindow } from './reportWindow';

export const normalizeSku = (sku: string): string => sku.trim().toUpperCase();

// Último custo CONHECIDO por SKU: o do recebimento mais recente por
// received_at (data do fato, não do registro) que tenha custo. Linha sem custo
// é ignorada — ausente não é zero, como a fatia 2 estabeleceu.
export const lastKnownCostBySku = (receipts: Receipt[], items: ReceiptItem[]): Map<string, number> => {
	const receivedAt = new Map(receipts.map((r) => [r.id, r.receivedAt]));
	const best = new Map<string, { at: number; cost: number }>();
	for (const item of items) {
		if (item.unitCost === null || item.unitCost === undefined) continue;
		const at = new Date(receivedAt.get(item.receiptId) ?? item.createdAt).getTime();
		if (Number.isNaN(at)) continue;
		const sku = normalizeSku(item.sku);
		const current = best.get(sku);
		if (!current || at >= current.at) best.set(sku, { at, cost: item.unitCost });
	}
	return new Map([...best].map(([sku, v]) => [sku, v.cost]));
};

export type SampleContactRow = {
	key: string; name: string; qty: number; cost: number; partial: boolean;
};

export type SampleSummary = {
	totalQty: number;
	cost: number;
	skusTotal: number;
	skusWithoutCost: number;
	byContact: SampleContactRow[];
};

export type SampleInput = {
	interactions: Interaction[];
	contacts: FieldContact[];
	receipts: Receipt[];
	receiptItems: ReceiptItem[];
	window: ReportWindow;
};

export const summarizeSamples = (input: SampleInput): SampleSummary => {
	const costBySku = lastKnownCostBySku(input.receipts, input.receiptItems);
	const nameByKey = new Map(input.contacts.map((c) => [`${c.contactType}:${c.id}`, c.name]));
	const rows = new Map<string, SampleContactRow>();
	const skus = new Set<string>();
	const skusSemCusto = new Set<string>();
	let totalQty = 0;
	let cost = 0;

	for (const interaction of input.interactions) {
		if (!inWindow(interaction.occurredAt, input.window)) continue;
		const key = interaction.clientId
			? `client:${interaction.clientId}`
			: interaction.supplierId
				? `supplier:${interaction.supplierId}`
				: null;
		if (!key) continue;
		for (const sample of interaction.samples) {
			const sku = normalizeSku(sample.sku);
			const unit = costBySku.get(sku);
			skus.add(sku);
			if (unit === undefined) skusSemCusto.add(sku);
			totalQty += sample.qty;
			const lineCost = unit === undefined ? 0 : unit * sample.qty;
			cost += lineCost;
			const row = rows.get(key) ?? {
				key, name: nameByKey.get(key) ?? '—', qty: 0, cost: 0, partial: false,
			};
			row.qty += sample.qty;
			row.cost += lineCost;
			if (unit === undefined) row.partial = true;
			rows.set(key, row);
		}
	}

	return {
		totalQty,
		cost,
		skusTotal: skus.size,
		skusWithoutCost: skusSemCusto.size,
		byContact: [...rows.values()].sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name)),
	};
};
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/utils/sampleCost.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Commit**

```bash
git add src/utils/sampleCost.ts src/utils/sampleCost.test.ts
git commit -m "feat(campo): amostras por contato com custo estimado e cobertura"
```

---

### Task 5: Recebido x vendido (`receivedVsSold`)

**Files:**
- Create: `src/utils/receivedVsSold.ts`
- Test: `src/utils/receivedVsSold.test.ts`

**Interfaces:**
- Consumes: `ReportWindow`, `inWindow` (Task 1); `normalizeSku` (Task 4);
  `Product`, `Receipt`, `ReceiptItem`, `FieldContact` de `../types`.
  **Atenção:** `SalesOrder` e `SalesItem` **não estão em `src/types/index.ts`** —
  são declarados em `src/services/dashboardService.ts:4` e `:18`, em
  **snake_case**, e o item liga ao pedido por **`order_number`** (não há
  `order_id` nem `id` no item). Importe de lá:
  `import type { SalesItem, SalesOrder } from '../services/dashboardService';`
  Campos usados: `order.order_number`, `order.sold_at` (`string | undefined`),
  `order.location`, `item.order_number`, `item.sku` (`string | undefined`),
  `item.qty`. **Não** converta esses dois tipos para camelCase nesta fatia:
  isso é refatoração de outra área, com muitos consumidores.
- Produces:
  `type ReceivedVsSoldRow = { sku: string; name: string; received: number; sold: number; balance: number; supplierName: string | null; multipleSuppliers: boolean }`;
  `buildReceivedVsSold(input: ReceivedVsSoldInput): ReceivedVsSoldRow[]`;
  `type SupplierReceivedRow = { supplierId: string; name: string; qty: number; cost: number }`;
  `buildReceivedBySupplier(input: { receipts: Receipt[]; receiptItems: ReceiptItem[]; suppliers: FieldContact[]; window: ReportWindow }): SupplierReceivedRow[]`.

**Filtro de loja:** este módulo **não** filtra por loja. Quem entrega
`orders`/`salesItems` já os filtrou (Task 10, via `filterSalesByLocation`), e
`receipts` nunca são filtrados — recebimento não tem loja (decisão da spec).

**Regras que o teste precisa provar:** recebido e vendido respeitam a janela; o
**saldo é o de agora** (`products.qty`, sem janela); a procedência é o
fornecedor do recebimento mais recente do SKU, com `multipleSuppliers` quando
houve mais de um; **vendas nunca são somadas por fornecedor**.

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from 'vitest';
import type { FieldContact, Product, Receipt, ReceiptItem } from '../types';
import type { SalesItem, SalesOrder } from '../services/dashboardService';
import { resolveWindow } from './reportWindow';
import { buildReceivedVsSold } from './receivedVsSold';

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
```

Acrescente ainda, no mesmo arquivo:

```ts
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
			{ supplierId: 's1', name: 'Noronha Pescados', qty: 100, cost: 200 },
			{ supplierId: 's2', name: 'Atlântico Sul', qty: 40, cost: 120 },
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
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/utils/receivedVsSold.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```ts
import type { FieldContact, Product, Receipt, ReceiptItem } from '../types';
import type { SalesItem, SalesOrder } from '../services/dashboardService';
import { inWindow, type ReportWindow } from './reportWindow';
import { normalizeSku } from './sampleCost';

export type ReceivedVsSoldRow = {
	sku: string;
	name: string;
	received: number;
	sold: number;
	/** products.qty — valor de AGORA, não do fim da janela (Emenda 1 da spec). */
	balance: number;
	/** Procedência: fornecedor do recebimento mais recente. Nunca agrega vendas. */
	supplierName: string | null;
	multipleSuppliers: boolean;
};

export type ReceivedVsSoldInput = {
	products: Product[];
	receipts: Receipt[];
	receiptItems: ReceiptItem[];
	orders: SalesOrder[];
	salesItems: SalesItem[];
	suppliers: FieldContact[];
	window: ReportWindow;
};

type Acc = {
	name: string; received: number; sold: number; balance: number;
	supplierIds: Set<string>; lastSupplierId: string | null; lastAt: number;
};

export const buildReceivedVsSold = (input: ReceivedVsSoldInput): ReceivedVsSoldRow[] => {
	const acc = new Map<string, Acc>();
	const touch = (rawSku: string): Acc => {
		const sku = normalizeSku(rawSku);
		const current = acc.get(sku);
		if (current) return current;
		const created: Acc = {
			name: sku, received: 0, sold: 0, balance: 0,
			supplierIds: new Set(), lastSupplierId: null, lastAt: -Infinity,
		};
		acc.set(sku, created);
		return created;
	};

	for (const p of input.products) {
		const row = touch(p.sku);
		row.name = p.name || normalizeSku(p.sku);
		row.balance = p.qty;
	}

	const receiptById = new Map(input.receipts.map((r) => [r.id, r]));
	for (const item of input.receiptItems) {
		const receipt = receiptById.get(item.receiptId);
		if (!receipt) continue;
		const row = touch(item.sku);
		// A procedência olha TODO o histórico; só a soma respeita a janela.
		row.supplierIds.add(receipt.supplierId);
		const at = new Date(receipt.receivedAt).getTime();
		if (!Number.isNaN(at) && at >= row.lastAt) {
			row.lastAt = at;
			row.lastSupplierId = receipt.supplierId;
		}
		if (inWindow(receipt.receivedAt, input.window)) row.received += item.qty;
	}

	// Item liga ao pedido por order_number: sales_items não tem order_id.
	const soldAtByOrder = new Map(input.orders.map((o) => [o.order_number, o.sold_at]));
	for (const item of input.salesItems) {
		if (!item.sku) continue;
		const soldAt = soldAtByOrder.get(item.order_number);
		if (!soldAt || !inWindow(soldAt, input.window)) continue;
		touch(item.sku).sold += item.qty;
	}

	const supplierName = new Map(input.suppliers.map((s) => [s.id, s.name]));
	return [...acc.entries()]
		.map(([sku, row]) => ({
			sku,
			name: row.name,
			received: row.received,
			sold: row.sold,
			balance: row.balance,
			supplierName: row.lastSupplierId ? (supplierName.get(row.lastSupplierId) ?? null) : null,
			multipleSuppliers: row.supplierIds.size > 1,
		}))
		.sort((a, b) => b.received - a.received || b.sold - a.sold || a.sku.localeCompare(b.sku));
};
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/utils/receivedVsSold.test.ts`
Expected: PASS (5 testes).

Acrescente ao mesmo módulo:

```ts
export type SupplierReceivedRow = {
	supplierId: string; name: string; qty: number; cost: number;
};

// Este é o único lugar em que fornecedor vira agregação — e só do lado
// RECEBIDO, que é o único que conhece procedência. Venda nunca entra aqui.
export const buildReceivedBySupplier = (input: {
	receipts: Receipt[];
	receiptItems: ReceiptItem[];
	suppliers: FieldContact[];
	window: ReportWindow;
}): SupplierReceivedRow[] => {
	const receiptById = new Map(input.receipts.map((r) => [r.id, r]));
	const nameById = new Map(input.suppliers.map((s) => [s.id, s.name]));
	const acc = new Map<string, SupplierReceivedRow>();
	for (const item of input.receiptItems) {
		const receipt = receiptById.get(item.receiptId);
		if (!receipt || !inWindow(receipt.receivedAt, input.window)) continue;
		const row = acc.get(receipt.supplierId) ?? {
			supplierId: receipt.supplierId,
			name: nameById.get(receipt.supplierId) ?? '—',
			qty: 0,
			cost: 0,
		};
		row.qty += item.qty;
		// Linha sem custo entra na quantidade e não no valor: ausente não é zero,
		// mas também não invalida o que já se sabe do fornecedor.
		if (item.unitCost !== null && item.unitCost !== undefined) row.cost += item.unitCost * item.qty;
		acc.set(receipt.supplierId, row);
	}
	return [...acc.values()].sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
};
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc -b`
Expected: sem erro. (Se acusar campo inexistente em `SalesOrder`/`SalesItem`,
o culpado é o teste: confira contra `src/services/dashboardService.ts:4-30`.)

- [ ] **Step 6: Commit**

```bash
git add src/utils/receivedVsSold.ts src/utils/receivedVsSold.test.ts
git commit -m "feat(campo): recebido x vendido por SKU com procedência"
```

---

### Task 6: Divergências de saldo (`negativeBalances`)

**Files:**
- Create: `src/utils/negativeBalances.ts`
- Test: `src/utils/negativeBalances.test.ts`

**Interfaces:**
- Consumes: `Product` de `../types`.
- Produces: `type NegativeBalance = { sku: string; name: string; qty: number }`;
  `findNegativeBalances(products: Product[]): NegativeBalance[]`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from 'vitest';
import type { Product } from '../types';
import { findNegativeBalances } from './negativeBalances';

const product = (sku: string, qty: number): Product => ({
	id: sku, name: `Produto ${sku}`, sku, status: 'ativo', location: 'Miami', qty,
});

describe('findNegativeBalances', () => {
	it('lista só os produtos com saldo abaixo de zero, do pior para o melhor', () => {
		// mata: usar <= 0 (saldo zero viraria divergência), ou não ordenar
		expect(findNegativeBalances([
			product('A', 5), product('B', -2), product('C', 0), product('D', -9),
		])).toEqual([
			{ sku: 'D', name: 'Produto D', qty: -9 },
			{ sku: 'B', name: 'Produto B', qty: -2 },
		]);
	});

	it('devolve lista vazia quando está tudo em ordem', () => {
		// mata: devolver todos os produtos quando não há negativo
		expect(findNegativeBalances([product('A', 1)])).toEqual([]);
	});
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/utils/negativeBalances.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```ts
import type { Product } from '../types';

export type NegativeBalance = { sku: string; name: string; qty: number };

// Amostra registrada sem estoque deixa products.qty negativo
// (register_interaction avisa e não bloqueia, por decisão da fatia 1) e o aviso
// da RPC é efêmero. Este é o único lugar do app onde a divergência aparece.
export const findNegativeBalances = (products: Product[]): NegativeBalance[] =>
	products
		.filter((p) => p.qty < 0)
		.map((p) => ({ sku: p.sku, name: p.name, qty: p.qty }))
		.sort((a, b) => a.qty - b.qty);
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/utils/negativeBalances.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add src/utils/negativeBalances.ts src/utils/negativeBalances.test.ts
git commit -m "feat(campo): divergências de saldo negativo no painel"
```

---

### Task 7: Tipos camelCase e leitura de recebimentos

**Files:**
- Modify: `src/types/index.ts:103-131` (`Receipt`, `ReceiptItem`)
- Modify: `src/services/receiptService.ts`
- Test: `src/services/receiptService.test.ts` (arquivo já existe, 22 testes)

**Interfaces:**
- Consumes: nada das tasks anteriores.
- Produces: `Receipt` e `ReceiptItem` em camelCase (shape exato abaixo);
  `fetchReceipts(tenantId: string): Promise<Receipt[]>`;
  `fetchReceiptItems(tenantId: string): Promise<ReceiptItem[]>`.
  As Tasks 4 e 5 já foram escritas contra esses tipos.

**Por que agora:** `docs/backlog.md` registrou que a conversão deve acontecer
"na fatia 3, junto com o primeiro consumidor de tela". Este é o momento; a
entrada do backlog sai na Task 11.

- [ ] **Step 1: Escrever o teste que falha**

Acrescente ao fim de `src/services/receiptService.test.ts`:

```ts
describe('rowToReceipt / rowToReceiptItem', () => {
	it('mapeia o row snake_case do banco para o domínio camelCase', () => {
		// mata: devolver o row cru (a UI leria receivedAt como undefined e
		// mostraria "Invalid Date" sem erro nenhum)
		expect(rowToReceipt({
			id: 'r1', tenant_id: 't1', receipt_number: 'R-0007', supplier_id: 's1',
			received_at: '2026-09-01T00:00:00.000Z', document: 'NF 12', note: null,
			total_cost: 120.5, created_by: 'u1',
			created_at: '2026-09-01T01:00:00.000Z', updated_at: '2026-09-01T01:00:00.000Z',
		})).toEqual({
			id: 'r1', tenantId: 't1', receiptNumber: 'R-0007', supplierId: 's1',
			receivedAt: '2026-09-01T00:00:00.000Z', document: 'NF 12', note: null,
			totalCost: 120.5, createdBy: 'u1',
			createdAt: '2026-09-01T01:00:00.000Z', updatedAt: '2026-09-01T01:00:00.000Z',
		});
	});

	it('preserva custo nulo como null, sem virar zero', () => {
		// mata: `Number(row.unit_cost)` — null viraria 0 e o SKU passaria a ter
		// custo conhecido igual a zero, quebrando o aviso de cobertura do painel
		expect(rowToReceiptItem({
			id: 'i1', tenant_id: 't1', receipt_id: 'r1', receipt_number: 'R-0007',
			product_id: null, sku: 'CAM-1620', qty: 10, unit_cost: null,
			total_cost: null, created_at: '2026-09-01T01:00:00.000Z',
		})).toMatchObject({ unitCost: null, totalCost: null, productId: null });
	});
});
```

Ajuste o import do topo do arquivo para incluir `rowToReceipt` e `rowToReceiptItem`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/services/receiptService.test.ts`
Expected: FAIL — `rowToReceipt is not a function`.

- [ ] **Step 3: Trocar os tipos**

Em `src/types/index.ts`, substitua as duas interfaces:

```ts
export interface Receipt {
	id: string;
	tenantId: string;
	receiptNumber: string;
	supplierId: string;
	receivedAt: string;
	document: string | null;
	note: string | null;
	totalCost: number | null;
	createdBy: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface ReceiptItem {
	id: string;
	tenantId: string;
	receiptId: string;
	receiptNumber: string;
	productId: string | null;
	sku: string;
	qty: number;
	unitCost: number | null;
	totalCost: number | null;
	createdAt: string;
}
```

- [ ] **Step 4: Mapear e ler no serviço**

Em `src/services/receiptService.ts`, acrescente (e troque o `data as Receipt`
do `registerReceipt` por `rowToReceipt(data)`):

```ts
type Row = Record<string, unknown>;

const text = (row: Row, key: string): string => (row[key] === null || row[key] === undefined ? '' : String(row[key]));
const nullableText = (row: Row, key: string): string | null =>
	row[key] === null || row[key] === undefined ? null : String(row[key]);
const nullableNumber = (row: Row, key: string): number | null =>
	row[key] === null || row[key] === undefined ? null : Number(row[key]);

export const rowToReceipt = (row: Row): Receipt => ({
	id: text(row, 'id'),
	tenantId: text(row, 'tenant_id'),
	receiptNumber: text(row, 'receipt_number'),
	supplierId: text(row, 'supplier_id'),
	receivedAt: text(row, 'received_at'),
	document: nullableText(row, 'document'),
	note: nullableText(row, 'note'),
	totalCost: nullableNumber(row, 'total_cost'),
	createdBy: nullableText(row, 'created_by'),
	createdAt: text(row, 'created_at'),
	updatedAt: text(row, 'updated_at'),
});

export const rowToReceiptItem = (row: Row): ReceiptItem => ({
	id: text(row, 'id'),
	tenantId: text(row, 'tenant_id'),
	receiptId: text(row, 'receipt_id'),
	receiptNumber: text(row, 'receipt_number'),
	productId: nullableText(row, 'product_id'),
	sku: text(row, 'sku'),
	qty: Number(row.qty),
	// nullableNumber, e não Number(): custo ausente não é custo zero.
	unitCost: nullableNumber(row, 'unit_cost'),
	totalCost: nullableNumber(row, 'total_cost'),
	createdAt: text(row, 'created_at'),
});

const PAGE_SIZE = 1000;

// Mesma paginação do fieldService: PostgREST corta em 1000 linhas e o corte é
// silencioso. Ordena por id para ter chave estável.
async function fetchAll(table: 'receipts' | 'receipt_items', tenantId: string): Promise<Row[]> {
	const rows: Row[] = [];
	for (let from = 0; ; from += PAGE_SIZE) {
		const { data, error } = await supabase
			.from(table)
			.select('*')
			.eq('tenant_id', tenantId)
			.order('id', { ascending: true })
			.range(from, from + PAGE_SIZE - 1);
		if (error) throw error;
		if (!data?.length) break;
		rows.push(...(data as Row[]));
		if (data.length < PAGE_SIZE) break;
	}
	return rows;
}

export async function fetchReceipts(tenantId: string): Promise<Receipt[]> {
	return (await fetchAll('receipts', tenantId)).map(rowToReceipt);
}

export async function fetchReceiptItems(tenantId: string): Promise<ReceiptItem[]> {
	return (await fetchAll('receipt_items', tenantId)).map(rowToReceiptItem);
}
```

- [ ] **Step 5: Rodar a suíte inteira e o typecheck**

Run: `npm test` e `npx tsc -b`
Expected: PASS. A troca de tipo pode quebrar consumidores de `Receipt` — se
quebrar, conserte-os (era o objetivo). **Não** silencie com `any`.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/services/receiptService.ts src/services/receiptService.test.ts
git commit -m "feat(campo): Receipt/ReceiptItem em camelCase e leitura de recebimentos"
```

---

### Task 8: Leitura da janela no `fieldService`

**Files:**
- Modify: `src/services/fieldService.ts`
- Test: `src/services/fieldService.test.ts` (já existe, 7 testes)

**Interfaces:**
- Consumes: `ReportWindow` (Task 1).
- Produces:
  `fetchInteractionsInWindow(tenantId: string, w: ReportWindow): Promise<Interaction[]>`;
  `fetchContactCreatedAts(tenantId: string): Promise<string[]>`.

- [ ] **Step 1: Escrever o teste que falha**

Acrescente a `src/services/fieldService.test.ts` (siga o padrão de mock do
supabase que já existe no arquivo):

```ts
describe('fetchInteractionsInWindow', () => {
	it('pede ao banco só o que está na janela, com as amostras juntas', async () => {
		// mata: buscar tudo e filtrar no cliente (traria meses de histórico por
		// página de 1000 linhas), ou esquecer o join de interaction_samples
		const w = { from: '2026-09-01T00:00:00.000Z', to: '2026-09-08T00:00:00.000Z' };
		await fetchInteractionsInWindow('t1', w);
		expect(lastSelect).toContain('interaction_samples');
		expect(lastFilters).toContainEqual(['gte', 'occurred_at', w.from]);
	});

	it('não manda filtro inferior quando a janela é "tudo"', async () => {
		// mata: mandar `gte occurred_at null`, que o PostgREST rejeita
		await fetchInteractionsInWindow('t1', { from: null, to: '2026-09-08T00:00:00.000Z' });
		expect(lastFilters.some(([op, col]) => op === 'gte' && col === 'occurred_at')).toBe(false);
	});
});
```

Se a instrumentação `lastSelect`/`lastFilters` não existir no mock atual,
crie-a no próprio arquivo de teste — o mock precisa registrar o que foi pedido,
senão o teste não consegue provar nada sobre a query.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/services/fieldService.test.ts`
Expected: FAIL — função não existe.

- [ ] **Step 3: Implementar**

```ts
// Recorte por janela para o Painel. O filtro vai ao banco: buscar tudo e
// filtrar no cliente traria o histórico inteiro em páginas de 1000 linhas.
export async function fetchInteractionsInWindow(
	tenantId: string,
	w: ReportWindow,
): Promise<Interaction[]> {
	const rows = await fetchAllPages<InteractionRow>((from, to) => {
		let query = supabase
			.from('interactions')
			.select('*, interaction_samples(sku, qty)')
			.eq('tenant_id', tenantId)
			.lte('occurred_at', w.to);
		// "Tudo" não tem limite inferior: mandar gte com null quebra a query.
		if (w.from) query = query.gte('occurred_at', w.from);
		return query.order('id', { ascending: true }).range(from, to);
	});
	return rows.map(rowToInteraction);
}

// "Contatos novos" do período. A view field_contacts NÃO expõe created_at
// (decisão da spec: consultar as tabelas em vez de alterar a view).
export async function fetchContactCreatedAts(tenantId: string): Promise<string[]> {
	const read = async (table: 'clients' | 'suppliers'): Promise<string[]> => {
		const rows = await fetchAllPages<{ created_at: string | null }>((from, to) =>
			supabase
				.from(table)
				.select('id, created_at')
				.eq('tenant_id', tenantId)
				.order('id', { ascending: true })
				.range(from, to),
		);
		return rows.map((r) => r.created_at).filter((at): at is string => Boolean(at));
	};
	const [clients, suppliers] = await Promise.all([read('clients'), read('suppliers')]);
	return [...clients, ...suppliers];
}
```

Importe `ReportWindow` no topo: `import type { ReportWindow } from '../utils/reportWindow';`

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/services/fieldService.test.ts` e `npx tsc -b`
Expected: PASS, sem erro de tipo.

- [ ] **Step 5: Commit**

```bash
git add src/services/fieldService.ts src/services/fieldService.test.ts
git commit -m "feat(campo): leitura de interações por janela e datas de cadastro"
```

---

### Task 9: `PanelView` — apresentação pura

**Files:**
- Create: `src/components/field/PanelView.tsx`
- Test: `src/components/field/PanelView.test.tsx`

**Interfaces:**
- Consumes: os tipos de saída das Tasks 2-6 e `REPORT_PERIODS`/`ReportPeriod`
  (Task 1).
- Produces: `PanelView` (default export) com estas props, e nada mais —
  **este componente não busca dado nem calcula derivação**; recebe tudo pronto:

```ts
type Props = {
	period: ReportPeriod;
	onPeriodChange: (p: ReportPeriod) => void;
	locationLabel: string;          // "Todos os locais" ou o nome da loja
	activity: FieldActivity;
	newContacts: number;
	overdueFollowUps: number;
	funnel: { rows: FunnelRow[]; total: number };
	samples: SampleSummary;
	rows: ReceivedVsSoldRow[];
	bySupplier: SupplierReceivedRow[];
	negatives: NegativeBalance[];
};
```

**Visual:** linguagem do Campo — `rounded-2xl border border-border bg-card`,
chips `rounded-full`, alvo de toque `min-h-11`, como `FunnelView.tsx:19-21`.
**Sem Recharts**: a barra do funil é `div` com `width` em porcentagem.
Referência de layout: o mockup `2026-09-08-campo-fatia3-nav-preview.html`.

**Formato de moeda:** `new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' })`.

- [ ] **Step 1: Escrever o teste que falha**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PanelView from './PanelView';

const base = {
	period: '30d' as const,
	onPeriodChange: vi.fn(),
	locationLabel: 'Todos os locais',
	activity: { total: 64, byChannel: { visit: 18, call: 12, whatsapp: 30, email: 4 } },
	newContacts: 5,
	overdueFollowUps: 3,
	funnel: { rows: [{ stage: 'active' as const, label: 'Ativo', count: 2 }], total: 2 },
	samples: { totalQty: 42, cost: 380, skusTotal: 10, skusWithoutCost: 3, byContact: [] },
	rows: [],
	bySupplier: [],
	negatives: [],
};

describe('PanelView', () => {
	it('avisa quando há SKU sem custo conhecido', () => {
		// mata: exibir o valor estimado sem a cobertura — o sócio leria US$ 380
		// como o custo total das amostras, e não como um total parcial
		render(<PanelView {...base} />);
		expect(screen.getByText(/3 de 10 SKUs sem custo conhecido/i)).toBeInTheDocument();
	});

	it('omite o aviso de cobertura quando todo SKU tem custo', () => {
		// mata: deixar o aviso fixo na tela (viraria ruído que ninguém lê)
		render(<PanelView {...base} samples={{ ...base.samples, skusWithoutCost: 0 }} />);
		expect(screen.queryByText(/sem custo conhecido/i)).not.toBeInTheDocument();
	});

	it('diz que o filtro de loja só afeta as vendas', () => {
		// mata: remover o rótulo — os números globais passariam por números da loja
		render(<PanelView {...base} locationLabel="Miami" />);
		expect(screen.getByText(/afeta apenas as vendas/i)).toBeInTheDocument();
	});

	it('mostra o card de divergência só quando há saldo negativo', () => {
		// mata: esconder sempre (a divergência voltaria a ser invisível) ou
		// mostrar sempre (card vazio dizendo que está tudo certo vira ruído)
		const { rerender } = render(<PanelView {...base} />);
		expect(screen.queryByText(/saldo negativo/i)).not.toBeInTheDocument();
		rerender(<PanelView {...base} negatives={[{ sku: 'CAM-1620', name: 'Camarão 16/20', qty: -4 }]} />);
		expect(screen.getByText(/saldo negativo/i)).toBeInTheDocument();
	});

	it('rotula como "hoje" o que não respeita a janela', () => {
		// mata: rotular o funil com o período escolhido (Emenda 1 da spec: funil,
		// saldo e divergências são foto de agora, não da janela)
		render(<PanelView {...base} />);
		expect(screen.getByText(/Funil por estágio/i).closest('section')).toHaveTextContent(/hoje/i);
	});
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/components/field/PanelView.test.tsx`
Expected: FAIL — componente não existe.

- [ ] **Step 3: Implementar o componente**

Escreva `PanelView.tsx` cumprindo, na ordem: seletor de período (pills a partir
de `REPORT_PERIODS`, chamando `onPeriodChange`) → rótulo de loja → grade de 4
KPIs (interações, contatos novos, amostras com subtítulo de custo estimado,
follow-ups vencidos em vermelho) → card "Por canal" → card "Funil por estágio"
com `<section>` e sufixo "hoje" no título → card de amostras por contato (lista
`byContact`, com o aviso de cobertura quando `skusWithoutCost > 0`) → tabela
recebido x vendido (coluna de saldo rotulada "hoje"; chip de procedência com
"+1" quando `multipleSuppliers`) → card "Recebido por fornecedor" a partir de
`bySupplier` (quantidade e valor; valor omitido quando `cost === 0`) → card de
divergências, renderizado apenas quando `negatives.length > 0`.

Cada bloco sem dado renderiza a própria frase de vazio ("nenhuma interação no
período", "nenhuma amostra entregue no período"), nunca um zero solto.

Esqueleto — copie a estrutura e complete os blocos que faltam no mesmo estilo:

```tsx
import type { ReportPeriod } from '../../utils/reportWindow';
import { REPORT_PERIODS } from '../../utils/reportWindow';

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' });

const card = 'rounded-2xl border border-border bg-card p-4';
const pill = (active: boolean) =>
	`min-h-11 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
		active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground'
	}`;

const PanelView = ({ period, onPeriodChange, locationLabel, activity, newContacts,
	overdueFollowUps, funnel, samples, rows, bySupplier, negatives }: Props) => (
	<div className="space-y-4">
		<div className="flex flex-wrap gap-2">
			{REPORT_PERIODS.map((p) => (
				<button key={p.value} type="button" className={pill(period === p.value)}
					onClick={() => onPeriodChange(p.value)}>
					{p.label}
				</button>
			))}
		</div>

		{/* O filtro de loja não alcança campo nem recebimento: dizer isso é o que
		    impede o sócio de ler um número global como número da loja. */}
		<p className="text-xs text-muted-foreground">
			Loja: {locationLabel} · o filtro de loja afeta apenas as vendas
		</p>

		<div className="grid grid-cols-2 gap-3">
			<div className={card}>
				<b className="block text-2xl">{activity.total}</b>
				<span className="text-xs text-muted-foreground">Interações</span>
			</div>
			{/* contatos novos, amostras (com subtítulo de custo estimado) e
			    follow-ups vencidos (número em text-red-600) no mesmo formato */}
		</div>

		<section className={card}>
			<p className="mb-3 text-sm font-semibold">Funil por estágio · hoje</p>
			{funnel.total === 0 ? (
				<p className="text-sm text-muted-foreground">Nenhum contato cadastrado.</p>
			) : (
				funnel.rows.map((row) => (
					<div key={row.stage} className="mb-2.5 last:mb-0">
						<div className="flex items-center justify-between">
							<span className="text-sm">{row.label}</span>
							<span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-bold">{row.count}</span>
						</div>
						<div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
							<div className="h-full rounded-full bg-primary"
								style={{ width: `${funnel.total ? (row.count / funnel.total) * 100 : 0}%` }} />
						</div>
					</div>
				))
			)}
		</section>

		<section className={card}>
			<p className="mb-3 text-sm font-semibold">Amostras entregues</p>
			{/* lista samples.byContact: nome, qty un, money.format(cost) */}
			{samples.skusWithoutCost > 0 && (
				<p className="mt-3 text-xs text-muted-foreground">
					Custo estimado pelo último recebimento — {samples.skusWithoutCost} de {samples.skusTotal} SKUs
					sem custo conhecido.
				</p>
			)}
		</section>

		{/* tabela recebido x vendido (cabeçalho da coluna de saldo: "Saldo hoje";
		    chip de procedência com "+1" quando row.multipleSuppliers),
		    card "Recebido por fornecedor" a partir de bySupplier */}

		{negatives.length > 0 && (
			<section className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
				<p className="text-sm font-bold text-red-700">Saldo negativo</p>
				<p className="mt-1 text-xs text-red-700">
					Amostra registrada sem estoque deixa o saldo abaixo de zero. Confira a contagem física.
				</p>
				{negatives.map((n) => (
					<p key={n.sku} className="mt-2 text-sm font-semibold text-red-700">
						{n.name} · {n.qty}
					</p>
				))}
			</section>
		)}
	</div>
);

export default PanelView;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/components/field/PanelView.test.tsx` e `npx tsc -b`
Expected: PASS (5 testes), sem erro de tipo.

- [ ] **Step 5: Commit**

```bash
git add src/components/field/PanelView.tsx src/components/field/PanelView.test.tsx
git commit -m "feat(campo): PanelView com os avisos de cobertura, loja e divergência"
```

---

### Task 10: Ligar o Painel ao app

**Files:**
- Modify: `src/components/field/FieldPage.tsx`
- Modify: `src/components/Dashboard.tsx:466`

**Interfaces:**
- Consumes: tudo das Tasks 1-9.
- Produces: nada para tasks seguintes.

- [ ] **Step 1: Passar o filtro de loja ao Campo**

Em `src/components/Dashboard.tsx:466`, troque:

```tsx
<FieldPage tenantId={tenantId} products={products} onReload={reload} />
```

por:

```tsx
<FieldPage
	tenantId={tenantId}
	products={products}
	onReload={reload}
	locationFilter={locationFilter}
	orders={visibleSales}
	salesItems={visibleSalesItems}
/>
```

Confira os nomes reais das listas já filtradas por loja nos `useMemo` de
`Dashboard.tsx:114-167` e use os que existem — se a lista de itens filtrados
não existir com esse nome, use `filterSalesByLocation` (`src/utils/salesByLocation.ts:12`)
para derivá-la ali, ao lado das outras. **Não** filtre por loja dentro do Campo:
a decisão da spec é que só as vendas filtram, e o ponto de filtragem do app é o
Dashboard.

- [ ] **Step 2: Estender as props e o estado do `FieldPage`**

```tsx
type FieldView = 'agenda' | 'funnel' | 'suppliers' | 'panel';

type Props = {
	tenantId?: string;
	products: Product[];
	onReload: () => void;
	locationFilter: 'all' | string;
	orders: SalesOrder[];
	salesItems: SalesItem[];
};
```

Estado novo: `const [period, setPeriod] = useState<ReportPeriod>('30d');` e um
`useState` para os dados do painel (`interactions`, `receipts`, `receiptItems`,
`createdAts`).

- [ ] **Step 3: Carregar os dados do painel só quando a sub-view abre**

```tsx
// O painel lê quatro fontes a mais; carregar isso na montagem do Campo faria
// a Agenda (tela de trabalho diária do Elcy) esperar por dado que ela não usa.
const [panelData, setPanelData] = useState<PanelData | null>(null);
const [panelLoading, setPanelLoading] = useState(false);
const windowRef = useMemo(() => resolveWindow(period, new Date()), [period]);

useEffect(() => {
	if (view !== 'panel' || !tenantId) return;
	let alive = true;
	setPanelLoading(true);
	Promise.all([
		fetchInteractionsInWindow(tenantId, windowRef),
		fetchReceipts(tenantId),
		fetchReceiptItems(tenantId),
		fetchContactCreatedAts(tenantId),
	])
		.then(([interactions, receipts, receiptItems, createdAts]) => {
			if (!alive) return;
			setPanelData({ interactions, receipts, receiptItems, createdAts });
		})
		.catch((err) => {
			if (!alive) return;
			console.error('[campo] falha ao carregar o painel', err);
			setError('Não foi possível carregar o painel.');
		})
		.finally(() => { if (alive) setPanelLoading(false); });
	return () => { alive = false; };
}, [view, tenantId, windowRef]);
```

- [ ] **Step 4: Acrescentar o pill e renderizar**

No segmented control (`FieldPage.tsx:87-95`), acrescente como quarto botão:

```tsx
<button type="button" className={segClass(view === 'panel')} onClick={() => setView('panel')}>
	Painel
</button>
```

E a renderização, junto das outras sub-views:

```tsx
{!loading && (!error || loadedOnce) && view === 'panel' && (
	panelLoading || !panelData ? (
		<p className="text-sm text-muted-foreground">Carregando…</p>
	) : (
		<PanelView
			period={period}
			onPeriodChange={setPeriod}
			locationLabel={locationFilter === 'all' ? 'Todos os locais' : locationFilter}
			activity={summarizeActivity(panelData.interactions, windowRef)}
			newContacts={panelData.createdAts.filter((at) => inWindow(at, windowRef)).length}
			overdueFollowUps={agenda.filter((i) => i.nextStepDueAt && new Date(i.nextStepDueAt) < new Date()).length}
			funnel={summarizeFunnel(contacts)}
			samples={summarizeSamples({
				interactions: panelData.interactions, contacts,
				receipts: panelData.receipts, receiptItems: panelData.receiptItems, window: windowRef,
			})}
			rows={buildReceivedVsSold({
				products, receipts: panelData.receipts, receiptItems: panelData.receiptItems,
				orders, salesItems, suppliers: contacts.filter((c) => c.contactType === 'supplier'),
				window: windowRef,
			})}
			negatives={findNegativeBalances(products)}
		/>
	)
)}
```

**Sobre `overdueFollowUps`:** o valor precisa ser o mesmo que a sub-view Agenda
mostra. Antes de escrever a linha acima, abra `src/utils/agendaGrouping.ts` e
**use a função que já existe** (`groupAgenda`) para contar os atrasados, em vez
da comparação inline do exemplo. Duas contagens de atraso divergindo dentro da
mesma aba é defeito, e o exemplo acima é só o formato — não a implementação
final.

- [ ] **Step 5: Rodar tudo**

Run: `npm test` e `npx tsc -b`
Expected: PASS, sem erro.

- [ ] **Step 6: Ver na tela**

Rode `npm run dev`, abra a aba Campo → Painel, e confira: o seletor de período
troca os números; o rótulo de loja aparece; nenhum bloco mostra zero sem
explicação.

- [ ] **Step 7: Commit**

```bash
git add src/components/field/FieldPage.tsx src/components/Dashboard.tsx
git commit -m "feat(campo): Painel como quarta sub-view, com filtro de loja nas vendas"
```

---

### Task 11: Runbook, backlog e fechamento

**Files:**
- Create: `docs/superpowers/runbooks/2026-09-08-campo-fatia3-e2e.md`
- Modify: `docs/backlog.md`

- [ ] **Step 1: Escrever o runbook**

Casos obrigatórios, nesta ordem:

1. **Pré-voo — a leitura funciona.** Com um tenant que tenha recebimento
   gravado, abrir Campo → Painel e confirmar que a tabela recebido x vendido
   traz linhas. **Tabela vazia sem mensagem de erro = falha das policies de
   `select` de `receipts`/`receipt_items`, nunca exercitadas antes desta
   fatia.** Achar isso é motivo de parar e reportar, não de seguir.
2. Trocar as quatro janelas e conferir que atividade, contatos novos, amostras,
   recebido e vendido mudam — e que funil, saldo e divergências **não** mudam.
3. Registrar uma amostra de SKU sem estoque (aba Campo → Registrar visita) e
   confirmar que o card de divergência aparece com o saldo negativo.
4. Registrar amostra de um SKU **sem custo em nenhum recebimento** e conferir
   que a cobertura sobe ("N de M SKUs sem custo conhecido") e o valor não muda.
5. Trocar a loja no seletor do header e confirmar que só o "vendido" muda, e
   que o rótulo explica isso.
6. SKU recebido de dois fornecedores diferentes: a coluna de procedência mostra
   o mais recente com a marcação de "+1".
7. Tenant vazio (sem interação, sem recebimento): cada bloco mostra a própria
   frase de vazio; nenhum "0" solto, nenhum "US$ 0,00" como se fosse fato.

- [ ] **Step 2: Duas entradas novas em `docs/backlog.md`**

Uma para **vendas somadas por fornecedor** (exige vínculo produto→fornecedor
como dado de primeira classe; hoje `sales_items` só conhece SKU) e outra para
**loja própria no recebimento** (coluna `location` em `receipts`, com o custo de
mexer na RPC da fatia 2 e de deixar os recebimentos existentes sem loja). Cada
uma no formato das entradas que já estão no arquivo: origem, o que implementar,
escopo.

Remova da entrada "Tipos de recebimento em snake_case (resolver na fatia 3)" o
status de pendente — ela foi paga na Task 7. Registre a data.

- [ ] **Step 3: Rodar a suíte inteira uma última vez**

Run: `npm test` e `npx tsc -b`
Expected: PASS. Anote o número de testes para o corpo do PR.

- [ ] **Step 4: Commit**

```bash
git add docs/
git commit -m "docs(campo): runbook e2e da fatia 3 e entradas de backlog"
```

## Notas para quem revisa

- **O gate desta fatia não é a suíte verde**, é a mutação: para cada teste com
  `mata:`, aplique a mutação descrita e confirme que o teste falha. Um teste que
  passa com o código mutado não está testando o que diz testar.
- **O e2e é obrigatório antes de tirar o PR de draft**, e o caso 1 do runbook é
  o único jeito de saber se as policies de leitura da fatia 2 funcionam.
