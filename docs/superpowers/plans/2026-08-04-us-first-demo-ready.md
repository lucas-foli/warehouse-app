# Demo-ready US-first — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o warehouse-app apresentável e coerente com US-first para o café com o Davi — sem números fabricados na tela e com moeda em dólar.

**Architecture:** Uma função pura central de moeda (`formatCurrency`, Intl en-US/USD) como única fonte de verdade, substituindo literais `R$` espalhados. Empty states passam a refletir dados reais (ou somem quando não há fonte). O card "Novos no mês" vira real mapeando `clients.created_at` (coluna já existente no banco) e contando via função pura testável.

**Tech Stack:** React + TypeScript, Vitest (só função pura — o repo não renderiza componente em teste), Supabase.

## Global Constraints

- Gate de merge: `npx tsc -b` 0 erros · `npm test` (vitest) verde · eslint limpo nos arquivos tocados. **Nunca** usar `tsc --noEmit` (o tsconfig raiz tem `files: []` e não checa nada).
- Formato de moeda alvo: `$1,234.56` (Intl `en-US` / `USD`, 2 casas).
- **Datas permanecem em pt-BR** (`toLocaleString('pt-BR')` de mês/dia). Data é idioma, não moeda — entra na branch de i18n. Não tocar.
- **Contagens/quantidades não são moeda** e não mudam: `totalSold` (unidades) e contagem de clientes permanecem como estão.
- Imports por caminho relativo (o repo não usa alias `@/`): de `src/components/*.tsx` → `../utils/currency`; de `src/components/products/*.tsx` → `../../utils/currency`; de `src/utils/*.test.ts` → `./currency`.
- Convenção do tipo timestamp: espelhar `Product.created_at?: string` (não camelCase).

---

### Task 1: `formatCurrency` (função pura de moeda)

Alicerce da Frente 2. Todas as tasks de moeda consomem esta função.

**Files:**
- Create: `src/utils/currency.ts`
- Test: `src/utils/currency.test.ts`

**Interfaces:**
- Produces: `formatCurrency(value: number): string` — retorna string monetária USD, ex. `$1,234.56`. Estrita: só aceita `number` (o guard de "valor ausente → —" fica no call-site, não aqui).

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, it, expect } from 'vitest';
import { formatCurrency } from './currency';

describe('formatCurrency', () => {
  it('formata zero com centavos', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });
  it('formata valor com centavos', () => {
    expect(formatCurrency(1234.56)).toBe('$1,234.56');
  });
  it('agrupa milhares com vírgula', () => {
    expect(formatCurrency(1000000)).toBe('$1,000,000.00');
  });
  it('formata estorno (negativo) com sinal', () => {
    expect(formatCurrency(-49.9)).toBe('-$49.90');
  });
  it('arredonda para 2 casas', () => {
    expect(formatCurrency(30)).toBe('$30.00');
  });
});
```

> **mata:** o caso "agrupa milhares" mata o mutante que troca `en-US`→`pt-BR` (viraria `US$ 1.000.000,00`); o caso "formata zero" mata o mutante que remove `style: 'currency'` (viraria `0`); o caso "estorno" mata o mutante que envolve `value` em `Math.abs`; "arredonda para 2 casas" mata o mutante que passa `minimumFractionDigits: 0`.

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- currency`
Expected: FAIL — `formatCurrency` não existe.

- [ ] **Step 3: Implementar a função mínima**

```ts
const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export const formatCurrency = (value: number): string => usd.format(value);
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- currency`
Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add src/utils/currency.ts src/utils/currency.test.ts
git commit -m "feat: formatCurrency como fonte única de moeda (USD)"
```

---

### Task 2: Empty states honestos

Remove os dois números fabricados que não têm fonte de dado. Sem teste unitário — o repo não testa componente; a verificação é manual + `tsc`.

**Files:**
- Modify: `src/components/OverviewPage.tsx:51`
- Modify: `src/components/SellersPage.tsx:105` (remove o card "Abaixo da meta")

- [ ] **Step 1: Zerar o faturamento fantasma no OverviewPage**

Em `src/components/OverviewPage.tsx:51`, trocar:

```ts
	const monthlyRevenue = latestMonth?.value ?? 574661;
