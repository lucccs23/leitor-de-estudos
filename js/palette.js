/* Paleta de comandos (Ctrl+K): digite o nome de qualquer função, um número de página, um tema,
   um PDF recente ou um termo para buscar. Setas escolhem, Enter executa, Esc fecha. */
(() => {
'use strict';
const App = window.App;
const { $, el, state, DB, safe } = App;

let box = null, input = null, list = null, items = [], cur = 0, recents = [];
App.cmdkOpen = () => !!box;

const norm = s => App.fold(String(s || '')).trim();
function matches(q, text){
  const t = norm(text);
  return norm(q).split(/\s+/).filter(Boolean).every(w => t.includes(w));
}
function score(q, text){ const t = norm(text), n = norm(q); return t.startsWith(n) ? 0 : t.includes(' ' + n) ? 1 : 2; }

function collect(q){
  const out = [];
  const add = (o) => out.push(o);
  const query = q.trim();
  // número = ir para a página
  const m = /^(?:p(?:ag(?:ina)?)?\.?\s*)?(\d{1,5})$/i.exec(query);
  if (m && state.pdf) {
    const n = Math.min(state.pages.length, Math.max(1, +m[1]));
    add({ label: `Ir para a página ${n}`, icon: 'right', group: 'Navegar', run: () => App.goToPage(n) });
  }
  // funções
  for (const c of App.commands) {
    if (!App.commandAvailable(c)) continue;
    const text = `${c.label} ${c.short || ''} ${c.group} ${c.keywords || ''}`;
    if (!query || matches(query, text)) add({ label: c.label, icon: c.icon, group: c.group, key: c.key, on: c.on && c.on(), run: () => App.runCommand(c.id), s: query ? score(query, c.label) : 1 });
  }
  // temas
  for (const [id, T] of Object.entries(App.THEMES)) {
    if (query && matches(query, `tema ${T.name}`)) add({ label: `Tema: ${T.name}`, icon: 'moon', group: 'Exibir', on: App.currentTheme() === id, run: () => App.applyTheme(id, true), s: score(query, T.name) });
  }
  // PDFs recentes
  for (const d of recents) {
    if (query ? matches(query, d.name + ' ' + (d.subject || '')) : out.length < 14) add({ label: App.baseName(d.name), sub: d.subject || `${d.pages || '?'} páginas`, icon: 'file', group: 'Abrir', run: () => App.switchTab(d.fp, d.name), s: query ? score(query, d.name) + 0.5 : 3 });
  }
  // buscar o texto digitado
  if (query.length >= 2 && !m) {
    if (state.pdf) add({ label: `Buscar “${query}” neste PDF`, icon: 'search', group: 'Buscar', key: 'Enter', run: () => App.searchFor ? App.searchFor(query) : App.openSearch(), s: 4 });
    add({ label: `Buscar “${query}” em todos os PDFs`, icon: 'search', group: 'Buscar', run: () => App.searchAll(query), s: 4.5 });
    if (state.pdf) add({ label: `Perguntar à IA: “${query}”`, icon: 'ai', group: 'Estudar', run: () => App.aiAsk ? App.aiAsk(query) : App.aiOpen?.(), s: 5 });
  }
  if (query) out.sort((a, b) => (a.s ?? 2) - (b.s ?? 2));
  return out.slice(0, 40);
}

function render(){
  items = collect(input.value);
  cur = Math.min(cur, Math.max(0, items.length - 1));
  list.innerHTML = '';
  if (!items.length) { list.append(el('div', 'cmdkEmpty', 'Nada encontrado. Tente outra palavra.')); return; }
  let lastGroup = null;
  items.forEach((it, i) => {
    if (!input.value.trim() && it.group !== lastGroup) { list.append(el('div', 'cmdkGroup', it.group)); lastGroup = it.group; }
    const b = el('button', 'cmdkItem' + (i === cur ? ' cur' : '')); b.type = 'button'; b.dataset.i = i;
    b.append(App.icon(it.icon));
    const t = el('span', 'cmdkLabel', it.label); if (it.sub) t.append(el('small', null, it.sub));
    b.append(t);
    if (it.on) b.append(App.icon('check', 'i cmdkOn'));
    if (input.value.trim()) b.append(el('span', 'cmdkGrp', it.group));
    if (it.key) b.append(el('kbd', null, it.key));
    b.onmousemove = () => { if (cur !== i) { cur = i; mark(); } };
    b.onclick = () => run(i);
    list.append(b);
  });
}
function mark(){
  list.querySelectorAll('.cmdkItem').forEach(b => b.classList.toggle('cur', +b.dataset.i === cur));
  list.querySelector('.cmdkItem.cur')?.scrollIntoView({ block: 'nearest' });
}
function run(i){
  const it = items[i]; if (!it) return;
  close();
  setTimeout(() => it.run(), 0);
}

App.openPalette = async () => {
  if (box) { input.focus(); input.select(); return; }
  App.closePop?.(); App.closeBarMenus?.(); App.closePopup?.();
  box = el('div', 'cmdk'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Paleta de comandos');
  const panel = el('div', 'cmdkPanel');
  const field = el('div', 'cmdkField');
  input = el('input'); input.type = 'text'; input.placeholder = 'Digite uma função, uma página, um PDF ou o que quer buscar…'; input.setAttribute('aria-label', 'Comando');
  field.append(App.icon('search'), input, el('kbd', null, 'Esc'));
  list = el('div', 'cmdkList'); list.setAttribute('role', 'listbox');
  const foot = el('div', 'cmdkFoot');
  foot.append(el('span', null, '↑↓ escolher · Enter executar · Esc fechar'), el('span', null, 'Dica: digite um número para ir à página'));
  panel.append(field, list, foot);
  box.append(panel);
  box.addEventListener('mousedown', e => { if (e.target === box) close(); });
  document.body.append(box);
  input.addEventListener('input', () => { cur = 0; render(); });
  input.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'ArrowDown') { e.preventDefault(); cur = (cur + 1) % Math.max(1, items.length); mark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); cur = (cur - 1 + items.length) % Math.max(1, items.length); mark(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(cur); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  recents = (await safe(() => DB.all('docs'), [])).filter(d => d.hasFile).sort((a, b) => b.ts - a.ts).slice(0, 30);
  cur = 0; render();
  input.focus();
};
function close(){ if (!box) return; box.remove(); box = null; input = null; list = null; }
App.closePalette = close;

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
    e.preventDefault(); e.stopPropagation();
    if (box) close(); else App.openPalette();
  }
}, true);
})();
