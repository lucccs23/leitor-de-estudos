/* Leitor de livros: EPUB lido direto e o "texto corrido" de um PDF.
   O texto se ajusta à tela, com letra, espaço entre linhas, margens, tema e brilho à escolha, em páginas
   (toque nas bordas, deslize ou setas) ou em rolagem, com rolagem automática.
   Sumário, busca no livro, marcadores, grifos com nota (viram cartões da revisão) e "continuar de onde parou".
   Cada capítulo é montado num quadro isolado (iframe sem scripts): o conteúdo do livro nunca roda código. */
(() => {
'use strict';
const App = window.App;
const { el, state, DB, safe, ls } = App;

// ---------- Preferências ----------
const PADRAO = { fonte: 'livro', tam: 100, linha: 1.55, margem: 1, alinhar: 'justify', tema: 'app', brilho: 1, modo: 'paginas', duas: true, estiloLivro: true, acesa: true, vel: 4 };
let opc = { ...PADRAO, ...ls.get('le.leitura', {}) };
const salvarOpc = () => ls.set('le.leitura', opc);
const TEMAS = {
  dia:   { nome: 'Dia',   bg: '#fbfaf6', fg: '#1f1d1a', link: '#4846c4', ui: 'light' },
  sepia: { nome: 'Sépia', bg: '#f3e8d0', fg: '#45362a', link: '#9a5420', ui: 'light' },
  verde: { nome: 'Verde', bg: '#dcebd8', fg: '#1f2f1d', link: '#2f6b3a', ui: 'light' },
  noite: { nome: 'Noite', bg: '#1c1d21', fg: '#cfccc4', link: '#a7a5ff', ui: 'dark' },
  preto: { nome: 'Preto', bg: '#000000', fg: '#b6b3ad', link: '#9d9bff', ui: 'dark' },
};
const DO_APP = { light: 'dia', sepia: 'sepia', dark: 'noite', oled: 'preto', night: 'noite', graphite: 'noite', contrast: 'preto' };
const temaAtual = () => TEMAS[opc.tema] ? opc.tema : (DO_APP[App.currentTheme()] || 'dia');
const FONTES = {
  livro: { nome: 'Do livro', css: '' },
  serif: { nome: 'Serifada', css: 'Georgia,"Iowan Old Style","Noto Serif",Cambria,"Times New Roman",serif' },
  sans:  { nome: 'Sem serifa', css: '"Segoe UI",Roboto,"Noto Sans","Helvetica Neue",Arial,sans-serif' },
  legivel: { nome: 'Legível', css: 'Verdana,"DejaVu Sans",Tahoma,sans-serif' },
};
const LINHAS = [[1.3, 'Justo'], [1.55, 'Normal'], [1.8, 'Largo'], [2.1, 'Bem largo']];
const MARGENS = [[0.5, 'Estreita'], [1, 'Normal'], [1.6, 'Larga']];

// ---------- Estado ----------
let B = null;          // livro aberto: { book, fp, ro, hls, marks, rec, ch, pag, lens }
let seq = 0;           // só o último carregamento de capítulo vale
let carregando = false; // capítulo sendo montado: toques e setas esperam
const blobs = new Map();
let idoc = null, se = null;
const M = { mh: 24, mvT: 24 }; // margens em uso

// ---------- Tela ----------
const ic = n => App.icon(n);
const root = el('section', 'leitor'); root.id = 'leitor'; root.hidden = true;
root.setAttribute('aria-label', 'Leitor de livros');
const frame = el('iframe', 'lrFrame');
frame.setAttribute('sandbox', 'allow-same-origin'); // sem scripts do livro; o Vetra monta e lê o conteúdo
frame.title = 'Texto do livro';
const dim = el('div', 'lrDim');
const top = el('header', 'lrTop'), bot = el('footer', 'lrBot'), mini = el('div', 'lrMini');
const tb = (icon, title, fn, cls = '') => { const b = App.ibtn(icon, null, fn, 'lrB ' + cls, title); return b; };
const ttl = el('div', 'lrTitle'), ttlB = el('b'), ttlS = el('span');
ttl.append(ttlB, ttlS);
const bMarca = tb('bookmark', 'Marcar esta página', () => alternarMarca());
const bAuto = tb('play', 'Rolagem automática', () => autoLigar(!auto), 'lrAuto');
top.append(tb('left', 'Voltar (Esc)', () => fechar()), ttl,
  tb('search', 'Buscar no livro', () => abrirBusca()), bMarca, bAuto,
  tb('list', 'Sumário, marcadores e grifos', () => abrirLado()),
  (() => { const b = el('button', 'btn lrB lrAa'); b.title = 'Letra, tema e página'; b.setAttribute('aria-label', 'Letra, tema e página'); b.textContent = 'Aa'; b.onclick = () => abrirAjustes(); return b; })(),
  tb('more', 'Mais opções', e => menuMais(e.currentTarget)));
const capEl = el('span', 'lrCap'), pagEl = el('span', 'lrPag');
const prog = el('input', 'lrProg'); prog.type = 'range'; prog.min = 0; prog.max = 1000; prog.step = 1; prog.setAttribute('aria-label', 'Posição no livro');
const progTip = el('span', 'lrProgTip');
const info = el('div', 'lrInfo'); info.append(capEl, pagEl);
const linha = el('div', 'lrBarRow'); linha.append(tb('left', 'Página anterior', () => anterior()), prog, tb('right', 'Próxima página', () => proxima()));
bot.append(info, linha, progTip);
const miniCap = el('span', 'lrMiniCap'), miniPct = el('span', 'lrMiniPct'), miniHora = el('span', 'lrMiniHora');
mini.append(miniCap, miniHora, miniPct);
const lado = el('aside', 'lrSide'); lado.hidden = true;
const folha = el('div', 'lrSheet'); folha.hidden = true;
const busca = el('div', 'lrBusca'); busca.hidden = true;
const pop = el('div', 'lrPop'); pop.hidden = true;
const veu = el('div', 'lrVeu'); veu.hidden = true; // fecha painéis ao tocar fora
veu.onclick = () => fecharPaineis();
root.append(frame, dim, mini, top, bot, veu, lado, folha, busca, pop);
document.body.append(root);

const W = () => frame.clientWidth || innerWidth, H = () => frame.clientHeight || innerHeight;
const paginado = () => opc.modo !== 'rolagem';
const duasAgora = () => paginado() && opc.duas && W() >= 900 && W() > H() * 1.05;
let uiT, uiFixa = false;
const mostrarUI = (on, fixa) => { uiFixa = !!(on && fixa); root.classList.toggle('ui', on); if (!on) fecharPop(); };

// ---------- Capítulo no quadro ----------
function preparaQuadro(){
  return new Promise(ok => {
    frame.onload = () => { idoc = frame.contentDocument; se = idoc.scrollingElement || idoc.documentElement; ligarEventos(); ok(); };
    frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><style id="lrCss"></style></head><body></body></html>';
  });
}
const tipoPorNome = p => (/\.svg$/i.test(p) ? 'image/svg+xml' : /\.png$/i.test(p) ? 'image/png' : /\.jpe?g$/i.test(p) ? 'image/jpeg' : /\.gif$/i.test(p) ? 'image/gif' : /\.webp$/i.test(p) ? 'image/webp'
  : /\.css$/i.test(p) ? 'text/css' : /\.woff2$/i.test(p) ? 'font/woff2' : /\.woff$/i.test(p) ? 'font/woff' : /\.[ot]tf$/i.test(p) ? 'font/ttf' : '');
async function urlDe(path){
  if (!blobs.has(path)) {
    const p = (async () => { const d = await B.book.file(path); return d ? URL.createObjectURL(new Blob([d], { type: B.book.typeOf(path) || tipoPorNome(path) })) : ''; })();
    blobs.set(path, p);
  }
  return blobs.get(path);
}
async function cssDoLivro(css, base, fundo = 0){
  const pedidos = [];
  css = css.replace(/@import\s+(?:url\()?\s*['"]?([^'")\s;]+)['"]?\s*\)?[^;]*;/gi, (m, u) => { pedidos.push(u); return ''; });
  const urls = new Set(); css.replace(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi, (m, u) => { if (!/^(data|blob|https?):/i.test(u)) urls.add(u); return m; });
  const mapa = new Map();
  for (const u of urls) mapa.set(u, await urlDe(App.epubResolve(base, u)));
  css = css.replace(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi, (m, u) => mapa.has(u) ? `url("${mapa.get(u)}")` : m);
  let antes = '';
  if (fundo < 3) for (const u of pedidos) { const p = App.epubResolve(base, u), d = await B.book.file(p); if (d) antes += await cssDoLivro(new TextDecoder().decode(d), p, fundo + 1); }
  return antes + css;
}
const XLINK = 'http://www.w3.org/1999/xlink';
async function limparEMontar(doc, href){
  for (const x of doc.querySelectorAll('script,iframe,object,embed,base,meta[http-equiv]')) x.remove();
  for (const x of doc.querySelectorAll('*')) for (const a of [...x.attributes]) if (/^on/i.test(a.name)) x.removeAttribute(a.name);
  if (B.book.kind !== 'epub') return;
  const jobs = [];
  for (const x of doc.querySelectorAll('img[src],video[src],audio[src],source[src],input[src]')) {
    const v = x.getAttribute('src'); if (/^(data|blob|https?):/i.test(v)) continue;
    jobs.push(urlDe(App.epubResolve(href, v)).then(u => x.setAttribute('src', u)));
  }
  for (const x of doc.querySelectorAll('video[poster]')) jobs.push(urlDe(App.epubResolve(href, x.getAttribute('poster'))).then(u => x.setAttribute('poster', u)));
  for (const x of doc.getElementsByTagNameNS('*', 'image')) {
    const v = x.getAttributeNS(XLINK, 'href') || x.getAttribute('href'); if (!v || /^(data|blob):/i.test(v)) continue;
    jobs.push(urlDe(App.epubResolve(href, v)).then(u => { x.setAttributeNS(XLINK, 'xlink:href', u); x.setAttribute('href', u); }));
  }
  for (const x of doc.querySelectorAll('[style*="url("]')) jobs.push(cssDoLivro(x.getAttribute('style'), href).then(c => x.setAttribute('style', c)));
  await Promise.all(jobs);
}

async function carregarCap(i, alvo = {}){
  if (!B) return;
  const n = B.book.spine.length;
  i = Math.max(0, Math.min(n - 1, i));
  const meu = ++seq;
  carregando = true;
  try { await montarCap(i, alvo, meu); } finally { if (meu === seq) carregando = false; }
}
async function montarCap(i, alvo, meu){
  const doc = await B.book.chapterDoc(i);
  const href = B.book.chapterHref(i);
  if (meu !== seq || !B) return;
  await limparEMontar(doc, href);
  let cssLivro = '';
  if (B.book.kind === 'epub' && opc.estiloLivro) {
    for (const x of doc.querySelectorAll('link[rel~="stylesheet"][href], style')) {
      if (x.localName === 'style') cssLivro += await cssDoLivro(x.textContent, href) + '\n';
      else { const p = App.epubResolve(href, x.getAttribute('href')), d = await B.book.file(p); if (d) cssLivro += await cssDoLivro(new TextDecoder().decode(d), p) + '\n'; }
    }
  }
  if (meu !== seq || !B) return;
  if (!idoc || !idoc.body) await preparaQuadro();
  for (const x of idoc.head.querySelectorAll('style.livro')) x.remove();
  if (cssLivro) { const s = idoc.createElement('style'); s.className = 'livro'; s.textContent = cssLivro; idoc.head.insertBefore(s, idoc.getElementById('lrCss')); }
  const corpo = doc.body || doc.getElementsByTagName('body')[0] || doc.documentElement;
  for (const x of corpo.querySelectorAll('style')) x.remove();
  const novo = idoc.importNode(corpo, true);
  if (novo.localName !== 'body') { const b = idoc.createElement('body'); b.append(novo); idoc.body.replaceWith(b); } else idoc.body.replaceWith(novo);
  idoc.documentElement.lang = B.book.lang || 'pt';
  B.ch = i; B.pag = 0; textosCache = null; fragPos = null; B.ancora = alvo.off != null && !alvo.fim && !alvo.frag ? alvo.off : null;
  aplicarCss();
  marcarGrifos();
  for (const im of idoc.images) if (!im.complete) im.addEventListener('load', reajustarDepois, { once: true });
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  if (meu !== seq) return;
  if (alvo.fim) irPag(paginas() - 1, true);
  else if (alvo.frag) { irFrag(alvo.frag); B.ancora = posFrag(alvo.frag); } // subtítulo do sumário: a posição é o próprio subtítulo
  else if (alvo.off) irOff(alvo.off);
  else irPag(0);
  if (alvo.marcar) marcarTemporario(alvo.marcar);
  atualizar();
}

// CSS do Vetra por cima do livro (letra, tema, margens, páginas)
function aplicarCss(){
  if (!idoc) return;
  const t = TEMAS[temaAtual()], f = FONTES[opc.fonte] || FONTES.livro, w = W(), h = H();
  const mh = M.mh = Math.round(Math.max(14, Math.min(72, w * 0.055)) * opc.margem), mvT = M.mvT = Math.round(Math.max(18, Math.min(52, h * 0.045)) * opc.margem), mvB = mvT + 16;
  const duas = duasAgora(), cw = duas ? (w - 4 * mh) / 2 : w - 2 * mh;
  root.dataset.ui = t.ui; root.style.setProperty('--lr-bg', t.bg); root.style.setProperty('--lr-fg', t.fg);
  dim.style.opacity = String(Math.max(0, Math.min(0.75, 1 - opc.brilho)));
  const escuro = t.ui === 'dark';
  idoc.getElementById('lrCss').textContent = `
html{background:${t.bg}!important;color:${t.fg}!important;font-size:${(18 * opc.tam / 100).toFixed(1)}px!important;-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0!important;background:transparent!important;color:${t.fg}!important;font-size:1rem!important;line-height:${opc.linha}!important;overflow-wrap:break-word;-webkit-user-select:text;user-select:text}
${f.css ? `body,body *:not(code):not(pre):not(kbd):not(samp){font-family:${f.css}!important}` : ''}
body p,body li,body dd,body blockquote,body div,body td,body span{line-height:inherit}
body p,body li,body dd,body blockquote{font-size:inherit}
body p{text-align:${opc.alinhar === 'justify' ? 'justify' : 'left'}!important;${opc.alinhar === 'justify' ? 'hyphens:auto;-webkit-hyphens:auto;' : ''}}
${escuro || !opc.estiloLivro ? `body *{color:inherit!important;background-color:transparent!important;border-color:color-mix(in srgb,currentColor 30%,transparent)!important}` : ''}
a,a *{color:${t.link}!important}
img,svg,video{max-width:100%!important;height:auto;max-height:${h - mvT - mvB - 8}px!important;object-fit:contain;break-inside:avoid}
${escuro ? 'img{filter:brightness(.88)}' : ''}
h1,h2,h3,h4,h5,h6{break-after:avoid;line-height:1.25!important;text-align:left}
table{max-width:100%;border-collapse:collapse}
pre{white-space:pre-wrap!important}
::selection{background:${escuro ? 'rgba(167,165,255,.35)' : 'rgba(88,86,214,.22)'}}
mark.lrHl{color:inherit!important;border-radius:2px;cursor:pointer;padding:0 0 .05em}
mark.lrHl.u{background:transparent!important;text-decoration:underline 2.5px var(--c);text-underline-offset:3px}
mark.lrHl.nota{box-shadow:inset 0 -2px 0 color-mix(in srgb,var(--c) 90%,#000)}
mark.lrTemp{background:${escuro ? 'rgba(255,214,0,.35)' : 'rgba(255,210,0,.5)'}!important;color:inherit!important;border-radius:2px}
.vetraPg{display:block;text-align:center;font:600 .72rem/1 system-ui,sans-serif!important;opacity:.45;margin:1.2em 0;letter-spacing:.04em;text-indent:0!important}
${paginado() ? `html{height:100vh!important;overflow:hidden!important}
html{touch-action:pan-y pinch-zoom}
body{box-sizing:border-box!important;height:100vh!important;max-width:none!important;padding:${mvT}px ${mh}px ${mvB}px!important;column-width:${cw}px!important;column-gap:${2 * mh}px!important;column-fill:auto!important;column-count:auto!important}`
  : `html{overflow-y:auto!important;overflow-x:hidden!important}
body{box-sizing:border-box!important;max-width:${Math.max(560, Math.min(w, 760))}px!important;margin:0 auto!important;padding:${mvT}px ${mh}px ${mvB + 40}px!important}`}`;
}

// ---------- Páginas ----------
const passo = () => W(); // uma "tela" (uma ou duas colunas)
function paginas(){ if (!se || !paginado()) return 1; return Math.max(1, Math.round((se.scrollWidth - 2) / passo() + 0.49)); }
function irPag(k, fimDoCap){
  if (!se) return;
  if (!paginado()) { se.scrollTop = fimDoCap ? se.scrollHeight : 0; B.pag = 0; return; }
  B.pag = Math.max(0, Math.min(paginas() - 1, k));
  se.scrollLeft = B.pag * passo();
}
function pagDoRetangulo(r){ return paginado() ? Math.floor((r.left + se.scrollLeft + 1) / passo()) : 0; }
function irOff(off){
  const [n, o] = pontoDe(off);
  const r = idoc.createRange(); try { r.setStart(n, o); r.setEnd(n, Math.min(n.length || 0, o + 1)); } catch { return irPag(0); }
  const q = r.getClientRects()[0] || (n.parentElement && n.parentElement.getBoundingClientRect());
  if (!q) return irPag(0);
  if (paginado()) irPag(pagDoRetangulo(q)); else se.scrollTop += q.top - 30;
}
function irFrag(frag){
  const x = idoc.getElementById(frag) || idoc.querySelector(`[name="${CSS.escape(frag)}"]`);
  if (!x) return irPag(0);
  const q = x.getBoundingClientRect();
  if (paginado()) irPag(pagDoRetangulo(q)); else se.scrollTop += q.top - 20;
}
// primeiro caractere visível na tela (a posição fica guardada assim, e não pelo número da página,
// que muda quando a letra ou a tela mudam)
// (mede onde as letras estão; o "que letra está neste ponto" do navegador erra quando o texto está em colunas)
function offAtual(){
  if (!idoc || !idoc.body) return 0;
  const ts = textos(); if (!ts.length) return 0;
  const rg = idoc.createRange();
  // -1: antes da tela (páginas anteriores ou acima), 0: na tela, 1: depois, null: sem caixa (espaço entre blocos)
  const lado = q => paginado() ? (q.right <= 1 ? -1 : q.left >= W() - 1 ? 1 : 0) : (q.bottom <= 1 ? -1 : q.top >= H() - 1 ? 1 : 0);
  const ladoNo = t => {
    rg.selectNodeContents(t);
    const qs = [...rg.getClientRects()].filter(q => q.width || q.height);
    if (!qs.length) return null;
    const ls = qs.map(lado);
    return ls.includes(0) || (ls.includes(-1) && ls.includes(1)) ? 0 : ls[0];
  };
  // busca binária pelo primeiro trecho que não está antes da tela (o texto segue a ordem de leitura)
  let a = 0, b = ts.length - 1, achou = -1;
  while (a <= b) {
    let m = (a + b) >> 1, s = ladoNo(ts[m]);
    for (let k = m + 1; s === null && k <= b; k++) { m = k; s = ladoNo(ts[k]); }
    if (s === null) { b = ((a + b) >> 1) - 1; continue; }
    if (s < 0) a = m + 1; else { achou = m; b = m - 1; }
  }
  if (achou < 0) return totalCap();
  let base = 0; for (let i = 0; i < achou; i++) base += ts[i].length;
  const t = ts[achou];
  // dentro do trecho: primeira letra que não está antes da tela
  let lo = 0, hi = t.length - 1, i0 = 0;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    rg.setStart(t, m); rg.setEnd(t, m + 1);
    const q = rg.getClientRects()[0];
    if (q && lado(q) < 0) lo = m + 1; else { i0 = m; hi = m - 1; }
  }
  return base + i0;
}
let textosCache = null;
function textos(){
  if (textosCache) return textosCache;
  const w = idoc.createTreeWalker(idoc.body, NodeFilter.SHOW_TEXT, { acceptNode: n => /^(style|script)$/i.test(n.parentNode && n.parentNode.localName) || n.parentNode.closest?.('.vetraPg') ? 2 : 1 });
  const out = []; while (w.nextNode()) out.push(w.currentNode);
  return (textosCache = out);
}
const totalCap = () => textos().reduce((s, t) => s + t.length, 0);
function posDe(node, off){
  const R = idoc.createRange();
  try { R.setStart(node, off); } catch { return 0; }
  let n = 0;
  for (const t of textos()) {
    if (t === node) return n + Math.min(off, t.length);
    if (R.comparePoint(t, t.length) < 0) n += t.length; else return n;
  }
  return n;
}
function pontoDe(pos){
  let n = 0; const ts = textos();
  for (const t of ts) { if (pos <= n + t.length) return [t, Math.max(0, pos - n)]; n += t.length; }
  const l = ts[ts.length - 1]; return l ? [l, l.length] : [idoc.body, 0];
}

async function proxima(){
  if (!B) return false;
  if (carregando) return true; // a rolagem automática continua
  fecharPop(); B.ancora = null;
  if (paginado()) {
    if (B.pag < paginas() - 1) { irPag(B.pag + 1); atualizar(); return true; }
  } else if (se.scrollTop + se.clientHeight < se.scrollHeight - 4) { se.scrollTop += se.clientHeight * 0.9; atualizar(); return true; }
  if (B.ch < B.book.spine.length - 1) { await carregarCap(B.ch + 1); return true; }
  App.toast('Fim do livro'); return false;
}
async function anterior(){
  if (!B || carregando) return;
  fecharPop(); B.ancora = null;
  if (paginado()) {
    if (B.pag > 0) { irPag(B.pag - 1); atualizar(); return; }
  } else if (se.scrollTop > 4) { se.scrollTop -= se.clientHeight * 0.9; atualizar(); return; }
  if (B.ch > 0) await carregarCap(B.ch - 1, { fim: true });
}
let reajT;
function reajustarDepois(){ clearTimeout(reajT); reajT = setTimeout(reajustar, 120); }
function reajustar(){
  if (!B || !idoc) return;
  // o ponto de leitura fica fixo enquanto só a letra, a margem ou a tela mudam (sem ir recuando a cada ajuste)
  const off = B.ancora != null ? B.ancora : offAtual();
  B.ancora = off;
  aplicarCss(); textosCache = null; reajustando = true;
  requestAnimationFrame(() => { irOff(off); atualizar(); setTimeout(() => { reajustando = false; }, 200); });
}
new ResizeObserver(() => { if (B && !root.hidden) reajustarDepois(); }).observe(root);

// ---------- Progresso ----------
let fragPos = null; // posição dos subtítulos do capítulo aberto
function posFrag(frag){
  if (!fragPos) fragPos = new Map();
  if (!fragPos.has(frag)) { const x = idoc && (idoc.getElementById(frag)); fragPos.set(frag, x ? posDe(x, 0) : 0); }
  return fragPos.get(frag);
}
function capituloDe(ch, off){
  let t = null;
  for (const x of B.book.toc) {
    if (x.ch > ch) continue;
    if (x.ch === ch && x.frag && ch === B.ch && idoc && off != null && posFrag(x.frag) > off) continue;
    if (!t || x.ch >= t.ch) t = x;
  }
  return t ? t.title : (B.book.spine.length > 1 ? `Capítulo ${ch + 1}` : '');
}
function pctDe(ch, off){
  if (!B.lens) return (ch + Math.min(1, off / Math.max(1, totalCap()))) / B.book.spine.length;
  const tot = B.lens.reduce((a, b) => a + b, 0) || 1;
  return (B.lens.slice(0, ch).reduce((a, b) => a + b, 0) + Math.min(off, B.lens[ch] || 0)) / tot;
}
function deOnde(p){ // fração do livro → capítulo e posição
  if (!B.lens) { const c = Math.min(B.book.spine.length - 1, Math.floor(p * B.book.spine.length)); return { ch: c, off: 0 }; }
  const tot = B.lens.reduce((a, b) => a + b, 0); let alvo = p * tot;
  for (let c = 0; c < B.lens.length; c++) { if (alvo <= B.lens[c] || c === B.lens.length - 1) return { ch: c, off: Math.max(0, Math.round(alvo)) }; alvo -= B.lens[c]; }
  return { ch: 0, off: 0 };
}
let salvarT;
function atualizar(){
  if (!B || !idoc) return;
  B.off = B.ancora != null ? B.ancora : offAtual();
  const pct = pctDe(B.ch, B.off);
  B.pct = pct;
  const cap = capituloDe(B.ch, B.off);
  capEl.textContent = cap; miniCap.textContent = cap;
  const n = paginas();
  pagEl.textContent = paginado() ? (n - B.pag - 1 > 0 ? `${App.plural(n - B.pag - 1, 'página falta', 'páginas faltam')} no capítulo` : 'Última página do capítulo') : '';
  miniPct.textContent = Math.floor(pct * 1000) / 10 + '%';
  if (!prog.matches(':active')) prog.value = Math.round(pct * 1000);
  bMarca.classList.toggle('on', !!marcaAqui());
  miniHora.textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  clearTimeout(salvarT); salvarT = setTimeout(salvarPosicao, 600);
}
prog.addEventListener('input', () => { if (B) { const d = deOnde(prog.value / 1000); progTip.textContent = capituloDe(d.ch) + ' · ' + Math.round(prog.value / 10) + '%'; progTip.classList.add('on'); } });
prog.addEventListener('change', async () => { progTip.classList.remove('on'); if (!B) return; const d = deOnde(prog.value / 1000); await carregarCap(d.ch, { off: d.off }); });

async function salvarPosicao(){
  if (!B) return;
  const pos = { ch: B.ch, off: B.off || 0, pct: B.pct || 0 };
  if (B.ro) { ls.set('le.txt:' + B.fp, pos); return; }
  B.rec.epub = pos;
  const visitados = B.rec.visited || [];
  if (!visitados.includes(B.ch + 1)) visitados.push(B.ch + 1);
  B.rec.visited = visitados;
  await App.patchDoc(B.fp, { epub: pos, pct: Math.round(pos.pct * 100), lastPage: B.ch + 1, visited: visitados, ts: Date.now() });
}
async function salvarLivro(){
  if (!B || B.ro) return;
  await App.patchDoc(B.fp, { highlights: B.hls, bookmarks: B.marks, time: B.rec.time || {}, lens: B.lens || undefined });
  App.emit('hl:changed');
}
const salvarLivroLogo = (() => { let t; return () => { clearTimeout(t); t = setTimeout(salvarLivro, 300); }; })();

// tamanho de cada capítulo (para a % do livro e a barra de posição): calculado uma vez, em segundo plano
async function medirCapitulos(){
  const meu = B;
  if (meu.lens && meu.lens.length === meu.book.spine.length) return;
  const lens = [];
  for (let i = 0; i < meu.book.spine.length; i++) {
    const d = await meu.book.chapterDoc(i);
    const b = d.body || d.documentElement;
    for (const x of b.querySelectorAll('style,script')) x.remove();
    lens.push((b.textContent || '').length);
    if (B !== meu) return;
  }
  meu.lens = lens;
  if (!meu.ro) App.patchDoc(meu.fp, { lens });
  atualizar();
}

// capa do livro na página inicial
async function guardarCapa(){
  const meu = B;
  if (meu.ro || meu.rec.thumb || !meu.book.cover) return;
  const u = await urlDe(meu.book.cover); if (!u) return;
  const im = new Image();
  await new Promise(r => { im.onload = r; im.onerror = r; im.src = u; });
  if (!im.naturalWidth || B !== meu) return;
  const c = document.createElement('canvas'), w = 180; c.width = w; c.height = Math.round(w * im.naturalHeight / im.naturalWidth);
  c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
  const thumb = c.toDataURL('image/jpeg', 0.8);
  meu.rec.thumb = thumb;
  await App.patchDoc(meu.fp, { thumb });
}

// ---------- Toques, cliques e teclas no texto ----------
let down = null, rodaT = 0, selT = null;
function ligarEventos(){
  idoc.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: Date.now(), tipo: e.pointerType }; atividade(); if (auto && e.pointerType !== 'mouse') autoLigar(false); }, true);
  idoc.addEventListener('pointerup', aoSoltar, true);
  App.spenOuvir?.(idoc); // botão da S Pen dentro do livro (próxima/anterior)
  idoc.addEventListener('pointercancel', () => { if (down) down.cancelado = true; }, true);
  idoc.addEventListener('touchend', e => {
    const t = e.changedTouches && e.changedTouches[0];
    if (!down || !down.cancelado || !t) return;
    const d = down; down = null;
    const dx = t.clientX - d.x, dy = t.clientY - d.y;
    if (paginado() && !temSelecao() && Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3 && Date.now() - d.t < 900) { if (dx < 0) proxima(); else anterior(); }
  }, true);
  idoc.addEventListener('mousemove', e => {
    if (App.isTouch) return;
    const perto = e.clientY < 64 || e.clientY > H() - 84;
    clearTimeout(uiT);
    if (perto) mostrarUI(true); else if (root.classList.contains('ui') && !uiFixa) uiT = setTimeout(() => mostrarUI(false), 900);
  });
  idoc.addEventListener('click', e => { if (e.target.closest && e.target.closest('a[href]')) e.preventDefault(); }, true);
  idoc.addEventListener('wheel', e => {
    atividade();
    if (!paginado() || e.ctrlKey) return;
    e.preventDefault();
    const agora = Date.now(); if (agora - rodaT < 260) return; rodaT = agora;
    const d = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (d > 0) proxima(); else if (d < 0) anterior();
  }, { passive: false });
  idoc.addEventListener('scroll', () => { if (!paginado() && !reajustando) { B.ancora = null; clearTimeout(rolT); rolT = setTimeout(atualizar, 150); } });
  idoc.addEventListener('keydown', teclas);
  idoc.addEventListener('selectionchange', () => {
    clearTimeout(selT);
    if (!down || down.tipo !== 'mouse') selT = setTimeout(() => { if (temSelecao()) mostrarPopSel(); }, 650);
  });
  idoc.addEventListener('contextmenu', e => { if (temSelecao()) e.preventDefault(); });
}
let rolT, reajustando = false;
const temSelecao = () => { const s = idoc && idoc.getSelection(); return !!(s && !s.isCollapsed && s.toString().trim()); };
function aoSoltar(e){
  const d = down; down = null;
  if (!d) return;
  const dx = e.clientX - d.x, dy = e.clientY - d.y, dt = Date.now() - d.t;
  const m = e.target.closest && e.target.closest('mark.lrHl');
  if (temSelecao()) { if (d.tipo === 'mouse') setTimeout(() => temSelecao() && mostrarPopSel(), 10); return; }
  if (!pop.hidden) { fecharPop(); return; }
  if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3 && dt < 800 && paginado()) { if (dx < 0) proxima(); else anterior(); return; }
  if (Math.abs(dx) > 10 || Math.abs(dy) > 10 || dt > 600) return;
  if (m) { editarGrifo(m.dataset.id, m); return; }
  const a = e.target.closest && e.target.closest('a[href]');
  if (a) { seguirLink(a.getAttribute('href')); return; }
  if (e.button > 0) return;
  const fx = e.clientX / W();
  if (root.classList.contains('ui') && !(fx < 0.22 || fx > 0.78)) { mostrarUI(false); return; }
  if (fx < 0.3) anterior(); else if (fx > 0.7) proxima(); else mostrarUI(!root.classList.contains('ui'), true);
}
function seguirLink(href){
  if (/^(https?|mailto):/i.test(href)) { App.openExternal ? App.openExternal(href) : window.open(href, '_blank', 'noopener'); return; }
  const atual = B.book.chapterHref(B.ch);
  const alvo = href.startsWith('#') ? atual : App.epubResolve(atual, href), frag = (href.split('#')[1] || '');
  const ch = B.book.spine.findIndex(s => s.href === alvo);
  if (ch < 0) return;
  if (ch === B.ch) { if (frag) { irFrag(frag); atualizar(); } } else carregarCap(ch, { frag });
}
function teclas(e){
  if (!B || root.hidden) return;
  if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.ownerDocument === document) { if (e.key === 'Escape') { fecharPaineis(); e.preventDefault(); } return; }
  const k = e.key;
  if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!pop.hidden || !lado.hidden || !folha.hidden || !busca.hidden) fecharPaineis(); else fechar(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) { if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'f') { e.preventDefault(); abrirBusca(); } return; }
  if (['ArrowRight', 'PageDown', ' '].includes(k) && !(k === ' ' && !paginado())) { e.preventDefault(); e.stopPropagation(); proxima(); }
  else if (['ArrowLeft', 'PageUp'].includes(k)) { e.preventDefault(); e.stopPropagation(); anterior(); }
  else if (k === 'ArrowDown' && paginado()) { e.preventDefault(); proxima(); }
  else if (k === 'ArrowUp' && paginado()) { e.preventDefault(); anterior(); }
  else if (k === 'Home') { e.preventDefault(); carregarCap(0); }
  else if (k === 'End') { e.preventDefault(); carregarCap(B.book.spine.length - 1, { fim: true }); }
  else if (k.toLowerCase() === 'b') { e.preventDefault(); alternarMarca(); }
  else if (k.toLowerCase() === 'm') { e.preventDefault(); mostrarUI(!root.classList.contains('ui')); }
  else return;
  atividade();
}
document.addEventListener('keydown', e => { if (B && !root.hidden && !document.querySelector('dialog[open]') && !App.reviewOpen) teclas(e); }, true);