```

por:

```ts
	const monthlyRevenue = latestMonth?.value ?? 0;
```

(Com isso `dailyRevenue = monthlyRevenue / 30` também zera; os cards abrem em `$0.00` após a Task 3.)

- [ ] **Step 2: Remover o card "Abaixo da meta" no SellersPage**

Em `src/components/SellersPage.tsx`, remover o bloco do card cujo `Metric` é `value="—"` / `label="Abaixo da meta"` (linha ~105). Não existe conceito de meta/quota no modelo de vendedor — o card só exibe travessão. Remover o `<Card>...</Card>` inteiro que o contém.

- [ ] **Step 3: Verificar o gate**

Run: `npx tsc -b && npm test`
Expected: 0 erros TS, testes verdes.

- [ ] **Step 4: Verificação manual**

Abrir o app num tenant sem dados: o card de faturamento mostra `$0.00` (não `574.661`), e o card "Abaixo da meta" não aparece na página de vendedores.

- [ ] **Step 5: Commit**

```bash
git add src/components/OverviewPage.tsx src/components/SellersPage.tsx
git commit -m "fix: empty states honestos (mata faturamento fantasma + card sem fonte)"
```

---

### Task 3: Moeda US$ nas páginas

Substitui todos os call-sites **monetários** por `formatCurrency`. Não tocar em `totalSold` (unidades) nem em datas.

**Files:**
- Modify: `src/components/OverviewPage.tsx` (linhas ~87, ~91, ~97, ~99, ~159, ~165, ~207)
- Modify: `src/components/ProductsPage.tsx` (linhas ~614, ~717)
- Modify: `src/components/SellersPage.tsx` (helper ~29-30 e usos ~95, ~257, ~261, ~299, ~300)
- Modify: `src/components/products/SaleOrderModal.tsx` (helper ~22-23 e usos)
- Modify: `src/components/OrdersPage.tsx` (helper ~25-27)

**Interfaces:**
- Consumes: `formatCurrency` da Task 1.

- [ ] **Step 1: OverviewPage — importar e trocar os StatCards e labels**

Adicionar no topo: `import { formatCurrency } from '../utils/currency';`

Trocar o par value+prefix dos dois `Metric` de faturamento. De:

```tsx
					<Metric
						value={Math.max(0, dailyRevenue || 0).toLocaleString('pt-BR', {
							maximumFractionDigits: 0,
						})}
						label="Faturamento do dia"
						prefix="R$ "
```

para:

```tsx
					<Metric
						value={formatCurrency(Math.max(0, dailyRevenue || 0))}
						label="Faturamento do dia"
```

E o de "Faturamento Total". De:

```tsx
					<Metric
						value={Math.max(0, monthlyRevenue || 0).toLocaleString('pt-BR')}
						label="Faturamento Total"
						prefix="R$ "
```

para:

```tsx
					<Metric
						value={formatCurrency(Math.max(0, monthlyRevenue || 0))}
						label="Faturamento Total"
```

(Remover a prop `prefix="R$ "` nos dois — o valor já vem com `$`.)

Linhas ~159, ~165, ~207 — trocar `R$ ${x.toLocaleString('pt-BR')}` por `formatCurrency(x)`:
- `:159` — `R$ {cat.venda.toLocaleString('pt-BR')}` → `{formatCurrency(cat.venda)}`
- `:165` — `Custo: R$ {cat.custo.toLocaleString('pt-BR')}` → `Custo: {formatCurrency(cat.custo)}`
- `:207` — `formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR')}`, 'Faturamento']}` → `formatter={(value: number) => [formatCurrency(value), 'Faturamento']}`

