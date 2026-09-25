# Bugs do Painel (BUG-20, BUG-21) + copy do set-password (BUG-9)

**Data:** 2026-09-25
**Status:** aprovada (brainstorm com Lucas)
**Jira:** WAR-13 (BUG-20), WAR-14 (BUG-21), WAR-18 (BUG-9)
**PR:** reaproveita o #66 (`bugs/e2e-manual-2026-08-04`), que só registrava BUG-6..9.
A branch recebeu merge de `main` (sem rebase: force-push é bloqueado e o repo faz squash
merge) e o `docs/bugs.md` foi reconferido contra `main` antes desta spec.
**Sem migration. Sem mockup** — nenhuma tela ganha layout novo; muda o que as linhas
existentes mostram.

## Contexto

O e2e da fatia 3 do Campo (PR #75) achou dois defeitos que só a tela mostrava, ambos no
Painel (`src/components/field/PanelView.tsx`), ambos reproduzidos no tenant Stanley contra
o Supabase real:

- **BUG-20:** "Recebido x vendido" lista o catálogo inteiro — centenas de linhas `0 / 0 / 0`
  empurram "Recebido por fornecedor" e o card de saldo negativo para dezenas de rolagens
  abaixo.
- **BUG-21:** com amostras entregues e **nenhum** SKU com custo conhecido, o KPI mostra
  "~US$ 0,00 (est., parcial)" e as linhas por contato "US$ 0,00 (parcial)".

O BUG-9 entra junto porque o #66 é o dono do registro dele e a correção é só de texto.

## Decisões

### BUG-20 — a tabela só recebe SKU que se moveu; o filtro mora na origem

`buildReceivedVsSold` (`src/utils/receivedVsSold.ts`) passa a devolver **só** as linhas com
`received > 0 || sold > 0` na janela. Ordenação inalterada (recebido desc, vendido desc,
SKU asc).

Consequência na tela: a condição de vazio do bloco em `PanelView` vira `rows.length === 0`,
e o comentário que justificava o `.some(...)` sai. **Uma regra, num lugar só** — o
`bugs.md` apontava justamente o risco de duas regras (a da função e a da tela) deixarem de
concordar. O contrato "nenhuma linha 0/0 chega à tela" passa a ser da função, e é ela que
os testes cobrem.

O que continua igual, de propósito:
- A **procedência** (`supplierName`, `multipleSuppliers`) segue olhando todo o histórico de
  recebimentos, não só a janela. Um SKU só vendido no período aparece com o fornecedor do
  último recebimento, mesmo que esse recebimento seja anterior à janela.
- O **saldo** segue sendo `products.qty` de hoje.
- SKU recebido/vendido que não está mais no catálogo continua aparecendo (nome = SKU,
  saldo 0), como hoje.
- O card de saldo negativo não depende desta tabela (`negativeBalances`), então um SKU
  negativo sem movimento no período some da tabela e continua no card.

Rejeitadas: **"ver todos" atrás de um botão** (mantém a função devolvendo o catálogo e
duas regras que precisam concordar; quem quer o catálogo tem a aba Produtos); **teto de N
linhas + "ver mais"** (estado novo na tela para um volume que a Global não tem; volta se
algum tenant real encher a tabela *só* de SKUs com movimento).

**Fora desta obra:** o layout mobile da tabela (5 colunas com rolagem horizontal). Com o
filtro, a tabela da Global volta a ter até ~10 linhas e o card de saldo negativo fica a
poucos blocos do topo. Trocar tabela por cards no mobile é layout novo e pertence ao
WAR-8 (direção "app nativo") — vira comentário no WAR-8, não task aqui.

### BUG-21 — uma regra de "custo desconhecido" para os três blocos que mostram US$

**A regra:** o valor em US$ de um agregado só aparece se **ao menos uma linha dele tem
custo conhecido**. "Nenhum custo conhecido" é ausência; um custo conhecido que soma zero é
um fato e aparece como `US$ 0,00`. Portanto a decisão **nunca** olha `cost === 0`.

Hoje os três blocos usam três critérios diferentes:

| Bloco | Critério atual | Defeito |
|---|---|---|
| KPI "Amostras entregues" | mostra se `totalQty > 0` | cobertura zero vira `~US$ 0,00 (est., parcial)` |
| "Amostras entregues" por contato | sempre mostra | contato só com SKU sem custo vira `US$ 0,00 (parcial)` |
| "Recebido por fornecedor" | mostra se `cost !== 0` | esconde custo zero real; acerta o "nada conhecido" por acidente |

Depois:

| Bloco | Nada conhecido | Parcial | Tudo conhecido |
|---|---|---|---|
| KPI | `22 un` + linha "custo desconhecido" | `~US$ X (est., parcial)` | `~US$ X (est.)` |
| Por contato | `6 un` | `6 un · US$ X (parcial)` | `6 un · US$ X` |
| Por fornecedor | `40 un` | `40 un · US$ X (parcial)` | `40 un · US$ X` |

- KPI sem amostra nenhuma (`totalQty === 0`): continua sem linha de valor (vazio não é
  zero — regra que a revisão final da fatia 3 já tinha fixado).
- No KPI, "nada conhecido" é `samples.skusWithoutCost === samples.skusTotal` (com
  `totalQty > 0`, `skusTotal > 0`). O KPI mostra o texto "custo desconhecido" em vez de
  sumir com a linha, para distinguir "há amostra e não sei o custo" de "não há amostra".
- Nas linhas (contato e fornecedor), só a quantidade, sem texto extra: o rodapé do bloco
  de amostras ("N de M SKUs sem custo conhecido") já explica, e o de fornecedor sempre foi
  só quantidade nesse caso.

**Mudança de dado (não é só apresentação):** `SampleContactRow`
(`src/utils/sampleCost.ts`) e `SupplierReceivedRow` (`src/utils/receivedVsSold.ts`)
ganham `costKnown: boolean` — `true` se ao menos uma linha agregada teve custo conhecido.
O registro do BUG-21 dizia "é decisão de apresentação, não de derivação"; isso vale para o
KPI, mas **não** para as linhas: com `cost === 0 && partial`, o dado atual não distingue
"nada conhecido" de "custo conhecido que soma zero".

### BUG-9 — texto neutro no set-password

`src/components/SetPassword.tsx`: título "Definir nova senha" → **"Definir senha"**;
subtítulo "Escolha uma nova senha para concluir a recuperação." → **"Defina sua senha para
acessar sua conta."** Os rótulos dos campos ("Nova senha", "Confirmar nova senha") ficam —
"nova" é verdade nos dois fluxos.

Rejeitado: **texto condicional por fluxo.** O `App.tsx` manda convite sem `invite_token`
para `/set-password` puro (`buildSetPasswordTarget`), indistinguível da recuperação; o
condicional exigiria um sinal novo na rota para trocar uma frase.

## Testes (gate de mutação)

Cada caso nomeia a mutação que mata. Nenhum caso novo é só-negativo sem o par positivo.

**`src/utils/receivedVsSold.test.ts` — `buildReceivedVsSold`**
1. SKU do catálogo sem recebimento nem venda na janela **não** aparece.
   _mata:_ remover o filtro (devolver o catálogo inteiro).
2. SKU só **recebido** na janela aparece. _mata:_ filtro `sold > 0` apenas.
3. SKU só **vendido** na janela aparece. _mata:_ filtro `received > 0` apenas.
4. SKU com recebimento e venda **só fora** da janela não aparece.
   _mata:_ filtrar por "teve movimento em algum momento" em vez de "na janela".
5. SKU só vendido na janela, cujo único recebimento é anterior à janela, aparece com
   `supplierName` desse recebimento. _mata:_ restringir a procedência à janela junto com o
   filtro.
6. Os testes existentes que assumem "uma linha por produto do catálogo" são ajustados para
   o novo contrato, não apagados.

**`src/utils/receivedVsSold.test.ts` — `buildReceivedBySupplier`**
7. Fornecedor com todas as linhas sem `unitCost` → `costKnown: false`.
8. Fornecedor com linha de `unitCost: 0` → `costKnown: true`, `cost: 0`.
   _mata (7+8):_ derivar `costKnown` de `cost !== 0`.
9. Fornecedor misto → `costKnown: true`, `partial: true`.

**`src/utils/sampleCost.test.ts` — `summarizeSamples`**
10. Contato só com SKU sem custo → `costKnown: false`, `partial: true`.
11. Contato com SKU de custo conhecido 0 → `costKnown: true`.
    _mata (10+11):_ derivar `costKnown` de `cost > 0`.

**`src/components/field/PanelView.test.tsx`**
12. KPI com amostras e `skusWithoutCost === skusTotal` → mostra "custo desconhecido" e
    nenhum `US$`. _mata:_ o comportamento atual.
13. KPI com cobertura parcial → mostra `US$` com "parcial". _mata:_ omitir sempre que
    `skusWithoutCost > 0`.
14. KPI sem amostra → nenhuma linha de valor, nem "custo desconhecido". _mata:_ mostrar
    "custo desconhecido" também quando `totalQty === 0`.
15. Linha de contato com `costKnown: false` → só quantidade, sem `US$`.
16. Linha de fornecedor com `costKnown: true, cost: 0` → mostra `US$ 0,00`.
    _mata:_ manter o `cost !== 0` na tela.
17. "Recebido x vendido" com `rows = []` → frase de vazio; com uma linha → tabela.
    Os testes que passavam linhas 0/0 para provar o vazio passam a passar `[]`.

**`src/components/SetPassword.test.tsx` (novo)**
18. Renderiza sem "recuperação" e com "Defina sua senha para acessar sua conta".
    _mata:_ o texto atual.

## E2E (só leitura, tenant Stanley)

Os dois bugs do Painel se reproduzem nos dados que já existem no Stanley; nada precisa ser
escrito em tenant real.

- **A — BUG-20:** Campo → Painel, janela padrão. "Recebido x vendido" lista só linhas com
  recebido ou vendido > 0; "Recebido por fornecedor" e o card de saldo negativo (se houver)
  ficam a poucas rolagens. Trocar para uma janela sem movimento mostra a frase de vazio.
- **B — BUG-21:** mesmo Painel. KPI de amostras mostra `N un` + "custo desconhecido", sem
  `US$ 0,00`; as linhas por contato mostram só quantidade; o rodapé "N de M SKUs sem custo
  conhecido" continua.
- **C — BUG-9:** abrir `/set-password` na sessão logada e ler o texto. **Não submeter** —
  submeter troca a senha da conta.
- Regressão: o Caso 4 do runbook da fatia 3 (filtro de loja só muda o vendido) continua
  valendo com o filtro novo — conferir que trocar de loja não faz sumir linha que só tem
  recebido.

## Fechamento

- `docs/bugs.md`: BUG-9, BUG-20 e BUG-21 marcados `(RESOLVIDO — PR #66)`, no formato das
  entradas já resolvidas.
- Título e descrição do PR #66 reescritos para o escopo novo.
- Jira: WAR-13, WAR-14, WAR-18 → Feito no merge; comentário no WAR-8 sobre a tabela no
  mobile. WAR-11 (BUG-19, resolvido pelo PR #76) → Feito já, independente desta obra.
