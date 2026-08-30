# Campo — fatia 1: contatos, interações e agenda

**Data:** 2026-08-26
**Status:** aprovada (brainstorm com Lucas)
**Mockup:** `2026-08-26-campo-fatia1-preview.html` (descartável, tokens do preset warm)

## Contexto

A Global (import/export Brasil→EUA, primeiro cliente: Popeye/Noronha Pescados,
10 SKUs) vai usar o warehouse-app como sistema de campo. Persona alvo: **Elcy**,
que faz a ponte — prospecta mercados compradores nos EUA **e** fornecedores no
Brasil. Hoje o registro de campo dele é o Notes e o WhatsApp, sem histórico
estruturado e sem visão para os sócios.

Obra decomposta em 5 fatias (decisão de recorte aprovada):

1. **Contatos e campo** ← esta spec
2. Entrada de mercadoria (recebimentos que fazem o estoque SUBIR — hoje `qty`
   só desce via `register_sale_order`; defeito conhecido e registrado)
3. Tela de relatório de campo (visitas, funil, amostras, recebido × vendido)
4. Canal WhatsApp — Cloud API **Coexistence** no número atual do Elcy
   (verificado 2026-08-26: app Business + API no mesmo número, sync
   bidirecional, histórico de até 6 meses importado; exige app WhatsApp
   Business, abrir o app a cada 14 dias, janela de 24h/templates continuam)
5. Automações (resumo periódico aos sócios, lembrete de follow-up ao Elcy,
   follow-up pós-amostra ao comprador, confirmação de pedido) — todas as 4
   aprovadas

O relatório é **sempre disponível na tela** (fatia 3) e **também enviado por
WhatsApp** (fatia 5). Nenhuma fatia posterior bloqueia esta.

## Decisões de modelo (com as alternativas rejeitadas)

**Duas tabelas, não uma.** `clients` permanece e passa a abrigar também
prospects (mercado visitado na semana 1 = mesmo registro que compra na semana
6 — continuidade sem re-cadastro). `suppliers` nasce separada: transações
opostas (recebimento sobe estoque, pedido desce), e a FK de `sales_orders.client_id`
continua garantindo que venda não aponta para fornecedor. A alternativa
"entidade única com papéis" foi rejeitada: o caso "cliente e fornecedor ao
mesmo tempo" não existe na Global, e o rename de `clients`→`contacts` tocaria
as RPCs de venda sem ganho.

**Interações são o centro, não o contato.** O que o Elcy perde hoje é o
rastro (fui lá, deixei amostra, voltar dia X), idêntico para os dois lados.

**Estágio derivado com override manual.** O app deriva o estágio dos fatos;
o Elcy pode sobrescrever, o override fica identificado (quem/quando) e um
fato novo posterior ao override volta a derivar.

**Amostra baixa estoque.** Saída real sem receita. Estoque insuficiente
**avisa e não bloqueia** — a realidade física ganha do número do app; a
divergência aparece no relatório (fatia 3), não trava o registro na rua.

**Agenda não é tabela.** É `interactions` com `next_step_due_at` preenchido
e `next_step_done_at` nulo. Nada para sincronizar.

## Schema (migrations novas)

### Colunas novas em `clients` e em `suppliers` (iguais nas duas)

```sql
stage text,                      -- SÓ o override manual; null = derivar
stage_overridden_at timestamptz, -- quando o override foi feito
stage_overridden_by uuid,        -- auth.users; quem decidiu
last_interaction_at timestamptz  -- denormalizado p/ ordenação e "há X dias"
```

### `suppliers` (nova)

Mesma forma de `clients`: `id`, `tenant_id` FK tenants, `external_id`,
`name`, `email`, `phone`, `city`, `created_at`, `updated_at` + as colunas de
estágio acima. Unique `(tenant_id, external_id)`. RLS idêntica à de
`clients` (padrão `is_tenant_member`).

### `interactions` (nova, central)

```sql
id uuid pk default gen_random_uuid(),
tenant_id uuid not null references tenants on delete cascade,
client_id uuid references clients (id) on delete cascade,
supplier_id uuid references suppliers (id) on delete cascade,
kind text not null check (kind in ('visit','call','whatsapp','email')),
outcome text check (outcome in
  ('interested','proposal_requested','undecided','not_interested','buyer_absent')),
note text,
occurred_at timestamptz not null default now(),
recorded_by uuid not null,           -- auth.users
next_step text,
next_step_due_at timestamptz,
next_step_done_at timestamptz,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now(),
check (num_nonnulls(client_id, supplier_id) = 1)   -- arco exclusivo
```

