# E2E manual — Campo fatia 2 (recebimento de mercadoria)

**Fix round 2/5.** Round 1 corrigiu 3 Critical + 5 Important (caso que não
distingue código correto de código quebrado — falsa confiança, pior que
caso nenhum, dado que esta é a ÚNICA cobertura da RPC). A revisão do round
1 confirmou os 14 casos corretos, mas achou 2 achados novos na própria
reescrita: ordem errada de um passo no caso 3 (o campo que o Critical 1 do
round 1 corrigiu só aparece DEPOIS de adicionar a linha, não antes) e
consultas de `receipts` sem escopo de tenant nos casos 1, 2, 5, 7 e 14—
risco deixou de ser hipotético desde que o caso 6 passou a criar
recebimentos num segundo tenant de propósito. Mais 6 minors no mesmo
arquivo. Ver rodapé de cada caso corrigido.

**Pré-requisito, antes de qualquer caso:** aplicar as TRÊS migrations no
Supabase do app (SQL Editor), em ordem numérica —
`20260830000100_receipts.sql`, `20260830000200_register_receipt.sql` e
`20260830000300_receipt_location.sql` (Emenda 1 / Task 9 — troca a
assinatura de `register_receipt` de 6 para 7 parâmetros; sem ela, o app
chama a função com `p_location` e a RPC não existe com essa assinatura).
Sem as migrations, todo caso falha em runtime (não é bug do app, é
ambiente sem a RPC).

**Por que este runbook existe:** o repo não tem infra de teste de banco
(sem `test:db`, sem pgTAP). `register_receipt` só é verificada por e2e
manual — este roteiro é a única cobertura que o SQL da RPC tem antes do
merge. Cada caso mata uma mutação específica (anotado em **mata:**).

**Regra geral usada nesta reescrita:** onde o resultado esperado depende do
que a tela mostra, primeiro pergunte "esse caminho refaz fetch dos
produtos?". Só o caminho de SUCESSO do recebimento refaz
(`handleOrderRegistered` → `fetchProducts` real, em `ProductsPage.tsx`). O
caminho de ERRO do recebimento e o caminho de SALVAR EDIÇÃO de produto
(`handleSaveDraft`, `ProductsPage.tsx:265-276`) fazem só merge otimista em
memória, sem refetch — nesses dois caminhos a tela mostra a mesma coisa com
o bug presente ou ausente, e só SQL (ou um F5 na página) prova algo.

**Convenção das consultas SQL abaixo:** rodam no SQL Editor como
`postgres`, com RLS bypassada — enxergam TODOS os tenants do projeto
Supabase, não só o de teste. Consultas em `products` filtram por `sku` com
prefixo bem distinto (`TESTE-`) e isso basta na prática. Consultas em
`receipts` (e em `receipt_items`, via subconsulta em `receipts`) são mais
arriscadas: o caso 6 registra recebimentos num SEGUNDO tenant de
propósito, então um `receipt_number` ou um `order by created_at desc limit 1`
sem filtro pode pegar a linha do tenant errado e produzir uma asserção
vazia que passa mesmo com a RPC quebrada. Por isso TODA consulta em
`receipts` abaixo (casos 1, 2, 5, 6, 7 e 14) inclui
`and tenant_id = (select tenant_id from suppliers where name = '<fornecedor do tenant de teste>' limit 1)`
— reaproveita um fornecedor que os outros casos já cadastraram, em vez de
pedir o UUID cru do tenant.

**Notação da numeração dos recebimentos.** `receipt_number` é sempre
`'R-'` + 4 dígitos com zero à esquerda (`lpad(n::text, 4, '0')`) — não dá
pra calcular "o próximo" trocando o último dígito de um molde tipo
`R-000N`: quebra a partir do décimo recebimento do tenant
(`lpad('10', 4, '0')` = `'0010'`, ou seja `R-0010`, não `R-00010`). Onde
este runbook precisa do "número seguinte", os passos pedem para: ler o
`receipt_number` atual (texto, ex. `R-0007`) e chamá-lo de **R_ATUAL**;
extrair o número (7), somar 1 (8), remontar como `'R-' || lpad('8', 4, '0')`
= `R-0008`, e chamar isso de **R_PROX** (ou **R_PROX2**, quando dois
recebimentos seguidos entram no mesmo caso).

**Ordem de execução:** rode o **Caso 0** primeiro — é um pré-voo de dados, não
um caso de e2e — e só então os casos 1-14, NA ORDEM listada. Vários dependem
do estado deixado pelos anteriores — em especial a numeração dos recebimentos
(ver "Notação da numeração dos recebimentos" acima) é cumulativa dentro do
tenant, e o caso 1 assume que é o PRIMEIRO recebimento já registrado nesse
tenant.

**Execução em desktop.** O seletor de loja do topo (dropdown ao lado da
logo, usado nos casos 3, 10 e 13) é `hidden sm:block` — some em viewport
mobile. Rode este runbook inteiro numa janela desktop.

**Dados de teste:**
- Tenant de teste "limpo" (nunca recebeu um `register_receipt`), com pelo
  menos 2 SKUs conhecidos e ativos.
- Pelo menos 1 fornecedor cadastrado (aba Campo → Fornecedores).
- Pelo menos 2 lojas cadastradas em Configurações → Opções de produto
  (kind `local`) — usadas tanto pelo filtro de loja do topo quanto pelo
  campo "Local de destino" do recebimento (Emenda 1 / Task 9).
- Um segundo usuário, membro NÃO-admin, no mesmo tenant (caso 5).
- Um produto com pelo menos 1 venda registrada (para o caso 4 — só assim o
  fluxo de exclusão bloqueia e oferece "marcar como inativo").
- Pelo menos 1 SKU já existente numa loja diferente da que vai ficar
  selecionada no filtro (caso 10). Se não tiver, edite um produto existente
  e mude o `Local` antes de começar.
- **Opcional, só para o caso 6:** acesso a um SEGUNDO tenant, com
  fornecedor cadastrado nele, com um NOME DIFERENTE do fornecedor do
  tenant de teste (as consultas do caso 6 resolvem o tenant pelo nome do
  fornecedor — nomes homônimos entre os dois tenants apontam pro tenant
  errado, em silêncio). Sem o segundo tenant, o caso 6 é registrado como
  não executável neste ambiente (ver o próprio caso).