// ---------- Selecionar texto: grifar, nota, copiar ----------
function retanguloNaTela(r){
  const q = r.getBoundingClientRect(), f = frame.getBoundingClientRect();
  return { left: q.left + f.left, right: q.right + f.left, top: q.top + f.top, bottom: q.bottom + f.top };
}
function posicionarPop(q){
  pop.hidden = false;
  const w = pop.offsetWidth, h = pop.offsetHeight;
  let x = (q.left + q.right) / 2 - w / 2, y = q.top - h - 10;
  if (y < 56) y = q.bottom + 12;
  x = Math.max(8, Math.min(innerWidth - w - 8, x)); y = Math.max(8, Math.min(innerHeight - h - 8, y));
  pop.style.left = x + 'px'; pop.style.top = y + 'px';
}
function bolinhas(onPick, atual){
  const row = el('div', 'lrCores');
  for (const c of App.COLORS) {
    const b = el('button', 'lrCor' + (c.id === atual ? ' on' : '')); b.style.background = c.hex; b.title = App.labelOf(c.id); b.setAttribute('aria-label', 'Grifar: ' + App.labelOf(c.id));
    b.onclick = e => { e.stopPropagation(); onPick(c.id); };
    row.append(b);
  }
  return row;
}
function mostrarPopSel(){
  if (!temSelecao()) return;
  const sel = idoc.getSelection(), r = sel.getRangeAt(0);
  if (!B.ro && state.autoHL) { criarGrifo(state.color); return; }
  pop.innerHTML = '';
  if (!B.ro) pop.append(bolinhas(c => criarGrifo(c)));
  const acts = el('div', 'lrPopActs');
  if (!B.ro) acts.append(App.ibtn('note', 'Nota', () => { const h = criarGrifo(state.color, true); if (h) editarGrifo(h.id, null, true); }, 'sm'));
  acts.append(App.ibtn('copy', 'Copiar', () => { App.copyText(sel.toString().replace(/\s+/g, ' ').trim()); sel.removeAllRanges(); fecharPop(); }, 'sm'));
  acts.append(App.ibtn('search', 'Buscar', () => { const q = sel.toString().replace(/\s+/g, ' ').trim().slice(0, 80); sel.removeAllRanges(); fecharPop(); abrirBusca(q); }, 'sm'));
  pop.append(acts);
  posicionarPop(retanguloNaTela(r));
}
function fecharPop(){ pop.hidden = true; pop.innerHTML = ''; }

