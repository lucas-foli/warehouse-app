# Edição em massa: mostrar o que vai mudar antes de mudar

**Data:** 2026-07-31
**Branch:** `feat/bulk-edit-preview` (base: `origin/main` @ `3f36088`, com #62 mergeado)
**Origem:** follow-up do PR #62. Lá, o review corrigiu o sintoma (injeção de `null` no
estado ao apagar preço). Esta fatia ataca a causa a montante: a edição em massa aplica
uma mudança em N produtos sem mostrar nada e sem confirmar nada.

## Problema

- `BulkEditFieldPopover.tsx` (`submit`): com o campo de valor vazio, `price`/`min` viram
  `null` — "apagar o valor de todos os selecionados". O botão Apply **não** é desabilitado,
  então isso acontece com um clique, sem aviso e sem desfazer.
- `ProductsPage.tsx` (`handleBulkEditField`): grava direto, em chunks de 500, e só depois
  mostra um diálogo de resultado. O usuário nunca vê o antes→depois.
- Vale para os 5 campos, não só os numéricos: trocar 40 produtos de local ou status em
  massa é igualmente destrutivo e silencioso.

## Decisões (fechadas no brainstorming)

1. **Formato do preview:** agregado por transição (agrupa por valor atual → novo). Escala
   para qualquer N. Sem detalhe expansível de SKUs (fatia futura).
2. **Cobertura:** os **5 campos** (`status`, `is_active`, `location`, `price`, `min`). A
   lógica de agrupar-por-transição é genérica; só a formatação de exibição difere.
3. **Caso destrutivo (valor vazio):** o preview mostra e **destaca** as transições que
   apagam (`→ "—"`), mas **não bloqueia**. O preview É o anti-acidente. Apagar em massa
   continua sendo operação legítima.
4. **Escopo:** só o preview. A descoberta da desativação via `is_active` fica como está
   (outra fatia).

## Fluxo

Hoje: `Apply → grava`. Passa a ser: `Revisar → preview → Confirmar → grava`. O preview é o
gate de confirmação para **todos** os casos; o destrutivo só ganha destaque visual. Nenhum
diálogo novo — o próprio popover cresce um segundo passo (`step: 'edit' | 'preview'`).

## Arquitetura

### 1. Função pura — `src/utils/bulkEditPreview.ts` (+ teste ao lado)

Onde vive toda a lógica testável sem UI.

```ts
import type { Product } from '../types';

// Passa a ser a fonte canônica do tipo. BulkEditFieldPopover.tsx deixa de defini-lo e
// re-exporta daqui, para NÃO quebrar o import existente em ProductsPage.tsx
//   (import { BulkEditFieldPopover, type BulkEditableField } from './products/BulkEditFieldPopover')
export type BulkEditableField = 'status' | 'is_active' | 'location' | 'price' | 'min';

export interface BulkEditGroup {
  from: unknown;        // valor atual normalizado do grupo
  to: unknown;          // valor novo (o mesmo para todo o preview)
  count: number;        // quantos selecionados têm esse valor atual
  changed: boolean;     // from !== to (após normalização)
  destructive: boolean; // apaga o valor: só true para price/min quando to === null
}

export interface BulkEditPreview {
  groups: BulkEditGroup[];   // ordenados: destrutivos, depois demais mudanças, depois sem-mudança
  changedCount: number;      // soma de count dos grupos changed
  unchangedCount: number;    // soma de count dos grupos !changed
  destructiveCount: number;  // soma de count dos grupos destructive
}

export function computeBulkEditPreview(
  field: BulkEditableField,
  newValue: unknown,          // já no tipo final: null | number | string | boolean
  selected: Product[],
): BulkEditPreview;

export function formatBulkFieldValue(field: BulkEditableField, value: unknown): string;
```

**Regras da `computeBulkEditPreview`:**

- Agrupa os `selected` pelo valor atual do campo (`p[field]`). Normalização por campo:
  - `price`/`min`: `undefined` → `null` (mesma coisa que "—").
  - `status`/`location`: string como está.
  - `is_active`: boolean; `undefined` tratado como grupo próprio (valor atual desconhecido).
- Chave de agrupamento = representação estável do valor normalizado (ex.: `String(v)` com
  `null` distinto de `''`). Preserva o valor original em `from` para exibição.
- `changed = from !== to` após normalização (ex.: `price` atual `undefined` vs novo `30` →
  changed; atual `30` vs novo `30` → não).
- `destructive = (field === 'price' || field === 'min') && to === null`.
- Ordenação de `groups`: destrutivos primeiro, depois demais `changed`, depois `!changed`.
- `selected` vazio → `groups: []` e todos os contadores 0.

**Regras da `formatBulkFieldValue`** (reusa a convenção "—" do repo, `ProductsPage.tsx:614`):

| campo | valor | saída |
|---|---|---|
| `price` | `null`/`undefined` | `—` |
| `price` | `30` | `R$ 30` (`toLocaleString('pt-BR')`) |
| `min` | `null`/`undefined` | `—` |
| `min` | `5` | `5` |
| `is_active` | `true` / `false` | `Ativo` / `Inativo` |
| `is_active` | `undefined`/`null` | `—` (valor atual desconhecido; evita "Inativo → Inativo" falso) |
| `status`/`location` | `''`/`null`/`undefined` | `—` |
| `status`/`location` | texto | o texto |

