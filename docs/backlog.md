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
