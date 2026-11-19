/* Tela inicial: saudação, continuar lendo (com capa), sua semana e backup. */
(() => {
'use strict';
const App = window.App;
const { $, el, state, DB, safe } = App;

function greeting(){
  const h = new Date().getHours();
  return h < 5 ? 'Boa madrugada' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

async function renderHome(){
  $('#greeting').textContent = greeting();
  const docs = await safe(() => DB.all('docs'), []);
  const recent = docs.filter(d => d.hasFile).sort((a, b) => b.ts - a.ts);
  const list = $('#recentList'); list.innerHTML = '';
  $('#recentWrap').hidden = !recent.length;
  $('#recentEmpty').hidden = !!recent.length;
  document.body.classList.toggle('has-recents', recent.length > 0);
  App.renderSubjectBar(recent);
  const shown = App.filterBySubject(recent);
  for (const d of shown) list.append(recentCard(d));
  if (recent.length && !shown.length) list.append(App.emptyState('folder', 'Nenhum PDF nesta disciplina', 'Use a etiqueta "Disciplina" em cada PDF para colocá-lo aqui.'));
  renderWeek(docs);
  App.renderToday?.(docs);
  App.renderBackupStatus?.();
}

function recentCard(d){
  const row = el('div', 'recent');
  const th = el('div', 'recentThumb');
  if (d.thumb) { const im = el('img'); im.src = d.thumb; im.alt = ''; th.append(im); } else th.append(App.icon('file'));
  const info = el('div', 'info');
  info.append(el('div', 'name', App.baseName(d.name)));
  const n = (d.highlights || []).length, pct = App.docProgress(d), time = App.docTotalTime(d);
  const meta = el('div', 'meta');
  const item = (icon, text) => { const s = el('span'); s.append(App.icon(icon), text); return s; };
  meta.append(item('highlighter', `${n} ${n === 1 ? 'grifo' : 'grifos'}`));
  if (time >= 60) meta.append(item('clock', App.fmtDuration(time)));
  meta.append(d.kind === 'epub' ? item('book', `cap. ${d.lastPage || 1}${d.pages ? ' de ' + d.pages : ''}`) : item('bookmark', `p. ${d.lastPage || 1}${d.pages ? ' de ' + d.pages : ''}`));
  meta.append(App.subjectTag(d));
  info.append(meta);
  const bar = el('div', 'progress'); const f = el('div'); f.style.width = pct + '%'; bar.append(f); info.append(bar);
  const rm = App.ibtn('x', null, async e => {
    e.stopPropagation();
    await App.dropFile(d.fp);
    if (App.tabList().some(t => t.fp === d.fp)) await App.closeTab(d.fp);
    App.toast('Removido da lista. Os grifos continuam guardados se você abrir o arquivo de novo.');
    renderHome();
  }, 'sm rm', 'Remover da lista');
  row.append(th, info, el('span', 'pct', pct + '%'), rm);
  row.title = `${d.name} — ${pct}% lido`;
  row.onclick = () => App.switchTab(d.fp, d.name);
  return row;
}

function renderWeek(docs){
  const box = $('#week'); box.innerHTML = '';
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d); }
  const totals = days.map(d => { const k = App.dayKey(d); return docs.reduce((s, doc) => s + ((doc.time || {})[k] || 0), 0); });
  const max = Math.max(...totals, 1800);
  const sum = totals.reduce((a, b) => a + b, 0);
  const tot = $('#weekTotal'); tot.innerHTML = '';
  tot.append(el('strong', null, App.fmtDuration(sum)), el('span', null, 'de estudo nos últimos 7 dias'));
  days.forEach((d, i) => {
    const col = el('div', 'day');
    col.title = `${d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' })}: ${App.fmtDuration(totals[i])}`;
    const bar = el('div', 'bar' + (i === 6 ? ' today' : ''));
    bar.style.height = Math.max(3, totals[i] / max * 70) + 'px';
    col.append(el('div', 'dv', totals[i] >= 60 ? App.fmtShort(totals[i]) : ''), bar,
      el('div', 'dl' + (i === 6 ? ' today' : ''), i === 6 ? 'hoje' : d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')));
    box.append(col);
  });
}

// Capa: miniatura da 1ª página, gerada uma vez por documento
App.on('doc:loaded', async () => {
  if (state.thumb || !state.pdf) return;
  const token = state.token;
  try {
    const page = await state.pdf.getPage(1);
    const vp1 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: 140 / vp1.width });
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    if (token !== state.token) return;
    state.thumb = c.toDataURL('image/jpeg', 0.72);
    App.saveDocSoon();
  } catch (e) { console.warn('capa', e); }
});

App.renderHome = renderHome;
App.on('home:show', renderHome);
})();
