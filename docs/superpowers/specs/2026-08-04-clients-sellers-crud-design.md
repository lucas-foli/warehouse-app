# CRUD individual de clientes e vendedores no UI

Data: 2026-08-04
Branch: `feat/clients-sellers-crud` (a partir de `origin/main` @ 8323c41)

## Objetivo

Hoje a única forma de cadastrar clientes e vendedores no warehouse-app é o
import CSV (`DataImport.tsx`). Produtos, vendas (`SaleOrderModal`) e as listas
Onde/Local (`settings/ProductOptionsPage`) já têm criação individual pelo UI;
clientes e vendedores não. `ClientsPage` e `SellersPage` são telas somente de
leitura.

Esta obra adiciona **criar, editar e excluir** clientes e vendedores um a um,
por botões/modais no UI. O import CSV permanece intacto, reservado para bulk.

## Escopo

**Dentro:**
- Botão "Novo cliente" no topo de `ClientsPage`; "Novo vendedor" em `SellersPage`.
- Modal central de formulário (padrão `SaleOrderModal`) para criar e editar.
- Editar: clicar numa linha da tabela abre o modal preenchido.
- Excluir: botão dentro do modal de edição, com bloqueio quando há vendas vinculadas.
- Campo `email` adicionado aos types `Client` e `Seller` e ao mapeamento de dados.

**Fora (por enquanto):**
- Qualquer mudança no fluxo de import CSV.
- Edição de campos derivados de vendas (última compra, bruto, líquido, itens, boletos).
- Exposição do `external_id` no formulário (ver seção própria).
- Gating de botões por papel/role (o app não tem essa infra; ver Permissões).

## Entidades e schema (referência)

Tabela `public.clients` (migration `20251226000300_sales_clients.sql`):
- `id uuid` PK
- `tenant_id uuid` NOT NULL
- `external_id text` **NOT NULL**; índice único `(tenant_id, external_id)`
- `name text`, `email text`, `phone text`, `city text`, `last_purchase_at`

Tabela `public.sellers`:
- `id uuid` PK, `tenant_id uuid` NOT NULL
- `external_id text` **NOT NULL**; índice único `(tenant_id, external_id)`
- `name text`, `email text`

Vínculos: `sales_orders.client_id uuid references clients(id) on delete set null`
e `sales_orders.seller_id uuid references sellers(id) on delete set null`.

Types no front (`src/types/index.ts`), campos em português:
- `Client`: `id, externalId?, nome, cidade, telefone?, ultimaCompra` → **adicionar `email?`**
- `Seller`: `id, externalId?, nome, itens, bruto, liquido, boletos` → **adicionar `email?`**

## Arquitetura

`ClientsPage`/`SellersPage` são apresentacionais e recebem os dados por prop do
`Dashboard`, que os carrega via `useDashboardData(tenantId)`. Esse hook já expõe
`reload()`, hoje usado após registrar venda (`onSaleRegistered={reload}`).

Padrão adotado (o mesmo do CRUD de produto em `ProductsPage`):
1. As páginas passam a receber também `tenantId` e `onReload` (o `reload` do hook).
2. Cada mutação escreve direto no Supabase (`supabase.from('clients'|'sellers')`)
   e, no sucesso, chama `onReload()` para o Dashboard refazer o fetch.
3. Nenhum estado global novo; o modal detém apenas o rascunho do formulário.

O modal é um componente novo por entidade (ou um componente parametrizado),
espelhando a estrutura de `SaleOrderModal` (props `open`, `tenantId`, `onClose`,
callback de sucesso). Decidir 1-modal-parametrizado vs 2-modais na fase de plano;
preferir o que resultar em arquivos menores e mais focados.

## Formulários

**Cliente** (campos editáveis à mão):
- `nome` (obrigatório)
- `cidade`
- `telefone`
- `email`

**Vendedor:**
- `nome` (obrigatório)
- `email`

Campos derivados de vendas não aparecem no formulário.

