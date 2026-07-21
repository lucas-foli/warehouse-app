# Dados de teste — risco derivado (`getProductRisk`)

CSVs no formato da tela **Importar dados** do app, pensados para provar que o
risco de um produto (`critical` + `reasons`) é 100% **derivado** —
`src/utils/productRisk.ts` — e nunca lido de `products.status` ("Onde", que
agora é só lugar físico).

> Não usa o seed `test-data/seed-sales-location/`: aquelas vendas são de
> 2026-05/06 e, com o tempo passando, todas ficam com mais de 30 dias — não dá
> para provar o lado "<30 dias NÃO acende". Além disso nenhum produto de lá tem
> `image_url`, então todos acendem por "sem foto" e mascaram os outros
> gatilhos. Este seed corrige os dois problemas.

## Ordem de importação (Importar dados → escolher o Tipo → subir o arquivo)

1. **Locais / Campos (Onde / Local)** → `1_options.csv`
2. **Produtos** → `2_products.csv`
3. **Clientes** → `3_clients.csv`
4. **Vendedores** → `4_sellers.csv`
5. **Vendas (Pedidos)** → `5_sales_orders.csv`
6. **Itens de venda** → `6_sales_items.csv`

A ordem importa: Clientes e Vendedores precisam existir **antes** dos
Pedidos (o import liga por `external_id`); os Itens só aceitam SKUs de
produtos já cadastrados. Marque **"Limpar dados antes de importar"** em cada
tipo se estiver reimportando por cima de um teste anterior.

Todos os produtos usam a mesma loja (`location = LOJA RISCO`) para que o
filtro de loja do Dashboard não interfira em nada — qualquer diferença nos
resultados vem só do risco, nunca do filtro.

## As datas envelhecem — regenere quando precisar

`5_sales_orders.csv` tem `sold_at` calculado como "N dias atrás" a partir do
instante em que `generate.mjs` rodou. Como o app calcula
`daysSince(sold_at, new Date())` **ao vivo**, toda vez que a página abre, essas
datas ficam mais velhas a cada dia que passa — exatamente o defeito do seed
antigo. Se os cenários de fronteira (RSK-009 e RSK-010, veja abaixo) tiverem
passado da folga de segurança, rode de novo pouco antes de importar:

```
node test-data/seed-product-risk/generate.mjs
```

Isso reescreve os 6 CSVs neste diretório com datas frescas. Os CSVs já vêm
commitados também, para quem só quer subir e testar sem rodar Node.

## Cenários

Um produto por linha, prefixo de SKU `RSK-`. `min` vazio = não definido (não é
zero). `image_url` preenchido = qualquer URL placeholder — o conteúdo não
importa, só o campo estar presente ou ausente é o que `getProductRisk` olha
para o gatilho `'sem foto'` (a imagem não vai carregar de verdade).

| SKU | cenário | qty | min | foto | vendas | esperado |
|---|---|---|---|---|---|---|
| RSK-001 | controle saudável | 50 | 10 | sim | 1 venda há 5 dias | **NÃO crítico** — `reasons: []` |
| RSK-002 | vitrine + sem giro | 50 | 10 | sim | 1 venda há 60 dias | crítico — `reasons: ['sem giro']`. `status = VITRINE` (prova lugar+risco coexistindo) |
| RSK-003 | vitrine + comprar | 5 | 10 | sim | 1 venda há 3 dias | crítico — `reasons: ['comprar']`. `status = VITRINE` |
| RSK-004 | estoque zerado, sem mínimo | 0 | *(vazio)* | sim | 1 venda há 2 dias | crítico — `reasons: ['estoque zerado']`. Prova que `min` NULL não gera `'comprar'` mesmo com `qty=0` |
| RSK-005 | sem foto | 50 | 10 | *(vazio)* | 1 venda há 5 dias | crítico — `reasons: ['sem foto']` |
| RSK-006 | nunca vendido, recém-cadastrado | 50 | 10 | sim | nenhuma | **NÃO crítico** — `created_at` = data do import (recente) |
| RSK-007 | nunca vendido, antigo | 50 | 10 | sim | nenhuma | crítico — `reasons: ['sem giro']`. **Exige o passo SQL abaixo** depois do import |
| RSK-008 | venda recente ESTORNADA | 50 | 10 | sim | venda há 60 dias (ativa) + venda há 3 dias (estornada) | crítico — `reasons: ['sem giro']`. O estorno não pode contar como giro |
| RSK-009 | fronteira: ~30 dias (29,5) | 50 | 10 | sim | 1 venda há 29,5 dias | **NÃO crítico** — `reasons: []` |
| RSK-010 | fronteira: 31 dias | 50 | 10 | sim | 1 venda há 31 dias | crítico — `reasons: ['sem giro']` |

