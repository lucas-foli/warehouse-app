# E2E manual — Campo fatia 3 (painel)

**Por que este runbook existe.** O painel é o primeiro consumidor de TELA das
policies de `select` de `receipts`/`receipt_items` — elas existem desde a
fatia 2, mas até aqui só foram exercitadas pela RPC `register_receipt` (que
escreve, não lê) e pelo caso 5/6 do runbook da fatia 2 (leitura crua, sem
passar pelos módulos de derivação). Se a policy de leitura estiver errada, o
sintoma é **tabela vazia sem nenhum erro na tela** — o painel parece
funcionar, mostra um estado "sem dado" plausível, e ninguém percebe que na
verdade a consulta falhou em silêncio. É o pior tipo de falha possível para
um painel, porque ele existe para ser confiável. Por isso o **Caso 0** abaixo
é gate de merge: se falhar, para tudo e reporta — não é um caso de UI comum.

**Este é um runbook curto**, por decisão da própria spec (`docs/superpowers/specs/2026-09-08-campo-fatia3-design.md`,
seção "Verificação"). Os módulos puros (`fieldActivity`, `funnelSummary`,
`sampleCost`, `receivedVsSold`, `negativeBalances`) já têm suíte vitest com
anotação `mata:` — a garantia de que cada regra deriva certo é da suíte, não
deste roteiro. Este roteiro garante só o que a suíte não alcança: que a tela
real, contra o Supabase real, lê o que deveria ler.

**Convenção de cada caso:** pré-condição, passos, resultado esperado e o que
fazer se falhar. Onde o resultado depende de dado gravado antes desta fatia,
o caso diz de onde tirar (reaproveita, quando possível, o tenant de teste que
o runbook da fatia 2 já populou).

**Execução em desktop.** O seletor de loja do header (dropdown ao lado da
logo, usado no Caso 4) é `hidden sm:block` — some em viewport mobile, mesma
ressalva do runbook da fatia 2. Rode este roteiro numa janela desktop.

**Como preencher o resultado:** cada caso termina em `**Resultado:**`.
Marque `passou`, `falhou` (descrevendo o que apareceu de diferente do
esperado) ou `não executável neste ambiente`, quando for o caso. Cole o
roteiro inteiro com os resultados preenchidos no PR.

## Dados de teste

