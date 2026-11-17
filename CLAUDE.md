# Vetra — como trabalhar neste repositório

Leitor de PDF para estudo (pt-BR). O site é publicado pelo GitHub Pages a partir do `main`; o app de Windows se atualiza baixando os arquivos listados em `sw.js`. Fale com o Lucas sempre em português.

## Fluxo: branch → verificação → PR → merge
1. Nunca commitar direto no `main` (ele é o site no ar). Trabalhe num branch: `feat/...`, `fix/...`; mudanças de checagens só em `checks/...`.
2. Antes de **todo commit**: `/verify` (skill em `.claude/skills/verify/`). Antes de **abrir qualquer PR**: `npm run check`, `npm run build` e `npm test` passando, e as telas de `npm run shots` olhadas.
3. Commit, push e PR só com o OK do Lucas para aquela mudança. Merge no `main` = publicar: também só com OK explícito.
4. Ao publicar uma versão: aumente `App.VERSION` (js/core.js) **e** `VERSION` (sw.js), escreva a novidade no topo de `js/news.js`, e todo script novo entra no `index.html` e em `FILES` do `sw.js` (o `npm run check` confere).

## Falhou? Três rodadas e para
Rode → conserte → rode. Se a mesma checagem ainda falhar depois de **3 rodadas de conserto**, pare e chame o Lucas com: o que falha, a captura de `tests/out/`, o que tentou e a melhor hipótese. Não continue tentando sozinho.

## Testes instáveis
Nunca pular, nunca repetir até passar, nunca acrescentar espera/sleep. Ache a causa (esperar a condição certa com `until(...)`, estado vazando entre testes). Sem causa: apague o teste e registre o porquê no PR e em `tests/REMOVIDOS.md`.

## A mudança nunca edita as próprias checagens
`tests/`, `.claude/`, `.github/`, `CLAUDE.md`, `REVIEW.md`, `eslint.config.js`, `package.json` e `.gitignore` são as regras que julgam as mudanças. Elas só mudam em PR próprio (branch `checks/...`), sem código do app junto. O GitHub Actions roda sempre a versão do `main` dessas regras e reprova PR que misture as duas coisas. Não contorne: não use "bypass", não marque rótulos de exceção, não desative hooks.

## Dados do usuário
Os PDFs do Lucas (provas, livros) nunca entram no repositório nem em testes; os testes geram os próprios PDFs (`tests/lib/fixtures.mjs`).
