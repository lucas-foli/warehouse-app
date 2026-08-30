# Modal base + fluxo Novo Produto — modais acessíveis e backdrop correto

> Fatia única: um componente `<Modal>` base (portal + a11y) que **todas as modais**
> passam a usar, matando o **BUG-14** (backdrop deslocado) de uma vez; e a extração do
> drawer de produto para um `ProductFormModal` que resolve **BUG-1** (virar modal),
> **BUG-2** (marcar obrigatórios) e **BUG-3** (Salvar honesto).
> Data: 2026-08-26.

## Contexto

Quatro bugs abertos convergem para a mesma raiz — modais mal formadas:

- **BUG-1** — o painel "Novo produto"/"Editar produto" não é modal: no desktop cai como
  coluna do grid (`md:contents`, `ProductsPage.tsx:743`), no mobile vira bottom-sheet. Sem
  backdrop em todas as larguras, sem foco preso, sem `role="dialog"`.
- **BUG-2** — no create, nenhum campo comunica que Nome e SKU são obrigatórios; o erro
  ("SKU and Name are required.") só aparece após clicar em Salvar (`ProductsPage.tsx:226-230`).
- **BUG-3** — Salvar habilita ao primeiro campo digitado (`disabled={!editDirty || ...}`,
  `ProductsPage.tsx:934`); `editDirty` vira `true` no primeiro `updateDraft`.
- **BUG-14** — o overlay de **toda** modal é `fixed inset-0 z-50 bg-black/60` renderizado
  inline dentro do container do shell (`Dashboard.tsx`, wrapper com `space-y-10`). O
  utilitário `space-y-10` aplica `margin-top: 40px` ao overlay (filho não-primeiro), e num
  `position: fixed; inset:0` esse margin desloca a caixa 40px — a faixa do header fica sem
  escurecer. Sistêmico: atinge as 11 modais.

Doze arquivos usam o padrão de overlay `fixed inset-0 ... bg-black`; um deles
(`products/BulkEditFieldPopover.tsx`) é **popover ancorado**, não modal centralizado. As
outras 11 são modais reais. `createPortal` ainda não é usado em nenhum lugar do projeto.
`react-dom` (^19.1.1) já é dependência.

A cura canônica das quatro é a mesma técnica: renderizar a modal num **portal** para
`document.body` (sai do container com `space-y`) e centralizar num shell com a11y. Por isso
esta fatia cria um `<Modal>` base e migra as 11 modais para ele.

## Escopo

### 1. Componente `<Modal>` base — `src/components/ui/Modal.tsx` (novo)

Shell único que provê o comportamento e a moldura de toda modal. Cada modal passa **só o
conteúdo** (o header/body/footer que já tem); o `<Modal>` provê o painel.

**Interface:**

```tsx
type ModalProps = {
  open: boolean;
  onClose: () => void;
  labelledById?: string;              // id do heading do conteúdo, para aria-labelledby
  size?: 'sm' | 'md' | 'lg' | 'xl';   // max-width do painel (default 'md')
  mobileSheet?: boolean;              // true = bottom-sheet no mobile + centralizado no desktop (default false)
  children: React.ReactNode;
};
```

**Comportamento (obrigatório):**

- **Portal:** renderiza via `createPortal(…, document.body)`. É o que tira o overlay do
  container com `space-y-10` — **fix do BUG-14**.
- **Backdrop:** `fixed inset-0 z-50 bg-black/60` cobrindo 100% da viewport; clique no
  backdrop chama `onClose`. Clique **dentro** do painel não fecha (`stopPropagation`).
- **Painel:** centralizado (`flex items-center justify-center p-4`); `role="dialog"`,
  `aria-modal="true"`, `aria-labelledby={labelledById}` quando fornecido. Fundo `bg-card`,
  cantos arredondados, sombra; `max-width` conforme `size`
  (`sm`→`max-w-md`, `md`→`max-w-lg`, `lg`→`max-w-2xl`, `xl`→`max-w-3xl`); scroll interno
  (`max-h-[90vh] overflow-y-auto`).
