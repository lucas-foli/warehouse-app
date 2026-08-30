# Campo — fatia 2: entrada de mercadoria

**Data:** 2026-08-30
**Status:** aprovada (brainstorm com Lucas)
**Mockup:** `2026-08-30-campo-fatia2-preview.html` (descartável, tokens do preset warm)
**Jira:** WAR-3
**Fatia anterior:** `2026-08-26-campo-fatia1-design.md` (mergeada em main, squash 4ddce4b)

## Contexto

Segunda das 5 fatias da obra Campo (Global — import/export BR→EUA, primeiro
cliente Popeye/Noronha Pescados). Esta é a fatia que conserta o defeito
estrutural registrado desde a fatia 1: **`products.qty` só desce.**

Hoje o saldo é debitado em dois lugares — `register_sale_order` (venda) e
`register_interaction` (amostra, fatia 1) — e sobe apenas por **edição direta
do cadastro** (`ProductFormModal:161`) ou pelo import CSV. Não existe registro
de quem recebeu, quando, de qual fornecedor, quanto custou. A `suppliers` da
fatia 1 tem contato e estágio, mas nada transacional a liga à mercadoria.

Esta fatia cria o recebimento como evento de primeira classe e fecha a porta
dos fundos.

## Decisões (com as alternativas rejeitadas)

**A entrada é um lote do fornecedor, não item avulso nem inventário.** O evento
real na Global é o carregamento que chega com vários SKUs de uma vez, com data
e documento. Um cabeçalho com N linhas — a mesma forma de `sales_orders` /
`sales_items`. Rejeitados: entrada item a item (não é o evento real) e ajuste
de contagem (é outro problema; ver Fora do escopo).

**Custo por linha é capturado; margem não é calculada.** `receipt_items.unit_cost`
guarda o custo unitário em USD. Nenhuma coluna de custo entra em `products` e
nenhuma tela exibe margem nesta fatia. A razão: o custo por linha do recebimento
é o dado bruto do qual **todos** os métodos de custeio derivam — média ponderada,
último custo e FIFO são reconstruíveis depois (as saídas já têm data). Escolher
o método agora não entrega nada e engessa; adiar custa zero e faz a fatia de
margem nascer com histórico real acumulado. Rejeitado: calcular média ponderada
já nesta fatia (escopo maior, e mexe em telas que a fatia não precisa tocar).

**Custo em USD, convertido por quem digita.** O fornecedor é brasileiro e cobra
em BRL; o app formata tudo em USD (`utils/currency.ts`, hard-coded). O campo é
US$ e quem registra traz o valor já convertido. Mantém o dado homogêneo com o
preço de venda — a margem futura compara a mesma moeda — sem tocar em
`formatCurrency`. Risco aceito e registrado: o câmbio é feito de cabeça e não
fica auditável. Rejeitados: BRL + taxa de câmbio no lote (obriga o Elcy a
informar cotação e muda a formatação do app) e moeda por linha sem conversão
(inviabiliza total de lote misto).

**`unit_cost` é nullable, e ausente ≠ zero.** Mesmo padrão já adotado para
`price` (spec de 2026-07-23). Linha sem custo ⇒ `receipts.total_cost` nulo: o
app não soma um total mentiroso.

**SKU desconhecido cria o produto na hora.** O recebimento é também porta de
cadastro: SKU novo nasce com `qty` = recebida, `price` null, `location` e
`status` vazios. Consequência aceita: SKU digitado errado cria produto fantasma
em vez de dar erro — por isso a UI exige o nome na própria linha e marca a
criação de forma explícita (ver UI). Rejeitado: rejeitar o lote como faz a venda
(seria simétrico, mas trava o primeiro carregamento de fornecedor novo).