Índices: `(tenant_id)`, `(tenant_id, client_id)`, `(tenant_id, supplier_id)`,
parcial para agenda: `(tenant_id, next_step_due_at) where next_step_due_at
is not null and next_step_done_at is null`.

### `interaction_samples` (nova)

```sql
id uuid pk, tenant_id uuid not null references tenants,
interaction_id uuid not null references interactions on delete cascade,
product_id uuid references products (id) on delete set null,
sku text not null,
qty integer not null check (qty > 0),
created_at timestamptz not null default now()
```

### RPC `register_interaction`

Transacional, padrão de `register_sale_order`: insere a interação + amostras,
debita `products.qty` (permitindo negativo — avisar é papel da UI),
atualiza `last_interaction_at` do contato. Exceções nomeadas:
`interaction_contact_invalid`, `interaction_kind_invalid`,
`interaction_sample_qty_invalid`, `interaction_sample_sku_unknown`.
Retorna o id criado + lista de SKUs que ficaram negativos (para o aviso).

### View `field_contacts`

Leitura unificada para funil/agenda/timeline: união de `clients` e
`suppliers` com `contact_type` (`'client'`/`'supplier'`), estágio efetivo
(ver regra abaixo) e `last_interaction_at`. `security_invoker = true`
(RLS das tabelas base vale; padrão pós-lição do
`fix_tenant_branding_definer_view`).

## Estágio efetivo (regra de derivação)

Precedência, avaliada por contato:

1. `stage` manual, **se** `stage_overridden_at` > data do fato mais recente
   (interação/venda/recebimento) — senão o override expira e volta a derivar
2. tem venda (cliente) ou recebimento (fornecedor, fatia 2) → **ativo**
3. última interação com `outcome = not_interested` → **perdido**
4. última interação com `outcome = proposal_requested` → **negociando**
5. tem amostra em alguma interação → **amostra entregue**
6. tem ao menos uma interação → **contatado**
7. nada → **novo**

Implementada em TS (`src/utils/stageDerivation.ts`, fonte única), sobre
fatos crus expostos pela view (`has_transaction`, `last_outcome`,
`has_samples`, `has_interaction`, `last_fact_at`, `manual_stage`,
`stage_overridden_at`). Emenda ao desenho original (que punha a derivação
em SQL): a casa não tem harness de teste de banco — em SQL as 7 regras
ficariam sem teste de unidade; em TS ganham a suíte completa. Relatório
(fatia 3) e automações (fatia 5) são TS e importam o mesmo módulo.

## UI

Aba nova **Campo** na navegação principal, três sub-visões (segmented
control), mobile-first — layout do mockup aprovado:

**Agenda (visão inicial).** Grupos "Atrasados", "Hoje", "Esta semana"
(próximos 7 dias) e "Mais tarde" (além de 7 dias, colapsado — sem ele um
follow-up longo sumiria da agenda): interações com próximo passo vencido/vencendo. Item mostra
contato, papel (pill cliente/fornecedor), texto do passo, vencimento.
Ações: marcar feito (`next_step_done_at = now()`) ou reagendar. Vazio
honesto: "nenhum follow-up marcado". Botão fixo "+ Registrar visita".

**Registro rápido.** Uma tela: busca/criação de contato (novo = só nome +
cidade + papel; resto depois) → tipo (default visita) → resultado (1 toque,
opcional) → amostras (SKU + qtd, opcional; aviso inline se estoque
insuficiente, sem bloquear) → próximo passo (texto + atalhos amanhã/3
dias/próx. semana/data, opcional) → nota (opcional) → salvar via
`register_interaction`.

**Funil.** Contatos agrupados por estágio efetivo, filtro
Todos/Clientes/Fornecedores, card com "há X dias" desde a última interação
(⚠ visual a partir de 5 dias — constante na UI, não configurável nesta
fatia). Override manual visível: "marcado pelo Elcy".

