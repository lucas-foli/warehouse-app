# Integridade do import CSV de clientes/vendedores

Data: 2026-08-05
Branch: `feat/import-csv-integrity` (a partir de `origin/main` @ 8016598, que já tem o PR #67)

## Objetivo

O import CSV (`DataImport.tsx`) trata identidade de forma diferente do CRUD da UI, o
que o e2e do PR #67 expôs. Esta obra corrige dois pontos (registrados em `docs/bugs.md`):

- **BUG-11:** "Limpar dados antes de importar" faz `DELETE` na tabela e, como o FK é
  `on delete set null`, desvincula silenciosamente as vendas (viram "Vendedor/Cliente
  desconhecido"). Falta proteção.
- **BUG-12:** o import não respeita e-mail único (a UI passou a respeitar no PR #67);
  aceita e-mails duplicados no upload.

BUG-13 (duplicata por case do `external_id`) **não** entra: já foi resolvido para frente
pelos fixes do PR #67 (todos os caminhos de gravação normalizam em maiúsculas). Era resíduo
de registros criados antes do fix.

## Escopo

**Dentro** (só clientes e vendedores — os únicos com e-mail e com vínculo de venda):
- Aviso + confirmação ao limpar dados de clientes/vendedores (BUG-11).
- Pular + reportar linhas com e-mail duplicado no import (BUG-12).

**Fora:**
- `products`, `orders`, `options` no "Limpar dados" (não têm o problema de desvincular venda
  por cliente/vendedor; limpar pedidos já apaga itens de propósito).
- Qualquer mudança no CRUD da UI (entregue no #67).
- Backfill de `external_id` de registros antigos (BUG-13 — sem código pendente).

## Arquitetura

A lógica testável vai para funções puras em `src/utils/`; o `DataImport.tsx` faz as queries
e o wiring (padrão do repo). Dois módulos puros novos + edições no componente.

## BUG-11 — proteção no "Limpar dados" (aviso + confirmação)

Estado atual: checkbox `clearBeforeImport` (`DataImport.tsx:611`); ao importar com ele
marcado, `handleImport` faz `DELETE FROM <table> WHERE tenant_id` (`:355`).

Mudanças:
1. **Contagem.** Quando `kind` é `clients`/`sellers` **e** `clearBeforeImport` está marcado,
   disparar uma query de contagem das vendas que serão desvinculadas:
   `sales_orders` do tenant com `client_id` (para clients) ou `seller_id` (para sellers)
   **não-nulo** (`select ... { count: 'exact', head: true }` + `.not('client_id','is',null)`).
   Guardar em estado (`unlinkCount`).
2. **Aviso.** Abaixo do checkbox, mostrar a mensagem de `buildClearWarning(kind, count)` quando
   `count > 0`, ex.: *"Isso vai desvincular 12 vendas — elas ficarão sem cliente."* Some se 0.
3. **Confirmação inline.** Ao clicar "Importar" nesse estado de risco (clear + clients/sellers +
   count > 0), em vez de importar, entrar em modo confirmação (`confirmClear = true`): o botão
   principal vira *"Confirmar (N vendas ficarão sem vínculo)"* + um "Cancelar". O segundo clique
   (no confirmar) chama o `handleImport` de fato. Mesmo padrão do `confirmDelete` dos modais do
   #67; sem `window.confirm`. Fora do estado de risco, "Importar" segue direto como hoje.

`buildClearWarning(kind: 'clients' | 'sellers', count: number): string` é puro e testável.

## BUG-12 — e-mail único no import (pular + reportar)

Estado atual: `handleImport` para `clients`/`sellers` sanitiza e faz `upsert` por
`onConflict: tenant_id,external_id`. Duas linhas de mesmo `external_id` já deduplicam pelo
upsert; o problema é e-mail igual com `external_id` diferente, ou e-mail já no banco em outro
registro.

Mudanças no fluxo de `clients`/`sellers`, **antes** do upsert (após a sanitização que já
normaliza `external_id` em maiúsculas):
1. Buscar os e-mails já existentes no tenant: `select external_id, email from <table>
   where tenant_id and email in (<emails do CSV não vazios>)`. Montar um mapa
   `emailLower -> external_id` dos existentes.
2. Rodar `dedupeByEmail(rows, existingByEmail)` (puro): percorre as linhas mantendo um set de
   e-mails já vistos no próprio CSV; uma linha é **pulada** quando seu e-mail (case-insensitive,
   não vazio):
   - já apareceu antes no CSV (duplicata interna), ou
   - existe no banco sob um `external_id` **diferente** do da linha (não pular o update do
     próprio registro — mesmo external_id é atualização legítima).
   Linhas sem e-mail nunca são puladas por este motivo.
   Retorna `{ toImport: Row[], skippedEmails: number }`.
3. Fazer o upsert só de `toImport`. Se `skippedEmails > 0`, adicionar ao relatório existente
   (`csvWarnings` / a contagem de ignoradas) uma linha: *"N linha(s) ignorada(s): e-mail já
   cadastrado."*

`dedupeByEmail` é puro e testável (assinatura genérica sobre `{ external_id: string; email?: string }`).

## Arquivos

- Create `src/utils/importClearWarning.ts` — `buildClearWarning` (puro).
- Create `src/utils/importEmailDedup.ts` — `dedupeByEmail` (puro).
- Create os `.test.ts` correspondentes.
- Modify `src/components/DataImport.tsx` — query de contagem + aviso + confirmação inline
  (BUG-11); busca de e-mails + `dedupeByEmail` + relatório (BUG-12).

## Testes

Padrão dos `src/utils/csv.*.test.ts` (Vitest, funções puras):
- `dedupeByEmail`: pula duplicata interna do CSV; pula e-mail já no banco sob external_id
  diferente; **não** pula quando o external_id é o mesmo (update do próprio); não pula linhas
  sem e-mail; case-insensitive.
- `buildClearWarning`: singular/plural; texto por `kind` (cliente/vendedor); vazio/omitido
  quando count 0 (ou o componente decide não mostrar).

Baseline atual: 137 testes, 0 falhas.

## Riscos e paralelismo

- PR #66 (docs BUG-6..9) está aberto mas não toca `DataImport.tsx` — sem overlap.
- A checagem de e-mail é um "check-then-write" não atômico (como no CRUD do #67); aceitável para
  um import single-admin. O upsert por `external_id` continua sendo o backstop de identidade.

## Fora de escopo (explícito)

- BUG-13 / backfill de external_id antigos.
- Proteção de "Limpar dados" para products/orders/options.
- Validação de formato de e-mail / máscara de telefone (já no backlog).
