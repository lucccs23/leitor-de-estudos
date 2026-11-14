/* Busca no texto do documento: ignora maiúsculas e acentos, lista resultados com contexto. */
(() => {
'use strict';
const App = window.App;
const { $, el, state } = App;

const input = $('#searchInput'), info = $('#searchInfo'), list = $('#searchResults');
let results = [], cur = -1, runId = 0, byPage = new Map();

const fold = App.fold; // minúsculas e sem acento, índices iguais ao texto original

App.openSearch = () => {
  App.showSide('search');
  const sel = App.hasSelection() ? getSelection().toString().trim() : '';
  if (sel && sel.length < 80) { input.value = sel; run(); }
  input.focus(); input.select();
};
$('#btnSearch').onclick = App.openSearch;
// vindo da busca geral: procura o mesmo termo neste documento, a partir da página atual
App.searchFor = q => { App.showSide('search'); input.value = q; run(); };
$('#searchAll').onclick = () => App.searchAll(input.value.trim());

let t;
input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 280); });
input.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); if (results.length) App.searchStep(e.shiftKey ? -1 : 1); else run(); }
  if (e.key === 'Escape') { input.blur(); $('#viewer').focus({ preventScroll: true }); }
});
$('#searchNext').onclick = () => App.searchStep(1);
$('#searchPrev').onclick = () => App.searchStep(-1);

function clearAll(){
  results = []; cur = -1; byPage = new Map();
  for (const p of state.pages) p.search.innerHTML = '';
  list.innerHTML = ''; info.textContent = '';
}

async function run(){
  const id = ++runId;
  const q = input.value.trim();
  clearAll();
  if (!state.pdf || q.length < 2) {
    if (q.length === 1) info.textContent = 'Digite pelo menos 2 letras';
    list.append(App.emptyState('search', 'Buscar no documento', 'Maiúsculas e acentos são ignorados: "celula" encontra "Célula".'));
    return;
  }
  const re = new RegExp(fold(q).split(/\s+/).map(App.escapeRe).join('\\s*'), 'g');
  const total = state.pages.length;
  for (let n = 1; n <= total; n++) {
    let pt;
    try { pt = await App.pageText(n); } catch { continue; }
    if (id !== runId) return;
    const f = pt.folded || (pt.folded = fold(pt.text));
    re.lastIndex = 0; let m;
    while ((m = re.exec(f))) {
      if (!m[0].length) { re.lastIndex++; continue; }
      const r = { page: n, start: m.index, end: m.index + m[0].length, pt };
      results.push(r);
      if (!byPage.has(n)) byPage.set(n, []);
      byPage.get(n).push(r);
      if (results.length >= 3000) break;
    }
    if (n % 15 === 0) info.textContent = `Buscando… ${n}/${total} páginas · ${results.length} resultado(s)`;
    if (results.length >= 3000) break;
  }
  if (id !== runId) return;
  info.textContent = results.length ? `${results.length}${results.length >= 3000 ? '+' : ''} resultado${results.length === 1 ? '' : 's'}` : 'Nenhum resultado';
  renderList();
  if (!results.length) list.append(App.emptyState('search', 'Nada encontrado', 'Tente outra palavra. Em PDFs escaneados (imagem) não há texto para buscar.'));
  for (const n of byPage.keys()) drawPage(n);
  if (results.length) {
    const first = results.findIndex(r => r.page >= state.currentPage);
    go(first < 0 ? 0 : first, false);
  }
}

function renderList(){
  list.innerHTML = '';
  results.slice(0, 600).forEach((r, i) => {
    const b = el('button', 'sr'); b.dataset.i = i;
    b.append(el('span', 'pg', 'Página ' + r.page));
    const s = r.pt.text, a = Math.max(0, r.start - 45), z = Math.min(s.length, r.end + 70);
    b.append((a > 0 ? '…' : '') + s.slice(a, r.start));
    b.append(el('mark', null, s.slice(r.start, r.end)));
    b.append(s.slice(r.end, z) + (z < s.length ? '…' : ''));
    b.onclick = () => go(i, true);
    list.append(b);
  });
  if (results.length > 600) list.append(el('p', 'muted small pad', `Mostrando 600 de ${results.length}. Use Enter/F3 para percorrer todos.`));
}

function drawPage(n){
  const p = state.pages[n - 1]; if (!p) return;
  p.search.innerHTML = '';
  for (const r of byPage.get(n) || []) {
    r.rects = r.rects || App.textRects(r.pt, r.start, r.end);
    for (const q of r.rects) {
      const d = el('div'); if (results[cur] === r) d.className = 'cur';
      d.style.cssText = `left:${q.x * 100}%;top:${q.y * 100}%;width:${q.w * 100}%;height:${q.h * 100}%`;
      p.search.append(d);
    }
  }
}

function go(i){
  if (!results.length) return;
  const prev = results[cur];
  cur = (i + results.length) % results.length;
  const r = results[cur];
  if (prev && prev.page !== r.page) drawPage(prev.page);
  drawPage(r.page);
  info.textContent = `${cur + 1} de ${results.length}${results.length >= 3000 ? '+' : ''}`;
  list.querySelectorAll('.sr.on').forEach(b => b.classList.remove('on'));
  const item = list.querySelector(`.sr[data-i="${cur}"]`);
  if (item) { item.classList.add('on'); item.scrollIntoView({ block: 'nearest' }); }
  const q = (r.rects || [])[0];
  App.goToPage(r.page, q ? q.y : 0);
}
App.searchStep = dir => {
  if (!results.length) { App.openSearch(); return; }
  go(cur + dir);
};

App.on('doc:loaded', () => { runId++; clearAll(); run(); });
App.on('doc:closed', () => { runId++; results = []; byPage = new Map(); list.innerHTML = ''; info.textContent = ''; });
})();
