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

**Produto criado pelo recebimento recebe o local de destino do lote.**
~~A RPC informa `location = ''` explicitamente: não atribuído, visível em
"Todos os locais", atribuível depois.~~ **Revisto em 2026-08-30, durante a
execução — ver Emenda 1.** `status` continua com o default `'ESTOQUE'`, que
descreve corretamente mercadoria recém-chegada.

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
- **A RPC não tem teste automatizado, e isso é uma lacuna conhecida.** O
  warehouse-app não tem infra de teste de banco (não há `test:db`, pgTAP nem
  runner SQL) — a fatia 1 cobriu `register_interaction` do mesmo jeito: unidade
  em TS no que é lógica pura, e e2e manual roteirizado no que é SQL. Esta fatia
  mantém o padrão em vez de inventar infra no meio da obra; criar o runner é
  candidato a fatia própria (registrar no backlog).
- Runbook de e2e manual (obrigatório antes do merge, roteiro versionado junto
  ao PR). Cada caso existe para matar uma mutação específica da RPC:
  - lote de 2 SKUs sobe o saldo dos dois — `mata:` `+` virar `-`, ou só a
    primeira linha ser atualizada
  - lote com SKU inválido na 2ª linha: nada é gravado, saldo da 1ª intacto,
    nenhum `receipts` órfão — `mata:` remover a transação / commit por linha
  - SKU novo: produto criado com preço vazio e local vazio (não
    "Brasília Shopping") — `mata:` `price` = 0 / `price` = unit_cost / deixar o
    default de `location` agir
  - SKU novo sem nome preenchido: erro na tela, nada gravado — `mata:` criar
    produto com nome vazio
  - SKU desativado: produto volta à lista com o saldo somado — `mata:` update
    sem `is_active = true`
  - usuário membro não-admin: erro de permissão — `mata:` gate trocado por
    `is_tenant_member`
  - dois recebimentos seguidos: `R-0001` e `R-0002` — `mata:` numeração global
    em vez de por tenant
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

---

## Emenda 1 — 2026-08-30: local de destino do lote

**Por que a decisão original caiu.** A spec mandava a RPC gravar `location = ''`
para não plantar no cadastro uma loja que ninguém escolheu, e o modal prometia ao
usuário que o produto novo apareceria "só em Todos os locais até você escolher uma
loja". A revisão do runbook derrubou a premissa: o app **desfaz** o vazio em três
pontos na leitura e na escrita —

- `src/services/dashboardService.ts:111` — `location: str(row,'location') || 'Loja principal'`
- `src/components/ProductsPage.tsx:145` — mesmo fallback ao abrir a edição
- `src/components/ProductsPage.tsx:220` — ao **salvar** a edição, grava `'Loja principal'` de verdade

Efeito real: o produto novo aparece como "Loja principal" (não como não-atribuído),
entra no filtro daquela loja, e a primeira edição materializa esse valor no banco.
A decisão original trocava o `'Brasília Shopping'` do default do banco pelo
`'Loja principal'` do app — sem resolver o problema que a motivava. E a caixa verde
do modal passou a prometer um comportamento que o app não cumpre.

**Decisão revista (Lucas, 2026-08-30):** resolver na origem. O lote passa a carregar
um **local de destino**, e o produto criado pelo recebimento nasce com ele. A opção
havia sido rejeitada no brainstorm por "adicionar uma decisão a cada recebimento" —
o que se resolve tornando o campo **obrigatório apenas quando o lote contém ao menos
um SKU novo**. Lote só de SKUs conhecidos não pergunta nada, porque produto existente
mantém o local que já tem: o local do lote se aplica **exclusivamente** aos produtos
criados, nunca move produto entre lojas.

**Consequências:**

- `register_receipt` ganha o parâmetro `p_location`, usado no `insert into products`.
  Se o lote tiver SKU novo e `p_location` vier vazio ⇒ exceção `receipt_location_required`.
  O default `'Brasília Shopping'` da tabela nunca age.
- `receiptService` passa `location` no input.
- O modal ganha o campo no cabeçalho, alimentado pelas opções de local do tenant
  (`listProductOptions`, kind `local` — a mesma fonte do `ProductFormModal`), exibido
  e exigido apenas quando há SKU novo no lote.
- A caixa verde deixa de prometer "Todos os locais" e passa a dizer em que loja o
  produto vai nascer.
- O fallback `|| 'Loja principal'` dos três pontos acima **não** é tocado por esta
  fatia: é comportamento app-wide, afeta todo produto sem local e o filtro de lojas
  derivado deles, e merece spec própria. Fica em `docs/backlog.md`.