function corDe(h){ return App.colorOf(h.color).hex; }
function estiloMark(m, h){
  const c = corDe(h);
  m.style.setProperty('--c', c);
  m.style.backgroundColor = h.style === 'underline' ? 'transparent' : c + (TEMAS[temaAtual()].ui === 'dark' ? '55' : '70');
  m.classList.toggle('u', h.style === 'underline');
  m.classList.toggle('nota', !!h.note);
  m.title = h.note ? h.note : '';
}
function envolver(h){
  if (!h.ep || h.ep.ch !== B.ch) return;
  const [sn, so] = pontoDe(h.ep.s), [en, eo] = pontoDe(h.ep.e);
  const alvo = []; let on = false;
  for (const t of textos()) { if (t === sn) on = true; if (on) alvo.push(t); if (t === en) break; }
  for (const t of alvo) {
    const a = t === sn ? so : 0, b = t === en ? eo : t.length;
    if (b <= a) continue;
    let x = t;
    if (a > 0) x = x.splitText(a);
    if (b - a < x.length) x.splitText(b - a);
    if (!x.data.trim() && /^(table|tbody|thead|tr|ul|ol|dl|body|section|div)$/i.test(x.parentNode.localName)) continue;
    const m = idoc.createElement('mark'); m.className = 'lrHl'; m.dataset.id = h.id; estiloMark(m, h);
    x.parentNode.insertBefore(m, x); m.append(x);
  }
  textosCache = null;
}
function desenvolver(id){
  for (const m of idoc.querySelectorAll(`mark.lrHl[data-id="${CSS.escape(id)}"]`)) m.replaceWith(...m.childNodes);
  idoc.body.normalize(); textosCache = null;
}
function marcarGrifos(){ if (B.ro) return; for (const h of B.hls) envolver(h); }
function marcarTemporario({ s, e }){
  for (const m of idoc.querySelectorAll('mark.lrTemp')) m.replaceWith(...m.childNodes);
  const [sn, so] = pontoDe(s), [en, eo] = pontoDe(e);
  try {
    const r = idoc.createRange(); r.setStart(sn, so); r.setEnd(en, eo);
    const m = idoc.createElement('mark'); m.className = 'lrTemp';
    m.append(r.extractContents()); r.insertNode(m);
  } catch {}
  textosCache = null;
  setTimeout(() => { if (!idoc) return; for (const m of idoc.querySelectorAll('mark.lrTemp')) m.replaceWith(...m.childNodes); idoc.body.normalize(); textosCache = null; }, 2500);
}
function criarGrifo(color, comNota){
  if (!temSelecao() || B.ro) return null;
  const sel = idoc.getSelection(), r = sel.getRangeAt(0);
  let s = posDe(r.startContainer, r.startOffset), e = posDe(r.endContainer, r.endOffset);
  if (e <= s) return null;
  // grifo por cima de grifo: vira um só
  const juntos = B.hls.filter(h => h.ep && h.ep.ch === B.ch && h.ep.s < e && h.ep.e > s);
  let nota = '';
  for (const h of juntos) { s = Math.min(s, h.ep.s); e = Math.max(e, h.ep.e); if (h.note) nota += (nota ? '\n' : '') + h.note; desenvolver(h.id); }
  B.hls = B.hls.filter(h => !juntos.includes(h));
  const [sn, so] = pontoDe(s), [en, eo] = pontoDe(e);
  let text;
  try { const q = idoc.createRange(); q.setStart(sn, so); q.setEnd(en, eo); text = q.toString().replace(/\s+/g, ' ').trim(); } catch { text = sel.toString().replace(/\s+/g, ' ').trim(); }
  const h = App.normHl({ id: App.uid(), kind: 'text', style: state.style === 'underline' ? 'underline' : 'fill', color, text, note: nota, created: Date.now(),
    ep: { ch: B.ch, s, e }, parts: [{ page: B.ch + 1, rects: [] }], cap: capituloDe(B.ch) });
  if (juntos[0] && juntos[0].srs) h.srs = juntos[0].srs;
  B.hls.push(h); state.color = color;
  sel.removeAllRanges(); fecharPop();
  envolver(h); salvarLivroLogo();
  if (!comNota) App.toast(juntos.length ? 'Grifos juntados num só' : 'Grifado');
  return h;
}
function editarGrifo(id, m, focarNota){
  const h = B.hls.find(x => x.id === id); if (!h) return;
  m = m || idoc.querySelector(`mark.lrHl[data-id="${CSS.escape(id)}"]`);
  pop.innerHTML = '';
  pop.append(bolinhas(c => { h.color = c; for (const x of idoc.querySelectorAll(`mark.lrHl[data-id="${CSS.escape(id)}"]`)) estiloMark(x, h); salvarLivroLogo(); }, h.color));
  const nota = el('textarea', 'lrNota'); nota.placeholder = 'Escreva uma nota…'; nota.value = h.note || ''; nota.rows = 3;
  nota.oninput = () => { h.note = nota.value; for (const x of idoc.querySelectorAll(`mark.lrHl[data-id="${CSS.escape(id)}"]`)) estiloMark(x, h); salvarLivroLogo(); };
  nota.onkeydown = e => { e.stopPropagation(); if (e.key === 'Escape') fecharPop(); };
  pop.append(nota);
  const acts = el('div', 'lrPopActs');
  acts.append(App.ibtn('text', h.style === 'underline' ? 'Preencher' : 'Sublinhar', () => {
    h.style = h.style === 'underline' ? 'fill' : 'underline';
    for (const x of idoc.querySelectorAll(`mark.lrHl[data-id="${CSS.escape(id)}"]`)) estiloMark(x, h); salvarLivroLogo(); editarGrifo(id);
  }, 'sm'));
  acts.append(App.ibtn('copy', 'Copiar', () => { App.copyText(h.text + (h.note ? '\n\nNota: ' + h.note : '')); fecharPop(); }, 'sm'));
  acts.append(App.ibtn('trash', 'Apagar', () => { desenvolver(h.id); B.hls = B.hls.filter(x => x !== h); salvarLivroLogo(); fecharPop(); App.toast('Grifo apagado'); }, 'sm danger'));
  pop.append(acts);
  posicionarPop(m ? retanguloNaTela(m) : { left: innerWidth / 2, right: innerWidth / 2, top: innerHeight / 3, bottom: innerHeight / 3 });
  if (focarNota) setTimeout(() => nota.focus(), 30);
}

