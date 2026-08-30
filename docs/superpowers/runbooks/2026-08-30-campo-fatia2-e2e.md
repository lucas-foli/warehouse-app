# E2E manual — Campo fatia 2 (recebimento de mercadoria)

**Pré-requisito, antes de qualquer caso:** aplicar as duas migrations no
Supabase do app (SQL Editor), em ordem numérica —
`20260830000100_receipts.sql` e depois `20260830000200_register_receipt.sql`.
Sem elas, `register_receipt` não existe e todo caso falha em runtime (não é
bug do app, é ambiente sem a RPC).

**Por que este runbook existe:** o repo não tem infra de teste de banco
(sem `test:db`, sem pgTAP). `register_receipt` só é verificada por e2e
manual — este roteiro é a única cobertura que o SQL da RPC tem antes do
merge. Cada caso mata uma mutação específica (anotado em **mata:**);
execute todos antes de aprovar a fatia.

**Ordem de execução:** rode os casos NA ORDEM listada. Vários dependem do
estado deixado pelos anteriores — em especial a numeração dos recebimentos
(`R-000N`) é cumulativa dentro do tenant, e o caso 1 assume que é o
PRIMEIRO recebimento já registrado nesse tenant.

**Dados de teste:**
- Tenant de teste "limpo" (nunca recebeu um `register_receipt`), com pelo
  menos 2 SKUs conhecidos e ativos.
- Pelo menos 1 fornecedor cadastrado (aba Campo → Fornecedores).
- Um segundo usuário, membro NÃO-admin, no mesmo tenant (caso 5).
- Um produto com pelo menos 1 venda registrada (para o caso 4 — só assim o
  fluxo de exclusão bloqueia e oferece "marcar como inativo").
- Duas lojas cadastradas (`location`), com pelo menos 1 SKU já existente
  numa loja diferente da que vai ficar selecionada no filtro (caso 10). Se
  não tiver, edite um produto existente e mude o `Local` antes de começar.

---

## 1. Lote de 2 SKUs conhecidos

1. Login como admin do tenant de teste.
2. Na aba Produtos, anote o saldo (qtd) de dois SKUs conhecidos — chame-os
   de SKU-A (saldo atual X) e SKU-B (saldo atual Y).
3. Clique "Registrar recebimento".
4. Selecione um fornecedor. Deixe "Chegou em" na data padrão (hoje).
5. Adicione item: SKU-A, quantidade 5, custo unitário 10,00 → "Adicionar
   item".
6. Adicione item: SKU-B, quantidade 3, custo unitário 4,50 → "Adicionar
   item".
7. Confira o rodapé "Custo do lote": 63,50 (5×10,00 + 3×4,50).
8. Clique "Registrar entrada".

**Esperado:**
- O modal fecha sem erro.
- Produtos: SKU-A com saldo X+5; SKU-B com saldo Y+3 — soma exata, não
  substituição.
- No banco (SQL Editor):
  `select receipt_number, total_cost from receipts order by created_at desc limit 1;`
  → `receipt_number = 'R-0001'`, `total_cost = 63.50`.
- `select sku, qty, unit_cost from receipt_items where receipt_id = (select id from receipts order by created_at desc limit 1);`
  → 2 linhas, uma por SKU, `qty` e `unit_cost` exatos aos digitados.

**mata:** `+` virar `-` no update de saldo; só a 1ª linha do lote ser
gravada/atualizada.

---

## 2. Lote com 2ª linha inválida (atomicidade)

O modal impede, na própria UI, adicionar uma linha de SKU novo sem nome —
então este caso força a inconsistência entre duas abas, para que o SERVIDOR
(não o cliente) rejeite a linha e a transação inteira precise se desfazer.

1. Escolha um SKU conhecido, SEM nenhuma venda registrada — chame-o de
   SKU-EXCLUIR — e anote seu saldo atual.
2. Escolha um segundo SKU conhecido, SKU-A, e anote seu saldo atual.
3. Aba 1: Produtos → "Registrar recebimento" → selecione um fornecedor.
4. Adicione item: SKU-A, quantidade 5 → "Adicionar item".
5. Adicione item: SKU-EXCLUIR, quantidade 2 → "Adicionar item" (SKU já
   conhecido pelo catálogo carregado quando o modal abriu, não pede nome).
6. NÃO clique em "Registrar entrada" ainda — deixe o modal aberto, com as 2
   linhas.
