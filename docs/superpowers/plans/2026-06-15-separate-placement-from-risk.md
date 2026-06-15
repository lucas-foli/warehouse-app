# Plano: separar "Onde" (lugar físico) de "Risco/Situação"

> Contexto em `docs/data-model-location-status.md`. Hoje o campo `products.status`
> (rotulado na UI como "Onde") carrega DUAS coisas: o lugar físico do produto
> (ESTOQUE/GAVETA/VM) e um sinal de risco lido por palavra-chave
> (`'sem giro'`, `'comprar'`, `'em risco'`, `'stockout'`). Este plano extrai o risco
> para um conceito próprio, deixando "Onde" significar só lugar físico.

## Objetivo

Um produto poder estar, ao mesmo tempo, **na vitrine** (lugar) **e** **sem giro** (risco)
— hoje impossível, porque ambos disputam o mesmo campo de texto.

## Decisão fixada (owner, 2026-06-15): **Opção B — risco 100% derivado**

Risco NÃO é guardado em coluna — é **calculado** a partir de dados que já existem.
Sem nova coluna, sem migração de schema, sem digitação humana.

Regras de risco:
- **"Comprar"** = `qty <= min` (estoque atingiu o mínimo). Dados já existem no produto.
- **"Sem giro"** = produto sem venda há X dias (derivar de `total_sold` / data da última
  venda). **Definir o limiar X com o owner** (ex.: 30/60/90 dias).
- (Mantidos os gatilhos já existentes: estoque zerado `qty <= 0`, sem foto `!image`.)

Consequência: o campo "Onde" (`status`) passa a significar SÓ lugar físico — nenhuma
palavra de risco mora mais nele.

## Passos (TDD onde houver lógica)

1. **Definir o limiar de "sem giro"** com o owner (ex.: 30/60/90 dias sem venda) e
   confirmar qual dado representa "última venda" (campo em `products` ou consulta a
   `sales_items`/`sales_orders`).
2. **Isolar a lógica de risco.** Hoje vive inline em `isCriticalProduct`
   (`src/components/ProductsPage.tsx:80-87`). Extrair para `src/utils/productRisk.ts`
   com função pura `getProductRisk(p): { critical, reasons[] }`. TDD: cobrir cada
   gatilho (estoque zerado, sem foto, `qty <= min`, sem giro).
3. **Remover a leitura de palavra-chave de dentro de `status`.** Tirar
   `criticalStatus = status.includes('sem giro') | ...` (linhas 84-85). Substituir
   pelas regras derivadas (`qty <= min` para "comprar"; limiar de dias para "sem giro").
   **Sem nova coluna, sem migração.**
4. **UI do risco.** O chip "Críticos" (`ProductsPage.tsx:470`) passa a usar
   `getProductRisk`. Opcional: mostrar os `reasons[]` (por que está crítico) no produto.
5. **Verificar.** `npx tsc --noEmit`, testes da lógica de risco, e e2e manual:
   produto "na vitrine" (Onde) com `qty <= min` deve aparecer como crítico — provando
   que lugar e risco agora coexistem.

## Fora de escopo

- Renomear a coluna `status → placement` no banco (fatia separada; o relabel de UI para
  "Onde" já foi feito).
- Filtro de loja (ver `2026-06-15-location-multistore.md`).
