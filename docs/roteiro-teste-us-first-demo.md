# Roteiro de teste manual — demo-ready US-first (PR #65)

Verificação visual da obra no app real. A suíte automatizada só cobre funções
puras (moeda e contagem); render de tela é este roteiro. Faça antes do café.

## Setup

Prepare **dois tenants** para cobrir empty state e dados reais:

- **Tenant A — zerado**: sem vendas, sem faturamento (idealmente sem clientes).
  Valida os empty states honestos.
- **Tenant B — com dados**: com produtos, vendas, clientes e vendedores.
  Valida a formatação US$ em valores reais.

Regra transversal em TODAS as telas:
- **Moeda** aparece como `$1,234.56` (cifrão, vírgula de milhar, ponto decimal). **Nunca** `R$` nem `1.234,56`.
- **Datas** continuam em pt-BR (`jan/25`, `dd/mm`) — isto é esperado, NÃO é bug (idioma fica pra outra branch).
- **Quantidades** (unidades vendidas, contagem de clientes) NÃO são moeda: seguem número simples, sem `$`.

---

## 1. Dashboard / Overview

**Tenant A (zerado):**
- [ ] "Faturamento do dia" mostra **`$0.00`** — não `574.661`, não `R$`.
- [ ] "Faturamento Total" mostra **`$0.00`**.

**Tenant B (com dados):**
- [ ] "Faturamento do dia" e "Faturamento Total" em `$X,XXX.XX`.
- [ ] Bloco de categorias: venda e custo de cada categoria em US$ (`$...`).
- [ ] Gráfico de faturamento: passar o mouse → tooltip mostra o valor em **US$**.
- [ ] Lista de produtos mais vendidos: a coluna de **unidades** (`totalSold`) continua número simples (ex. `1.234`), **sem** `$`.

## 2. Products

**Tenant B:**
- [ ] Preço de cada produto em `$X,XXX.XX` (tanto no card mobile quanto na tabela desktop).
- [ ] Produto **sem preço** mostra `—` (travessão), não `$0.00`.
- [ ] Coluna de **quantidade vendida** continua número simples, sem `$`.

## 3. Sellers (Vendedores)

**Tenant B:**
- [ ] O card **"Abaixo da meta" NÃO aparece** — a linha de cards do topo tem 3 cards, não 4.
- [ ] "Faturamento combinado" em US$.
- [ ] Cada vendedor: bruto e líquido em US$ (nos cards, na tabela e no tooltip do gráfico).

**Tenant A (zerado):**
- [ ] Sem vendedores/valores, nada de número fabricado; ausência do card de meta confirmada.

## 4. Clients (Clientes) — foco no card "Novos no mês"

O **único** fluxo de cadastro de cliente no app é o **import CSV** (tela Importar
dados → tipo "Clientes"). Não existe formulário "novo cliente" nem criação inline
na venda. O import faz `upsert` com `onConflict: tenant_id,external_id` e **não**
envia `created_at`, então todo cliente **novo** (external_id inédito) entra com
`created_at = now()` — ou seja, conta como "novo no mês".

**Teste dinâmico (o mais importante):**
- [ ] Anote o valor atual do card **"Novos no mês"**.
- [ ] Na tela Importar → **Clientes**, importe um CSV com **um cliente de external_id inédito**.
- [ ] Volte ao dashboard de clientes: o card **"Novos no mês" incrementou em 1** — porque o `created_at` do insert é agora, dentro do mês corrente.
- [ ] O card **não** é mais `0` fixo: reflete a contagem real de clientes com `created_at` neste mês.
- [ ] As contagens de clientes (total, gráfico de evolução) continuam número simples, sem `$`.

> **Pegadinha da demo Popeye:** como o import seta `created_at = now()`, se você
> importar TODOS os clientes hoje, TODOS contam como "novos no mês" (o card pode
> igualar o total importado). Re-importar um cliente **existente** (mesmo
> `tenant_id+external_id`) faz UPDATE e **não** altera o `created_at` original.
> Só um seed via SQL com `created_at` explícito de outro mês ficaria fora da contagem.

## 5. Orders (Pedidos)

**Tenant B:**
- [ ] Valores dos pedidos em US$.
- [ ] Pedido/linha **sem valor** mostra `—` (o guard foi preservado), não `$0.00` nem erro.
- [ ] Datas dos pedidos continuam em pt-BR.

## 6. Edição em massa de produtos (bulk edit)

**Tenant B:**
- [ ] Selecione produtos → edição em massa de **preço** → na tela de **preview** (antes de aplicar), o valor aparece em `$X.XX` (US$), não `R$`.
- [ ] Aplicar e conferir que o preço gravado aparece em US$ na listagem.

## 7. Venda (SaleOrderModal)

**Tenant B:**
- [ ] Abrir uma nova venda: preço unitário, total da linha e total do pedido, todos em US$.
- [ ] Item sem preço mantém o checkout bloqueado (comportamento pré-existente, só confirmar que não regrediu).

---

## Se achar bug

Registrar em `docs/bugs.md` (backlog versionado do repo) com tela, passo e o que apareceu vs. esperado.

## Fora do escopo deste PR (não reportar como bug)

- Rótulos/textos em português (idioma → branch de i18n dedicada).
- Fronteira de "mês" em UTC no card "Novos no mês" (cliente criado perto da meia-noite no fuso local pode cair no mês seguinte) — handoff conhecido, revisitar no i18n/locale.
- Coluna vazia no grid de vendedores no breakpoint `xl` (cosmético, opcional).