**Produto criado pelo recebimento nasce sem local.** `products.location` é
`not null default 'Brasília Shopping'` (`multitenant.sql:71`, herança do tenant
brasileiro original). Deixar o default agir plantaria uma loja que ninguém
escolheu no cadastro de um app US-first — então a RPC informa `location = ''`
explicitamente: não atribuído, visível em "Todos os locais", atribuível depois.
`status` é o caso oposto e fica com o default `'ESTOQUE'`, que descreve
corretamente mercadoria recém-chegada. Rejeitado: campo "local de destino" no
cabeçalho do lote (mais completo, mas adiciona decisão a cada recebimento).

**SKU desativado é reativado pelo recebimento.** Receber mercadoria de um item
desativado reativa o produto e soma o saldo, com aviso explícito na tela antes
de salvar. Rejeitados: rejeitar o lote (trava o "voltei a trabalhar com esse
item") e receber sem reativar (criaria estoque invisível — saldo no banco que
não aparece na lista).

**Gate `is_tenant_admin`, como a venda.** O recebimento altera saldo e escreve
custo, o que o aproxima de `register_sale_order` (admin) e o afasta de
`register_interaction` (member, "registro de campo não é operação
administrativa"). Na Global quem opera é o Elcy e os sócios, então o gate não
trava ninguém na prática.

**Saldo vira só-leitura na edição de produto.** Com o recebimento como porta
oficial, o campo de quantidade editável passa a ser um caminho paralelo que fura
o histórico. Na **criação** de produto o campo continua editável (é o saldo de
abertura); na **edição** de produto existente vira só-leitura, com a frase que
ensina o modelo e um atalho para o recebimento. Rejeitados: manter editável
(mantém o defeito, agora silencioso) e transformar a edição em movimento de
ajuste registrado (exigiria um segundo tipo de movimento nesta fatia).

**A navegação entra nesta fatia.** `/products` é hoje a única tela sem aba, e é
justamente de onde o recebimento é disparado. `Produtos` entra na barra no lugar
de `Dashboard`, que passa a ser alcançado pela logo — a decisão que o PR #70
registrou em 2026-08-05 e deixou pendurada sem spec. Fecha o #70.

## Schema (migrations novas)

### `receipts` (nova)

```
id                uuid pk default gen_random_uuid()
tenant_id         uuid not null references tenants (id) on delete cascade
receipt_number    text not null                    -- R-0001, por tenant
supplier_id       uuid not null references suppliers (id)
received_at       timestamptz not null default now()
document          text                             -- nota / invoice / container
note              text
total_cost        numeric                          -- null se alguma linha sem custo
created_by        uuid                             -- auth.uid()
created_at        timestamptz not null default now()
updated_at        timestamptz not null default now()

unique (tenant_id, receipt_number)
index (tenant_id)
index (tenant_id, supplier_id)
```

### `receipt_items` (nova)

```
id                uuid pk default gen_random_uuid()
tenant_id         uuid not null references tenants (id) on delete cascade
receipt_id        uuid not null references receipts (id) on delete cascade
receipt_number    text not null
product_id        uuid references products (id)
sku               text not null
qty               int not null check (qty > 0)
unit_cost         numeric                          -- USD, nullable
total_cost        numeric                          -- null quando unit_cost null
created_at        timestamptz not null default now()

unique (tenant_id, receipt_id, sku)
index (tenant_id, receipt_id)
index (tenant_id, sku)
```

### RLS

Leitura por `is_tenant_member` nas duas tabelas (padrão da casa). Escrita
apenas pela RPC `security definer` — nenhuma policy de insert/update direto.

## RPC `register_receipt`

```
register_receipt(
  p_tenant_id   uuid,
  p_supplier_id uuid,
  p_items       jsonb,        -- [{ sku, qty, unit_cost?, name? }, ...]
  p_received_at timestamptz default now(),
  p_document    text default null,
  p_note        text default null
) returns public.receipts
```

Sequência, tudo numa transação (erro em qualquer linha aborta o lote inteiro —
sem lote órfão, espelhando `register_sale_order`):

1. `auth.uid()` nulo ⇒ `not_authenticated`; `is_tenant_admin` falso ⇒ `not_authorized`
2. `p_supplier_id` nulo ou inexistente no tenant ⇒ `receipt_supplier_required`
3. `p_items` não-array ou vazio ⇒ `receipt_items_required`
4. Validação por elemento **antes** da agregação, sem cast (NULL-seguro), como
   a fatia 1 faz com amostras: `qty` ausente / não-numérico / decimal / zero /
   negativo / overflow ⇒ `receipt_qty_invalid`. `unit_cost` presente e negativo
   ⇒ `receipt_cost_invalid`
5. `pg_advisory_xact_lock(hashtext(tenant))`; `receipt_number` = `R-` + lpad,
   4 dígitos, do próximo número **daquele tenant** — `max` sobre os
   `receipt_number like 'R-%'` do tenant, mesma mecânica do `V-`
6. `insert into receipts`
7. Merge de SKUs duplicados no payload: soma `qty`; último `unit_cost` não-nulo
   por ordem de entrada vence; primeiro `name` não-vazio vence. Idêntico ao
   merge da venda — dois lotes do mesmo SKU na mesma tela não trincam o índice único
8. Por linha:
   - busca produto por `upper(trim(sku))` no tenant
   - **não existe:** `name` vazio ⇒ `receipt_product_name_required`; senão
     `insert into products` (`qty` = recebida, `price` null, `is_active` true,
     **`location` = `''` explicitamente** — nunca deixar o default da tabela
     agir; `status` omitido, herdando o default `'ESTOQUE'`)
   - **existe e `is_active` false:** `update products set is_active = true, qty = qty + n`
   - **existe e ativo:** `update products set qty = qty + n`
   - `insert into receipt_items` com `product_id` resolvido
9. `receipts.total_cost` = soma dos `total_cost` das linhas, ou `null` se
   qualquer linha tiver `unit_cost` nulo

`revoke all from public` + `grant execute to authenticated` (padrão da casa).

## UI

**Navegação (`Dashboard.tsx:351-355` + header).** A barra passa a ser
`Produtos · Campo · Clientes · Vendedores · Vendas`. A entrada `overview` sai da
barra; a logo/marca no header vira o link para `/`. Cinco abas continuam cinco.

**Tela de produtos.** Ganha o botão primário "Registrar recebimento", na posição
do FAB já usada na fatia 1.

**Modal de recebimento** (espelho estrutural do `SaleOrderModal`, sobre a base de
modal do PR #72). Cabeçalho: fornecedor (obrigatório, select de `suppliers`),
chegou em (data, default hoje), documento (opcional), observação (opcional).
Linhas: SKU, nome/descrição, **saldo atual** e delta (`saldo 148` `+100` — o
antes e a variação, não só o resultado, para conferir contra o físico antes de
salvar), qty, custo unitário. Rodapé: custo do lote (oculto quando alguma linha
está sem custo) e "Registrar entrada".

**Estado SKU desconhecido.** Caixa verde acima da linha ("POP-922 não existe no
cadastro. Vai ser criado agora, com saldo N e sem preço de venda. Confira o
código antes de salvar"), pílula `novo produto` na linha e campo **Nome do
produto** obrigatório dentro da própria linha. É a fricção que torna o dedo
errado visível, já que a criação não dá erro.

**Estado SKU desativado.** Caixa âmbar ("POP-208 está desativado. Registrar esta
entrada reativa o produto e ele volta a aparecer na lista") e pílula
`será reativado` na linha.

**Modal de produto (`ProductFormModal`).** Na criação, `qty` segue editável. Na
edição, o campo vira só-leitura (fundo `secondary`, marca "só-leitura"), com a
legenda "O saldo muda por recebimento, venda e amostra — não pela edição do
cadastro" e o botão "Registrar recebimento deste item".

## Erros e testes

- RPC com exceções nomeadas (padrão da casa); UI traduz para mensagem.
- **Gate de mutação adversarial antes da task 1** (regra da casa): cada teste
  abaixo anota `mata:` qual mutação detectaria. Regra de paridade: todo caminho
  de erro tem teste negativo **e** o caminho feliz correspondente tem teste
  positivo — suíte só-negativa passa sob "nega tudo".
- Testes de unidade (TS, `receiptService`):
  - merge de SKUs duplicados soma qty — `mata:` trocar `sum` por `max`/primeiro
  - merge preserva o último `unit_cost` não-nulo — `mata:` pegar o primeiro
  - linha sem custo zera o total do lote (null, não 0) — `mata:` `coalesce(cost,0)`
  - total do lote soma qty×custo por linha — `mata:` somar só o custo unitário
  - SKU vazio/qty ≤ 0/decimal é rejeitado antes do envio — `mata:` remover a validação
- Testes de RPC (`test:db`, com **gate de where superuser** — regra que a Fase 3
  do sanAI ensinou: sob superuser a RLS não é rede):
  - lote válido sobe `qty` de todos os SKUs — `mata:` trocar `+` por `-`, ou
    atualizar só a primeira linha
  - SKU inválido na linha N aborta as N-1 anteriores — `mata:` remover a
    transação / commit por linha
  - SKU novo cria produto com `price` null — `mata:` `price` = 0 ou = unit_cost
  - SKU novo cria produto com `location` vazio — `mata:` omitir a coluna no
    insert e deixar o default `'Brasília Shopping'` entrar
  - SKU novo sem nome ⇒ `receipt_product_name_required` — `mata:` criar com nome vazio
  - SKU desativado é reativado e somado — `mata:` update sem `is_active = true`
  - membro não-admin ⇒ `not_authorized` — `mata:` trocar o gate por `is_tenant_member`
  - dois recebimentos no mesmo tenant geram `R-0001` e `R-0002` — `mata:` remover
    o advisory lock / numeração global em vez de por tenant
- Gate de typecheck: `npx tsc -b` (nunca `tsc --noEmit` — o tsconfig raiz tem
  `files: []`).
- E2e manual roteirizado antes do merge (runbook no PR), com dados da Global.

## Fora do escopo (decisões, não esquecimentos)

- **Margem e método de custeio** → fatia própria. O dado (custo por linha) passa
  a ser acumulado desde já; média ponderada × último custo × FIFO segue em aberto.
- **Tela de listagem de recebimentos** → fatia 3 (relatório). O histórico existe
  no banco desde esta fatia, só não tem tela própria.
- **Editar ou estornar um recebimento** → não existe nesta fatia. Lote errado
  fica registrado; a correção é assunto da fatia de ajuste/inventário. (A venda
  tem `void_sale_order`; o recebimento não ganha equivalente agora.)
- **Ajuste de contagem / inventário** → não entra. A porta dos fundos é fechada
  sem substituto: divergência entre físico e app fica visível no relatório
  (fatia 3) e se resolve com um recebimento ou, no limite, recriando o produto.
- **Import CSV** → intocado; continua criando produtos com `qty` inicial.
- **Moeda multi-currency / câmbio auditável** → fora; custo é USD digitado.
- **Lote/validade, custo desembarcado (frete, imposto), FOB** → cortados na
  fatia 1 e seguem cortados; o schema não impede entrada futura.
- Redesign "nativo" do app inteiro (WAR-8) → segue no backlog, intocado.

## Handoffs desta fatia

1. Aplicar as migrations novas no Supabase do app antes do uso real (risco
   mapeado: RPC não aplicada = falha em runtime, ver
   `project_warehouse_sales_migrations_risk`).
2. E2e manual roteirizado com dados da Global (Noronha + os 10 SKUs Popeye).
3. Fechar o PR #70 (backlog de navegação) quando esta fatia mergear — a decisão
   que ele registrava passa a estar implementada.
