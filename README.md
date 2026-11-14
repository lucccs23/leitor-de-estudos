# Vetra

Leitor de PDF (e EPUB) para estudar: grifos, caneta, notas, revisão, simulados, IA, timer, estatísticas e sincronização entre aparelhos.

- **Site / app do celular e tablet:** https://lucccs23.github.io/leitor-de-estudos/ (instalável, funciona sem internet)
- **App para Windows:** instalador em `desktop/dist/` (veja abaixo como gerar)

## Pastas

| Pasta | O que é |
|---|---|
| `index.html`, `app.css`, `js/`, `lib/`, `icons/`, `manifest.webmanifest`, `sw.js` | O app (é o que o GitHub Pages publica) |
| `js/` | Um arquivo por função: `core.js` (base: abrir, desenhar, grifar), `toolbar.js` (barra e menus), `ai.js`, `sync.js`, `today.js` (timer), `estatisticas.js`, `epub.js`… |
| `lib/` | PDF.js e pdf-lib (cópias locais, para funcionar offline) |
| `windows/` | **Versão de testes no Windows**: atalho "Vetra (testes)", "Abrir com", serviço local de backup diário + OCR do Windows |
| `desktop/` | **App instalável para Windows** (Electron): gera o `Vetra-Instalador-x.y.z.exe` |

## Versão de testes (no computador)

1. Dê dois cliques em `windows/Instalar atalho.cmd` (uma vez). Cria o atalho **Vetra (testes)**.
2. Edite os arquivos e reabra o atalho para ver a mudança.

## Publicar no site

1. Aumente a versão em `js/core.js` (`App.VERSION`) **e** em `sw.js` (`VERSION`) — é isso que faz o celular oferecer "Atualizar".
2. Conte o que mudou em `js/news.js`.
3. `git commit` e `git push`: o GitHub Pages publica em ~1 minuto.

## Gerar o instalador para Windows

```bash
cd desktop
npm install          # só na primeira vez
npm run dist         # copia o app atual e gera desktop/dist/Vetra-Instalador-<versão>.exe
```

Antes, ajuste `"version"` em `desktop/package.json` para a mesma do `App.VERSION`.

O app instalado guarda os dados separados da versão de testes, usa o próprio serviço local (porta 47623) e faz backup em `Documentos\Vetra\Backups`.