7. Aba 2 (mesmo tenant, mesmo login ou outro admin): Produtos → edite
   SKU-EXCLUIR → "Delete product" → confirme "Delete" no diálogo "Delete
   product?". Como não tem venda, a exclusão é definitiva (não cai no
   fluxo de "marcar como inativo").
8. Volte para a Aba 1 (modal ainda aberto com as 2 linhas) e clique
   "Registrar entrada".

**Esperado:**
- Uma mensagem de erro aparece NA TELA do modal (texto vermelho) — algo
  como "Informe o nome do produto novo antes de registrar a entrada." (o
  servidor não encontra mais SKU-EXCLUIR e passa a tratá-lo como produto
  novo sem nome).
- O modal continua aberto — não fecha, não dá a entender que salvou.
- Produtos: saldo de SKU-A permanece o mesmo do passo 2 (NÃO subiu 5) — a
  1ª linha, válida, não foi gravada.
- No banco: `select count(*) from receipts where receipt_number = 'R-0002';`
  → 0. Nenhum cabeçalho de recebimento foi criado por esta tentativa.

**mata:** remover a transação / commitar por linha (se a RPC gravasse
linha por linha, o saldo de SKU-A teria subido mesmo com a 2ª linha
falhando).

---

## 3. SKU novo com nome

1. Escolha um SKU que NÃO existe em nenhum produto do tenant — ex.
   `TESTE-NOVO-001`.
2. "Registrar recebimento" → fornecedor → adicione item: SKU
   `TESTE-NOVO-001`, campo "Nome do produto" = "Produto Teste Fatia 2",
   quantidade 4, custo unitário 12,00 → "Adicionar item" → "Registrar
   entrada".

**Esperado:**
- Com o filtro de loja do topo (dropdown ao lado da logo) em "Todos os
  locais", o produto novo aparece em Produtos com saldo 4.
- Abrindo o cadastro dele (editar): campo "Preço" vazio (não "0,00"); campo
  "Local" mostra "Selecione…" — vazio, não uma loja pré-escolhida.
- Trocando o filtro de loja do topo de "Todos os locais" para qualquer loja
  ESPECÍFICA cadastrada: o produto novo NÃO aparece na lista.
- Voltando o filtro para "Todos os locais": o produto reaparece.

**mata:** `price` = 0 ou = custo do lote; deixar o default de `location`
agir (plantaria o produto numa loja que ninguém escolheu); produto nascer
preso a uma loja específica em vez de "sem local".

---

## 4. SKU desativado

1. Escolha um produto com pelo menos 1 venda registrada — SKU-VENDIDO.
2. Edite SKU-VENDIDO → "Delete product" → confirme "Delete" → como tem
   venda, aparece o bloqueio "Can't delete" / `"SKU-VENDIDO" has sales
   records and can't be deleted. Set it inactive instead?` → confirme "Set
   inactive".
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
- Saldo de SKU-VENDIDO na aba Produtos = saldo do passo 4 + 6.

**mata:** update sem `is_active = true` (o saldo subiria certo, mas o
produto continuaria escondido das vendas).

---

## 5. Usuário membro não-admin

1. Login como o usuário membro NÃO-admin do tenant de teste.
2. Aba Produtos → "Registrar recebimento".
3. Selecione um fornecedor, adicione um item válido (SKU conhecido,
   quantidade qualquer) → "Registrar entrada".

**Esperado:**
- Mensagem "Apenas administradores podem registrar recebimentos." aparece
  em texto vermelho no modal.
- O modal continua aberto.
- Saldo do produto não muda; no banco, nenhuma linha nova em `receipts`
  para esta tentativa.

**mata:** gate trocado por `is_tenant_member` (deixaria qualquer membro
registrar).

---

## 6. Dois recebimentos seguidos

1. No banco: `select receipt_number from receipts where tenant_id = '<tenant de teste>' order by created_at desc limit 1;`
   — anote o número (chame-o de R-000N).
2. Logado como admin, registre um recebimento qualquer (fornecedor + 1
   item válido) → "Registrar entrada".
3. No banco de novo, mesma query → confirme que o número é exatamente
   R-000(N+1).
4. Registre um SEGUNDO recebimento (pode repetir fornecedor/SKU) →
   "Registrar entrada".
5. No banco de novo → confirme que o número é R-000(N+2).

**Esperado:** cada recebimento novo recebe o número seguinte, sem pular e
sem repetir, dentro do mesmo tenant.

**mata:** numeração global em vez de por tenant (a sequência teria que
isolar por `tenant_id`, não competir com recebimentos de outros tenants).

