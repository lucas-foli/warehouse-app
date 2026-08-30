# E2E manual — Campo fatia 1

Pré: aplicar as 5 migrations (20260826* e 20260827000100), em ordem numérica,
no Supabase do app (SQL Editor). Rodar o app novo sem a última faz o estágio
marcado à mão ser ignorado em silêncio: a view antiga entrega `last_fact_at`
não-nulo mesmo para fatos anteriores ao override, e a regra nova exige nulo
para honrá-lo — sem erro visível, o override simplesmente nunca "pega".
Dados: tenant de teste com 2+ produtos importados. Para o passo 18, um segundo
usuário não-admin no mesmo tenant.

1. Aba Campo aparece na navegação; abre na Agenda vazia ("Nenhum follow-up marcado"). ✅
2. + Registrar visita → criar contato novo (cliente, nome+cidade) → resultado
   "Interessado" → 1 amostra de SKU existente (qty 2) → próximo passo "voltar"
   em 3 dias → salvar. Sem erro.✅
3. Produtos: qty do SKU caiu 2. (Débito de amostra.)✅
4. Agenda: item em "Esta semana" com o contato e o passo. "Feito" o remove.✅
5. Funil: contato em "Amostra entregue" (estágio derivado). Registrar nova
   interação com "Pediu proposta" → contato move para "Negociando".✅
6. Ficha (tocar no card do funil): timeline com as 2 interações e amostras.✅
7. Override: na ficha, mudar estágio para "Perdido" → funil mostra "marcado à
   mão". Registrar nova interação → volta ao derivado (override expira).✅
8. Fornecedores: criar "Noronha Pescados" → aparece na lista; registrar
   interação de ligação nela; funil (filtro Fornecedores) mostra "Contatado".✅
9. Amostra com qty maior que o estoque → aviso âmbar aparece e o registro salva
   mesmo assim (estoque fica negativo em Produtos).✅
10. ClientsPage: botão "Ficha" abre a timeline do cliente.✅

## ⚠ Antes de pôr na mão do Elcy — limitação conhecida desta fatia

**Amostra registrada não tem desfazer.** O débito de estoque da amostra é
definitivo: não há edição nem exclusão de interação no app, e a entrada de
mercadoria (que faz o estoque subir) só chega na fatia 2. Um "20" digitado no
lugar de "2" corrompe o `qty` daquele SKU até alguém corrigir **por SQL
manual** no Supabase.

Consequências práticas enquanto a fatia 2 não entra:
- avisar o Elcy de que a quantidade de amostra é para conferir antes de salvar;
- quem administra o workspace precisa saber que a correção é SQL, não UI;
- o mesmo vale para uma visita registrada no contato errado.

Registrado como decisão consciente da fatia 1 (não é bug a reportar).


## Casos adicionais (surgidos nos reviews das tasks 1-13)

11. Amostra com quantidade decimal (ex.: 1,5): tentar adicionar ao registro
    rápido → recusada com mensagem de erro visível, não some em silêncio da
    lista de amostras.
12. Amostra adicionada por engano: no registro rápido, adicionar uma amostra e
    removê-la pelo ✕ antes de salvar → ela some da lista e não é debitada do
    estoque ao salvar.
13. Registrar visita com "próximo passo" preenchido e SEM tocar no campo de
    data → o chip "amanhã" acende sozinho; ao salvar, o item aparece na
    Agenda.
14. Salvar uma visita que deixa o estoque negativo (amostra maior que o
    saldo): o modal NÃO fecha sozinho, mostra o aviso âmbar, e o botão salvar
    fica travado no estado "Visita registrada" até clicar em "Entendi,
    fechar" — só aí o modal fecha.
15. Na ficha aberta pelo Funil (tocar num card): registrar uma visita por ali
    → a timeline atualiza sem fechar a ficha; trocar o estágio → o chip muda
    na hora e passa a marcar "· à mão"; clicar em "voltar ao automático" → o
    chip volta ao estágio derivado.
16. Na ficha aberta pela ClientsPage (botão "Ficha"): confirmar que o chip de
    estágio NÃO aparece ali (o estágio é aproximado só na aba Campo) — só o
    badge de papel e a timeline.
17. Funil com filtro "Fornecedores" num tenant (ou momento, antes do passo 8
    criar o Noronha Pescados) sem nenhum fornecedor cadastrado → mostra
    "Nenhum contato neste filtro.", não uma tela em branco.
18. Logado como usuário NÃO-admin: consegue registrar visita em contato que
    JÁ existe e marcar um follow-up como feito na Agenda. É barrado, com
    mensagem clara e sem erro em inglês, em três pontos:
    - mudar o estágio na ficha → "Apenas administradores podem alterar o
      estágio." (e a mudança não é aplicada);
    - criar contato novo pelo registro rápido → "Apenas administradores podem
      cadastrar clientes.";
    - Fornecedores → "+ Novo fornecedor" → "Apenas administradores podem
      cadastrar fornecedores.".
19. Campo "Quando": registrar uma visita com data de ontem e conferir que a
    timeline mostra a data de ontem, não a de hoje; conferir que o seletor
    não deixa escolher data futura.
20. Rastro do override: marcar um contato como "Perdido" e conferir que a
    timeline ganha o card "Estágio marcado à mão · Perdido" na data de hoje,
    SEM fechar e reabrir a ficha.
21. Escopo do override — **use o MESMO contato do passo 20** (o que você
    acabou de marcar como "Perdido" e que já tinha amostra entregue antes
    disso). Registrar nele uma visita nova SEM amostra e conferir que ele vai
    para "Contatado" — e NÃO volta para "Amostra entregue".

    ⚠ Só vale nesse contato. Num contato SEM override, "Amostra entregue" é o
    resultado CORRETO: sem `stage_overridden_at` o escopo é inerte e todos os
    fatos contam, inclusive amostras antigas. O jeito rápido de saber se um
    contato tem override é a timeline: se não há card "Estágio marcado à mão",
    não há override e não há escopo.
