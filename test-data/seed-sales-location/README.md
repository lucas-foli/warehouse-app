# Dados de teste — Phase 6 (filtro de loja em todo o Dashboard) via Import de CSV

CSVs no formato da própria tela **Importar dados** do app. Você sobe logado em
qualquer tenant (o `tenant_id` é resolvido sozinho) — sem SQL, sem placeholder.

> Requer a branch `feat/sales-location-revenue-by-store` rodando e a migração da
> Phase 6 aplicada no Supabase.

## Ordem de importação (Importar dados → escolher o Tipo → subir o arquivo)
1. **Locais / Campos (Onde / Local)** → `1_options.csv`
2. **Produtos** → `2_products.csv`
3. **Clientes** → `3_clients.csv`
4. **Vendedores** → `4_sellers.csv`
5. **Vendas (Pedidos)** → `5_sales_orders.csv`
6. **Itens de venda** → `6_sales_items.csv`

A ordem importa: Clientes e Vendedores precisam existir **antes** dos Pedidos (o
import liga por `external_id`); os Itens só aceitam SKUs de produtos já cadastrados.
Para recomeçar, marque **"Limpar dados antes de importar"** em cada tipo.

## Cenário
- **2 lojas com dados**: `LOJA TESTE A`, `LOJA TESTE B`. **`LOJA TESTE C`** existe só na
  lista (sem produto/venda) — serve para confirmar que loja cadastrada aparece no filtro.
- **2 vendedores**: Ana (`VEND-A`, só Loja A) e Bruno (`VEND-B`, só Loja B).
- **3 clientes**: Alfa (`CLI-A`, Loja A), Beta (`CLI-B`, Loja B), Gama (`CLI-C`, compra **nas duas**).
- **1 voided** (`VT-0005`) e **2 sem loja** (`VT-0010/0011`).

## O que o filtro de loja recorta agora (em TODAS as telas)

**Visão geral** — Faturamento / Tendência / Categorias:

| Filtro | Faturamento |
|---|---|
| Todos os locais | **R$ 3.000** |
| LOJA TESTE A | **R$ 1.240** |
| LOJA TESTE B | **R$ 1.360** |
| LOJA TESTE C | **R$ 0** (só na lista) |

**Vendas (lista de pedidos):**
- Todos → 11 pedidos · Loja A → 5 (inclui o voided VT-0005) · Loja B → 4 · sem-loja só em "Todos".

**Vendedores:**
- Todos → Ana R$ 1.560, Bruno R$ 1.440.
- Loja A → Ana R$ 1.240 (Bruno zera). Loja B → Bruno R$ 1.360 (Ana zera).

**Clientes:**
- Todos → 3 clientes (Alfa, Beta, Gama).
- Loja A → Alfa + Gama. Loja B → Beta + Gama. (Gama aparece nas duas.)

> Em todas, o voided (`VT-0005`, R$ 250) nunca soma, e os pedidos sem loja só
> aparecem em "Todos os locais".

## Roteiro de teste
1. Importe os 6 CSVs na ordem acima.
2. **Visão geral**: Todos R$ 3.000 → Loja A R$ 1.240 → Loja B R$ 1.360.
3. **Vendas**: troque a loja e veja a lista de pedidos encolher para a loja.
4. **Vendedores**: Loja A mostra Ana com faturamento; Loja B mostra Bruno.
5. **Clientes**: Loja A lista Alfa+Gama; Loja B lista Beta+Gama.
6. **LOJA TESTE C**: aparece no filtro (valida o fix), tudo zerado/vazio.
7. Modal de Nova Venda → o select de loja lista A, B e C.
