/* Lado a lado: um segundo PDF à direita (livro + aula, caderno + gabarito, ou dois pontos do mesmo livro).
   O da direita é para consulta: mostra os grifos já feitos, permite selecionar e copiar texto,
   e pode rolar junto com o principal. Para grifar nele, use "Trocar de lado". */
(() => {
'use strict';
const App = window.App;
const { $, el, state, DB, safe, ls } = App;
const CSS_UNITS = 96 / 72;

const box = $('#split'), head = $('#splitHead'), view = $('#splitView'), pagesEl = $('#splitPages');
const S = { pdf: null, fp: null, name: '', bytes: null, pages: [], scale: 1, autoFit: true, cur: 1, token: 0, hls: [], sync: false, delta: 0 };
App.splitState = S;
App.splitOpen = () => !box.hidden;

// ---------- Abrir / fechar ----------
App.toggleSplit = anchor => { if (!box.hidden) close(); else choose(anchor && anchor.getBoundingClientRect().width ? anchor : $('#btnSplit')); };
async function choose(anchor){
  if (!state.pdf) return;
  const docs = (await safe(() => DB.all('docs'), [])).filter(d => d.hasFile).sort((a, b) => b.ts - a.ts);
  const items = docs.slice(0, 14).map(d => ({
    label: App.baseName(d.name) + (d.fp === state.fp ? ' (este mesmo)' : ''), icon: 'file',
    sub: d.subject || undefined, checked: d.fp === S.fp,
    on: async () => { const f = await safe(() => DB.get('files', d.fp), null); if (f) open(f.data, d.name, d.fp, d.fp === state.fp ? state.currentPage : d.lastPage); else App.toast('Não encontrei este arquivo salvo.'); },
  }));
  items.push({ sep: true }, { label: 'Escolher no computador…', icon: 'folder', on: () => $('#splitFile').click() });
  App.popMenu(anchor || $('#btnSplit'), items, { title: 'Abrir ao lado', alignRight: true });
}
$('#splitFile').onchange = async () => {
  const f = $('#splitFile').files[0]; $('#splitFile').value = '';
  if (f) open(await f.arrayBuffer(), f.name, null, 1);
};

async function open(bytes, name, fp, page = 1){
  const token = ++S.token;
  let pdf;
  try { pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise; }
  catch { App.toast('Não consegui abrir este PDF.'); return false; }
  const n = pdf.numPages, sizes = new Array(n);
  for (let i = 0; i < n; i += 48)
    await Promise.all(Array.from({ length: Math.min(48, n - i) }, (_, k) => pdf.getPage(i + k + 1).then(pg => { const vp = pg.getViewport({ scale: CSS_UNITS }); sizes[i + k] = { w: vp.width, h: vp.height }; })));
  if (token !== S.token) { pdf.destroy(); return false; }
  if (S.pdf) S.pdf.destroy();
  fp = fp || pdf.fingerprints[0];
  const rec = await safe(() => DB.get('docs', fp), null);
  Object.assign(S, { pdf, fp, name, bytes, cur: 1, autoFit: true, sync: false, ocr: (rec && rec.ocr) || {} });
  S.hls = fp === state.fp ? state.highlights : ((rec && rec.highlights) || []);
  pagesEl.innerHTML = '';
  S.pages = sizes.map((s, i) => {
    const pe = el('div', 'spPage'); pe.dataset.page = i + 1;
    const hl = el('div', 'spHlLayer'); pe.append(hl);
    pagesEl.append(pe);
    return { num: i + 1, el: pe, hl, base: s, canvas: null, img: null, tl: null, renderedScale: null, rendering: false, imgRects: null };
  });
  box.hidden = false; document.body.classList.add('split-on');
  applyWidth();
  setScale(fitScale());
  drawAllHls();
  goTo(page || 1);
  renderHead();
  App.scheduleRender();
  return true;
}
function close(){
  S.token++;
  if (S.pdf) S.pdf.destroy();
  Object.assign(S, { pdf: null, fp: null, name: '', bytes: null, pages: [], hls: [], sync: false });
  pagesEl.innerHTML = ''; box.hidden = true; document.body.classList.remove('split-on');
  box.style.width = '';
  App.scheduleRender();
}
App.closeSplit = close;
App.openSplit = open;
App.on('doc:closed', () => { if (!box.hidden) close(); });

// ---------- Cabeçalho ----------
function renderHead(){
  head.innerHTML = '';
  const nameBtn = el('button', 'splitName');
  nameBtn.append(App.icon('file'), el('span', null, App.baseName(S.name)), App.icon('down', 'i chev'));
  nameBtn.title = 'Trocar o PDF da direita';
  nameBtn.onclick = () => choose(nameBtn);
  const pg = el('div', 'pageBox');
  const inp = el('input'); inp.type = 'number'; inp.min = 1; inp.max = S.pages.length; inp.value = S.cur; inp.id = 'splitPage'; inp.setAttribute('aria-label', 'Página do PDF da direita');
  inp.onchange = () => { goTo(+inp.value); inp.blur(); };
  inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') inp.blur(); };
  pg.append(inp, el('span', null, '/ ' + S.pages.length));
  const syncBtn = App.ibtn('link', null, toggleSync, 'sm' + (S.sync ? ' on' : ''), S.sync ? 'Rolando junto com o PDF principal — clique para soltar' : 'Rolar junto com o PDF principal (mantém a distância atual entre as páginas)');
  syncBtn.id = 'splitSync';
  head.append(nameBtn, el('span', 'tbSpacer'), pg,
    App.ibtn('minus', null, () => zoomBy(1 / 1.15), 'sm', 'Diminuir zoom'),
    App.ibtn('plus', null, () => zoomBy(1.15), 'sm', 'Aumentar zoom'),
    App.ibtn('fit', null, () => { S.autoFit = true; setScale(fitScale()); }, 'sm' + (S.autoFit ? ' on' : ''), 'Ajustar à largura'),
    syncBtn,
    App.ibtn('swap', null, swap, 'sm', 'Trocar de lado (o da direita vira o principal, para grifar)'),
    App.ibtn('x', null, close, 'sm', 'Fechar o lado a lado (L)'));
}
function updatePageBox(){ const i = $('#splitPage'); if (i && document.activeElement !== i) i.value = S.cur; }

// ---------- Largura (arrastável) ----------
function applyWidth(){
  const total = $('#main').clientWidth;
  const frac = Math.max(0.25, Math.min(0.7, ls.get('le.splitW', 0.5)));
  box.style.width = Math.round(total * frac) + 'px';
}
$('#splitResize').addEventListener('pointerdown', e => {
  e.preventDefault();
  const r = $('#splitResize'); r.setPointerCapture(e.pointerId);
  const mainR = $('#main').getBoundingClientRect();
  const move = ev => {
    const frac = Math.max(0.25, Math.min(0.7, (mainR.right - ev.clientX) / mainR.width));
    box.style.width = Math.round(mainR.width * frac) + 'px'; ls.set('le.splitW', frac);
  };
  const up = () => { r.removeEventListener('pointermove', move); r.removeEventListener('pointerup', up); if (S.autoFit) setScale(fitScale()); };
  r.addEventListener('pointermove', move); r.addEventListener('pointerup', up);
});
addEventListener('resize', () => { if (!box.hidden) applyWidth(); });
new ResizeObserver(() => { if (S.pdf && S.autoFit && Math.abs(fitScale() - S.scale) > 0.005) setScale(fitScale()); }).observe(view);

// ---------- Zoom e navegação ----------
function fitScale(){
  const w = Math.max(...S.pages.slice(0, 5).map(p => p.base.w), 1);
  return Math.max(0.25, Math.min(2, (view.clientWidth - 36) / w));
}
function setScale(s){
  s = Math.max(0.25, Math.min(5, s));
  const p = S.pages[S.cur - 1], ry = p ? (view.scrollTop - p.el.offsetTop) / p.el.offsetHeight : 0;
  S.scale = s;
  for (const q of S.pages) { q.el.style.width = q.base.w * s + 'px'; q.el.style.height = q.base.h * s + 'px'; }
  if (p) view.scrollTop = p.el.offsetTop + ry * p.el.offsetHeight;
  $$fit();
  schedule();
}
function $$fit(){ const b = head.querySelector('[title="Ajustar à largura"]'); if (b) b.classList.toggle('on', S.autoFit); }
function zoomBy(f){ S.autoFit = false; setScale(S.scale * f); }
function goTo(n, frac = 0){
  if (!S.pages.length) return;
  n = Math.max(1, Math.min(S.pages.length, n | 0));
  const p = S.pages[n - 1];
  view.scrollTop = p.el.offsetTop + frac * p.el.offsetHeight - (frac ? 0 : 10);
  updateCur(); schedule();
}
App.splitGoTo = goTo;
function indexAt(y){
  let lo = 0, hi = S.pages.length - 1, ans = 0;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (S.pages[m].el.offsetTop <= y) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans;
}
function updateCur(){ if (!S.pages.length) return; S.cur = S.pages[indexAt(view.scrollTop + view.clientHeight * 0.35)].num; updatePageBox(); }
view.addEventListener('scroll', () => { if (!S.pdf) return; updateCur(); schedule(); if (!syncing) captureDelta(); }, { passive: true });
view.addEventListener('wheel', e => {
  if (!e.ctrlKey || !S.pdf) return;
  e.preventDefault();
  zoomBy(Math.max(0.8, Math.min(1.25, Math.exp(-(e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY) * 0.0022))));
}, { passive: false });

// ---------- Rolar junto ----------
// guarda a distância (em páginas) entre os dois e mantém essa distância quando o principal rola
let syncing = false;
// posição como "página + fração", medida na mesma linha usada para a página atual (35% da altura)
const LINE = 0.35;
function posIn(pages, sc, h){
  if (!pages.length) return 1;
  const y = sc + h * LINE;
  let lo = 0, hi = pages.length - 1, i = 0;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (pages[m].el.offsetTop <= y) { i = m; lo = m + 1; } else hi = m - 1; }
  const p = pages[i];
  return p.num + Math.max(0, Math.min(0.999, (y - p.el.offsetTop) / p.el.offsetHeight));
}
const mainPos = () => { const v = $('#viewer'); return posIn(state.pages, v.scrollTop, v.clientHeight); };
const splitPos = () => posIn(S.pages, view.scrollTop, view.clientHeight);
function captureDelta(){ if (S.sync) S.delta = splitPos() - mainPos(); }
function toggleSync(){
  S.sync = !S.sync;
  if (S.sync) S.delta = splitPos() - mainPos();
  renderHead();
  App.toast(S.sync ? 'Rolando junto: os dois PDFs andam no mesmo ritmo' : 'Rolagem independente');
}
$('#viewer').addEventListener('scroll', () => {
  if (!S.sync || !S.pdf || !state.pdf) return;
  const target = mainPos() + S.delta;
  const n = Math.floor(target), frac = target - n;
  if (n < 1 || n > S.pages.length) return;
  syncing = true;
  const p = S.pages[n - 1];
  view.scrollTop = p.el.offsetTop + frac * p.el.offsetHeight - view.clientHeight * LINE;
  updateCur(); schedule();
  requestAnimationFrame(() => { syncing = false; });
}, { passive: true });

// ---------- Trocar de lado ----------
async function swap(){
  if (!S.pdf || !state.pdf) return;
  const right = { bytes: S.bytes, name: S.name, page: S.cur };
  const left = { bytes: state.bytes, name: state.name, fp: state.fp, page: state.currentPage };
  if (S.fp === state.fp) { App.goToPage(right.page); goTo(left.page); return; }
  const ok = await App.loadDoc(right.bytes, right.name);
  if (!ok) return;
  App.goToPage(right.page);
  await open(left.bytes, left.name, left.fp, left.page);
}

// ---------- Renderização ----------
let raf = false;
function schedule(){ if (raf) return; raf = true; requestAnimationFrame(() => { raf = false; renderVisible(); }); }
function renderVisible(){
  if (!S.pdf) return;
  const top = view.scrollTop, h = view.clientHeight, bottom = top + h;
  for (const p of S.pages) {
    const t = p.el.offsetTop, b = t + p.el.offsetHeight;
    if (b >= top - h && t <= bottom + h) renderPage(p);
    else if ((b < top - h * 4 || t > bottom + h * 4) && p.canvas) unload(p);
  }
}
async function renderPage(p){
  if (p.rendering || p.renderedScale === S.scale) return;
  p.rendering = true;
  const token = S.token, scale = S.scale;
  try {
    const page = await S.pdf.getPage(p.num);
    const vp = page.getViewport({ scale: scale * CSS_UNITS });
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (vp.width * vp.height * dpr * dpr > 12e6) dpr = Math.sqrt(12e6 / (vp.width * vp.height));
    const canvas = el('canvas', 'pageCanvas');
    canvas.width = Math.floor(vp.width * dpr); canvas.height = Math.floor(vp.height * dpr);
    if (p.ownAnnots === undefined) p.ownAnnots = await App.hasOwnAnnots(page);
    await page.render({ canvasContext: canvas.getContext('2d', { willReadFrequently: true }), viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null,
      annotationMode: p.ownAnnots ? pdfjsLib.AnnotationMode.DISABLE : pdfjsLib.AnnotationMode.ENABLE }).promise;
    if (token !== S.token) return;
    const tl = el('div', 'textLayer');
    tl.style.setProperty('--scale-factor', vp.scale);
    const tc = await page.getTextContent();
    if (!(S.ocr[p.num] && App.textLength(tc) < App.MIN_TEXT)) await pdfjsLib.renderTextLayer({ textContentSource: tc, container: tl, viewport: vp, textDivs: [] }).promise;
    if (!p.imgRects) p.imgRects = App.imageRects(page).catch(() => []);
    const img = App.buildImgLayer(canvas, await p.imgRects);
    if (token !== S.token) return;
    if (p.canvas) p.canvas.replaceWith(canvas); else p.el.prepend(canvas);
    if (p.img) { p.img.width = 0; p.img.remove(); }
    if (img) canvas.after(img);
    if (p.tl) p.tl.replaceWith(tl); else p.el.append(tl);
    p.canvas = canvas; p.img = img; p.tl = tl; p.renderedScale = scale;
  } catch (e) {
    if (e?.name !== 'RenderingCancelledException') console.warn('lado a lado', e);
  } finally { p.rendering = false; }
  if (token === S.token && p.renderedScale !== S.scale) schedule();
}
function unload(p){
  if (p.canvas) { p.canvas.width = 0; p.canvas.remove(); }
  if (p.img) { p.img.width = 0; p.img.remove(); }
  if (p.tl) p.tl.remove();
  p.canvas = p.img = p.tl = null; p.renderedScale = null;
}

// grifos já feitos neste PDF (só leitura)
function drawAllHls(){
  for (const p of S.pages) p.hl.innerHTML = '';
  for (const h of S.hls) {
    if (h.kind === 'ink' || h.kind === 'note') continue;
    const col = App.colorOf(h.color);
    for (const part of h.parts || []) {
      const p = S.pages[part.page - 1]; if (!p || !part.rects) continue;
      for (const r of part.rects) {
        const d = el('div', 'spHl' + (h.style === 'underline' ? ' u' : h.style === 'strike' ? ' s' : '') + (h.kind === 'area' ? ' area' : ''));
        d.style.cssText = `left:${r.x * 100}%;top:${r.y * 100}%;width:${r.w * 100}%;height:${r.h * 100}%`;
        d.style.setProperty('--c', col.hex); d.style.setProperty('--ci', col.ink);
        if (h.note) d.title = h.note;
        p.hl.append(d);
      }
    }
  }
}
// mesmo PDF dos dois lados: acompanha os grifos novos
App.on('hl:changed', () => { if (S.pdf && S.fp === state.fp) { S.hls = state.highlights; drawAllHls(); } });
App.on('doc:saved', () => { if (S.pdf && S.fp === state.fp) { S.hls = state.highlights; drawAllHls(); } });

$('#btnSplit').onclick = () => App.toggleSplit();
})();