// ---------- Marcadores ----------
function marcaAqui(){
  if (!B || !idoc) return null;
  return B.marks.find(m => m.ch === B.ch && pagDe(m.off) === (paginado() ? B.pag : pagDe(B.off)));
}
function pagDe(off){
  if (!paginado()) return Math.round(off / 400);
  const [n, o] = pontoDe(off);
  try { const r = idoc.createRange(); r.setStart(n, o); r.setEnd(n, Math.min(n.length, o + 1)); const q = r.getClientRects()[0]; return q ? pagDoRetangulo(q) : -1; } catch { return -1; }
}
function alternarMarca(){
  if (!B) return;
  if (B.ro) { App.toast('No texto corrido os marcadores ficam no PDF.'); return; }
  const m = marcaAqui();
  if (m) { B.marks = B.marks.filter(x => x !== m); App.toast('Marcador removido'); }
  else {
    const [n, o] = pontoDe(B.off || 0);
    const trecho = (n.data || '').slice(o, o + 90).replace(/\s+/g, ' ').trim();
    B.marks.push({ id: App.uid(), ch: B.ch, off: B.off || 0, label: trecho || capituloDe(B.ch), cap: capituloDe(B.ch), created: Date.now(), page: B.ch + 1 });
    App.toast('Página marcada');
  }
  salvarLivroLogo(); atualizar();
}