> RSK-009 usa 29,5 dias em vez de exatos 30,0 — veja o comentário no topo de
> `generate.mjs` para o porquê (a comparação é `daysSince > 30`, e "agora" só
> anda para frente entre gerar o CSV e abrir a tela).

### Totais esperados

**Logo após importar os 6 CSVs (antes do passo SQL do RSK-007):**
- **6 críticos**: RSK-002, RSK-003, RSK-004, RSK-005, RSK-008, RSK-010
- **4 não críticos**: RSK-001, RSK-006, RSK-007 (ainda sem o SQL), RSK-009

**Depois de rodar o SQL do RSK-007 (abaixo):**
- **7 críticos**: RSK-002, RSK-003, RSK-004, RSK-005, RSK-007, RSK-008, RSK-010
- **3 não críticos**: RSK-001, RSK-006, RSK-009

Confira que o contador **"Itens críticos"** da Visão geral bate exatamente com
o número de linhas que aparecem ao aplicar o filtro **"Críticos"** na tela de
Produtos (e que os SKUs coincidem com a lista acima) — os dois derivam da
mesma `getProductRisk`, então qualquer divergência é bug.

## Passo SQL — envelhecer o `created_at` do RSK-007

O import de Produtos não aceita coluna `created_at` (não está na lista de
opcionais de `DataImport.tsx`), então ele nasce com `created_at` = agora, igual
ao RSK-006. Para provar o caso "nunca vendido só acende se `created_at` tem
mais de 30 dias", rode isto no **Supabase Studio** depois do import:

```sql
-- CONFIRA o tenant_id antes de rodar (troque <SEU_TENANT_ID>)!
-- Ex.: SELECT DISTINCT tenant_id FROM products WHERE sku LIKE 'RSK-%';
UPDATE products
SET created_at = now() - interval '60 days'
WHERE tenant_id = '<SEU_TENANT_ID>'
  AND sku = 'RSK-007';
```

Escopado por `tenant_id` **e** `sku` de propósito — sem o filtro de
`tenant_id` isso envelheceria o RSK-007 de **todo mundo** que tiver esse SKU
importado.

## Roteiro de teste do estorno pela UI (RSK-002)

RSK-002 já entra crítico por `'sem giro'` (última venda há 60 dias). Para
provar que o app reage a uma venda nova e depois a um estorno:

1. Importe os 6 CSVs (ordem acima).
2. Abra **Produtos**, filtre por `RSK-002` → confirme que está em **Críticos**
   com `'sem giro'`.
3. Registre uma **venda nova** hoje para `RSK-002` (Vendas → Nova venda).
4. Volte em Produtos → `RSK-002` deve **sair** de Críticos (a venda de hoje
   zera o "sem giro"; se `qty` não ficou `<= min` depois da baixa, não sobra
   nenhum outro motivo).
5. Vá em **Vendas**, encontre o pedido que você acabou de criar e **estorne**
   (void).
6. Volte em Produtos → `RSK-002` deve **voltar** a aparecer em Críticos com
   `'sem giro'` — o estorno não pode ser contado como giro (é a mesma garantia
   que o cenário RSK-008 testa via CSV, aqui pela UI).