**Ficha do contato.** Na `ClientsPage`, tocar num cliente abre a ficha:
cabeçalho (papel, estágio, cidade, telefone, última compra/interação), ações
(+ Visita, Novo pedido) e **timeline** cronológica de interações (com
amostras) — pedidos e recebimentos entram na mesma timeline nas fatias
2/3. Fornecedores: lista simples dentro de Campo (sub-visão 3) com a mesma
ficha; sem página rica própria.

**Direção visual adotada:** a linguagem "app nativo" do mockup (cards
arredondados, pills, segmented control, botão fixo) vale para a aba Campo
nesta fatia. Estender ao app inteiro = tarefa futura no Jira (fora do
escopo).

## Erros e testes

- RPCs com exceções nomeadas (padrão da casa); UI traduz para mensagem.
- Testes de unidade: derivação de estágio (todas as 7 regras + expiração do
  override), agrupamento da agenda (atrasado/hoje/semana, timezone do
  navegador), merge de amostras duplicadas no payload da RPC.
- Gate de mutação adversarial antes da task 1 (regra da casa): cada teste da
  spec anota `mata:` qual mutação detectaria.
- Gate de typecheck: `npx tsc -b` (nunca `tsc --noEmit`).
- E2e manual roteirizado antes do merge (roteiro no PR).

## Fora do escopo (decisões, não esquecimentos)

- Recebimento/entrada de mercadoria → fatia 2. Até lá `qty` segue só
  descendo (agora também por amostra) — divergência conhecida.
- Tela de relatório → fatia 3. Envio por WhatsApp → fatia 5.
- Canal WhatsApp → fatia 4. **Handoff imediato do Lucas (calendário Meta,
  não código):** garantir número do Elcy no app WhatsApp Business,
  verificar Business Manager da Global, criar WABA.
- Campos de sourcing (FOB, capacidade, certificação), lote/validade, custo
  desembarcado → cortados; schema não impede entrada futura.
- Redesign "nativo" do app inteiro → ticket Jira (criado junto desta spec).
- Backlog existente (metas de vendedor, sort, etc.) → intocado.

## Handoffs desta fatia

1. Aplicar as migrations novas no Supabase do app (risco mapeado: RPC não
   aplicada = falha em runtime, ver `project_warehouse_sales_migrations_risk`).
2. E2e manual roteirizado com dados da Global (Noronha + 2 mercados).

---

## Emenda 2 — 2026-08-27, após a seção 1 do e2e manual

Três decisões do Lucas ao rodar o roteiro com dados reais.

### 1. Quando a interação aconteceu

O modal só tinha data para o **próximo passo**; `occurred_at` era sempre
`now()`. Quem registra à noite as visitas do dia carimbava tudo com a hora da
digitação, e a timeline mentia sobre quando ele esteve lá.

Passa a existir um seletor discreto de data no topo do registro rápido, com
**hoje** como padrão e o dia inteiro de folga (não pede hora). O campo do
próximo passo continua separado e inalterado.

### 2. Override manual: rastro e escopo

Dois defeitos que apareceram juntos no mesmo teste (marcar "Perdido" e depois
registrar visita nova):

**Rastro.** Marcar estágio à mão escreve em `clients`/`suppliers`, e a timeline
lê só `interactions` — então o override não deixava rastro nenhum e o histórico
ficava incompreensível. A ficha passa a exibir o override armazenado como um
evento na timeline, na data em que foi feito. Limitação assumida: só o **último**
override é guardado (não há tabela de histórico), então a timeline mostra um
evento de estágio, não a série completa.

**Escopo.** A derivação olhava todos os fatos de sempre — por isso um contato
marcado "Perdido" e depois visitado sem amostra voltava para "Amostra entregue",
por causa de uma amostra de semanas antes. Passa a valer: **depois de um
override manual, só contam os fatos posteriores a ele.**

A view `field_contacts` passa a escopar `has_transaction`, `last_outcome`,
`has_samples`, `has_interaction` e `last_fact_at` ao que aconteceu **após**
`stage_overridden_at` (sem override, nada muda — são todos os fatos). Com isso
`deriveStage` simplifica: o override vale exatamente enquanto `lastFactAt` for
nulo, e as regras 2-7 passam a operar sobre os fatos do ciclo atual.

### 3. Editar/excluir interação — fora desta fatia

Confirmado que fica no WAR-10. A fatia 1 entrega sem correção in-app; quantidade
de amostra tem que ser conferida antes de salvar, e o conserto é SQL manual até
a fatia 2/3.
