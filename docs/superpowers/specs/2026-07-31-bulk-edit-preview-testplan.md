# Roteiro de verificação manual — edição em massa com preview

**Fatia:** preview antes de aplicar na edição em massa. **Branch:** `feat/bulk-edit-preview`.
**Executado por:** Lucas, no app real (localhost), 2026-07-31 — **7/7 OK**.

O preview é read-only até o Confirmar; os casos 1–6 não mutam dados. Só o caso 7 grava.

**Setup:** login → lista completa de produtos → selecionar ~5–10 produtos com preços
variados (alguns com preço, alguns "—", alguns com o mesmo valor) → acionar edição de
campo em massa ("Edit field on N products").

| # | Caso | Passos | Esperado | Resultado |
|---|------|--------|----------|-----------|
| 1 | Aplicar valor comum | Field=Price, Value=`30` → Revisar | Subtítulo `N produtos · campo Price → R$ 30`; linhas agregadas por transição com contagem; "· sem mudança" apagadas no fim; rodapé `X alterados · Y sem mudança`; Confirmar escuro | ✅ |
| 2 | Destrutivo (apagar preço) | Field=Price, Value **vazio** → Revisar | Banner vermelho "Vai apagar o valor de N produtos"; transições `R$ 25 → —` em vermelho; Confirmar vermelho; bate com `preview.html` | ✅ |
| 3 | Tudo sem mudança | Só produtos com o mesmo preço; Value = esse preço → Revisar | Todas "sem mudança"; rodapé `0 alterados`; **Confirmar desabilitado** | ✅ |
| 4 | Entrada inválida (NaN) | Field=Price/Min, valor não-numérico | **Revisar desabilitado** (não avança) | ✅ |
| 5 | Campos não-numéricos | Field=Onde e Location, escolher no dropdown → Revisar | Preview agrega texto→texto; sem banner/destaque vermelho | ✅ |
| 6 | Reset ao reabrir | Chegar no preview → Cancel → reabrir | Abre no passo de **edição**, não preso no preview | ✅ |
| 7 | Confirmar grava (muta) | 1 produto, Price diferente → Revisar → Confirmar | Diálogo "1 of 1 products updated"; depois desfazer ao valor original | ✅ |

**Cobertura:** preview mostra o mesmo conjunto/valor que a gravação aplica; destrutivo
visível mas não bloqueia; layout fiel ao `preview.html` aprovado.