// ---------- Painel: sumário, marcadores, grifos ----------
let abaLado = 'sumario';
function abrirLado(aba){
  if (aba) abaLado = aba;
  fecharPaineis(); veu.hidden = false; lado.hidden = false; mostrarUI(false);
  desenharLado();
}
function desenharLado(){
  lado.innerHTML = '';
  const cab = el('div', 'lrSideTop');
  cab.append(el('b', null, B.book.name || 'Livro'), App.ibtn('x', null, fecharPaineis, 'sm lrB', 'Fechar'));
  if (B.book.author) cab.append(el('span', 'muted small', B.book.author));
  const abas = el('div', 'lrTabs');
  const abaB = (id, nome, n) => { const b = el('button', 'lrTab' + (abaLado === id ? ' on' : ''), nome + (n ? ` (${n})` : '')); b.onclick = () => { abaLado = id; desenharLado(); }; return b; };
  abas.append(abaB('sumario', 'Sumário'));
  if (!B.ro) abas.append(abaB('marcas', 'Marcadores', B.marks.length), abaB('grifos', 'Grifos', B.hls.length));
  const lista = el('div', 'lrList');
  if (abaLado === 'sumario') {
    const itens = B.book.toc.length ? B.book.toc : B.book.spine.map((s, i) => ({ title: `Capítulo ${i + 1}`, ch: i, level: 0 }));
    let atual = null; for (const t of itens) if (t.ch <= B.ch) atual = t;
    for (const t of itens) {
      const b = el('button', 'lrItem' + (t === atual ? ' on' : '')); b.style.paddingLeft = 14 + Math.min(4, t.level || 0) * 16 + 'px';
      b.append(el('span', null, t.title));
      if (B.lens) { const p = pctDe(t.ch, 0); b.append(el('small', null, Math.round(p * 100) + '%')); }
      b.onclick = () => { fecharPaineis(); carregarCap(t.ch, { frag: t.frag }); };
      lista.append(b);
    }
    setTimeout(() => lista.querySelector('.on')?.scrollIntoView({ block: 'center' }), 0);
  } else if (abaLado === 'marcas') {
    if (!B.marks.length) lista.append(App.emptyState('bookmark', 'Nenhum marcador', 'Toque no marcador lá em cima (ou aperte B) para marcar a página.'));
    for (const m of [...B.marks].sort((a, b) => a.ch - b.ch || a.off - b.off)) {
      const b = el('div', 'lrItem rich');
      const t = el('div', 'lrItemTxt'); t.append(el('small', null, m.cap || capituloDe(m.ch)), el('span', null, m.label));
      t.onclick = () => { fecharPaineis(); carregarCap(m.ch, { off: m.off }); };
      b.append(t, App.ibtn('x', null, () => { B.marks = B.marks.filter(x => x !== m); salvarLivroLogo(); desenharLado(); atualizar(); }, 'sm lrB', 'Apagar marcador'));
      lista.append(b);
    }
  } else {
    if (!B.hls.length) lista.append(App.emptyState('highlighter', 'Nenhum grifo', 'Selecione um trecho e escolha uma cor. Os grifos viram cartões da revisão.'));
    else {
      const topo = el('div', 'lrListActs');
      topo.append(App.ibtn('cards', 'Revisar', () => { fecharPaineis(); App.openReview(); }, 'sm'), App.ibtn('markdown', 'Exportar', () => exportarGrifos(), 'sm'));
      lista.append(topo);
    }
    for (const h of [...B.hls].sort((a, b) => a.ep.ch - b.ep.ch || a.ep.s - b.ep.s)) {
      const b = el('div', 'lrItem rich hl'); b.style.setProperty('--c', corDe(h));
      const t = el('div', 'lrItemTxt'); t.append(el('small', null, h.cap || capituloDe(h.ep.ch)), el('span', null, h.text));
      if (h.note) t.append(el('em', null, h.note));
      t.onclick = () => { fecharPaineis(); irParaGrifo(h); };
      b.append(t);
      lista.append(b);
    }
  }
  lado.append(cab, abas, lista);
}
async function irParaGrifo(h){
  if (!B || !h.ep) return;
  if (h.ep.ch !== B.ch) await carregarCap(h.ep.ch, { off: h.ep.s }); else { irOff(h.ep.s); atualizar(); }
  const m = idoc.querySelector(`mark.lrHl[data-id="${CSS.escape(h.id)}"]`);
  if (m) { m.animate([{ outline: '3px solid ' + corDe(h) }, { outline: '3px solid transparent' }], { duration: 1400 }); }
}
function exportarGrifos(){
  const linhas = [`# ${B.book.name}`, B.book.author ? `*${B.book.author}*` : '', ''];
  let cap = null;
  for (const h of [...B.hls].sort((a, b) => a.ep.ch - b.ep.ch || a.ep.s - b.ep.s)) {
    const c = h.cap || capituloDe(h.ep.ch);
    if (c !== cap) { linhas.push(`## ${c}`, ''); cap = c; }
    linhas.push(`> ${h.text}`, `— ${App.labelOf(h.color)}`, ''); if (h.note) linhas.push(`Nota: ${h.note}`, '');
  }
  App.download(linhas.join('\n'), `${B.book.name.replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 80)} - grifos.md`, 'text/markdown');
}

