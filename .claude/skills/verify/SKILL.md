---
name: verify
description: Sobe o Vetra e testa de ponta a ponta como um usuário (abrir PDF, grifar, caneta, simulado, barras), mais checagens estáticas, lint e build. Use antes de todo commit e antes de abrir qualquer PR, e sempre que precisar provar que uma mudança funciona no app de verdade.
---

# /verify — provar que a mudança funciona no app rodando

Verificar é **rodar o app**, não ler o diff. Esta skill é o harness de smoke test do Vetra: rápido, confiável e igual em todo lugar (sua máquina e o GitHub Actions).

## 1. Rodar, nesta ordem (o barato primeiro)

```bash
npm ci                # só se node_modules/ não existir
npm run check         # segundos: scripts compilam, sw.js lista todo script, versões batem, lint
npm run build         # checagens + cópia do app para o instalador do Windows
npm test              # ponta a ponta: ~2-3 min, Edge/Chrome sem janela, perfil novo a cada suíte
npm run shots         # capturas em 1300/820/390 → tests/out/telas-*.png
```

- `npm test -- simulado` roda só as suítes com "simulado" no nome (útil enquanto conserta; **antes de commit/PR rode tudo**).
- Toda falha imprime os passos até ali, os dados que o teste viu e uma captura em `tests/out/`. **Abra a captura** (Read na imagem) antes de mexer no código.
- Navegador: acha Edge/Chrome sozinho; se não achar, `VETRA_BROWSER=<caminho>`.

## 2. Olhar as telas

Depois de `npm run shots`, abra as imagens `tests/out/telas-*.png` e confira como um usuário:
nada cortado na borda, barras sem sobrepor, texto legível no tema escuro, ícones alinhados.
Mudou algo visual que as telas padrão não mostram? Tire a captura do estado certo com o harness
(veja `tests/lib/telas.mjs`) ou abra o app no navegador do painel (`node -e "import('./tests/lib/serve.mjs').then(m=>m.serve('.')).then(s=>console.log(s.url))"`).

## 3. Mapa de funções (roteiro e critério de "pronto")

| Função | Como chegar | O que tem que acontecer |
|---|---|---|
| Abrir | Abrir PDF / arrastar arquivo | páginas e texto selecionável; abre sempre na página inicial; Ctrl+Shift+T reabre a última aba |
| Grifar | Selecionar texto (ferramenta Texto, V) | grifo na cor escolhida; grifar por cima junta num grifo só (cor nova), sublinhado fica à parte; Ctrl+Z desfaz |
| Caneta | P (caneta), M (marca-texto), E (borracha), laço | traço com espessura própria; desfazer/refazer; laço move/pinta/duplica/apaga; borracha parcial corta o traço; tocar de novo na cor abre o seletor |
| Simulado | botão Simulado → Começar | acha questões e alternativas; clique marca, botão direito risca; Z chute, X dúvida, J/K navegam; Parar → sair e continuar depois; Entregar → resultado com áreas, tempo, Revisar erros, Refazer só os erros, Exportar planilha |
| Barras | Exibir → "… preso no topo", arrastar a alça ⋮⋮, clique direito no controle de página | barra de cima sempre cabe (⋯ no celular); controle de página nunca embaixo da barra de marcação; esquerda/centro/direita |
| Revisão | Estudar → Revisar grifos (R) | cartões vencidos; lembrete ao abrir o Vetra e o PDF |
| Atualização | Ajuda → Procurar sempre ao abrir | no app de Windows confere a cada abertura |

Cada linha tem uma suíte em `tests/e2e/`. Função nova ou mudada → acrescente ou ajuste a suíte **em um PR só de checagens** (veja CLAUDE.md), nunca no mesmo PR da mudança.

## 4. Regras que não se negociam

- **Três rodadas.** Rode, conserte, rode de novo. Se a mesma checagem ainda falhar depois de **3 rodadas de conserto**, pare e chame o Lucas com: o que falha, a captura, o que já tentou e sua melhor hipótese.
- **Teste instável (flaky):** nunca pular, nunca tentar de novo até passar, nunca acrescentar `wait`/sleep para "dar tempo". Ache a causa (normalmente: esperar a condição certa com `until(...)` em vez de um tempo fixo, ou estado vazando entre testes). Se não achar, **apague o teste e registre o porquê** no PR e em `tests/REMOVIDOS.md`.
- **A mudança não mexe nas próprias checagens.** `tests/`, `.claude/`, `.github/`, `CLAUDE.md`, `REVIEW.md`, `eslint.config.js`, `package.json` e `.gitignore` só mudam em PR separado, num branch `checks/...`.
- **Diga como verificou.** No fim, relate: comandos rodados, quantas verificações passaram, telas que olhou e o que não deu para verificar (ex.: S Pen de verdade, app de Windows instalado).
