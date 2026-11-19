/* Barra lateral: sumário do PDF, miniaturas das páginas e marcadores. */
(() => {
'use strict';
const App = window.App;
const { $, $$, el, btn, state } = App;

let pane = App.ls.get('le.sidePane', 'outline');
let built = { outline: null, thumbs: null }; // fp para o qual cada painel foi montado

App.showSide = name => {
  pane = name; App.ls.set('le.sidePane', name);
  document.body.classList.add('side-open'); App.ls.set('le.side', true);
  $$('.sideTabs button').forEach(b => b.classList.toggle('on', b.dataset.side === name));
  $$('#sidebar section').forEach(s => s.classList.toggle('on', s.dataset.pane === name));
  if (name === 'outline' && built.outline !== state.fp) buildOutline();
  if (name === 'thumbs' && built.thumbs !== state.fp) buildThumbs();
  if (name === 'thumbs') markCurrentThumb(true);
  if (name === 'bookmarks') renderBookmarks();
  App.scheduleRender();
};
App.toggleSide = () => {
  if (document.body.classList.contains('side-open')) {
    document.body.classList.remove('side-open'); App.ls.set('le.side', false); App.scheduleRender();
  } else App.showSide(pane);
};
$$('.sideTabs button').forEach(b => { b.onclick = () => App.showSide(b.dataset.side); });
$('#btnSidebar').onclick = App.toggleSide;
// X no topo do painel e Esc dentro dele: fecham o painel
const fecharLado = () => { if (document.body.classList.contains('side-open')) App.toggleSide(); };
$('#btnSideClose').onclick = fecharLado;
$('#sidebar').addEventListener('keydown', e => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); e.stopPropagation(); fecharLado(); $('#viewer').focus({ preventScroll: true }); } });

// ---------- Sumário ----------
async function buildOutline(){
  const fp = state.fp; built.outline = fp;
  const box = $('#outline'); box.innerHTML = '';
  const ol = await state.pdf.getOutline().catch(() => null);
  if (fp !== state.fp) return;
  if (!ol || !ol.length) {
    box.append(App.emptyState('list', 'Sem sumário', 'Este PDF não tem sumário embutido. Use Páginas ou Busca para navegar.'));
    return;
  }
  box.append(renderItems(ol, 0, ol.length <= 15));
}
function renderItems(items, depth, openFirst){
  const ul = el('ul', 'tree');
  for (const it of items) {
    const li = el('li'), row = el('div', 'treeRow');
    const kids = it.items && it.items.length;
    if (kids) {
      const tg = el('button', 'twisty'); tg.title = 'Expandir'; tg.append(App.icon('right'));
      tg.onclick = e => { e.stopPropagation(); li.classList.toggle('open'); };
      row.append(tg);
    } else row.append(el('span', 'twisty'));
    const a = el('button', 'treeLink', it.title || '(sem título)');
    a.onclick = () => goDest(it.dest);
    row.append(a); li.append(row);
    if (kids) { li.append(renderItems(it.items, depth + 1, false)); if (openFirst && depth === 0) li.classList.add('open'); }
    ul.append(li);
  }
  return ul;
}
async function goDest(dest){
  try {
    if (typeof dest === 'string') dest = await state.pdf.getDestination(dest);
    if (!Array.isArray(dest)) return;
    const ref = dest[0];
    const idx = typeof ref === 'object' ? await state.pdf.getPageIndex(ref) : ref;
    const num = idx + 1;
    const type = dest[1] && dest[1].name;
    let top = null;
    if (type === 'XYZ') top = dest[3]; else if (type === 'FitH' || type === 'FitBH') top = dest[2];
    let frac = 0;
    if (top != null) {
      const vp = (await state.pdf.getPage(num)).getViewport({ scale: 1 });
      frac = Math.max(0, Math.min(1, vp.convertToViewportPoint(0, top)[1] / vp.height));
    }
    App.goToPage(num, frac);
  } catch (e) { console.warn(e); App.toast('Não consegui ir para esse item do sumário.'); }
}

