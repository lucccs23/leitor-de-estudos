/* Modo leitura do PDF (o "Modo de leitura (tela cheia)", tecla F): página limpa, sem barras,
   toque nas bordas para virar a página (celular e tablet), cor da página (original, sépia, escura), brilho,
   cortar as margens brancas dos lados, rolagem automática e tela sempre acesa.
   "Texto corrido": o texto do PDF vira um livro no leitor (letra, tema e margens à escolha). */
(() => {
'use strict';
const App = window.App;
const { $, el, state, ls } = App;

let opc = { tom: 'app', cortar: false, brilho: 1, vel: 4, ...ls.get('le.leituraPdf', {}) };
const salvar = () => ls.set('le.leituraPdf', opc);
const viewer = $('#viewer'), stage = $('#stage');
const ativo = () => document.body.classList.contains('focus') && !!state.pdf;

// ---------- Barra do modo leitura ----------
const dim = el('div', 'lpDim'); stage.append(dim);
const bar = el('div', 'lpBar'); bar.hidden = true; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Modo leitura');
const pag = el('span', 'lpPag');
const bAuto = App.ibtn('play', null, () => autoLigar(!auto), 'sm lpB', 'Rolagem automática');
const bCorte = App.ibtn('fit', 'Margens', () => alternarCorte(), 'sm lpB', 'Cortar as margens brancas dos lados');
const brilho = el('input', 'lpRange'); brilho.type = 'range'; brilho.min = 25; brilho.max = 100; brilho.title = 'Brilho'; brilho.setAttribute('aria-label', 'Brilho');
brilho.oninput = () => { opc.brilho = brilho.value / 100; salvar(); aplicarBrilho(); };
const brilhoBox = el('label', 'lpBrilho'); brilhoBox.append(App.icon('sun'), brilho);
bar.append(
  App.ibtn('x', null, () => App.toggleFocus(), 'sm lpB', 'Sair do modo leitura (F)'),
  App.ibtn('left', null, () => App.pageStep(-1), 'sm lpB', 'Página anterior'), pag, App.ibtn('right', null, () => App.pageStep(1), 'sm lpB', 'Próxima página'),
  el('span', 'lpSep'),
  App.ibtn('palette', 'Página', e => menuTom(e.currentTarget), 'sm lpB', 'Cor da página'), bCorte, brilhoBox, bAuto,
  el('span', 'lpSep'),
  App.ibtn('book', 'Texto corrido', () => App.openReflow(), 'sm lpB', 'Ler o texto do PDF como um livro (letra e margens à escolha)'));
document.body.append(bar);

let barT;
function mostrarBarra(on, ms = 2600){
  clearTimeout(barT);
  bar.hidden = !on || !ativo();
  if (on && ms) barT = setTimeout(() => { if (!bar.matches(':hover') && !bar.contains(document.activeElement)) bar.hidden = true; }, ms);
}
const atualizarPag = () => { if (state.pdf) pag.textContent = `${state.currentPage} / ${state.pdf.numPages}`; };
App.on('page:changed', atualizarPag);
viewer.addEventListener('scroll', () => { if (ativo()) atualizarPag(); }, { passive: true });

function menuTom(anchor){
  const itens = [['app', 'Como o tema do app'], ['normal', 'Original (branca)'], ['sepia', 'Sépia'], ['invert', 'Escura']];
  App.popMenu(anchor, itens.map(([v, nome]) => ({ label: nome, checked: opc.tom === v, on: () => { opc.tom = v; salvar(); aplicarTom(); } })), { title: 'Cor da página' });
}
function aplicarTom(){
  if (!ativo() || opc.tom === 'app') { App.applyTheme(App.currentTheme()); return; }
  document.documentElement.dataset.page = opc.tom;
  App.scheduleRender();
}
function aplicarBrilho(){ dim.style.opacity = ativo() ? String(Math.max(0, Math.min(0.75, 1 - opc.brilho))) : '0'; }

// ---------- Cortar as margens dos lados ----------
let corte = null;
async function caixaDoTexto(){
  const n = state.pdf.numPages, k = Math.min(n, 10);
  const amostra = [...new Set([state.currentPage, ...Array.from({ length: k }, (_, i) => 1 + Math.floor(i * n / k))])];
  let x0 = 1, x1 = 0, achou = 0;
  for (const p of amostra) {
    const t = await App.pageText(p);
    for (const it of t.items) { if (!it.str || !it.str.trim() || !(it.w > 0)) continue; achou++; x0 = Math.min(x0, it.x); x1 = Math.max(x1, it.x + it.w); }
  }
  if (achou < 5) return null;
  x0 = Math.max(0, x0 - 0.02); x1 = Math.min(1, x1 + 0.02);
  return x1 - x0 > 0.9 ? null : { x: x0, w: x1 - x0 };
}
async function aplicarCorte(){
  const c = await caixaDoTexto();
  if (!c) { App.toast('Este PDF já usa a largura toda (ou não tem texto para medir as margens).'); return false; }
  const p0 = state.pages[0];
  corte = c;
  state.autoFit = false;
  App.setScale((viewer.clientWidth - 20) / (c.w * p0.base.w), true);
  alinharCorte();
  return true;
}
function alinharCorte(){
  if (!corte) return;
  const p = state.pages[state.currentPage - 1] || state.pages[0];
  viewer.scrollLeft = p.el.offsetLeft + corte.x * p.el.offsetWidth - 10;
}
function tirarCorte(){ if (!corte) return; corte = null; App.fitWidth(); }
async function alternarCorte(){
  opc.cortar = !opc.cortar; salvar();
  if (opc.cortar) { if (!await aplicarCorte()) { opc.cortar = false; salvar(); } } else tirarCorte();
  bCorte.classList.toggle('on', !!corte);
}
new ResizeObserver(() => { if (corte && ativo()) { clearTimeout(rT); rT = setTimeout(aplicarCorte, 150); } }).observe(stage);
let rT;
App.on('page:changed', () => { if (corte) alinharCorte(); });

// ---------- Rolagem automática ----------
let auto = null;
function autoLigar(on){
  if (auto) { clearInterval(auto.t); cancelAnimationFrame(auto.raf); auto = null; }
  bAuto.classList.toggle('on', !!on); bAuto.querySelector('use')?.setAttribute('href', on ? '#i-pause' : '#i-play');
  if (!on || !state.pdf) return;
  auto = {};
  if (viewer.classList.contains('paged')) auto.t = setInterval(() => { if (state.currentPage >= state.pdf.numPages) autoLigar(false); else App.pageStep(1); }, Math.round(60000 / (opc.vel + 1)));
  else {
    let antes = performance.now(), resto = 0;
    const passo = agora => {
      if (!auto) return;
      resto += (agora - antes) / 1000 * opc.vel * 9; antes = agora;
      const px = Math.floor(resto); resto -= px;
      if (px) { if (viewer.scrollTop + viewer.clientHeight >= viewer.scrollHeight - 2) { autoLigar(false); return; } viewer.scrollTop += px; }
      auto.raf = requestAnimationFrame(passo);
    };
    auto.raf = requestAnimationFrame(passo);
  }
  App.toast('Rolagem automática ligada. Toque na tela para parar.');
}

// ---------- Tela acesa ----------
let trava = null;
async function acesa(on){
  try {
    if (on && navigator.wakeLock && !trava && document.visibilityState === 'visible') { trava = await navigator.wakeLock.request('screen'); trava.addEventListener('release', () => { trava = null; }); }
    else if (!on && trava) { await trava.release(); trava = null; }
  } catch { trava = null; }
}
document.addEventListener('visibilitychange', () => { if (ativo() && document.visibilityState === 'visible') acesa(true); });

// ---------- Entrar e sair (segue o modo de leitura do app) ----------
let estava = false;
function mudou(){
  const on = ativo();
  if (on === estava) return;
  estava = on;
  if (on) {
    aplicarTom(); brilho.value = Math.round(opc.brilho * 100); aplicarBrilho(); acesa(true); atualizarPag();
    if (opc.cortar) aplicarCorte().then(ok => bCorte.classList.toggle('on', !!ok));
    mostrarBarra(true, 3500);
    if (App.isTouch && !ls.get('le.leituraPdfDica', false)) { ls.set('le.leituraPdfDica', true); App.toast('Toque nas bordas para virar a página e no meio para ver a barra'); }
  } else {
    autoLigar(false); acesa(false); mostrarBarra(false); aplicarBrilho();
    if (corte) tirarCorte();
    App.applyTheme(App.currentTheme());
  }
}
new MutationObserver(mudou).observe(document.body, { attributes: true, attributeFilter: ['class'] });
App.on('doc:closed', () => { if (document.body.classList.contains('focus')) App.toggleFocus(); });

// toque: bordas viram a página, meio mostra a barra (só dedo; caneta e mouse continuam grifando)
let toque = null;
viewer.addEventListener('pointerdown', e => {
  if (auto && e.pointerType !== 'mouse') autoLigar(false);
  toque = ativo() && e.pointerType === 'touch' && e.isPrimary ? { x: e.clientX, y: e.clientY, t: Date.now() } : null;
}, true);
viewer.addEventListener('pointermove', e => { if (toque && Math.hypot(e.clientX - toque.x, e.clientY - toque.y) > 12) toque = null; }, true);
viewer.addEventListener('pointerup', e => {
  const d = toque; toque = null;
  if (!d || !ativo() || Date.now() - d.t > 400 || state.tool !== 'text') return;
  if (!getSelection().isCollapsed || e.target.closest('.hl,.note,.noteLayer *,a,button,input,textarea,#popup')) return;
  const r = viewer.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width;
  if (fx < 0.25) App.pageStep(-1); else if (fx > 0.75) App.pageStep(1); else mostrarBarra(bar.hidden, 4000);
}, true);
// computador: a barra aparece com o mouse perto do pé da tela
document.addEventListener('mousemove', e => { if (ativo() && e.clientY > innerHeight - 90) mostrarBarra(true, 2000); }, { passive: true });

// ---------- Texto corrido: o PDF lido como um livro ----------
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function linhasDe(items){
  const out = []; let cur = null;
  for (const it of items) {
    const s = it.str; if (!s) continue;
    if (cur && Math.abs(it.y - cur.y) < Math.max(it.h, cur.h) * 0.55 && it.x >= cur.x1 - 0.03) {
      const gap = it.x - cur.x1;
      cur.t += (gap > 0.004 && !/\s$/.test(cur.t) && !/^\s/.test(s) ? ' ' : '') + s;
      cur.x1 = Math.max(cur.x1, it.x + it.w); cur.h = Math.max(cur.h, it.h);
    } else { if (cur) out.push(cur); cur = { t: s, x: it.x, x1: it.x + it.w, y: it.y, h: it.h }; }
  }
  if (cur) out.push(cur);
  return out.map(l => ({ ...l, t: l.t.replace(/\s+/g, ' ').trim() })).filter(l => l.t);
}
const quantil = (arr, q) => { const a = [...arr].sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(q * a.length))] : 0; };
function paragrafosDe(items){
  const ls2 = linhasDe(items);
  if (!ls2.length) return '';
  const hMed = quantil(ls2.map(l => l.h), 0.5) || 0.012, esq = quantil(ls2.map(l => l.x), 0.15), dir = quantil(ls2.map(l => l.x1), 0.85);
  let html = '', par = '', ant = null;
  const fechar = () => { if (par.trim()) html += `<p>${esc(par.trim())}</p>`; par = ''; };
  for (const l of ls2) {
    if ((l.y < 0.07 || l.y > 0.93) && l.t.length < 14 && /^[\divxlcm\s\-–—.|/]+$/i.test(l.t)) continue; // número da página
    if (l.h > hMed * 1.3 && l.t.length < 140) { fechar(); html += `<h3>${esc(l.t)}</h3>`; ant = null; continue; }
    const novo = !ant || l.y - ant.y > ant.h * 1.9
      || (l.x > esq + 0.025 && /[.!?:;"”)]$/.test(ant.t))
      || (ant.x1 < dir - 0.12 && /[.!?:"”]$/.test(ant.t));
    if (novo) fechar();
    if (par && /[A-Za-zÀ-ÿ]-$/.test(par) && /^\p{Ll}/u.test(l.t)) par = par.slice(0, -1) + l.t;
    else par += (par ? ' ' : '') + l.t;
    ant = l;
  }
  fechar();
  return html;
}
// marcas "p. N" dentro do texto: dizem em que página do PDF cada trecho está
function marcasDe(doc){
  const out = []; let n = 0;
  const w = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let x = w.nextNode();
  while (x) {
    if (x.nodeType === 1 && x.classList.contains('vetraPg')) { out.push({ page: +x.dataset.p, pos: n }); x = w.nextSibling() || (w.parentNode() && w.nextSibling()); continue; }
    if (x.nodeType === 3) n += x.length;
    x = w.nextNode();
  }
  return out;
}
async function livroDoPdf(){
  const pdf = state.pdf, n = pdf.numPages, fp = state.fp, nome = App.baseName(state.name);
  let caps = ((await App.chapters?.()) || []).filter(c => c.page >= 1 && c.page <= n).sort((a, b) => a.page - b.page);
  caps = caps.filter((c, i) => !i || c.page !== caps[i - 1].page);
  let secoes = [];
  if (caps.length >= 2) { if (caps[0].page > 1) secoes.push({ title: 'Início', from: 1 }); for (const c of caps) secoes.push({ title: c.title, from: c.page }); }
  else for (let p = 1; p <= n; p += 10) secoes.push({ title: n > 10 ? `Páginas ${p} a ${Math.min(n, p + 9)}` : nome, from: p });
  secoes.forEach((s, i) => { s.to = (secoes[i + 1] ? secoes[i + 1].from : n + 1) - 1; });
  secoes = secoes.filter(s => s.to >= s.from);
  const html = new Map();
  async function htmlDe(i){
    if (!html.has(i)) html.set(i, (async () => {
      const s = secoes[i]; let h = '';
      for (let p = s.from; p <= s.to; p++) {
        if (state.fp !== fp) break;
        const t = await App.pageText(p);
        const corpo = paragrafosDe(t.items);
        h += `<div class="vetraPg" data-p="${p}">p. ${p}</div>` + (corpo || `<p><em>(a página ${p} não tem texto: veja no PDF)</em></p>`);
      }
      return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(s.title)}</title></head><body>${h}</body></html>`;
    })());
    return html.get(i);
  }
  const doc = async i => new DOMParser().parseFromString(await htmlDe(i), 'text/html');
  return {
    kind: 'texto', fp, name: nome, author: '', lang: 'pt',
    spine: secoes.map((s, i) => ({ href: 's' + i })), toc: secoes.map((s, i) => ({ title: s.title, ch: i, level: 0 })),
    chapterHref: i => 's' + i, chapterDoc: doc, file: async () => null, typeOf: () => '',
    secaoDe: p => Math.max(0, secoes.findIndex(s => p >= s.from && p <= s.to)),
    async inicioDe(p){ const ch = this.secaoDe(p); const m = marcasDe(await doc(ch)).find(x => x.page === p); return { ch, off: m ? m.pos : 0 }; },
    async paginaDe(ch, off){ const ms = marcasDe(await doc(ch)); let p = secoes[ch] ? secoes[ch].from : 1; for (const m of ms) { if (m.pos <= off + 1) p = m.page; else break; } return p; },
  };
}
App.openReflow = async () => {
  if (!state.pdf) return;
  const voltarFoco = document.body.classList.contains('focus');
  mostrarBarra(false);
  App.setLoading(0.2);
  const book = await livroDoPdf();
  const inicio = await book.inicioDe(state.currentPage);
  App.setLoading(null);
  await App.openBook(book, {
    inicio,
    aoFechar: async pos => { const p = await book.paginaDe(pos.ch, pos.off); if (state.pdf && state.fp === book.fp) { App.goToPage(p); if (voltarFoco && !document.body.classList.contains('focus')) App.toggleFocus(); } },
  });
};
})();