// ---------- Busca no livro ----------
let textosLivro = null;
async function abrirBusca(q){
  fecharPaineis(); veu.hidden = false; busca.hidden = false; mostrarUI(false);
  busca.innerHTML = '';
  const linhaB = el('div', 'lrBuscaTop');
  const inp = el('input', 'lrBuscaIn'); inp.type = 'search'; inp.placeholder = 'Buscar no livro'; inp.value = q || '';
  const res = el('div', 'lrList');
  linhaB.append(App.icon('search'), inp, App.ibtn('x', null, fecharPaineis, 'sm lrB', 'Fechar'));
  busca.append(linhaB, res);
  let t;
  const rodar = async () => {
    const termo = inp.value.trim(); res.innerHTML = '';
    if (termo.length < 2) return;
    res.append(el('p', 'muted small pad', 'Buscando…'));
    if (!textosLivro || textosLivro.fp !== B.fp) {
      const meu = B, arr = [];
      for (let i = 0; i < meu.book.spine.length; i++) { const d = await meu.book.chapterDoc(i); const b = d.body || d.documentElement; for (const x of b.querySelectorAll('style,script')) x.remove(); arr.push(b.textContent || ''); }
      if (B !== meu) return;
      textosLivro = { fp: meu.fp, arr, dobrado: arr.map(App.fold) };
    }
    if (termo !== inp.value.trim()) return;
    res.innerHTML = '';
    const alvo = App.fold(termo); let n = 0;
    for (let c = 0; c < textosLivro.arr.length && n < 300; c++) {
      const f = textosLivro.dobrado[c], s = textosLivro.arr[c];
      let i = f.indexOf(alvo);
      while (i >= 0 && n < 300) {
        n++;
        const b = el('button', 'lrItem rich');
        const tx = el('div', 'lrItemTxt'); tx.append(el('small', null, capituloDe(c)));
        const sp = el('span'); const a = Math.max(0, i - 60);
        sp.append((a > 0 ? '…' : '') + s.slice(a, i).replace(/\s+/g, ' '), el('mark', null, s.slice(i, i + termo.length)), s.slice(i + termo.length, i + termo.length + 80).replace(/\s+/g, ' ') + '…');
        tx.append(sp); b.append(tx);
        const ch = c, off = i, len = termo.length;
        b.onclick = () => { fecharPaineis(); carregarCap(ch, { off, marcar: { s: off, e: off + len } }); };
        res.append(b);
        i = f.indexOf(alvo, i + alvo.length);
      }
    }
    res.prepend(el('p', 'muted small pad', n ? `${n >= 300 ? 'Mais de 300' : n} resultado(s)` : 'Nada encontrado.'));
  };
  inp.oninput = () => { clearTimeout(t); t = setTimeout(rodar, 300); };
  inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') { clearTimeout(t); rodar(); } if (e.key === 'Escape') fecharPaineis(); };
  setTimeout(() => inp.focus(), 30);
  if (q) rodar();
}