// ---------- Miniaturas ----------
let thumbObs = null;
function buildThumbs(){
  built.thumbs = state.fp;
  const box = $('#thumbs'); box.innerHTML = '';
  if (thumbObs) thumbObs.disconnect();
  thumbObs = new IntersectionObserver(ents => { for (const e of ents) if (e.isIntersecting) renderThumb(e.target); },
    { root: box.closest('section'), rootMargin: '400px' });
  for (const p of state.pages) {
    const t = el('button', 'thumb'); t.dataset.page = p.num; t.title = 'Página ' + p.num;
    const w = 120, h = Math.round(w * p.base.h / p.base.w);
    const frame = el('div', 'thumbFrame'); frame.style.width = w + 'px'; frame.style.height = h + 'px';
    t.append(frame, el('div', 'thumbNum', p.num), el('div', 'thumbMarks'));
    t.onclick = () => App.goToPage(p.num);
    box.append(t); thumbObs.observe(t);
  }
  updateThumbMarks(); markCurrentThumb(true);
}
async function renderThumb(t){
  if (t.dataset.done) return;
  t.dataset.done = '1';
  const token = state.token;
  try {
    const page = await state.pdf.getPage(+t.dataset.page);
    const vp1 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: 120 * Math.min(devicePixelRatio || 1, 2) / vp1.width });
    const c = el('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    await page.render({ canvasContext: c.getContext('2d', { willReadFrequently: true }), viewport: vp }).promise;
    if (token === state.token) t.querySelector('.thumbFrame').append(c);
  } catch (e) { t.dataset.done = ''; }
}
function markCurrentThumb(scroll){
  const cur = $('.thumb.current'); if (cur) cur.classList.remove('current');
  const t = $(`.thumb[data-page="${state.currentPage}"]`);
  if (!t) return;
  t.classList.add('current');
  if (scroll && pane === 'thumbs' && document.body.classList.contains('side-open')) t.scrollIntoView({ block: 'nearest' });
}
function updateThumbMarks(){
  if (built.thumbs !== state.fp) return;
  const byPage = new Map();
  for (const h of state.highlights) for (const part of h.parts) {
    const s = byPage.get(part.page) || new Set(); s.add(h.color); byPage.set(part.page, s);
  }
  const bms = new Set(state.bookmarks.map(b => b.page));
  $$('.thumb').forEach(t => {
    const n = +t.dataset.page, box = t.querySelector('.thumbMarks'); box.innerHTML = '';
    if (bms.has(n)) box.append(el('i', 'bm'));
    [...(byPage.get(n) || [])].slice(0, 4).forEach(c => { const i = el('i'); i.style.setProperty('--c', App.colorOf(c).hex); box.append(i); });
  });
}

// ---------- Marcadores ----------
App.toggleBookmark = () => {
  if (!state.pdf) return;
  const n = state.currentPage;
  const ex = state.bookmarks.find(b => b.page === n);
  if (ex) {
    state.bookmarks = state.bookmarks.filter(b => b !== ex);
    App.toast(`Marcador da página ${n} removido`);
    bookmarksChanged();
  } else {
    const b = { id: App.uid(), page: n, title: '', created: Date.now() };
    state.bookmarks.push(b);
    bookmarksChanged();
    App.showSide('bookmarks');
    const inp = $(`.bm[data-id="${b.id}"] input`);
    if (inp) inp.focus();
    App.toast(`Página ${n} marcada — dê um nome se quiser (Enter)`);
  }
};
function bookmarksChanged(){ renderBookmarks(); renderRibbons(); updateThumbMarks(); updateBookmarkBtn(); App.saveDocSoon(); }
function renderBookmarks(){
  const box = $('#bookmarkList'); box.innerHTML = '';
  if (!state.bookmarks.length) {
    box.append(App.emptyState('bookmark', 'Nenhum marcador', 'Aperte B para marcar a página atual — ex.: "parei aqui", "rever antes da prova".'));
    return;
  }
  for (const b of [...state.bookmarks].sort((a, c) => a.page - c.page)) {
    const row = el('div', 'bm'); row.dataset.id = b.id;
    const inp = el('input'); inp.value = b.title; inp.placeholder = `Página ${b.page} — dê um nome`;
    inp.oninput = () => { b.title = inp.value; renderRibbons(); App.saveDocSoon(); };
    inp.onkeydown = e => { if (e.key === 'Enter') inp.blur(); };
    const go = el('button', 'go', `p. ${b.page}`); go.title = 'Ir para a página'; go.onclick = () => App.goToPage(b.page);
    const rm = App.ibtn('x', null, () => { state.bookmarks = state.bookmarks.filter(x => x !== b); bookmarksChanged(); }, 'sm', 'Remover marcador');
    row.append(el('span', 'bmIcon'), inp, go, rm);
    box.append(row);
  }
}
function renderRibbons(){
  $$('.page .ribbon').forEach(r => r.remove());
  for (const b of state.bookmarks) {
    const p = state.pages[b.page - 1]; if (!p) continue;
    const r = el('div', 'ribbon'); r.title = b.title || 'Página marcada';
    r.onclick = () => App.showSide('bookmarks');
    p.el.append(r);
  }
}
function updateBookmarkBtn(){
  $('#btnBookmark').classList.toggle('on', state.bookmarks.some(b => b.page === state.currentPage));
}
$('#btnBookmark').onclick = App.toggleBookmark;

// ---------- Eventos ----------
App.on('doc:loaded', () => {
  built = { outline: null, thumbs: null };
  $('#outline').innerHTML = ''; $('#thumbs').innerHTML = '';
  renderBookmarks(); renderRibbons(); updateBookmarkBtn();
  if (document.body.classList.contains('side-open')) App.showSide(pane);
});
App.on('doc:closed', () => { built = { outline: null, thumbs: null }; if (thumbObs) thumbObs.disconnect(); });
App.on('page:changed', () => { markCurrentThumb(true); updateBookmarkBtn(); });
App.on('hl:changed', updateThumbMarks);
// redesenha sem salvar (dados vieram do banco: backup restaurado ou outra janela)
App.on('bookmarks:reload', () => { renderBookmarks(); renderRibbons(); updateThumbMarks(); updateBookmarkBtn(); });

App.initSidebar = () => {
  $$('.sideTabs button').forEach(b => b.classList.toggle('on', b.dataset.side === pane));
  $$('#sidebar section').forEach(s => s.classList.toggle('on', s.dataset.pane === pane));
  if (App.ls.get('le.side', false)) document.body.classList.add('side-open');
};
})();