- **`mobileSheet`:** quando `true`, no mobile o painel vira bottom-sheet
  (`inset-x-0 bottom-0 rounded-t-2xl`, com drag-handle) e centraliza a partir de `sm`.
- **Esc** → `onClose` (listener único aqui; remover os handlers duplicados das modais).
- **Foco preso:** ao abrir, mover o foco para o painel; `Tab`/`Shift+Tab` circulam apenas
  entre os focáveis do painel; ao fechar, **restaurar o foco** ao elemento que estava ativo
  antes de abrir. Implementação manual (query de focáveis), sem dependência nova.
- **Scroll-lock:** ao abrir, `document.body.style.overflow = 'hidden'`; ao fechar/desmontar,
  restaurar o valor anterior.
- `open === false` → renderiza `null` (não monta o portal).

**Isolamento:** o `<Modal>` não conhece nenhuma modal concreta; só recebe `children` e
config. Consumidores não sabem do portal nem do focus-trap — só passam conteúdo.

### 2. `ProductFormModal` — `src/components/products/ProductFormModal.tsx` (novo)

Extrai o drawer inline de `ProductsPage.tsx:738-961` para um componente próprio que usa
`<Modal>`. **Apresentacional:** recebe o draft e os callbacks por props; a lógica de
persistência (`supabase.from(...)`, delete) permanece no `ProductsPage` — assim o modal é
testável sem mock de Supabase.

**Props (do que o `ProductsPage` já tem):**

```tsx
type ProductFormModalProps = {
  open: boolean;
  mode: 'create' | 'edit';
  draft: ProductDraft | null;
  saving: boolean;
  error: string;
  dirty: boolean;
  hasTenant: boolean;
  ondeOptions: string[];
  localOptions: string[];
  onChange: (partial: Partial<ProductDraft>) => void;   // = updateDraft
  onSave: () => void;                                    // = handleSaveDraft
  onReset: () => void;                                   // = resetDraft (modo edit)
  onClose: () => void;                                   // = closeEditPanel
  onRequestDelete: () => void;                           // = setDeleteConfirmOpen(true) (modo edit)
};
```

O `ProductsPage` deixa de renderizar o bloco `{isEditPanelOpen && (…)}` e passa a montar
`<ProductFormModal open={isEditPanelOpen} mode={drawerMode} … />`. O `<ProductFormModal>`
usa `<Modal open={open} onClose={onClose} size="lg" mobileSheet labelledById="product-form-title">`.
Os campos (SKU/Name no create, header do produto + campos + danger-zone no edit) mudam de
lugar, **não** de conteúdo.

**BUG-2 (marcação + realce):** no modo `create`, os labels **SKU** e **Name** ganham
sufixo `*` e os inputs recebem `aria-required="true"`. Ao tentar salvar com um deles vazio,
o campo faltante recebe borda de atenção (classe de erro). Os demais campos ficam neutros. O
`error` (prop) segue exibido apenas para casos de servidor (ex.: SKU duplicado).

**BUG-3 (Salvar honesto):** o botão Salvar usa `disabled={!canSaveProduct(mode, draft, dirty, saving, hasTenant)}`
(ver 2b). A regra de negócio migra do JSX para uma função pura testável.

### 2b. `canSaveProduct` + `ProductDraft` — `src/utils/productForm.ts` (novo)

Hoje `ProductDraft` é um tipo **local não-exportado** em `ProductsPage.tsx:16-27`. Como
`canSaveProduct` e o `ProductFormModal` precisam do tipo, **mova** `ProductDraft` para
`productForm.ts` (exportado) e faça o `ProductsPage` importá-lo de lá (removendo a def local).
A forma do tipo não muda:

```tsx
export type ProductDraft = {
  id: string;
  name: string;
  sku: string;
  status: string;
  location: string;
  qty: string;
  min: string;
  price: string;
  barcode: string;
  image: string;
};

export const canSaveProduct = (
  mode: 'create' | 'edit',
  draft: ProductDraft | null,
  dirty: boolean,
  saving: boolean,
  hasTenant: boolean,
): boolean => {
  if (!draft || saving || !hasTenant) return false;
  if (mode === 'create') return Boolean(draft.sku.trim() && draft.name.trim());
  return dirty; // edit mantém a regra atual
};
```

`ProductsPage` e `ProductFormModal` passam a `import type { ProductDraft } from '../utils/productForm'`.

### 3. Migração das 11 modais para `<Modal>`

Cada uma troca o boilerplate de overlay (`fixed inset-0 … bg-black/60` + wrapper + seu Esc/
backdrop próprios) por `<Modal open onClose size mobileSheet labelledById>{conteúdo}</Modal>`.
O conteúdo interno não muda. `size`/`mobileSheet` de cada uma são **confirmados na migração**
olhando o `max-w-*` atual do arquivo — a tabela abaixo é o ponto de partida:

| Modal | `size` | `mobileSheet` |
|---|---|---|
| `products/ProductFormModal` (novo) | `lg` | sim |
| `products/SaleOrderModal` | `xl` | sim |
| `clients/ClientFormModal` | `md` | sim |
| `sellers/SellerFormModal` | `md` | sim |
| `members/InviteMemberModal` | `md` | sim |
| `products/ConfirmDialog` | `sm` | não |
| `products/BulkResultDialog` | `md` | não |
| `admin/ApproveRequestModal` | `md` | não |
| `admin/DeclineRequestModal` | `md` | não |
| `settings/ApproveJoinRequestModal` | `md` | não |
| `settings/DeclineJoinRequestModal` | `md` | não |

Cada modal migrada: remove seu próprio listener de Esc e seu handler de clique-no-backdrop
(agora no `<Modal>`), mapeia seu `onCancel`/`onClose` para `onClose` do `<Modal>`, e dá um
`id` ao seu heading para `labelledById`.

## Fora de escopo

- **`products/BulkEditFieldPopover`** — é popover ancorado a um elemento, semântica diferente
  de modal centralizado. **Não migra.**
- **Locale/copy** — o header do drawer está em inglês ("New product") e os labels em PT
  ("Onde", "Qtd", ...). É inconsistência **app-wide**; corrigir isso é branch de locale
  dedicada, **não** esta fatia. Os textos migram como estão.
- **Fusão de duplicatas** — `admin/*RequestModal` e `settings/*JoinRequestModal` podem ser
  quase-idênticas; **não** fundir. Só migrar cada uma.
- **Redesenho visual** — as modais mantêm seu conteúdo/estilo; muda a moldura e o
  comportamento (portal/a11y), não o design.

## Testes

Anotação `mata:` = a mutação que o teste tem de derrubar.

### Infra (task 1)

- devDeps: `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`.
- `vite.config.ts`: `test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'] }`;
  `src/test/setup.ts` importa `@testing-library/jest-dom`.
- **Gate:** a suíte pura existente (157 testes) continua verde sob `jsdom`. `mata:` uma
  config de jsdom que quebre os testes de node.

### Automatizados (vitest + Testing Library)

- **`<Modal>` (`src/components/ui/Modal.test.tsx`)** — é a peça mais reutilizada:
  - Esc chama `onClose`. `mata:` remover o handler de Esc.
  - Clique no backdrop chama `onClose`; clique **dentro** do painel **não** chama. `mata:`
    fechar no clique interno / não fechar no backdrop.
  - O nó do overlay é filho de `document.body`, **não** do container que renderiza o `<Modal>`
    (prova do portal / fix BUG-14). `mata:` voltar a renderizar inline.
  - `role="dialog"` + `aria-modal="true"` presentes; `aria-labelledby` reflete `labelledById`.
    `mata:` remover a semântica de diálogo.
  - Ao abrir, o foco vai para dentro do painel; ao fechar, **retorna** ao elemento previamente
    focado (o trigger). `mata:` não restaurar o foco.
  - `body` fica com `overflow:hidden` enquanto aberto e restaura ao fechar. `mata:` não
    restaurar o overflow.