**Não tocar** `:252` (`product.totalSold` — unidades).

- [ ] **Step 2: ProductsPage — preço em US$**

Adicionar `import { formatCurrency } from '../utils/currency';`. Nas linhas ~614 e ~717, trocar:

```tsx
{product.price ? `R$ ${product.price.toLocaleString('pt-BR')}` : '—'}
```

por:

```tsx
{product.price ? formatCurrency(product.price) : '—'}
```

**Não tocar** `:620`, `:720` (`product.totalSold` — unidades).

- [ ] **Step 3: SellersPage — substituir o helper local pelo util**

Remover o helper local (linhas ~29-30):

```ts
	const formatCurrency = (value: number) =>
		`R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
```

Adicionar no topo `import { formatCurrency } from '../utils/currency';`. Os usos internos que já chamam `formatCurrency(...)` passam a resolver para o util. Trocar os usos que ainda têm `R$` literal inline:
- `:95` — `R$ ${vendedores.reduce((sum, v) => sum + (v.bruto || 0), 0).toLocaleString('pt-BR')}` → `formatCurrency(vendedores.reduce((sum, v) => sum + (v.bruto || 0), 0))`
- `:257` — `R$ {v.bruto.toLocaleString('pt-BR')}` → `{formatCurrency(v.bruto)}`
- `:261` — `R$ {v.liquido.toLocaleString('pt-BR')}` → `{formatCurrency(v.liquido)}`
- `:299` — `R$ {v.bruto.toLocaleString('pt-BR')}` → `{formatCurrency(v.bruto)}`
- `:300` — `R$ {v.liquido.toLocaleString('pt-BR')}` → `{formatCurrency(v.liquido)}`

- [ ] **Step 4: SaleOrderModal — substituir o helper `formatBRL`**

Remover o helper local (linhas ~22-23):

```ts
const formatBRL = (value: number) =>
	`R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
```

Adicionar `import { formatCurrency } from '../../utils/currency';`. Substituir todas as chamadas `formatBRL(` por `formatCurrency(` no arquivo.

- [ ] **Step 5: OrdersPage — substituir `formatBRL` preservando o guard `—`**

Em `src/components/OrdersPage.tsx`, trocar o helper (linhas ~25-27):

```ts
const formatBRL = (value?: number) =>
	typeof value === 'number' && Number.isFinite(value)
		? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
		: '—';
```

por (mantendo o guard, delegando a formatação):

```ts
import { formatCurrency } from '../utils/currency';

const formatMoney = (value?: number) =>
	typeof value === 'number' && Number.isFinite(value) ? formatCurrency(value) : '—';
```

Substituir os usos de `formatBRL(` por `formatMoney(` no arquivo.

- [ ] **Step 6: Verificar que nenhum `R$` monetário sobrou**

Run: `grep -rn 'R\$' src/components src/services --include='*.tsx' --include='*.ts' | grep -v '//'`
Expected: nada (só podem restar menções em comentários, tratadas na Task 4 e higiene).

Run: `npx tsc -b && npm test`
Expected: 0 erros, testes verdes.

- [ ] **Step 7: Verificação manual + commit**

Abrir Overview, Products, Sellers, uma venda no SaleOrderModal e Orders: todos os valores monetários em `$` (en-US). Datas continuam em pt-BR.

```bash
git add src/components
git commit -m "feat: moeda US\$ nas paginas via formatCurrency"
```

---

### Task 4: Moeda no preview de edição em massa

O preview de bulk edit formata `price` como `R$` (fora da lista original da spec, incluído por decisão do Lucas para não deixar o preview inconsistente com o resto em US$). Tem teste próprio → task isolada.

**Files:**
- Modify: `src/utils/bulkEditPreview.ts:75`
- Test: `src/utils/bulkEditPreview.test.ts:116`

**Interfaces:**
- Consumes: `formatCurrency` da Task 1.