---

## 7. Lote com uma linha sem custo

1. "Registrar recebimento" → fornecedor → adicione item A com custo
   unitário preenchido (ex. 10,00) → "Adicionar item".
2. Adicione item B DEIXANDO o campo "Custo unitário" em branco →
   "Adicionar item".
3. Antes de salvar, confira que o rodapé "Custo do lote" NÃO aparece na
   tela (o bloco inteiro some, não mostra 0,00 nem só a soma do item A).
4. "Registrar entrada".

**Esperado:**
- Modal fecha sem erro.
- No banco: `select total_cost from receipts where id = (select id from receipts order by created_at desc limit 1);`
  → `NULL` — não `0`, não a soma parcial das linhas com custo.

**mata:** `coalesce(custo, 0)` na agregação (trataria ausência de custo
como zero e somaria um total errado, quando o certo é ausência ≠ zero).

---

## 8. Edição de produto — quantidade só-leitura

1. Edite qualquer produto ativo.
2. Confira: o campo "Qtd" aparece como texto cinza com o rótulo
   "só-leitura" ao lado dele — não é uma caixa numérica editável, e não há
   como digitar ali.
3. Feche a edição sem salvar. Clique "Novo produto".
4. Confirme que, no formulário de CRIAÇÃO, o campo "Qtd" continua sendo
   uma caixa numérica normal, editável.

**Esperado:** confirmado nos passos 2 e 4.

**mata:** manter a porta dos fundos aberta (editar saldo pelo cadastro
anularia o ganho de auditoria do recebimento).

---

## 9. Navegação

1. Com a aba "Produtos" ativa (em `/products`), confirme que ela aparece
   destacada (fundo preenchido) na barra de abas.
2. Clique na logo (canto superior esquerdo) → navega para `/` (Dashboard);
   nenhuma aba da barra fica destacada.
3. Clique em "Produtos" na barra de novo → volta para `/products`, aba
   acende.
4. Botão "Voltar" do navegador → volta para `/`. Botão "Avançar" → volta
   para `/products`.

**Esperado:** confirmado nos 4 passos.

**mata:** regressão na navegação da Task 7 (rota `/products` sem aba
destacada, ou logo sem link de volta ao Dashboard).

---

## Casos adicionais (surgidos nas revisões das tasks 1-7)

## 10. Recebimento com filtro de loja ativo

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
confirme que o saldo de SKU-OUTRA-LOJA subiu em 3, e que não foi criado um
segundo produto com o mesmo SKU.

**mata:** regressão do bug da Task 5 — modal recebendo o catálogo filtrado
por loja e tratando um SKU de outra loja como novo, descartando o `name`
digitado (a RPC, ao achar o produto pelo tenant inteiro, só soma o saldo e
ignora o `name` do payload).

---

## 11. Edição de produto não reverte saldo

Havia um bug (corrigido na Task 6) em que salvar uma edição gravava de
volta o saldo que o modal tinha capturado quando ABRIU, revertendo
qualquer recebimento feito nesse meio-tempo.

1. Escolha um produto SKU-EDICAO e anote seu preço atual.
2. Aba 1: clique para editar SKU-EDICAO (o formulário abre mostrando o
   saldo atual — ex. 10 — na área "só-leitura"). NÃO salve ainda, deixe o
   formulário aberto.
3. Aba 2 (mesmo tenant): "Registrar recebimento" de SKU-EDICAO, quantidade
   5, fornecedor válido → "Registrar entrada". Saldo real de SKU-EDICAO
   agora é 15.
4. Volte para a Aba 1 (formulário de edição ainda aberto, ainda mostrando
   10 na área "só-leitura" — não atualiza sozinho). Altere só o "Preço"
   (ex. de X para X+1). Clique "Salvar ajustes".

**Esperado:** depois de salvar, o saldo de SKU-EDICAO na aba Produtos é 15
(o valor pós-recebimento da Aba 2) — NÃO volta para 10. O preço foi
atualizado para X+1.

**mata:** regressão do bug da Task 6 — salvar a edição gravava de volta o
`qty` capturado na abertura do modal, revertendo o recebimento da Aba 2.

---

## 12. Fornecedor obrigatório e estado vazio

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
  selecionado, `canSubmit` nunca fica verdadeiro).

**mata:** deixar salvar sem fornecedor (a RPC tem `receipt_supplier_required`,
mas o gate tem que aparecer já na tela, antes do usuário tentar e levar um
erro).