// ---------- Ajustes: letra, tema, página ----------
function abrirAjustes(){
  fecharPaineis(); veu.hidden = false; folha.hidden = false; mostrarUI(false);
  desenharAjustes();
}
function mudar(patch){
  // o ponto de leitura é medido antes da troca (com a página ainda montada do jeito antigo)
  if (B && idoc && B.ancora == null) B.ancora = offAtual();
  opc = { ...opc, ...patch }; salvarOpc(); reajustar(); desenharAjustes(); if ('acesa' in patch) acesa(true); }
function chips(lista, atual, fn){
  const row = el('div', 'lrChips');
  for (const [v, nome] of lista) { const b = el('button', 'lrChip' + (v === atual ? ' on' : ''), nome); b.onclick = () => fn(v); row.append(b); }
  return row;
}
function chave(nome, on, fn){
  const b = el('button', 'lrSwitch' + (on ? ' on' : '')); b.setAttribute('role', 'switch'); b.setAttribute('aria-checked', on);
  b.append(el('span', null, nome), el('i')); b.onclick = () => fn(!on); return b;
}
function desenharAjustes(){
  folha.innerHTML = '';
  const sec = (titulo, ...filhos) => { const s = el('div', 'lrSec'); s.append(el('label', null, titulo), ...filhos); folha.append(s); };
  const tam = el('div', 'lrStep');
  const menos = el('button', 'lrChip', 'A−'), mais = el('button', 'lrChip big', 'A+'), val = el('span', null, opc.tam + '%');
  menos.onclick = () => mudar({ tam: Math.max(60, opc.tam - 10) }); mais.onclick = () => mudar({ tam: Math.min(250, opc.tam + 10) });
  tam.append(menos, val, mais);
  const cab = el('div', 'lrSheetTop'); cab.append(el('b', null, 'Leitura'), App.ibtn('x', null, fecharPaineis, 'sm lrB', 'Fechar'));
  folha.append(cab);
  sec('Tamanho da letra', tam);
  sec('Letra', chips(Object.entries(FONTES).map(([k, f]) => [k, f.nome]), opc.fonte, v => mudar({ fonte: v })));
  sec('Espaço entre linhas', chips(LINHAS, opc.linha, v => mudar({ linha: v })));
  sec('Margens', chips(MARGENS, opc.margem, v => mudar({ margem: v })));
  sec('Alinhamento', chips([['justify', 'Justificado'], ['left', 'À esquerda']], opc.alinhar, v => mudar({ alinhar: v })));
  const temas = el('div', 'lrTemas');
  for (const [k, t] of [['app', { nome: 'Do app', bg: 'linear-gradient(135deg,#fbfaf6 50%,#1c1d21 50%)', fg: '#888' }], ...Object.entries(TEMAS)]) {
    const b = el('button', 'lrTema' + (opc.tema === k ? ' on' : '')); b.style.background = t.bg; b.style.color = t.fg;
    b.append(el('span', null, 'Aa'), el('small', null, t.nome)); b.onclick = () => mudar({ tema: k });
    temas.append(b);
  }
  sec('Tema', temas);
  const br = el('input', 'lrRange'); br.type = 'range'; br.min = 25; br.max = 100; br.value = Math.round(opc.brilho * 100); br.setAttribute('aria-label', 'Brilho');
  br.oninput = () => { opc.brilho = br.value / 100; salvarOpc(); dim.style.opacity = String(Math.max(0, 1 - opc.brilho)); };
  sec('Brilho', br);
  sec('Página', chips([['paginas', 'Páginas'], ['rolagem', 'Rolagem']], opc.modo, v => mudar({ modo: v })),
    chave('Duas páginas com a tela deitada', opc.duas, v => mudar({ duas: v })));
  const vel = el('input', 'lrRange'); vel.type = 'range'; vel.min = 1; vel.max = 10; vel.value = opc.vel; vel.setAttribute('aria-label', 'Velocidade da rolagem automática');
  vel.oninput = () => { opc.vel = +vel.value; salvarOpc(); if (auto) { autoLigar(false); autoLigar(true); } };
  const ligar = el('button', 'lrChip' + (auto ? ' on' : ''), auto ? 'Parar' : 'Ligar'); ligar.onclick = () => { fecharPaineis(); autoLigar(!auto); };
  const velRow = el('div', 'lrStep lrVel'); velRow.append(ligar, vel);
  sec('Rolagem automática', velRow);
  const outros = el('div', 'lrSwitches');
  if (!B.ro) outros.append(chave('Cores e letras da editora', opc.estiloLivro, v => { opc.estiloLivro = v; salvarOpc(); carregarCap(B.ch, { off: B.off }); desenharAjustes(); }));
  outros.append(chave('Manter a tela acesa', opc.acesa, v => mudar({ acesa: v })));
  sec('Outros', outros);
  folha.append(App.btn('Voltar ao padrão', () => { opc = { ...PADRAO }; salvarOpc(); carregarCap(B.ch, { off: B.off }); desenharAjustes(); }, 'sm ghost lrReset'));
}
function fecharPaineis(){ lado.hidden = true; folha.hidden = true; busca.hidden = true; veu.hidden = true; fecharPop(); try { frame.contentWindow?.focus(); } catch {} }