- [ ] **Step 1: Atualizar o teste para o formato USD (falha primeiro)**

Em `src/utils/bulkEditPreview.test.ts:116`, trocar:

```ts
    expect(formatBulkFieldValue('price', 30)).toBe('R$ 30');
```

por:

```ts
    expect(formatBulkFieldValue('price', 30)).toBe('$30.00');
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- bulkEditPreview`
Expected: FAIL — ainda retorna `R$ 30`.

- [ ] **Step 3: Trocar a formatação de price para `formatCurrency`**

Em `src/utils/bulkEditPreview.ts`, adicionar `import { formatCurrency } from './currency';` e na linha 75 trocar:

```ts
  if (field === 'price') return value == null ? '—' : `R$ ${(value as number).toLocaleString('pt-BR')}`;
```

por:

```ts
  if (field === 'price') return value == null ? '—' : formatCurrency(value as number);
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- bulkEditPreview`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/bulkEditPreview.ts src/utils/bulkEditPreview.test.ts
git commit -m "feat: preview de edicao em massa em US\$"
```

---

### Task 5: Mapear `clients.created_at` no modelo e no service

Frente de dados, parte 1. A coluna `created_at` já existe no banco (`supabase/migrations/20251226000300_sales_clients.sql:12`, `timestamptz not null default now()`) — só falta lê-la. Espelha o padrão de `Product`.

**Files:**
- Modify: `src/types/index.ts` (interface `Client`, ~linha 37)
- Modify: `src/services/dashboardService.ts:133-140` (`fetchClients`)

**Interfaces:**
- Produces: `Client.created_at?: string` — timestamp ISO da row, ou `undefined` se ausente. Consumido pela Task 6.

- [ ] **Step 1: Adicionar o campo ao tipo `Client`**

Em `src/types/index.ts`, na interface `Client`, após `ultimaCompra: string;` adicionar:

```ts
	created_at?: string;
```

(Espelha `Product.created_at?: string`, linha 16 do mesmo arquivo.)

- [ ] **Step 2: Mapear a coluna no `fetchClients`**

Em `src/services/dashboardService.ts`, no objeto retornado por `fetchClients` (linhas 133-140), adicionar após `ultimaCompra`:

```ts
      created_at: toText(row.created_at) || undefined,
```

(Espelha `rowToProduct`, `dashboardService.ts:118`.)

- [ ] **Step 3: Verificar o gate**

Run: `npx tsc -b && npm test`
Expected: 0 erros, testes verdes.

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/services/dashboardService.ts
git commit -m "feat: mapeia clients.created_at no modelo Client"
```

---

### Task 6: "Novos no mês" real

Frente de dados, parte 2. Extrai a contagem como função pura testável (padrão do repo) e liga no card.

**Files:**
- Create: `src/utils/newClientsThisMonth.ts`
- Test: `src/utils/newClientsThisMonth.test.ts`
- Modify: `src/components/ClientsPage.tsx:80`

**Interfaces:**
- Consumes: `Client.created_at?: string` da Task 5.
- Produces: `countNewClientsThisMonth(clients: Client[], reference: Date): number`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, it, expect } from 'vitest';
import { countNewClientsThisMonth } from './newClientsThisMonth';
import type { Client } from '../types';

const client = (created_at?: string): Client => ({
  id: '1', nome: 'X', cidade: '—', ultimaCompra: '', created_at,
});

