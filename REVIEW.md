# Revisão de PRs do Vetra

Lido sempre do `main` (nunca do PR em revisão). Cada item: **gatilho** (o que no diff ativa), **o que conferir** e **de onde veio**. Rode só os itens cujo gatilho aparece no diff. Ao escalar para o Lucas, diga qual item disparou e por quê.

Classifique cada achado como **Importante**, **Detalhe** ou **Já existia** (defeito anterior ao PR).

1. **Campo novo em dados salvos.** Gatilho: campo novo em grifos (`state.highlights`), simulados (`state.exams`), documentos ou no `sync.js`. Conferir: documento antigo sem o campo abre e funciona; a sincronização entre aparelhos junta o campo sem perder dados; o backup/importação leva o campo. Origem: simulados "só os erros" (`only`) e cartões `srs`.
2. **Script novo.** Gatilho: arquivo novo em `js/` ou `<script>` novo no `index.html`. Conferir: está em `FILES` do `sw.js` (senão some offline e na atualização do app de Windows). Origem: `js/pen.js` (1.20.0).
3. **Versão.** Gatilho: PR que vai publicar. Conferir: `App.VERSION` = `VERSION` do `sw.js` = primeira entrada de `js/news.js`. Origem: aparelhos sem oferecer "Atualizar".
4. **Largura do celular.** Gatilho: CSS/HTML da barra de cima, barra de marcação, controle de página, simulado ou janelas. Conferir: nada passa da largura em 360/390/820 (a página "desliza" para o lado e corta a engrenagem). Origem: 1.20.4 (barra de cima) e modo simulado no tablet.
5. **Barras sobrepostas.** Gatilho: posição de `#dock`, `#pager`, `#topStrip`. Conferir: o controle de página nunca fica por baixo da barra de marcação (texto, caneta, laço, recolhida, centro). Origem: 1.20.4/1.20.6.
6. **localStorage.** Gatilho: chave `le.*` nova ou renomeada. Conferir: valor antigo continua lido (migração), e o app funciona com o armazenamento vazio. Origem: espessuras da caneta (fine/mid/bold → número).
7. **Grifos.** Gatilho: `createHighlight`, `absorbOverlaps`, `mergeRects`, cores. Conferir: grifo por cima não empilha cor; sublinhado/tachado não são engolidos pelo marca-texto; Ctrl+Z desfaz. Origem: 1.20.3.
8. **Simulado.** Gatilho: `js/exam.js`. Conferir: contagens usam as questões da tentativa (`only`), não `e.n`; J/K respeitam o filtro; entregar/continuar não perde respostas. Origem: 1.20.7.

Itens novos só entram se o padrão apareceu em pelo menos dois PRs ou num defeito real, e dá para reconhecer pelo diff. Itens que não pegam mais nada são removidos.
