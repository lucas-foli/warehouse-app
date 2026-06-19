# Modelo de dados: Localidade vs. Status (intenção do produto)

> Documenta a **intenção de produto** por trás dos campos `location` e `status` em
> `products`, o estado atual da implementação e os conflitos a resolver.
> Decidido com o owner em 2026-06-14.

## Intenção (o que cada campo DEVE significar)

- **`location` = qual loja.** Serve para o gerente filtrar entre diferentes lojas do
  negócio, ou ver tudo agregado (ideia de "dashboard geral dos negócios"). Dimensão de
  loja dentro de um mesmo tenant.
- **`status` = onde o produto está fisicamente.** Estoque/armazém, loja, gaveta,
  vitrine (VM), etc. Os valores **variam por organização** — cada org define os seus.

## Estado atual da implementação (2026-06-14)

### `location`
- Coluna `text not null default 'Brasília Shopping'` em `products`
  (`supabase/migrations/20251226000100_multitenant.sql:71`). **Texto livre**, sem lista
  canônica.
- Filtro **funciona** em `ProductsPage.tsx:99-113`, mas só renderiza com
  `locations.length > 1` (`ProductsPage.tsx:486`). Com uma única loja nos dados, não há
  o que filtrar (no test-data todos os produtos são `'Loja principal'`).
- Dropdown do **Dashboard é órfão**: `Dashboard.tsx:116-126` e `199-207` têm
  `onChange={() => {}}` e `value="all"` fixo — não guarda estado nem filtra nada. É
  justamente a peça que entregaria o "dashboard geral".

### `status`
- Coluna `text not null default 'ESTOQUE'` em `products`
  (`supabase/migrations/20251226000100_multitenant.sql:70`). Sem enum/constraint.
- Valores de posição física já existem: `ESTOQUE`, `GAVETA`, `VM`
  (`StatusUpdateForm.tsx:6`) — **conteúdo já bate com a intenção**.
- UI inconsistente: dropdown em `StatusUpdateForm.tsx:414-430` e
  `BulkEditFieldPopover.tsx:62-71`, mas **input de texto livre** em
  `ProductsPage.tsx:785-794`.

## Conflitos a resolver

1. **Dashboard sem filtro de loja** — ligar o dropdown órfão espelhando o
   `productLocationFilter` do ProductsPage, propagando o local selecionado às subpáginas.
2. **`location` texto livre** — para multi-loja confiável, normalizar para uma lista
   canônica de lojas por tenant (evita fragmentação "Loja Centro" vs "loja centro").
3. **Valores de `status` hardcoded** — `['ESTOQUE','GAVETA','VM']` está chumbado no
   front; precisa ser **configurável por tenant** ("depende de cada org").
4. **`status` sobrecarregado** — `isCriticalProduct` (`ProductsPage.tsx:80-87`) extrai
   risco (`'sem giro'`, `'comprar'`, `'em risco'`, `'stockout'`) de dentro do `status`.
   Se `status` = lugar físico, o sinal de risco precisa de **campo próprio**.
5. **Nomenclatura enganosa** — "status" para "lugar físico" confunde; o próprio
   `<select>` de status tem `id="product-location-select"` (`StatusUpdateForm.tsx:416`).
   Rótulo de UI deveria ser "Localização física" / "Onde está".
