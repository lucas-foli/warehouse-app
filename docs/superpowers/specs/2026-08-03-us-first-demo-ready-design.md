# Demo-ready US-first — design

## Contexto

A Global (distribuição/representação no eixo Brasil-EUA) fechou o primeiro
cliente: a marca **Popeye** (pescados do Brasil), que vai colocar 10 SKUs no
mercado americano. O fluxo real: recebem amostras, rodam mercados/varejistas,
vendem e distribuem. O warehouse-app entra como a ferramenta dessa operação, e
há uma reunião ("o café") em que o sistema será **apresentado** ao Davi.

O produto já tem a espinha dorsal do caso (catálogo, vendas com carrinho,
pedidos, clientes, dashboard, multi-tenant). O objetivo desta obra é deixar o
app **apresentável e coerente com US-first** para esse café: sem números falsos
na tela e com moeda em dólar. O idioma (pt para inglês) fica para uma branch
dedicada posterior.

Base: `origin/main` já com o #64 (edição em massa com preview) mergeado.

## Escopo

Duas frentes de **código** (viram um PR) e uma frente **operacional** (seed de
dados, fora do PR).

### Frente 1 - Empty states honestos (código)

Nenhum número fabricado pode chegar à tela de um tenant sem dados.

- `src/components/OverviewPage.tsx:51` - `monthlyRevenue = latestMonth?.value ?? 574661`
  passa a `?? 0`. Com isso `dailyRevenue` também zera e o card abre em `$0.00`
  em vez de faturamento fantasma.
- `src/components/ClientsPage.tsx:80` - o card "Novos no mês" hoje é `value={0}`
  fixo. Passa a **computar de verdade**: contagem de clientes cujo `created_at`
  cai no mês corrente. `Client.created_at` existe no modelo
  (`src/types/index.ts:32`). Se o dado não estiver populado, o resultado é `0`
  honesto (real), não `0` mentiroso (hard-coded).
- `src/components/SellersPage.tsx:105` - o card "Abaixo da meta" é `value="—"`
  fixo. **Removido**. Não existe conceito de meta/goal/quota no modelo de
  vendedor (verificado em `src/types` e `src/utils/sellerRollup.ts`); um card que
  só pode exibir travessão não agrega. Volta quando (se) metas forem
  implementadas.

### Frente 2 - Moeda R$ para US$ (código)

- Novo módulo `src/utils/currency.ts` com `formatCurrency(value: number): string`
  usando `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`.
  Formato alvo: `$1,234.56`. Função pura, única fonte de verdade de moeda.
- Substituir os literais `R$` e os `toLocaleString('pt-BR')` **monetários** pelas
  chamadas a `formatCurrency`, nos arquivos que hoje exibem valor em real:
  `ProductsPage.tsx`, `OverviewPage.tsx`, `SellersPage.tsx`,
  `components/ui/Primitives.tsx`, `products/SaleOrderModal.tsx`,
  `services/dashboardService.ts`, `ClientsPage.tsx`, `OrdersPage.tsx`.
  A enumeração exata dos call-sites fica no plano de implementação.

**Explicitamente fora desta frente:** formatação de **datas** (`toLocaleString('pt-BR')`
de mês/dia, ex. `jan/25`) permanece em pt-BR. Data é idioma, não moeda; entra na
branch de i18n. Não tocar nesses call-sites.

### Frente 3 - Seed de demo Popeye/Global (operacional, pós-deploy)

Não é PR; é setup de ambiente. Montado pelos **fluxos reais do app** (não por
atalho de SQL/API), o que também dogfooda o produto:

1. Criar o tenant "Global" via fluxo de signup/admin da plataforma.
2. Onboarding com branding (nome, cores, logo).
3. Importar por CSV **10 SKUs plausíveis** da marca Popeye (pescado: sardinha,
   atum, filé de tilápia, camarão, etc. - catálogo fictício realista, não os
   códigos reais, que ainda dependem das amostras).
4. Cadastrar alguns mercados (clientes) e vendedores.
5. Registrar algumas vendas pelo `SaleOrderModal` para popular dashboard e
   rollups.

Ambiente: **Supabase de produção do app**, em um subdomínio de demonstração. O
Lucas fornece acesso/credenciais; a execução é conduzida por mim após o deploy
do código (Frentes 1+2), para que a demo já mostre US$ e empty states corretos.

## Fora de escopo (deferido)

- **Idioma pt para inglês** (rótulos, mensagens, datas) - branch dedicada,
  app-wide, após o café.
- **Metas de vendedor** - modelo não suporta; card removido, não reimplementado.
- **Fit de distribuição** (marca/fornecedor como entidade, amostras como
  conceito, cliente como ponto de venda B2B) - Camada B, obra futura.
- Billing self-service, assets da DemoRequestPage.

## Arquitetura e limites

- `formatCurrency` é uma função pura, testável isoladamente, sem dependência de
  estado ou do locale do runtime. Segue o padrão já estabelecido por
  `src/utils/bulkEditPreview.ts` (função pura + testes) no #64.
- Empty states não introduzem módulo novo: são mudanças pontuais nos componentes
  e no cálculo de "Novos no mês" (derivado de `clientes` já em memória).

## Testes e gate de qualidade

- **`formatCurrency`**: teste unitário cobrindo zero, valor com centavos,
  milhares (separador de milhar), e negativo (estorno).
- **Empty states**: garantir que nenhum número hard-coded (574661) sobrevive; o
  cálculo de "Novos no mês" cobre o caso "nenhum cliente no mês" (retorna 0) e
  "N clientes no mês" (retorna N).
- Gate de merge: `tsc -b` 0 erros - `vitest` verde (>= 114 + novos) - eslint
  limpo nos arquivos tocados.
- Verificação manual no app real antes do merge (dashboard de tenant zerado não
  mostra faturamento fantasma; valores em US$).

## Sequência

1. PR `feat/us-first-demo-ready` (Frentes 1+2), worktree isolado sobre
   `origin/main`.
2. Review e merge.
3. Deploy.
4. Seed do tenant de demo (Frente 3) no Supabase do app.
5. Café.

## Dependências / handoff

- Frente 3 depende de acesso ao Supabase de produção do app (fornecido pelo
  Lucas) e do deploy das Frentes 1+2.