function menuMais(anchor){
  const itens = [];
  if (B.ro) itens.push({ label: 'Voltar ao PDF', icon: 'pdf', on: () => fechar() });
  if (!B.ro) {
    itens.push({ label: 'Revisar grifos', icon: 'cards', on: () => App.openReview() });
    if (B.hls.length) itens.push({ label: 'Exportar grifos (Markdown)', icon: 'markdown', on: exportarGrifos });
  }
  if (!B.ro && App.canEpub()) itens.push({ label: 'Converter em PDF', sub: 'caneta, simulado', icon: 'pdf', on: converter });
  if (!App.native && document.documentElement.requestFullscreen) itens.push({ label: document.fullscreenElement ? 'Sair da tela cheia' : 'Tela cheia', icon: 'expand', on: () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}) });
  itens.push({ sep: true }, { label: 'Atalhos: ← → viram a página, B marca, M mostra o menu', icon: 'keyboard', on: () => {} });
  App.popMenu(anchor, itens, { title: B.book.name, alignRight: true });
}
async function converter(){
  const f = await safe(() => DB.get('files', B.fp), null);
  if (!f) { App.toast('Não encontrei o arquivo do livro.'); return; }
  const nome = B.book.name;
  await App.epubToPdf(f.data, nome + '.epub');
}

// ---------- Rolagem automática ----------
let auto = null;
function autoLigar(on){
  if (auto) { clearInterval(auto.t); cancelAnimationFrame(auto.raf); auto = null; }
  bAuto.classList.toggle('on', !!on); bAuto.querySelector('use')?.setAttribute('href', on ? '#i-pause' : '#i-play');
  if (!on || !B) return;
  auto = {};
  if (paginado()) auto.t = setInterval(async () => { if (!await proxima()) autoLigar(false); }, Math.round(48000 / (opc.vel + 1)));
  else {
    let antes = performance.now(), resto = 0;
    const passoA = async agora => {
      if (!auto) return;
      const dt = (agora - antes) / 1000; antes = agora;
      resto += dt * opc.vel * 11; const px = Math.floor(resto); resto -= px;
      if (px && se) {
        if (se.scrollTop + se.clientHeight >= se.scrollHeight - 2) { if (!await proxima()) { autoLigar(false); return; } }
        else se.scrollTop += px;
      }
      auto && (auto.raf = requestAnimationFrame(passoA));
    };
    auto.raf = requestAnimationFrame(passoA);
  }
  App.toast('Rolagem automática ligada — toque na tela para parar');
}

// ---------- Tela acesa e tempo de leitura ----------
let trava = null, ultAtiv = Date.now();
const atividade = () => { ultAtiv = Date.now(); };
async function acesa(on){
  try {
    if (on && opc.acesa && navigator.wakeLock && !trava && document.visibilityState === 'visible') { trava = await navigator.wakeLock.request('screen'); trava.addEventListener('release', () => { trava = null; }); }
    else if ((!on || !opc.acesa) && trava) { await trava.release(); trava = null; }
  } catch { trava = null; }
}
document.addEventListener('visibilitychange', () => { if (B && !root.hidden) { if (document.visibilityState === 'visible') acesa(true); else salvarPosicao(); } });
setInterval(() => {
  if (!B || B.ro || root.hidden || document.visibilityState !== 'visible' || Date.now() - ultAtiv > 4 * 60000) return;
  const k = App.dayKey(), t = B.rec.time || (B.rec.time = {});
  t[k] = (t[k] || 0) + 15;
  if ((t[k] / 15) % 4 === 0) App.patchDoc(B.fp, { time: t });
}, 15000);

// ---------- Abrir e fechar ----------
// book: { kind:'epub'|'texto', name, author, spine:[{href}], toc:[{title,ch,frag,level}], chapterDoc(i), chapterHref(i), file(p), typeOf(p) }
App.openBook = async (book, op = {}) => {
  if (B) await fechar(true);
  const ro = book.kind !== 'epub';
  let rec = {};
  if (!ro) {
    rec = await safe(() => DB.get('docs', book.fp), null) || {};
    rec = await safe(() => DB.update('docs', book.fp, cur => ({ ...(cur || {}), fp: book.fp, name: book.name, kind: 'epub', author: book.author || '', hasFile: true, ts: Date.now(), pages: book.spine.length,
      highlights: (cur && cur.highlights) || [], bookmarks: (cur && cur.bookmarks) || [] })), null) || rec;
  }
  B = { book, fp: book.fp, ro, rec, hls: (rec.highlights || []).map(App.normHl).filter(h => h.ep), marks: rec.bookmarks || [], ch: 0, pag: 0,
    lens: book.lens || (rec.lens && rec.lens.length === book.spine.length ? rec.lens : null), aoFechar: op.aoFechar };
  root.hidden = false; document.body.classList.add('lendo');
  fecharPaineis(); mostrarUI(true);
  clearTimeout(uiT); uiT = setTimeout(() => { if (!uiFixa) mostrarUI(false); }, 2200);
  if (!history.state || !history.state.vetraLeitor) history.pushState({ vetraLeitor: 1 }, '');
  document.title = book.name + ' — Vetra';
  ttlB.textContent = book.name; ttlS.textContent = book.author || (ro ? 'Texto corrido do PDF' : '');
  root.classList.toggle('ro', ro); bMarca.hidden = ro;
  await preparaQuadro();
  const pos = op.inicio || (ro ? ls.get('le.txt:' + book.fp, null) : rec.epub) || { ch: 0, off: 0 };
  await carregarCap(pos.ch || 0, { off: pos.off || 0 });
  acesa(true); atividade();
  setTimeout(() => { if (B && B.book === book) { medirCapitulos(); guardarCapa(); } }, 400);
  if (!ls.get('le.leituraDica', false) && App.isTouch) { ls.set('le.leituraDica', true); setTimeout(() => App.toast('Toque nas bordas para virar a página e no meio para ver o menu'), 700); }
  try { frame.contentWindow.focus(); } catch {}
  App.emit('book:opened', { fp: book.fp });
  return true;
};
async function fechar(trocando){
  if (!B) return;
  autoLigar(false);
  await salvarPosicao(); await salvarLivro();
  const sai = B; B = null; seq++;
  root.hidden = true; document.body.classList.remove('lendo');
  fecharPaineis(); acesa(false);
  for (const p of blobs.values()) p.then(u => u && URL.revokeObjectURL(u));
  blobs.clear(); textosLivro = null;
  frame.srcdoc = '<!doctype html><html><body></body></html>'; idoc = null; se = null;
  document.title = 'Vetra';
  if (history.state && history.state.vetraLeitor && !trocando) { saindoPeloVoltar = true; history.back(); }
  if (!trocando) { if (sai.aoFechar) await sai.aoFechar({ ch: sai.ch, off: sai.off || 0, pct: sai.pct || 0, book: sai.book }); else App.emit('home:show'); }
  App.emit('book:closed', { fp: sai.fp });
}
let saindoPeloVoltar = false;
addEventListener('popstate', () => {
  if (saindoPeloVoltar) { saindoPeloVoltar = false; return; }
  if (!B) return;
  if (!lado.hidden || !folha.hidden || !busca.hidden || !pop.hidden) { fecharPaineis(); history.pushState({ vetraLeitor: 1 }, ''); return; }
  fechar(true).then(() => App.emit('home:show'));
});
App.closeBook = () => fechar();
// botão voltar do Android: fecha painel ou janela do leitor; depois, o livro
App.leitorVoltar = () => {
  if (!B) return false;
  if (!pop.hidden || !lado.hidden || !folha.hidden || !busca.hidden) { fecharPaineis(); return true; }
  fechar(); return true;
};
App.bookOpen = () => (B && !B.ro ? B.fp : null);
App.on('doc:loaded', () => { if (B) fechar(true); });

// revisão e "Para revisar hoje": os grifos do livro aberto
App.bookSource = () => (B && !B.ro ? {
  fp: B.fp, name: B.book.name,
  highlights: () => B.hls,
  save: salvarLivroLogo,
  jump: h => irParaGrifo(h),
} : null);
App.bookJump = h => irParaGrifo(h);

// para os testes e para quem integra: posição atual
App.bookState = () => B && { ch: B.ch, pag: B.pag, paginas: paginas(), off: B.off, pct: B.pct, name: B.book.name, grifos: B.hls.length, marcadores: B.marks.length, modo: opc.modo, tema: temaAtual(), carregando };
App.bookFrame = () => frame;
})();