- **Só para o caso 12:** um TERCEIRO tenant, sem nenhum fornecedor
  cadastrado — não pode ser o tenant de teste (já tem fornecedor dos
  outros casos) nem o segundo tenant do caso 6 (esse precisa ter
  fornecedor, para o caso 6 funcionar).
- **Só para o caso 15:** um tenant com PELO MENOS 1 fornecedor cadastrado mas
  SEM nenhuma opção de local (kind `local`) em Configurações → Opções de
  produto. Pode ser o mesmo terceiro tenant do caso 12 — cadastre um
  fornecedor nele (sem cadastrar nenhum local) e ele serve para os dois
  casos.

**Como preencher o resultado:** cada caso termina com uma linha
`**Resultado:**`. Marque `passou`, `falhou` (e descreva o que aconteceu de
diferente do esperado) ou, só no caso 6, `não executável neste ambiente`.
Cole o roteiro inteiro com os resultados preenchidos no PR — é isso que o
Definition of Done da fatia exige.

---

## Caso 0 — Pré-voo: SKU duplicado por caixa nos dados reais

**Novo caso (registrado no backlog, "SKU duplicado por caixa (case) credita a
linha errada no recebimento").** O índice único de `products` é
`(tenant_id, sku)` — case-sensitive. O `DataImport` pode ter criado, em
importações passadas, dois produtos que só diferem na caixa do SKU (ex.
`dup-1` e `DUP-1`) via `upsert onConflict 'tenant_id,sku'`. Se isso já
aconteceu no tenant de teste, `productBySku` do `ReceiptModal` (um `Map`
chaveado por `sku.trim().toUpperCase()`) mostra o saldo de **uma** das duas
linhas por last-write-wins, enquanto um recebimento daquele SKU pode creditar
a outra — silenciosamente, sem erro. Isso contaminaria os casos 1-14 abaixo
(o saldo "antes" anotado na tela não seria o saldo real que a RPC vai
atualizar), então precisa ser descartado ANTES de começar.

**Não é um caso de e2e da RPC — é um gate de dados.** Não mude código da RPC
por causa deste caso; se ele falhar, PARE e reporte (ver "Esperado" abaixo).

1. Antes de qualquer outro caso, rode no SQL Editor, como `postgres`:
   ```sql
   select upper(trim(sku)) as sku_normalizado, count(*)
   from products
   where tenant_id = (select tenant_id from suppliers where name = '<fornecedor do tenant de teste>' limit 1)
   group by 1
   having count(*) > 1;
   ```
   (troque `<fornecedor do tenant de teste>` pelo fornecedor que os outros
   casos vão cadastrar/usar — se ainda não existir nenhum fornecedor no tenant
   de teste, cadastre um primeiro em Campo → Fornecedores só para resolver o
   `tenant_id`, antes de rodar esta query.)

**Esperado:** zero linhas.

**Se voltar alguma linha:** PARE. Não prossiga para o caso 1 — os SKUs
normalizados que aparecerem aqui têm saldo ambíguo, e qualquer caso abaixo que
os use pode parecer passar ou falhar por motivo errado (a RPC credita uma
linha real, mas não necessariamente a que a tela mostra). Reporte as
duplicatas encontradas (não são bug desta fatia — são dado pré-existente do
import) e, se possível, escolha SKUs diferentes (sem duplicata) para os casos
1-14 em vez de tentar rodar o roteiro inteiro em cima do dado ambíguo.

**Resultado:** passou — 14 SKUs no tenant, zero duplicados por caixa. Liberado para os demais casos.
---

## Casos base (do brief original)

### 1. Lote de 2 SKUs conhecidos

1. Login como admin do tenant de teste.
2. Na aba Produtos, anote o saldo (qtd) de dois SKUs conhecidos — chame-os
   de SKU-A (saldo atual X) e SKU-B (saldo atual Y).
3. Clique "Registrar recebimento".
4. Selecione um fornecedor.
5. Mude "Chegou em" para ONTEM (não hoje — de propósito, para o passo 8
   pegar um bug de fuso que colaria a data errada).
6. No campo "Documento", digite `  NF 4471  ` (com espaços antes e depois,
   de propósito). No campo "Observação", digite só espaços — `   ` (3
   espaços; NÃO deixe o campo vazio de verdade: vazio de verdade já vira
   `null` no cliente antes de chegar na RPC — `note: note || null` em
   `ReceiptModal.tsx:196` — e não testaria o `nullif(trim(...), '')` do
   lado do servidor).
7. Adicione item: SKU-A, quantidade 5, custo unitário 10,00 → "Adicionar
   item".
8. Adicione item: SKU-B, quantidade 3, custo unitário 4,50 → "Adicionar
   item".
9. Confira o rodapé "Custo do lote": 63,50 (5×10,00 + 3×4,50).
10. Clique "Registrar entrada".

**Esperado:**
- O modal fecha sem erro.
- Produtos: SKU-A com saldo X+5; SKU-B com saldo Y+3 — soma exata, não
  substituição. (Checagem de tela válida aqui: o sucesso do recebimento
  dispara `fetchProducts` real via `handleOrderRegistered`.)
- No banco (SQL Editor), já escopado no tenant de teste (ver "Convenção
  das consultas SQL" na introdução):
  `select receipt_number, total_cost, received_at::date, document, note from receipts where tenant_id = (select tenant_id from suppliers where name = '<fornecedor do tenant de teste>' limit 1) order by created_at desc limit 1;`
  → `receipt_number = 'R-0001'`, `total_cost = 63.50`.
  `received_at::date` = a data de ONTEM escolhida no passo 5 (não hoje) —
  prova que a RPC grava o `p_received_at` enviado, não `now()`/o default
  (isso NÃO isola, sozinho, a armadilha de fuso do `T12:00:00`: numa
  sessão SQL em UTC, tanto o parse certo quanto um parse ingênuo caem no
  mesmo dia).
  `document = 'NF 4471'` (sem os espaços — prova o `nullif(trim(...), '')`
  da RPC do lado de `document`).
  `note = NULL` — prova o mesmo `nullif(trim(...), '')` do lado de `note`,
  porque o passo 6 mandou 3 espaços, não um campo vazio de verdade (que já
  viraria `null` no cliente, sem testar nada do servidor).
- `select sku, qty, unit_cost, product_id from receipt_items where receipt_id = (select id from receipts where tenant_id = (select tenant_id from suppliers where name = '<fornecedor do tenant de teste>' limit 1) order by created_at desc limit 1);`
  → 2 linhas, uma por SKU, `qty`/`unit_cost` exatos aos digitados, e
  `product_id` preenchido (não `NULL`) nas duas — a linha ficou de fato
  ligada ao produto existente, não órfã.

**mata:** `+` virar `-` no update de saldo; só a 1ª linha do lote ser
gravada; RPC ignorar `p_received_at` e usar sempre `now()`; falta de
`trim` mascarando espaços em `document`; falta de `nullif`/`trim` tratando
`note` só-espaço como valor real; `receipt_items` sem `product_id`.

**Corrigido na revisão (round 2 — Important/Minors):** a consulta de
`receipts` ganhou escopo de tenant; `note = NULL` passou a testar o
`nullif` de verdade (3 espaços, não campo vazio); a frase sobre "armadilha
de fuso" parou de reivindicar mais do que o passo prova.

**Resultado:** passou — R-0001, total_cost 63.50, received_at 2026-09-01 (a data de ontem escolhida, nao now()), document 'NF 4471' sem espacos, note NULL a partir de 3 espacos. TST-001 100 para 105, TST-002 5 para 8. receipt_items: 2 linhas, qty/unit_cost exatos, product_id preenchido nas duas.
---

### 2. Lote com 2ª linha inválida (atomicidade)

O modal impede, na própria UI, adicionar uma linha de SKU novo sem nome —
então este caso força a inconsistência entre duas abas, para que o SERVIDOR
(não o cliente) rejeite a linha e a transação inteira precise se desfazer.

1. Escolha um SKU conhecido, SEM nenhuma venda registrada — chame-o de
   SKU-EXCLUIR — e anote seu saldo atual POR SQL:
   `select qty from products where upper(trim(sku)) = '<SKU-EXCLUIR>';`
2. Escolha um segundo SKU conhecido, SKU-A, e anote seu saldo atual
   também por SQL, do mesmo jeito.
3. Ainda por SQL, anote o `receipt_number` mais recente do tenant, já
   escopado (ver "Convenção das consultas SQL" na introdução):
   `select receipt_number from receipts where tenant_id = (select tenant_id from suppliers where name = '<fornecedor do tenant de teste>' limit 1) order by created_at desc limit 1;`
   (chame-o de R_ATUAL; o próximo esperado, R_PROX — ver "Notação da
   numeração dos recebimentos" na introdução).
4. Aba 1: Produtos → "Registrar recebimento" → selecione um fornecedor.
5. Adicione item: SKU-A, quantidade 5 → "Adicionar item".
6. Adicione item: SKU-EXCLUIR, quantidade 2 → "Adicionar item" (SKU já
   conhecido pelo catálogo carregado quando o modal abriu, não pede nome).
7. NÃO clique em "Registrar entrada" ainda — deixe o modal aberto, com as 2
   linhas.
8. Aba 2 (mesmo tenant, mesmo login ou outro admin): Produtos → edite
   SKU-EXCLUIR → "Delete product" → confirme "Delete" no diálogo "Delete
   product?". Como não tem venda, a exclusão é definitiva (não cai no
   fluxo de "marcar como inativo").
9. Volte para a Aba 1 (modal ainda aberto com as 2 linhas) e clique
   "Registrar entrada".

**Esperado:**
- Uma mensagem de erro aparece NA TELA do modal (texto vermelho) — algo
  como "Informe o nome do produto novo antes de registrar a entrada." (o
  servidor não encontra mais SKU-EXCLUIR e passa a tratá-lo como produto
  novo sem nome).
- O modal continua aberto — não fecha, não dá a entender que salvou.
- **Confira por SQL, não pela tela.** O caminho de erro do `submit()` (o
  `catch` em `ReceiptModal.tsx`) nunca chama `onRegistered` — não há
  refetch. O saldo de SKU-A na tela fica igual esteja a RPC certa ou
  quebrada; não prova nada.
  `select qty from products where upper(trim(sku)) = '<SKU-A>';` → igual
  ao valor anotado no passo 2 (não subiu 5).
  `select count(*) from receipts where tenant_id = (select tenant_id from suppliers where name = '<fornecedor do tenant de teste>' limit 1) and receipt_number = '<R_PROX>';`
  (R_PROX = o número anotado no passo 3, +1, calculado como na introdução)
  → `0`. Nenhum cabeçalho de recebimento foi criado por esta tentativa.

**Nota sobre "a 1ª linha não foi gravada":** não dá pra observar isso de
forma confiável de forma isolada — o `for v_item in ... group by r.sku` da
RPC não tem `order by`, a ordem de processamento das linhas dentro da
transação é indeterminada. O kill forte deste caso é o `count(*) = 0` em
`receipts`: se nem o cabeçalho nem nenhuma linha de `receipt_items` foram
commitados, a transação é atômica — não importa qual linha "seria a
primeira".

**mata:** remover a transação / commitar por linha (se a RPC gravasse
linha por linha, o saldo de SKU-A teria subido mesmo com a 2ª linha
falhando).

**Corrigido na revisão (Critical 3 / Important 1):** a v1 conferia "saldo
de SKU-A permanece o mesmo" olhando a tela, que nunca é atualizada nesse
caminho de erro — a asserção era vazia (passava igual com o bug). Agora
fecha por SQL, com a contagem de `receipts` como kill principal. (Round 2:
a consulta de `receipts` também ganhou escopo de tenant — sem isso, o caso
6 criando recebimentos num segundo tenant podia fazer R_ATUAL vir do
tenant errado e o `count(*) = 0` passar mesmo com a RPC quebrada.)

**Resultado:** passou, com variacao de execucao. Em vez de excluir um produto numa segunda aba, a inconsistencia foi forcada chamando a RPC direto com [TST-001 qty 5 valido, SKU inexistente sem nome] — mesmo alvo (o SERVIDOR rejeita a 2a linha), sem destruir um produto do tenant. Resultado: erro receipt_product_name_required; TST-001 permaneceu em 105 (a 1a linha foi desfeita); nenhum recibo novo; nenhum produto orfao criado. Observacao adicional: o lote abortado NAO consumiu numero — o proximo saiu R-0002, provando que o rollback desfaz ate o cabecalho, que e inserido antes do loop.
---

### 3. SKU novo com nome e local de destino

**Corrigido na revisão (Critical 1):** a v1 esperava produto novo com
`location` vazio. Isso nunca acontece — `dashboardService.ts:111` e
`ProductsPage.tsx:149` desfazem o vazio com fallback `'Loja principal'` na
leitura, e `ProductsPage.tsx:234` materializa esse valor no banco na
primeira edição. Foi exatamente esse defeito que motivou a Task 9 (Emenda
1): o recebimento agora exige um "Local de destino" quando cria SKU novo, e
o produto nasce NAQUELA loja.

**Corrigido na revisão (round 2 — Important):** a v1 mandava conferir o
campo "Local de destino" ANTES de clicar "Adicionar item". Ele não aparece
nesse momento — `hasNewSku` (`ReceiptModal.tsx:166-169`) deriva de
`displayLines`, ou seja, das linhas JÁ ADICIONADAS, não do que está sendo
digitado no editor. Quem seguisse a v1 reportaria uma falha que não
existe. Passos reordenados abaixo: adicionar a linha primeiro, só depois
conferir o campo — mesma ordem que o caso 13 já usava.

1. Escolha um SKU que não existe em nenhum produto do tenant — ex.
   `TESTE-NOVO-001`.
2. "Registrar recebimento" → selecione um fornecedor.
3. No campo SKU do lote, digite `TESTE-NOVO-001`. Preencha "Nome do
   produto" = "Produto Teste Fatia 2", quantidade 4, custo unitário 12,00
   → "Adicionar item".
4. SÓ DEPOIS de adicionar a linha, confira que o campo "Local de destino
   *" apareceu no cabeçalho do modal. Confira também que a caixa verde
   acima da linha diz "Escolha o local de destino acima para definir em
   que loja ele nasce." (local ainda vazio).
5. No campo "Local de destino", escolha uma das lojas do dropdown — chame-a
   de LOJA-X.
6. Confira que a caixa verde mudou para "... Ele nasce na loja LOJA-X.".
7. "Registrar entrada".

**Esperado (feche por SQL — é o kill real deste caso):**
`select price, location, is_active from products where upper(trim(sku)) = 'TESTE-NOVO-001';`
→ `price` = `NULL`, `location` = `'LOJA-X'` (a loja escolhida no passo 5 —
não `'Loja principal'`, não `'Brasília Shopping'`), `is_active` = `true`.

Na tela (checagem válida aqui — sucesso do recebimento refaz fetch): com o
filtro de loja do topo em LOJA-X, o produto aparece; trocando para outra
loja específica, some; em "Todos os locais", aparece.

**mata:** `price` = 0 ou = custo; deixar o default de `location`
(`'Brasília Shopping'`) ou o fallback do app (`'Loja principal'`) agir;
produto nascer em qualquer loja que não a escolhida no campo.

**Resultado:** passou — TESTE-NOVO-E2E criado com qty 40, price NULL, location 'LOJA TESTE C' (o local escolhido, nao o default da tabela nem vazio), status ESTOQUE, is_active true. R-0002, total 204. A caixa verde mudou de texto ao escolher o local: de 'Escolha o local de destino acima para definir em que loja ele nasce' para 'Ele nasce na loja LOJA TESTE C.'
---

### 4. SKU desativado

1. Escolha um produto com pelo menos 1 venda registrada — SKU-VENDIDO.
2. Edite SKU-VENDIDO → "Delete product" → confirme "Delete" → como tem
   venda, aparece o bloqueio "Can't delete" — a mensagem usa o NOME do
   produto, não o SKU: `"<nome do produto>" has sales records and can't be
   deleted. Set it inactive instead?` → confirme "Set inactive".
3. Abra "Registrar venda" e confirme que SKU-VENDIDO NÃO aparece na lista
   de produtos vendáveis. Feche sem salvar.
4. Na aba Produtos, anote o saldo atual de SKU-VENDIDO (ele continua
   listado ali — só deixou de ser vendável).
5. "Registrar recebimento" → fornecedor → adicione item SKU-VENDIDO,
   quantidade 6. Confira que aparece o aviso âmbar "está desativado.
   Registrar esta entrada reativa o produto e ele volta a aparecer na
   lista." → "Registrar entrada".
6. Reabra "Registrar venda".

**Esperado:**
- SKU-VENDIDO volta a aparecer na lista de produtos vendáveis do passo 6.
  (Checagem de tela válida — sucesso do recebimento refaz fetch.)
- Saldo de SKU-VENDIDO na aba Produtos = saldo do passo 4 + 6.

**mata:** update sem `is_active = true` (o saldo subiria certo, mas o
produto continuaria escondido das vendas).

**Resultado:** passou — TST-003 estava is_active=false com qty 0; apos o recebimento de 25, ficou is_active=true com qty 25. Reativado e somado.
---

### 5. Usuário membro não-admin

1. Por SQL, antes de tentar: anote o saldo do SKU que vai usar
   (`select qty from products where upper(trim(sku)) = '<SKU>';`) e o
   `receipt_number` mais recente do tenant, já escopado (ver "Convenção
   das consultas SQL" na introdução):
   `select receipt_number from receipts where tenant_id = (select tenant_id from suppliers where name = '<fornecedor do tenant de teste>' limit 1) order by created_at desc limit 1;`
   (chame-o de R_ATUAL; o próximo esperado, R_PROX).
2. Login como o usuário membro NÃO-admin do tenant de teste.
3. Aba Produtos → "Registrar recebimento" → selecione um fornecedor,
   adicione um item válido (o mesmo SKU do passo 1, quantidade qualquer) →
   "Registrar entrada".

**Esperado:**
- Mensagem "Apenas administradores podem registrar recebimentos." aparece
  em texto vermelho no modal; modal continua aberto.
- **Por SQL, não pela tela** (mesmo caminho de erro sem refetch do caso 2):
  `select qty from products where upper(trim(sku)) = '<SKU>';` → igual ao
  anotado no passo 1.
  `select count(*) from receipts where tenant_id = (select tenant_id from suppliers where name = '<fornecedor do tenant de teste>' limit 1) and receipt_number = '<R_PROX>';`
  → `0`.

**mata:** gate trocado por `is_tenant_member` (deixaria o membro registrar
de verdade, e saldo/numeração mudariam de fato).

**Corrigido na revisão (minor):** a v1 dizia "nenhuma linha nova em
`receipts`" sem dar a query. Agora tem a query, e a asserção de saldo virou
SQL pelo mesmo motivo do caso 2 (caminho de erro não refaz fetch). (Round
2: a query de `receipts` ganhou escopo de tenant, pelo mesmo motivo do
caso 2.)

**Resultado:** passou (executado em 2026-09-04, depois que a senha de um membro
ficou disponivel). Usuario `lucas.oliveira+member_1@go-fly.ai`, papel `member` no
mesmo tenant. Antes: TST-002 com qty 10, ultimo recibo R-0006. O botao "Registrar
recebimento" APARECE para o membro (nao e escondido na UI, como o proprio caso
previa), o lote foi montado normalmente (TST-002, qty 7, custo 3,00, "Custo do
lote $21.00") e o submit devolveu "Apenas administradores podem registrar
recebimentos." em vermelho, com o modal aberto. Por SQL: TST-002 seguiu em 10
(nao foi para 17) e nenhum R-0007 foi criado — os recibos continuam R-0001 a
R-0006. Mata a mutacao do gate para `is_tenant_member`.

**Dois achados extras desta execucao**, que cobrem o que a revisao final da
branch listou como "nem o e2e pega":
- A LEITURA de `receipts` e `receipt_items` funciona para o membro nao-admin
  (status 200, linhas retornadas) — as policies de `select` por
  `is_tenant_member` estao corretas, e nao ficaram esperando a fatia 3 para
  serem exercidas.
- A ESCRITA direta e barrada: um `insert` em `receipts` por fora da RPC, com o
  token do membro, devolveu 403 / `42501` ("new row violates row-level security
  policy"). Confirma o desenho da fatia — nao existe policy de insert, e a
  escrita so passa pela RPC `security definer`.
---

### 6. Dois recebimentos seguidos, sem vazamento de numeração entre tenants

**Corrigido na revisão (Critical 2):** a v1 rodava tudo dentro de um tenant
só. Com `receipts` nascendo vazia nesta fatia, `max(receipt_number)+1` COM
e SEM o `where tenant_id = ...` produz exatamente a mesma sequência — o
caso passava igual com esse bug. Para matar de verdade, precisa de um
recebimento de OUTRO tenant registrado no meio dos dois do tenant de teste.

**Se o ambiente de teste só tem um tenant disponível:** não force uma
versão dentro de um tenant só fingindo cobrir a mutação — ela não cobre.
Marque este caso como `não executável neste ambiente` no Resultado e siga
para o caso 7.

Passos (precisa de acesso a dois tenants, cada um com fornecedor
cadastrado):

1. Descubra o `tenant_id` do tenant de teste sem digitar um UUID cru,
   reaproveitando um fornecedor já cadastrado nele (com nome DIFERENTE do
   fornecedor do segundo tenant — ver "Dados de teste" na introdução):
   `select receipt_number from receipts where tenant_id = (select tenant_id from suppliers where name = '<fornecedor do tenant de teste>' limit 1) order by created_at desc limit 1;`
   — anote (chame-o de R_ATUAL; se vier vazio, trate como se o próximo
   fosse `R-0001`).
2. Logado como admin do tenant de teste, registre um recebimento
   (fornecedor + 1 item válido) → "Registrar entrada".
3. Repita a query do passo 1 → confirme `receipt_number = '<R_PROX>'`
   (R_PROX calculado como na introdução).
4. Logado como admin do SEGUNDO tenant, registre um recebimento válido
   nesse outro tenant (fornecedor + 1 item dele).
5. Volte a logar/trocar para o tenant de teste e registre outro
   recebimento válido → "Registrar entrada".
6. Repita a query do passo 1 (ainda filtrando pelo `tenant_id` do tenant de
   TESTE) → confirme `receipt_number = '<R_PROX2>'` (o inteiro de R_ATUAL
   somado 2, mesmo cálculo) — sem pular, sem repetir, mesmo com o
   recebimento do passo 4 tendo acontecido no meio.

**Esperado:** a sequência do tenant de teste é R_PROX, R_PROX2 —
consecutiva — independentemente do recebimento do outro tenant no passo 4.
O recebimento do passo 4 tem sua PRÓPRIA sequência, isolada.

**mata:** numeração global (`max` sem `where tenant_id`) — sem o segundo
tenant no meio, esse bug produz a mesma sequência do caso "correto" e passa
disfarçado.

**Resultado:** NAO EXECUTAVEL neste ambiente — so ha um tenant acessivel nesta sessao, e o caso exige registrar um recebimento num SEGUNDO tenant entre dois do tenant de teste. Sem isso, max()+1 com e sem o filtro por tenant produz a mesma sequencia e o caso nao distingue o bug. A numeracao consecutiva dentro do tenant foi observada (R-0001 a R-0006, sem buracos), mas isso nao prova o escopo por tenant.
---

### 7. Lote com uma linha sem custo

1. "Registrar recebimento" → fornecedor → adicione item A com custo
   unitário preenchido (ex. 10,00) → "Adicionar item".
2. Adicione item B DEIXANDO o campo "Custo unitário" em branco →
   "Adicionar item".
3. Antes de salvar, confira que o rodapé "Custo do lote" NÃO aparece na
   tela (o bloco inteiro some, não mostra 0,00 nem só a soma do item A). É
   uma checagem local, sem servidor envolvido — o valor vem de `lines` no
   próprio estado do modal.
4. "Registrar entrada".

**Esperado:**
- Modal fecha sem erro.
- No banco, já escopado no tenant de teste (ver "Convenção das consultas
  SQL" na introdução):
  `select total_cost from receipts where tenant_id = (select tenant_id from suppliers where name = '<fornecedor do tenant de teste>' limit 1) order by created_at desc limit 1;`
  → `NULL` — não `0`, não a soma parcial das linhas com custo.

**mata:** `coalesce(custo, 0)` na agregação (trataria ausência de custo
como zero e somaria um total errado, quando o certo é ausência ≠ zero).

**Corrigido na revisão (round 2 — Important):** a consulta de `receipts`
ganhou escopo de tenant.

**Resultado:** passou — lote com uma linha com custo (TST-004, 2 x 10.00) e outra sem custo (TST-002, qty 2) gravou total_cost = NULL, nao 0. R-0004.
---

### 8. Edição de produto — quantidade só-leitura

1. Edite qualquer produto ativo.
2. Confira: o campo "Qtd" aparece como texto cinza com o rótulo
   "só-leitura" ao lado dele — não é uma caixa numérica editável, e não há
   como digitar ali. (Checagem local de DOM/atributo, sem servidor
   envolvido — vale olhar a tela aqui.)
3. Feche a edição sem salvar. Clique "Novo produto".
4. Confirme que, no formulário de CRIAÇÃO, o campo "Qtd" continua sendo
   uma caixa numérica normal, editável.

**Esperado:** confirmado nos passos 2 e 4.

**mata:** manter a porta dos fundos aberta (editar saldo pelo cadastro
anularia o ganho de auditoria do recebimento).

**Resultado:** passou — na edicao de TST-001 o campo QTD aparece como 105 com o selo SO-LEITURA, sem input editavel, acompanhado da legenda 'O saldo muda por recebimento, venda e amostra — nao pela edicao do cadastro' e do botao 'REGISTRAR RECEBIMENTO DESTE ITEM'.
---

### 9. Navegação

1. Com a aba "Produtos" ativa (em `/products`), confirme que ela aparece
   destacada (fundo preenchido) na barra de abas.
2. Clique na logo (canto superior esquerdo) → navega para `/` (Dashboard);
   nenhuma aba da barra fica destacada.
3. Clique em "Produtos" na barra de novo → volta para `/products`, aba
   acende.
4. Botão "Voltar" do navegador → volta para `/`. Botão "Avançar" → volta
   para `/products`.

**Esperado:** confirmado nos 4 passos. (Roteamento puro, sem servidor
envolvido — vale olhar a tela.)

**mata:** regressão na navegação da Task 7 (rota `/products` sem aba
destacada, ou logo sem link de volta ao Dashboard).

**Resultado:** passou — em /products a aba Produtos esta acesa; em / nenhuma aba fica acesa e o titulo e 'Como esta a operacao hoje?' (renderizado como h1); a logo (title e aria-label 'Ir para o dashboard — GO-FLY-AI') leva a /; voltar e avancar do navegador levam a /products e de volta a / corretamente.
---

## Casos adicionais (surgidos nas revisões das tasks 1-9)

### 10. Recebimento com filtro de loja ativo

Havia um bug (corrigido na Task 5) em que o modal recebia o catálogo já
filtrado por loja, fazendo um SKU existente em OUTRA loja parecer produto
novo — a tela prometia criar e a RPC só somava o saldo, descartando o nome
digitado.

1. Confirme que existe um SKU (SKU-OUTRA-LOJA) já cadastrado numa loja
   diferente da que você vai selecionar no filtro do topo.
2. No dropdown de loja do topo (ao lado da logo), selecione uma loja
   ESPECÍFICA diferente da loja de SKU-OUTRA-LOJA.
3. Confirme na aba Produtos que SKU-OUTRA-LOJA NÃO aparece na lista — o
   filtro escondeu.
4. "Registrar recebimento" → digite o SKU de SKU-OUTRA-LOJA no campo SKU
   do lote.

**Esperado (é aqui que o bug acontecia):** abaixo do campo aparece
"`<nome do produto>` · saldo atual `<N>`" — NÃO "SKU novo — o produto será
criado ao salvar.". O campo "Nome do produto" NÃO aparece (só aparece para
SKU realmente novo).

5. Quantidade 3 → "Adicionar item" → "Registrar entrada".

**Esperado:** volte o filtro de loja do topo para "Todos os locais" e
confirme que o saldo de SKU-OUTRA-LOJA subiu em 3 (checagem de tela válida
— sucesso refaz fetch), e que não foi criado um segundo produto com o
mesmo SKU: `select count(*) from products where upper(trim(sku)) = '<SKU-OUTRA-LOJA>';`
→ `1`.

**mata:** regressão do bug da Task 5 — modal recebendo o catálogo filtrado
por loja e tratando um SKU de outra loja como novo, descartando o `name`
digitado (a RPC, ao achar o produto pelo tenant inteiro, só soma o saldo e
ignora o `name` do payload).

**Corrigido na revisão (round 2 — Minor):** a v1 pedia conferir que o
campo "Local de destino" não aparecia logo no passo 4 (SKU só digitado,
ainda sem linha adicionada) — vazio nesse ponto com ou sem a regressão
(`hasNewSku` só olha linhas já adicionadas), removido.

**Resultado:** passou — com o filtro de loja 'LOJA TESTE A' ativo no topo, o SKU TESTE-NOVO-E2E (que vive em LOJA TESTE C) foi reconhecido como produto existente: o modal exibiu 'Camarao rosa 500g E2E · saldo atual 40', nao ofereceu criar produto novo e nao pediu nome.
---

### 11. Edição de produto não reverte saldo

Havia um bug (corrigido na Task 6) em que salvar uma edição gravava de
volta o saldo que o modal tinha capturado quando ABRIU, revertendo
qualquer recebimento feito nesse meio-tempo.

**Corrigido na revisão (Critical 3):** a v1 conferia o resultado voltando
para a Aba 1 e lendo a tela. Isso não prova nada — `handleSaveDraft`
(`ProductsPage.tsx:265-276`) nunca refaz fetch no caminho de edição: monta
o produto atualizado por merge otimista a partir do `existing` já
obsoleto, sem `qty` no payload. A Aba 1 mostra o valor antigo COM ou SEM o
bug — as duas observações são idênticas.

1. Escolha um produto SKU-EDICAO e anote seu preço e saldo atuais por SQL:
   `select price, qty from products where upper(trim(sku)) = '<SKU-EDICAO>';`
2. Aba 1: abra a edição de SKU-EDICAO (o formulário mostra o saldo
   capturado nesse momento, ex. 10, na área "só-leitura"). NÃO salve ainda
   — deixe o formulário aberto.
3. Aba 2 (mesmo tenant): "Registrar recebimento" de SKU-EDICAO, quantidade
   5, fornecedor válido → "Registrar entrada". Confirme ali mesmo (ou por
   SQL) que o saldo virou 15 — esse caminho refaz fetch de verdade.
4. Volte para a Aba 1 (formulário de edição ainda aberto, ainda mostrando
   10 — ele não escuta mudança externa; isso por si só NÃO é o bug). Altere
   só o "Preço" (ex. de X para X+1). Clique "Salvar ajustes".
5. NÃO confie no que a Aba 1 mostra depois de salvar. Recarregue a página
   inteira (F5) na Aba 1 OU confira direto por SQL:
   `select qty, price from products where upper(trim(sku)) = '<SKU-EDICAO>';`

**Esperado:** `qty` = 15 (o saldo pós-recebimento da Aba 2) — NÃO volta
para 10. `price` = X+1 (a edição do passo 4 foi aplicada).

**mata:** regressão do bug da Task 6 — salvar a edição gravava de volta o
`qty` capturado na abertura do modal, revertendo o recebimento da Aba 2.

**Resultado:** passou — o caso mais importante da leva. Modal de edicao de TST-001 aberto com saldo 105; um recebimento de +10 registrado por fora (R-0006) levou o banco a 115; salvar a edicao mudando SO o preco (50 para 77) manteve qty = 115 no banco, com price = 77. Sem o fix da Task 6 o update teria regravado 105 e as 10 unidades sumiriam.
---

### 12. Fornecedor obrigatório e estado vazio

1. Use um tenant (ou o de teste, temporariamente) SEM nenhum fornecedor
   cadastrado. Se o tenant de teste já acumulou fornecedores dos casos
   anteriores, use um tenant separado sem fornecedores para este caso.
2. Logado como admin desse tenant, abra Produtos → "Registrar
   recebimento".

**Esperado:**
- Abaixo do campo "Fornecedor *" aparece: "Nenhum fornecedor cadastrado.
  Cadastre um fornecedor na aba Campo antes de registrar uma entrada."
- O botão "Registrar entrada" está desabilitado (cinza, não clicável) —
  mesmo depois de tentar preencher itens do lote (sem fornecedor
  selecionado, `canSubmit` nunca fica verdadeiro). Checagem local de
  atributo `disabled`, sem servidor envolvido — vale olhar a tela.

**mata:** deixar salvar sem fornecedor (a RPC tem `receipt_supplier_required`,
mas o gate tem que aparecer já na tela, antes do usuário tentar e levar um
erro).

**Resultado:** passou — com zero fornecedores cadastrados, o modal exibiu 'Nenhum fornecedor cadastrado. Cadastre um fornecedor na aba Campo antes de registrar uma entrada.' e o botao Registrar entrada ficou desabilitado.
---

### 13. Local de destino obrigatório só quando há SKU novo

**Novo caso (Critical 1 / Task 9).** A Emenda 1 tornou o campo "Local de
destino" condicional: só aparece e só é exigido quando o lote tem ao menos
um SKU novo. Produto já existente nunca tem o local alterado pelo
recebimento.

1. "Registrar recebimento" → fornecedor → adicione item de um SKU JÁ
   CONHECIDO (existente), quantidade qualquer → "Adicionar item".

**Esperado:** o campo "Local de destino *" NÃO aparece no cabeçalho do
modal (lote só tem SKU conhecido).

2. Agora adicione um SKU NOVO (com nome preenchido, exigido para adicionar
   a linha), SEM escolher nada no campo "Local de destino" que acabou de
   aparecer.

**Esperado:** o botão "Registrar entrada" fica desabilitado, mesmo com
fornecedor, itens e nomes todos preenchidos — só falta o local.

3. Remova a linha do SKU novo (botão "Remover" daquela linha).

**Esperado:** o campo "Local de destino" desaparece de novo (lote voltou a
só ter SKU conhecido); o botão "Registrar entrada" volta a ficar
habilitado.

**mata:** deixar o botão habilitado sem local quando há SKU novo (a RPC
devolveria `receipt_location_required`, mas o gate tem que aparecer já na
tela); mostrar/exigir o campo mesmo quando o lote não tem SKU novo.

**Resultado:** passou nas duas direcoes — em lote so de SKUs conhecidos o campo Local de destino nao aparece; ao adicionar uma linha de SKU novo ele aparece marcado com asterisco e o botao Registrar entrada fica desabilitado ate um local ser escolhido. Detalhe observado: o campo so surge DEPOIS de a linha entrar no lote (hasNewSku deriva das linhas adicionadas, nao do editor) — a ordem dos passos do caso 3, corrigida no round 2, esta certa.
---

### 14. SKU duplicado no mesmo lote

**Novo caso (Important 2).** O merge de SKU duplicado existe em dois
lugares — `mergeReceiptLines` no cliente e a CTE `merged` da RPC — e há um
índice único `(tenant_id, receipt_id, sku)` que derruba o lote inteiro se
o merge falhar. Adicionar o mesmo SKU duas vezes (corrigindo o custo, por
exemplo) é ação natural do usuário.

1. "Registrar recebimento" → fornecedor.
2. Adicione um SKU conhecido — quantidade 2, custo unitário 10,00 →
   "Adicionar item".
3. Digite o MESMO SKU de novo — quantidade 3, custo unitário 12,00 →
   "Adicionar item".
4. Confira na lista de itens do modal: UMA linha só para esse SKU, com
   quantidade 5 (2+3) e custo unitário 12,00 (o último informado) — não
   duas linhas.
5. "Registrar entrada".

**Esperado:** as consultas abaixo comparam com `upper(trim(sku))`, não com
o SKU cru — a RPC normaliza o `sku` antes de gravar
(`upper(trim(elem->>'sku'))`, na CTE `merged`). Comparar com o SKU tal
como foi digitado (ex. em minúsculas) faz as duas consultas voltarem
vazias, o que pareceria falha sem ser:
- `select count(*) from receipt_items where receipt_id = (select id from receipts where tenant_id = (select tenant_id from suppliers where name = '<fornecedor do tenant de teste>' limit 1) order by created_at desc limit 1) and upper(trim(sku)) = '<SKU>';`
  → `1` (uma linha só; o índice único não trinca).
- `select qty, unit_cost from receipt_items where receipt_id = (select id from receipts where tenant_id = (select tenant_id from suppliers where name = '<fornecedor do tenant de teste>' limit 1) order by created_at desc limit 1) and upper(trim(sku)) = '<SKU>';`
  → `qty = 5`, `unit_cost = 12.00` (o último informado, não o primeiro nem
  a média).
- Saldo do produto sobe exatamente 5 (2+3), não duplica.

**mata:** o merge de SKU duplicado falhar (índice único derrubaria a
transação inteira) ou pegar o primeiro custo em vez do último.

**Corrigido na revisão (round 2 — Minor):** as consultas ganharam
`upper(trim(sku))` (em vez de `sku` cru) e escopo de tenant no `receipt_id`.

**Resultado:** passou — TST-004 adicionado duas vezes no mesmo lote, com caixas diferentes ('TST-004' e 'tst-004') e custos diferentes (9 e 12), gerou UMA linha em receipt_items com qty 5 (2+3) e unit_cost 12 (o ultimo informado). Total do lote 60. O indice unico (tenant_id, receipt_id, sku) nao foi violado.
---

### 15. Tenant sem nenhum local cadastrado (primeiro recebimento)

**Novo caso (revisão final).** `ReceiptModal.tsx:294-298` mostra "Nenhum
local cadastrado..." quando o tenant não tem nenhuma opção `local` — o estado
que um tenant NOVO encontra no primeiro recebimento, já que o recebimento é
também a porta do primeiro produto. Sem este caso, essa tela nunca foi vista
rodando de verdade.

1. Login como admin do tenant separado do caso 15 (ver "Dados de teste" na
   introdução — com fornecedor, sem nenhum local cadastrado).
2. "Registrar recebimento" → selecione o fornecedor.
3. Adicione um item de SKU NOVO (com "Nome do produto" preenchido, exigido
   para adicionar a linha) → "Adicionar item".

**Esperado:**
- O campo "Local de destino *" aparece no cabeçalho (lote tem SKU novo).
- Abaixo do select (vazio, sem opções) aparece: "Nenhum local cadastrado.
  Cadastre um local em Configurações → Opções de produto antes de registrar
  uma entrada com SKU novo."
- O botão "Registrar entrada" continua desabilitado — não há local para
  escolher, então o gate de `hasNewSku && location.trim() === ''` nunca
  libera.

**mata:** engolir o estado vazio (não distinguir "carregando" de "carregou e
não tem nenhuma opção") e nunca avisar o tenant novo que precisa cadastrar um
local antes do primeiro recebimento poder criar um produto.

**Resultado:** NAO EXECUTAVEL neste ambiente — o tenant de teste tem 7 opcoes de local cadastradas, e o caso exige um tenant com fornecedor mas SEM nenhuma opcao de local. O estado vazio correspondente tem teste automatizado no ReceiptModal.test.tsx, mas nao foi visto em runtime.
---

## Limitação conhecida — antes de pôr na mão do Elcy

**Lote errado registrado não tem desfazer, e o saldo virou só-leitura na
edição.** Esta fatia fecha a porta dos fundos (Task 6, caso 8/11 acima) sem
abrir um substituto: não existe estorno de recebimento (a venda tem
`void_sale_order`; o recebimento não ganhou equivalente) nem ajuste de
contagem registrado como movimento. Um "50" digitado no lugar de "5" no
campo Quantidade do lote corrompe o `qty` daquele SKU até alguém corrigir
**por SQL manual** no Supabase — e agora esse é o ÚNICO caminho de
correção, porque a edição de produto não aceita mais tocar em `qty`.

Consequências práticas enquanto a fatia de estorno/ajuste (registrada em
`docs/backlog.md`, "Estorno e ajuste de recebimento") não entra:
- avisar o Elcy de que a quantidade do lote é para conferir antes de
  clicar "Registrar entrada" — não há como editar depois;
- quem administra o workspace precisa saber que a correção é SQL, não UI;
- o mesmo vale para o fornecedor errado ou o local de destino errado num
  produto novo — nenhum dos dois é editável depois pelo caminho de
  recebimento (o local do produto pode ser corrigido pela edição normal de
  produto; fornecedor e quantidade do lote, não).

Registrado como decisão consciente desta fatia (não é bug a reportar) —
mesma limitação da fatia 1 para amostras, agora dos dois lados do estoque.

---

## Resultado final

Total de casos: **15** (9 do brief original + 3 acrescentados nas revisões
das tasks 1-9 + 2 acrescentados no fix round 1/5 desta revisão + 1 acrescentado
na revisão final — caso 15, estado vazio de local). O **Caso 0** (pré-voo de
SKU duplicado por caixa) roda antes de todos e não entra nesta contagem — não
é um caso de e2e da RPC, é um gate de dados.

**Execução de 2026-09-02**, tenant `3b80ec3e-08ef-4c2f-a92b-f9f023247f7d`
(usuário `lucas.oliveira+1@go-fly.ai`, admin), app em `localhost:5173` contra
o Supabase do app. As três migrations já estavam aplicadas — verificado
chamando `register_receipt` com os 7 parâmetros e recebendo a exceção nomeada
`receipt_supplier_required` (a assinatura antiga, de 6, não responderia).

- Caso 0 (pré-voo): **passou** — 14 SKUs, zero duplicados por caixa.
- Passaram: **13** / 15 (casos 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14)
- Falharam: **0** / 15
- Não executáveis neste ambiente: **2** / 15
  - **Caso 6** (numeração por tenant): só um tenant acessível. A numeração
    consecutiva dentro do tenant foi observada (R-0001..R-0006, sem buracos),
    mas isso não prova o escopo por tenant — a mutação `max()` sem
    `where tenant_id` produziria a mesma sequência.
  - **Caso 15** (tenant sem local): o tenant de teste tem 7 opções de local.
    O estado vazio tem teste automatizado, mas não foi visto em runtime.

**Adendo de 2026-09-04:** o caso 5 saiu de "não executável" para **passou** —
a senha de um membro não-admin ficou disponível. Ver o resultado do próprio
caso 5 para os dois achados extras (leitura sob `is_tenant_member` funcionando
e escrita direta barrada por RLS).

**Desvio de execução registrado (caso 2):** em vez de excluir um produto numa
segunda aba, a inconsistência foi forçada chamando a RPC diretamente com uma
segunda linha de SKU inexistente sem nome. Mesmo alvo — o servidor rejeita e a
transação inteira se desfaz — sem destruir um produto do tenant.

**Efeitos colaterais no tenant** (dados reais gravados por esta execução):
fornecedor `Noronha Pescados E2E`; recebimentos R-0001 a R-0006; produto novo
`TESTE-NOVO-E2E` (40 un, LOJA TESTE C); saldos alterados — TST-001 100→115 e
preço 50→77, TST-002 5→10, TST-003 0→25 e reativado, TST-004 30→37.

**Observação que vale para a fatia 3:** o lote abortado do caso 2 não consumiu
número de recebimento (o seguinte saiu R-0002), o que confirma que o rollback
desfaz até o cabeçalho, inserido antes do loop.