describe('countNewClientsThisMonth', () => {
  const ref = new Date('2026-08-15T12:00:00Z');
  it('retorna 0 quando ninguém foi criado no mês', () => {
    expect(countNewClientsThisMonth([client('2026-07-31T23:00:00Z')], ref)).toBe(0);
  });
  it('conta clientes criados no mês/ano de referência', () => {
    const clients = [client('2026-08-01T00:00:00Z'), client('2026-08-20T00:00:00Z'), client('2026-07-01T00:00:00Z')];
    expect(countNewClientsThisMonth(clients, ref)).toBe(2);
  });
  it('ignora clientes sem created_at', () => {
    expect(countNewClientsThisMonth([client(undefined), client('2026-08-05T00:00:00Z')], ref)).toBe(1);
  });
});
```

> **mata:** "conta no mês/ano" com um cliente de julho mata o mutante que compara só o mês ignorando o ano (contaria 3); "ignora sem created_at" mata o mutante que trata `undefined` como data válida (viraria `Invalid Date`, contaria errado).

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- newClientsThisMonth`
Expected: FAIL — função não existe.

- [ ] **Step 3: Implementar a função pura**

```ts
import type { Client } from '../types';

export const countNewClientsThisMonth = (clients: Client[], reference: Date): number => {
  const m = reference.getMonth();
  const y = reference.getFullYear();
  return clients.filter((c) => {
    if (!c.created_at) return false;
    const d = new Date(c.created_at);
    return !Number.isNaN(d.getTime()) && d.getMonth() === m && d.getFullYear() === y;
  }).length;
};
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- newClientsThisMonth`
Expected: PASS (3/3).

- [ ] **Step 5: Ligar no card do ClientsPage**

Em `src/components/ClientsPage.tsx`, importar (junto aos imports de utils):

```ts
import { countNewClientsThisMonth } from '../utils/newClientsThisMonth';
```

Trocar o card hard-coded (linha ~80):

```tsx
					<Metric value={0} label="Novos no mês" />
```

por:

```tsx
					<Metric value={countNewClientsThisMonth(clientes, new Date())} label="Novos no mês" />
```

- [ ] **Step 6: Verificar o gate + manual**

Run: `npx tsc -b && npm test`
Expected: 0 erros, testes verdes.

Manual: num tenant com clientes cadastrados no mês corrente, o card mostra a contagem real; sem nenhum, mostra `0` honesto.

- [ ] **Step 7: Commit**

```bash
git add src/utils/newClientsThisMonth.ts src/utils/newClientsThisMonth.test.ts src/components/ClientsPage.tsx
git commit -m "feat: card 'Novos no mês' real (conta clients.created_at do mês)"
```

---

## Higiene opcional (comentários com `R$`)

Não funcional. Se quiser coerência total, atualizar os comentários-exemplo que ainda citam `R$` (não são código de formatação):
- `src/components/ui/Primitives.tsx:53` — exemplo `R$ 302.881.052`
- `src/services/dashboardService.ts:77` — `R$ 0,00`
- `src/components/products/SaleOrderModal.tsx:164` — `R$ 0,00`

Fora do gate; pode virar um commit de polish ou ficar para a branch de i18n.

## Handoff / pontos de atenção

- **Seed da demo (Frente 3):** o card "Novos no mês" só mostra `> 0` se os clientes do tenant de demo tiverem `created_at` no mês corrente. Como a coluna é `default now()`, clientes criados pelo fluxo real do app durante o seed já entram com a data certa. Clientes importados via CSV com data antiga (ou seed histórico) aparecerão como `0` — atenção ao montar a demo Popeye.
- **Fora deste plano:** idioma pt→inglês (branch dedicada), metas de vendedor (modelo não suporta), seed operacional (Frente 3, pós-deploy).

## Self-review

- **Cobertura da spec:** Frente 1 empty states → Tasks 2 (574661, card meta) + 5+6 (Novos no mês, agora real por decisão do Lucas). Frente 2 moeda → Tasks 1 (util) + 3 (páginas) + 4 (bulk preview). Frente 3 (seed) fora do PR, registrada no handoff. ✓
- **Sem placeholder:** todo step tem código exato ou comando. ✓
- **Consistência de tipos:** `formatCurrency(value: number): string` usado igual em todas as tasks; `Client.created_at?: string` (Task 5) consumido por `countNewClientsThisMonth` (Task 6). ✓