## external_id: geração automática (não exposto)

`external_id` é NOT NULL e é a chave única de cruzamento com importações CSV
(o CSV de pedidos referencia clientes/vendedores por `client_external_id` /
`seller_external_id`, resolvidos para o `id` uuid). No import
(`buildClientsFromCsvText`), quando o CSV não traz `external_id`, o código gera:

```
const external_id = external || email || phone || name; // clientes
```

Para manter o registro criado à mão **deduplicável e cruzável** (uma reimportação
CSV do mesmo cliente atualiza em vez de duplicar; pedidos importados por CSV
casam com ele), a criação manual gera `external_id` com a **mesma regra**:
- Cliente: `email || phone || nome`
- Vendedor: `email || nome`

O campo **não** aparece no formulário. Ele é fixado na criação e nunca alterado
na edição (mudar quebraria vínculos já existentes).

Colisão do índice único `(tenant_id, external_id)` (ex.: dois clientes de mesmo
nome sem email/telefone): o insert falha e o modal mostra erro claro, ex.:
"Já existe um cliente com esse nome. Adicione um email para diferenciar."
Esse tratamento espelha o `error.code === '23505'` do create de produto.

## Exclusão + integridade referencial

O FK é `on delete set null`: excluir um cliente/vendedor **não** gera erro de FK
— o banco silenciosamente desvincula os pedidos (`client_id/seller_id = null`),
perdendo a atribuição do histórico sem avisar.

Como a decisão é **bloquear com aviso**, a exclusão faz uma **checagem explícita
proativa** antes de deletar:
1. `select count` em `sales_orders` com `client_id` (ou `seller_id`) = registro,
   filtrado por `tenant_id`.
2. Se count > 0: aborta e mostra aviso, ex.: "Este vendedor tem N vendas
   vinculadas. Desvincule ou remova essas vendas antes de excluir."
3. Se count = 0: `delete` normal e `onReload()`.

(No CRUD de produto o bloqueio é reativo a erro de FK; aqui precisa ser proativo
porque o `on delete set null` não gera erro.)

## Permissões / RLS

As policies de escrita de `clients` e `sellers` usam `is_tenant_admin` — igual às
de `products`. O botão "Novo produto" hoje **não** é gated por papel; a RLS
simplesmente barra não-admins e o erro é tratado. O app não tem infra de role no
front. Seguimos o mesmo padrão: botões visíveis a todos, erro de RLS tratado
(mensagem amigável) quando um não-admin tenta escrever. Nenhum gating novo.

## Testes

Espelhar o padrão dos `src/utils/csv.*.test.ts` (Vitest, funções puras):
- Função pura que monta o payload de insert/update a partir do rascunho do form
  (trim, `tenant_id`, geração de `external_id` pela regra `email || phone || nome`
  / `email || nome`, omissão de vazios).
- Função pura de validação (nome obrigatório) retornando erro legível.
- Casos: nome vazio; external_id derivado de email; derivado de telefone; derivado
  de nome; email/telefone opcionais ausentes.

A lógica de mutação/checagem-de-FK que toca o Supabase fica fina e delega a essas
funções puras, que são o alvo dos testes. Baseline atual: 122 testes, 0 falhas.

## Riscos e paralelismo

- Há outro desenvolvedor com agentes no mesmo repo. O PR #65 ("empty states
  honestos") **já foi mergeado** em `origin/main`; esta branch parte dele, então
  não há overlap pendente conhecido em `ClientsPage`/`SellersPage`. PR #66 (docs
  de bugs) não toca esses arquivos. Manter a branch enxuta e mergear cedo.
- `useDashboardData` refaz o fetch inteiro no `reload()` — custo aceitável para a
  escala atual; não introduzir mutação otimista agora (YAGNI).

## Fora de escopo (explícito)

- Bulk / import CSV: inalterado.
- Mesclar registros duplicados existentes.
- Exposição ou edição de `external_id`.
- Mutação otimista / cache local.
- Gating de UI por papel.
