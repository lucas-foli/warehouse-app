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