- **`canSaveProduct` (`src/utils/productForm.test.ts`)**:
  - create sem `sku` ou sem `name` → `false`; create com ambos → `true`. `mata:` habilitar
    no create ao primeiro campo (regra antiga do `dirty`).
  - edit sem `dirty` → `false`; edit com `dirty` → `true`. `mata:` ignorar o modo.
  - `saving` ou `!hasTenant` ou `draft===null` → `false`. `mata:` permitir salvar sem tenant.
- **`ProductFormModal` (`src/components/products/ProductFormModal.test.tsx`)**:
  - No create, Salvar nasce desabilitado e habilita ao preencher SKU+Name. `mata:` botão
    habilitado sem os obrigatórios.
  - Inputs SKU e Name têm `aria-required="true"` no create. `mata:` faltar a marcação.
- **Smoke de migração**: uma modal simples via `<Modal>` (ex.: `ConfirmDialog`) abre, e fecha
  por Esc e por backdrop. Não se replica às 11 (o `<Modal>` já é coberto isolado); cada
  migração roda `npm test` + `npx tsc -b` no seu próprio review.

### Manual

Roteiro passo a passo (a ser seguido no e2e do app real):

1. **Backdrop cobre o topo (BUG-14):** abrir uma modal a partir de uma página do Dashboard
   (ex.: "Novo vendedor") e confirmar que o escurecimento cobre **a faixa do header** — sem
   sobrar a listra clara no topo. Repetir numa modal de produto e numa de confirmação.
2. **A11y do `<Modal>`:** Esc fecha; clicar fora (backdrop) fecha; clicar dentro não fecha;
   Tab circula dentro da modal (não vaza para a página atrás); ao fechar, o foco volta ao
   botão que abriu; a página de trás não rola enquanto a modal está aberta.
3. **BUG-1:** "Novo produto" abre como modal centralizada com backdrop em desktop e mobile.
4. **BUG-2:** no "Novo produto", Nome e SKU aparecem com `*`; os demais campos, sem.
5. **BUG-3:** o botão Salvar começa desabilitado e só habilita quando Nome **e** SKU estão
   preenchidos (digitar só Qtd/Preço não habilita).
6. **Não-regressão:** criar e editar um produto de verdade (salvar persiste); as demais
   modais (venda, cliente, vendedor, convite, aprovações) abrem, salvam e fecham normalmente.

**Execução:** o e2e no browser é rodado por mim (Claude) ao final, com screenshots dos
pontos-chave (backdrop no topo, obrigatórios, Salvar desabilitado→habilitado).

## Verificação

- `npx tsc -b` limpo e `npm test` verde (inclui as suítes novas e os 157 pré-existentes).
- Grep de sanidade: nenhuma modal (exceto o popover) mantém `fixed inset-0 ... bg-black`
  próprio — todas passam pelo `<Modal>`. `grep -rl "fixed inset-0.*bg-black" src/components`
  deve restar só `products/BulkEditFieldPopover.tsx`.
- E2e manual conforme o roteiro acima.

## Ordem das tasks (sugestão para o plano)

1. **Infra de teste** (jsdom + Testing Library + setup) — confirmar 157 verdes sob jsdom.
2. **`<Modal>` base** (TDD: testes de comportamento primeiro) + `canSaveProduct` puro.
3. **`ProductFormModal`** (extração do drawer, BUG-1/2/3) + fiação no `ProductsPage`.
4. **Migração das 11 modais** — agrupável em subagents paralelos por pasta
   (produto / forms / admin+settings), cada grupo com review próprio; o smoke de migração
   entra aqui.
5. **E2e no browser** (roteiro manual) — executado por mim.