### 2. `BulkEditFieldPopover.tsx` — segundo passo

- Novo estado `step: 'edit' | 'preview'`. Nova prop `selectedProducts: Product[]`.
- **`edit`** (igual ao atual): escolhe campo + valor. O botão passa de "Apply" para
  **"Revisar"**. Ao clicar: parseia+valida o valor, calcula o preview, vai para `preview`.
  - **Parse/validação na fronteira** (resolve o achado herdado do #62): para `price`/`min`,
    valor vazio → `null`; valor não-vazio que vira `NaN` (`Number`/`Number.parseInt`) →
    entrada inválida, **não avança** (botão Revisar desabilitado ou mensagem). A função
    pura só recebe valor já no tipo final.
- **`preview`**: renderiza `groups` como linhas `formatBulkFieldValue(field, from) → …(to)`
  com `count`. Linhas `destructive` com destaque de aviso. Grupos `!changed` mostrados como
  "sem mudança" (visualmente apagados). Rodapé: "X alterados · Y sem mudança". Botões
  **"Voltar"** (→ `edit`) e **"Confirmar"** (→ `onApply(field, value)`, grava). Se
  `changedCount === 0`, **Confirmar desabilitado**.
- `open` reseta para `step: 'edit'`.

### 3. `ProductsPage.tsx` — mudança cirúrgica

- Passar `selectedProducts={products.filter((p) => selectedIds.has(p.id))}` ao popover.
- `handleBulkEditField` (gravação em chunks de 500 + `BulkResultDialog`) **não muda** — só
  é chamado depois do Confirmar. Nenhuma alteração na lógica de gravação/patch.

## Testes (TDD — função pura, `src/utils/bulkEditPreview.test.ts`)

Anotação `mata:` = qual defeito/mutação o teste detecta.

- **price vazio (`newValue = null`) sobre mix de atuais** → todos os grupos `destructive`,
  `destructiveCount` = total, `changedCount` = os que não eram já `null`.
  `mata:` destructive nunca sinalizado; contagem destrutiva ignorada.
- **price=30 sobre atuais `[undefined, 25, 30, 30]`** → 3 grupos: `— → R$ 30` (count 1,
  changed), `R$ 25 → R$ 30` (count 1, changed), `R$ 30 → R$ 30` (count 2, **não** changed);
  `changedCount = 2`, `unchangedCount = 2`, `destructiveCount = 0`.
  `mata:` "sem mudança" contado como mudança; agrupamento que funde valores distintos;
  changed sempre-true.
- **is_active=false sobre `[true, false, undefined]`** → agrupa os 3; `changed` só para
  `true` e `undefined`; `destructiveCount = 0` (nunca destrutivo).
  `mata:` bool tratado como destrutivo; undefined fundido com false.
- **status="B" sobre `["A", "B"]`** → `A → B` changed, `B → B` não; `destructiveCount = 0`.
  `mata:` string marcada destrutiva; changed sempre-true em string.
- **seleção vazia** → `groups: []`, todos os contadores 0.
  `mata:` crash/divisão por zero em entrada vazia.
- **ordenação** → grupo destrutivo aparece antes de um grupo só-changed, que aparece antes
  de um grupo sem-mudança. `mata:` ordem não aplicada.
- **`formatBulkFieldValue`** por campo (tabela acima), incluindo `price=null → "—"`,
  `is_active` true/false, status vazio → "—". `mata:` formatação trocada entre campos;
  vazio não vira "—".

**Paridade:** cada campo editável (`status`, `is_active`, `location`, `price`, `min`) tem
ao menos um caso de agrupamento. A suíte deve falhar sob "computeBulkEditPreview retorna
`groups: []` sempre" e sob "changed sempre true".

**Não introduzir** `@testing-library/react` — a lógica é pura e testada sem UI. O passo de
preview do popover é verificado na checagem manual.

## Gates por commit

- `npx tsc --noEmit` → 0 erros.
- `npx vitest run` → tudo passa (baseline 101 + novos).
- eslint limpo nos arquivos tocados. **Não tocar** os ~6 warnings pré-existentes fora da
  fatia (LoginForm, RequestsPage, MembersPage, JoinRequestsPage, ProductOptionsPage,
  PlatformAdminContext).

## Verificação manual (fim)

App em localhost (conferir a porta que o vite escolheu — 5173 costuma estar ocupada).
Ambiente tem dados reais: desfazer o que for alterado no teste. Roteiro:
selecionar N produtos → Editar campo → Revisar → conferir agregação e destaque destrutivo
→ Confirmar → conferir resultado. Testar o caso vazio (apagar preço) e um caso "sem
mudança".

## Fora de escopo

- Detalhe expansível de SKUs por grupo.
- Descoberta/UX da desativação via `is_active`.
- Qualquer refactor não relacionado.
