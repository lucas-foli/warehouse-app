# Backlog de features — warehouse-app

> Melhorias e features deferidas (não são bugs — bugs ficam em `bugs.md`).
> Ordem = ordem de registro.

## 2026-08-04 — Metas de vendedor (goal/quota)

**Origem:** na obra demo-ready US-first (PR #65), o card "Abaixo da meta" do
`SellersPage` foi **removido** porque não existe conceito de meta/quota no modelo
de vendedor — o card só conseguia exibir `—` (travessão). Removê-lo foi a decisão
honesta ("nada fabricado na tela"); esta entrada registra o caminho de volta.

**O que implementar:**
- Adicionar meta/quota ao modelo de vendedor (`Seller` em `src/types/index.ts`) —
  decidir a granularidade: meta de faturamento por mês? por período? valor fixo por
  vendedor ou configurável por tenant?
- Persistência: coluna(s) na tabela de vendedores no Supabase (+ migration) e/ou
  uma tabela de metas por período.
- Fluxo de definição da meta na UI (onde o gestor define/edita a meta de cada vendedor).
- Recolocar o card "Abaixo da meta" no `SellersPage`, agora com dado real: contar
  vendedores cujo faturamento (bruto/líquido — definir) está abaixo da meta do período.
- Reaproveitar o padrão de rollup já existente (`src/utils/sellerRollup.ts`) para o
  faturamento realizado vs. meta.

**Fora do escopo original da obra US-first** — feature própria, com brainstorming/spec
quando for priorizada.

## 2026-08-05 — Opções de ordenação (sort) escolhíveis pelo usuário nas listas

**Origem:** descoberto no e2e do CRUD individual de clientes/vendedores (PR #67).
Hoje as listas carregam ordenadas por `id` (uuid) em `dashboardService.ts:18` —
nem alfabética, nem por atividade. Efeitos:
- `ClientsPage` desktop (`:240-251`) mostra **todos** os clientes com rolagem
  (`overflow-auto`); o botão "Ver mais" existe **só** no mobile (`:200-235`, corta em 5).
- `SellersPage` ordena por receita (`bruto` desc) com cap de 15 na exibição.
- Um registro recém-criado cai numa posição "aleatória" (ordem de uuid), difícil de
  localizar numa lista grande.

**Decisão de produto:** a ordenação deve ser **escolhível pelo usuário** (seletor de
sort na tela), não fixa no código.

**Default proposto (Lucas):** clientes por **última venda (`last_purchase_at`) desc**,
com **ordem alfabética (nome A→Z)** como segundo critério de desempate. Prioriza a
visão do Business Owner (quem tem atividade comercial recente).

**A resolver no brainstorming/spec:**
- Onde entram os registros **sem compra** (incluindo recém-cadastrados): com "última
  venda desc", eles caem no fim. Isso é coerente com "priorizar atividade", mas o
  feedback de "acabei de cadastrar" passa a vir só do modal, não da posição na lista.
  Decidir se nulos vão ao fim, ou se há um modo/seletor "recém-adicionados".
- Aplicar o mesmo mecanismo de sort escolhível a vendedores (hoje fixo em receita).
- Opções de critério a expor: última venda, alfabético, data de cadastro, receita
  (vendedores). Persistir a preferência? (por usuário/tenant, ou só na sessão).

**Escopo:** afeta o display (fetch em `dashboardService` + render das páginas), **não**
o CRUD entregue no PR #67. Feature própria, com spec quando priorizada.

## 2026-08-05 — Validação de e-mail e máscara de telefone nos modais

**Origem:** e2e do CRUD de clientes/vendedores (PR #67). Os campos de e-mail e telefone
nos modais (`ClientFormModal`, `SellerFormModal`) aceitam qualquer texto: o `type="email"`
não valida porque o submit é por botão, não por `<form>`; o telefone é texto livre, sem
formatação.

**O que implementar:**
- Validação de formato de e-mail antes de salvar (mensagem amigável se inválido).
- Máscara/formatação de telefone. Duas abordagens a avaliar:
  - Simples: formatar conforme a contagem de dígitos (padrão US vs BR).
  - Rica: seletor de DDI com bandeira e, a partir da escolha, aplicar o formato do país.
- Decidir se o telefone inválido bloqueia o salvamento ou só formata/avisa.

**Fora do escopo do MVP/apresentação** — deferido conscientemente no e2e. Feature de
polimento dos modais, com spec quando priorizada. Pesar a complexidade do seletor de DDI
antes de adotá-lo.

## 2026-08-05 — Margem real (custo por produto)

**Origem:** obra "Dashboard honesto" (BUG-7). A seção "Categorias" exibia um
custo/margem fabricado (`custo = venda × 0.4`), removido por não existir custo real
no modelo (`Product` só tem `price`). Esta entrada registra o caminho para a margem
de verdade.

**O que implementar:**
- Custo por produto no modelo `Product` (`src/types/index.ts`) + persistência
  (coluna na tabela de produtos no Supabase + migration).
- UI para o gestor informar/editar o custo de cada produto.
- Recolocar custo e **margem real** por categoria na seção "Categorias" do
  `OverviewPage`, derivando de vendas − custo real (reaproveitar
  `buildCategorySalesFromItems`/`FromProducts`).

**Fora do escopo da obra Dashboard honesto** — feature própria, com spec quando priorizada.

## 2026-08-05 — Alinhar janelas das duas visões de vendedor

**Origem:** revisão final da obra "Dashboard honesto" (BUG-10). No `SellersPage`, os
dois gráficos lado a lado medem janelas temporais diferentes, ambos rotulados como
faturamento do mesmo vendedor:
- "Performance por período" (`buildSellerDailyPerformance`) soma só os **últimos 30
  dias** terminando hoje.
- "Faturamento por vendedor" (barras) usa `v.bruto` de `aggregateSellers`, que é
  **all-time** (sem janela).

**Efeito:** com histórico > 30 dias (ex.: import de CSV de 6 meses), a soma da série
não bate com a barra do mesmo vendedor. Não é dado fabricado — ambos são reais, só
medem períodos distintos; cada gráfico carrega seu próprio rótulo. O comportamento
antigo (série via `Math.random` distribuindo `bruto/30`) também não conciliava, então
não há regressão.

**A resolver no brainstorming/spec:** decidir se as duas visões devem compartilhar a
mesma janela (ambas 30d? ambas all-time? seletor de período?) ou se o rótulo deve
deixar a diferença de janela explícita ao usuário.

**Fora do escopo da obra Dashboard honesto** — decisão de produto, com spec quando priorizada.

## 2026-08-05 — Expor `external_id` do vendedor (e cliente) na UI

**Origem:** e2e da obra "Dashboard honesto". O `external_id` (identificador de origem
usado para casar pedidos importados por CSV via dual-key) **não aparece em nenhum lugar
da UI**: a tabela de vendedores mostra só nome/e-mail/itens/bruto/líquido/boletos, e o
`SellerFormModal` só tem os campos Nome e E-mail (`src/components/sellers/SellerFormModal.tsx:177-190`).
Hoje só dá para descobrir o `external_id` pelo CSV importado ou consultando o Supabase
(`sellers.external_id`). Exceção acidental: um vendedor importado **sem nome** aparece com
o `external_id` no lugar do nome (fallback em `dashboardService.ts:152`).

**Dor:** dificulta conciliação e suporte — quando uma venda registrada na tela e uma
importada deveriam cair no mesmo vendedor, não há como o gestor verificar o vínculo pela
interface.

**O que implementar:** exibir o `external_id` (read-only) nos detalhes do vendedor — no
modal e/ou como coluna/tooltip na tabela. Estender ao cliente (`external_id` de cliente
tem o mesmo papel). Decidir se é sempre visível ou só quando presente.

**Fora do escopo da obra Dashboard honesto** — melhoria de UI/suporte, com spec quando priorizada.

## 2026-08-26 — Estender a direção visual "app nativo" ao app inteiro

**Origem:** brainstorm da obra Campo (spec `2026-08-26-campo-fatia1-design.md`).
O mockup da aba Campo (cards arredondados, pills, segmented control, botão de
ação fixo, agrupamentos com hierarquia mobile-first) foi aprovado pelo Lucas
com decisão explícita de **adotar essa linguagem** — "tá caminhando pra se
tornar um app nativo".

**O que implementar:** aplicar a mesma linguagem visual às telas existentes
(Overview, Produtos, Pedidos, Clientes, Vendedores, Ajustes), hoje em padrão
misto. Referência viva: a aba Campo (fatia 1 da obra) e o mockup
`docs/superpowers/specs/2026-08-26-campo-fatia1-preview.html`.

**Escopo:** obra própria com brainstorming/spec — mudança app-wide de UI, não
fix por componente (regra de escopo já estabelecida para mudanças transversais).

**Jira:** WAR-8 (board Warehouse criado em 2026-08-26 no go-fly.atlassian.net;
epic da obra Campo = WAR-1).