- **Tenant A — com histórico.** Precisa ter pelo menos:
  - 1 recebimento gravado de verdade (`register_receipt` já exercitado) —
    reaproveite o tenant de teste da fatia 2
    (`docs/superpowers/runbooks/2026-08-30-campo-fatia2-e2e.md`), que já tem
    recebimentos `R-0001` a `R-0006` e produtos `TST-001`–`TST-004` e
    `TESTE-NOVO-E2E`.
  - Pelo menos 2 interações registradas em momentos diferentes, de forma que
    trocar entre "7 dias" e "90 dias"/"Tudo" mude o total — se todo o
    histórico do tenant coube nos últimos 7 dias, o Caso 1 não distingue
    nada. Se precisar, registre uma interação nova hoje (via "+ Registrar
    visita") antes de começar, para garantir pelo menos uma dentro e uma
    fora da janela mais estreita.
  - Pelo menos 1 fornecedor cadastrado (aba Campo → Fornecedores) além do
    fornecedor já usado nos recebimentos da fatia 2 — precisa de DOIS
    fornecedores distintos para o Caso 5.
  - Pelo menos 2 lojas cadastradas em Configurações → Opções de produto
    (`kind` `local`), e pelo menos uma venda registrada em cada uma — para o
    Caso 4 fazer sentido, o "vendido" precisa ter algo para mudar quando o
    filtro de loja troca.
  - Um SKU cujo saldo (`products.qty`) você consiga levar a negativo
    registrando uma amostra maior que o estoque (Caso 2) — ou aceite que o
    Caso 2 mexe de propósito no saldo real de um SKU de teste.
  - Um SKU que **nunca** apareceu em `receipt_items` com `unit_cost`
    preenchido — nem no recebimento inicial, nem em nenhum posterior. Se
    todos os SKUs do tenant já têm custo conhecido, registre um SKU novo
    (via "Registrar recebimento", igual ao Caso 3 do runbook da fatia 2, mas
    deixando o campo "Custo unitário" em branco) só para o Caso 3 deste
    roteiro.
- **Tenant B — vazio.** Um tenant novo, sem nenhuma interação e sem nenhum
  recebimento gravado — para o Caso 6. Pode ser um tenant recém-criado que
  ainda não passou pelo onboarding de dados nenhum, ou um tenant de teste
  reservado só para este caso.

---

## Caso 0 — Pré-voo: a leitura funciona (GATE DE MERGE)

**Não é um caso de UI comum.** Se este caso falhar, **pare** — não continue
para o Caso 1. O objetivo único é confirmar que as policies de `select` de
`receipts`/`receipt_items` (fatia 2, nunca exercitadas por uma tela até
agora) devolvem linha de verdade para o painel.

**Pré-condição:** logado como membro do Tenant A (admin ou não-admin — a
leitura é `is_tenant_member`, não exige admin), tenant com pelo menos 1
recebimento gravado (ver "Dados de teste").

**Passos:**
1. Abra a aba Campo.
2. Toque no item "Painel" do segmented control (Agenda / Funil /
   Fornecedores / Painel).
3. Aguarde o "Carregando…" desaparecer.
4. Role até a seção "Recebido x vendido por produto".

**Esperado:** a tabela tem pelo menos 1 linha, com "Receb." maior que zero
para pelo menos um produto — refletindo o recebimento real que o tenant tem
gravado. Role também até "Recebido por fornecedor": pelo menos 1 linha, com
quantidade maior que zero.

**Se falhar (tabela vazia, sem nenhuma mensagem de erro na tela):** **PARE.**
Não é um bug de UI para reportar como os demais casos — é sinal de que a
policy de `select` de `receipts` ou `receipt_items` está bloqueando a
leitura no Supabase do app. Abra o painel de rede do navegador e confira a
resposta da consulta a `receipts`/`receipt_items` (status 200 com `[]` é a
policy retornando vazio; 4xx é outra falha, mais fácil de notar). Reporte
antes de seguir para qualquer outro caso deste roteiro — os demais casos
pressupõem que a leitura funciona, e rodá-los sobre uma leitura quebrada só
produziria resultados sem sentido.

**Resultado:**

---

## Caso 1 — A janela de tempo muda o que deve mudar, e só isso

**Pré-condição:** Caso 0 passou. Tenant A, com interações em momentos
diferentes (ver "Dados de teste").

**Passos:**
1. No Painel, anote os 4 KPIs do topo (Interações, Contatos novos, Amostras
   entregues, Follow-ups vencidos), a quebra "Por canal", a linha "Recebido"
   e "Vendido" de pelo menos um produto da tabela, e o rótulo de cobertura
   de custo das amostras (se aparecer) — tudo com a pill "30 dias" ativa
   (default).
2. Anote também: o funil por estágio (contagem de cada estágio), o "Saldo
   hoje" de um produto na tabela, e se o card "Saldo negativo" aparece ou
   não.
3. Troque para "7 dias".
4. Troque para "90 dias".
5. Troque para "Tudo".

**Esperado:**
- Em cada troca, os KPIs de Interações, Contatos novos e Amostras entregues
  (e o valor estimado em US$) mudam de acordo com a janela — mais estreita
  em "7 dias", mais ampla ou igual em "Tudo" (nunca menor que "30 dias" ao
  alargar).
- A coluna "Receb." e "Vend." da tabela "Recebido x vendido" mudam do mesmo
  jeito.
- O rótulo de cobertura de custo ("N de M SKUs sem custo conhecido") pode
  mudar — o conjunto de SKUs amostrados no período muda com a janela.
- **O funil por estágio, o "Saldo hoje" de cada produto e o card "Saldo
  negativo" NÃO mudam em nenhuma das 4 pills** — são "foto de agora"
  (Emenda 1 da spec), não recortadas pela janela.
- O rótulo "Funil por estágio · hoje" está sempre presente, em qualquer
  pill escolhida.

**Se falhar:** se o funil, o saldo ou a divergência mudarem ao trocar a
pill, é regressão da Emenda 1 — esses três blocos não têm como reconstruir
um histórico (o app não guarda snapshot de saldo por data), então qualquer
variação com a janela é dado inventado, não recalculado de verdade. Se os
KPIs/tabela NÃO mudarem entre janelas bem diferentes ("7 dias" vs. "Tudo"),
confira primeiro se o tenant de teste realmente tem dado fora da janela mais
estreita (ver "Dados de teste") antes de reportar como bug.

**Resultado:**

---

## Caso 2 — Amostra sem estoque vira card de divergência

**Pré-condição:** Caso 0 passou. Tenant A, um SKU-ALVO cujo saldo atual você
conhece (anote por SQL ou pela aba Produtos).

**Passos:**
1. Na aba Campo, toque "+ Registrar visita".
2. Preencha um contato (novo ou existente).
3. Em "Amostras deixadas (baixa o estoque)", busque SKU-ALVO e adicione uma
   quantidade **maior que o saldo atual** dele.
4. Confirme que aparece o aviso âmbar "Estoque insuficiente no app:
   SKU-ALVO — o registro segue mesmo assim." e clique em salvar mesmo
   assim.
5. Confirme que a caixa de aviso final mostra "Estoque ficou negativo:
   SKU-ALVO." e feche o modal.
6. Volte para (ou abra) a sub-view Painel.

**Esperado:** um card vermelho "Saldo negativo" aparece no fim da tela, com
o texto "Amostra registrada sem estoque deixa o saldo abaixo de zero.
Confira a contagem física." e uma linha "SKU-ALVO · <saldo negativo>"
abaixo. Sem essa condição (nenhum produto do tenant com saldo negativo), o
card inteiro não aparece — não existe um card vazio dizendo "tudo certo".

**Se falhar:** se o card não aparecer mesmo com o saldo confirmadamente
negativo (confira `products.qty` por SQL, já que o aviso da RPC de
`register_interaction` é efêmero e some da tela), é regressão de
`negativeBalances`/`PanelView`. Se o card aparecer mesmo com todo saldo ≥ 0,
mesma coisa, na direção contrária.

**Resultado:**

---

## Caso 3 — Amostra de SKU sem custo conhecido muda a cobertura, não o valor

**Pré-condição:** Caso 0 passou. Tenant A, um SKU-SEM-CUSTO que nunca
apareceu em `receipt_items` com `unit_cost` preenchido (ver "Dados de
teste").

**Passos:**
1. Anote, no Painel (janela "30 dias" ou a que cobre o teste), o valor
   estimado das amostras (`~US$ X`) e o rótulo de cobertura atual (se
   houver, "N de M SKUs sem custo conhecido").
2. "+ Registrar visita" → contato qualquer → adicione uma amostra de
   SKU-SEM-CUSTO, quantidade qualquer → salve.
3. Volte ao Painel.

**Esperado:** o valor estimado das amostras (`~US$ X`) **não muda** com essa
amostra — SKU-SEM-CUSTO entra na quantidade total, mas contribui `0` ao
custo (ausente não é zero, então não é somado como zero disfarçado nem
ignorado da contagem). O rótulo de cobertura sobe: `N` (SKUs sem custo)
aumenta em 1, e `M` (total de SKUs amostrados) também aumenta em 1 se
SKU-SEM-CUSTO for novo na janela.

**Se falhar:** se o valor estimado subir com essa amostra, é
`lastKnownCostBySku` tratando "sem custo" como custo zero em vez de ausente
— contraria a decisão da spec ("Amostras: valorizadas pelo último custo
conhecido do SKU"). Se o rótulo de cobertura não aparecer/não subir,
confira se o rótulo só aparece quando `skusWithoutCost > 0` (comportamento
esperado quando NENHUM SKU está sem custo) antes de reportar.

**Resultado:**

---

## Caso 4 — O filtro de loja só muda o vendido

**Pré-condição:** Caso 0 passou. Tenant A, com pelo menos 2 lojas cadastradas
e ao menos 1 venda registrada em cada uma.

**Passos:**
1. Com o seletor de loja do header em "Todos os locais", anote no Painel: o
   rótulo "Loja: Todos os locais · o filtro de loja afeta apenas as
   vendas", o "Vend." de um produto na tabela "Recebido x vendido" e o
   "Receb." do mesmo produto.
2. No seletor de loja do header (dropdown ao lado da logo), escolha uma loja
   específica que tenha venda registrada.
3. Volte ao Painel (ou aguarde recarregar, se já estiver aberto).

**Esperado:**
- O rótulo muda para "Loja: <nome da loja> · o filtro de loja afeta apenas
  as vendas".
- A coluna "Vend." da tabela muda (cai, refletindo só as vendas daquela
  loja) — ou, se o produto não teve venda naquela loja no período, mostra
  `0`.
- A coluna "Receb." do MESMO produto **não muda** — recebido é global,
  porque `receipts` não tem coluna de loja (decisão da spec, seção "Filtro
  de loja: só onde existe loja de verdade").
- Os KPIs do topo (Interações, Contatos novos, Amostras, Follow-ups),
  "Por canal", o funil, "Recebido por fornecedor" e "Saldo negativo"
  também não mudam com o filtro de loja.

**Se falhar:** se "Receb." mudar com o filtro de loja, é regressão da
decisão de modelo da spec — recebido não tem como ser filtrado por loja sem
inventar dado (o `p_location` do recebimento define a loja do produto novo
que o lote cria, não a loja do recebimento em si). Se o rótulo não
atualizar com a loja escolhida, é regressão do aviso que evita o sócio ler
um número global como número da loja.

**Resultado:**

---

## Caso 5 — SKU recebido de dois fornecedores: procedência mostra o mais recente com "+1"

**Pré-condição:** Caso 0 passou. Tenant A, dois fornecedores distintos
cadastrados.

**Passos:**
1. Escolha um SKU-DUPLO já recebido de um fornecedor (Fornecedor 1, o que já
   está nos recebimentos do tenant de teste).
2. "Registrar recebimento" → selecione um Fornecedor 2 diferente → adicione
   item SKU-DUPLO, quantidade qualquer → "Registrar entrada".
3. Volte ao Painel, na tabela "Recebido x vendido por produto", localize a
   linha de SKU-DUPLO.

**Esperado:** a coluna "Procedência" mostra o nome do Fornecedor 2 (o
recebimento mais recente por `received_at`), com uma marcação "+1" ao lado
— sinalizando que existe mais de um fornecedor no histórico daquele SKU.
Role até "Recebido por fornecedor": os dois fornecedores aparecem como
linhas separadas, cada um com sua própria quantidade — nunca uma venda
somada a nenhum dos dois (a tabela de fornecedores só soma o RECEBIDO,
nunca o vendido).

**Se falhar:** se a procedência mostrar o Fornecedor 1 (o mais antigo) em
vez do 2, é ordenação errada por `received_at`. Se a marcação "+1" não
aparecer, é `multipleSuppliers` quebrado. Se "Recebido por fornecedor"
tiver uma linha que soma vendas, é a regra mais importante da spec sendo
violada — vendas nunca são somadas por fornecedor, porque `sales_items` só
conhece SKU, não procedência (ver a entrada de backlog "Vendas somadas por
fornecedor").

**Resultado:**

---

## Caso 6 — Tenant vazio: cada bloco fala por si, nenhum zero solto

**Pré-condição:** Caso 0 passou (num tenant que TEM dado — este caso usa
outro). Tenant B, sem nenhuma interação e sem nenhum recebimento.

**Passos:**
1. Logado no Tenant B, abra Campo → Painel.

**Esperado, bloco a bloco (nenhum deles pode mostrar tabela/lista vazia sem
explicação, e nenhum deve parecer um dado real quando não há dado):**
- "Por canal": "Nenhuma interação no período." — não uma lista com todos os
  canais zerados.
- "Funil por estágio · hoje": "Nenhum contato cadastrado."
- "Amostras entregues" (lista por contato): "Nenhuma amostra entregue no
  período."
- "Recebido x vendido por produto": "Nenhum recebimento nem venda no
  período." — não uma tabela vazia sem legenda.
- "Recebido por fornecedor": "Nenhum recebimento no período."
- O card "Saldo negativo" não aparece (nenhum produto com saldo negativo
  neste tenant vazio).
- Os 4 KPIs do topo mostram `0` — que aqui é um zero real (o tenant de fato
  não tem nenhuma interação/contato/amostra/follow-up), não um "não
  conseguimos calcular" disfarçado de zero.

**Se falhar:** qualquer bloco que mostre uma tabela ou lista em branco sem a
frase correspondente é regressão do padrão "estados por bloco, não por
tela" que a spec exige (seção "UI"). Se algum KPI ou consulta disparar erro
visível na tela (em vez de vazio limpo), verifique se não é o mesmo
problema do Caso 0 — um tenant genuinamente vazio precisa se comportar
igual a um tenant com policy de leitura quebrada só na ausência de dado, o
que pode confundir os dois casos; confira a resposta de rede antes de
concluir qual é.

**Resultado:**

---

## Resultado final

Total de casos: **7** (Caso 0, pré-voo/gate de merge, + Casos 1–6).

- Caso 0: **(a preencher)**
- Passaram: **_ / 6** (Casos 1–6)
- Falharam: **_ / 6**
- Não executáveis neste ambiente: **_ / 6**

**Efeitos colaterais no(s) tenant(s)** (dados reais gravados pela execução):
**(a preencher na execução — recebimentos novos do Caso 5, amostras dos
Casos 2 e 3, saldo negativo deixado de propósito no Caso 2)**.
