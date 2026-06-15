# Plano: Localidade como filtro multi-loja

> Contexto em `docs/data-model-location-status.md`. Intenção do owner:
> `location` = "qual loja", para o gerente filtrar entre lojas do negócio ou ver tudo
> agregado (dashboard geral). Hoje: o filtro do ProductsPage funciona, mas o do
> **Dashboard é órfão** e `location` é texto livre.

## Objetivo

1. Ligar o filtro de loja do Dashboard (a peça que entrega o "dashboard geral").
2. Tornar `location` confiável (lista canônica de lojas), evitando fragmentação por typo.

## Fatia 1 — Ligar o filtro do Dashboard (barata, sem schema)

Espelha o que `ProductsPage` já faz corretamente (`ProductsPage.tsx:49,99-113,486-498`).

1. **Estado.** Em `src/components/Dashboard.tsx`, adicionar
   `const [locationFilter, setLocationFilter] = useState<'all' | string>('all')`.
2. **Ligar os dropdowns órfãos.** `Dashboard.tsx:116-126` (desktop) e `199-207`
   (mobile): trocar `value="all"` fixo por `value={locationFilter}` e
   `onChange={() => {}}` por `onChange={(e) => setLocationFilter(e.target.value)}`.
3. **Consumir o filtro.** Derivar `filteredProducts` por `location` e passar às
   subpáginas (`OverviewPage`, `ClientsPage`, etc., ~`Dashboard.tsx:290+`) em vez de
   `products` cru. Decidir o alcance: só produtos, ou também pedidos/vendas?
   (Vendas exigiriam `location` em `sales_orders` — hoje não existe → ver Fatia 2.)
4. **Guard de renderização.** Só mostrar o dropdown com `locations.length > 1`
   (mesma regra do ProductsPage), senão "Todos os locais" é inútil.
5. **Verificar.** `npx tsc --noEmit` + e2e manual com ≥2 lojas nos dados
   (test-data hoje só tem "Loja principal" → criar 2ª loja pra testar de verdade).

## Decisões fixadas (owner, 2026-06-15)

- **Loja = Opção B** — `location` continua **texto**, mas com **lista gerenciada por
  tenant**. Sem tabela `stores`, sem FK.
- **Alcance = Tudo** — o filtro de loja cobre **produtos E vendas/receita**.

⚠️ **Risco de B + Tudo:** se produto e venda guardam loja como texto livre, "Loja
Centro" vs "loja centro" desalinha os números. **Mitigação obrigatória:** produtos E
vendas devem escolher loja **da mesma lista gerenciada** (fonte única) — nunca digitar.
Sem isso, o relatório de receita por loja fica não-confiável.

## Fatia 2 — Lista gerenciada de lojas (Opção B)

Hoje `location` é `text not null default 'Brasília Shopping'`
(`supabase/migrations/20251226000100_multitenant.sql:71`) — texto livre por produto.

1. **Fonte da lista gerenciada por tenant.** Definir onde mora a lista de lojas
   (ex.: tabela simples `tenant_locations(tenant_id, name)` OU config no tenant).
   É a fonte única de verdade para todos os dropdowns de loja.
2. **Trocar todo input de loja por seleção da lista.** Onde hoje se digita `location`
   livre (criação/edição de produto, bulk edit), passar a escolher da lista gerenciada.
3. **Loja nas vendas (necessário para "Tudo").** Adicionar `location` (text) em
   `sales_orders`, preenchido **a partir da mesma lista** no momento da venda.
   **Atenção (memória `project_warehouse_sales_migrations_risk`): a migração + RPCs de
   venda precisam ser aplicadas na Supabase do app, senão quebra em runtime.**
4. **Dashboard filtra receita por loja.** Com `sales_orders.location` disponível, o
   filtro da Fatia 1 passa a recortar também os números financeiros por loja.
5. **Normalização dos dados atuais + import CSV.** Conciliar `location` existente
   (produtos e vendas) contra a lista gerenciada; ajustar `helpers.ts:453` e
   `dashboardService.ts:90` para resolver contra a lista, não aceitar texto solto.

## Ordem recomendada

**Fatia 1 primeiro** (liga o filtro do Dashboard p/ produtos; sem schema, valor imediato).
**Fatia 2 depois** (lista gerenciada + loja nas vendas → habilita receita por loja).
