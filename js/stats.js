/* Tempo de estudo e progresso de leitura por documento. */
(() => {
'use strict';
const App = window.App;
const { $, el, state } = App;

const TICK = 15; // segundos
const IDLE = 120000; // 2 min sem interação = pausa
let lastActivity = Date.now(), pageEnter = { page: null, t: 0 };
const touch = () => { lastActivity = Date.now(); };
['pointermove', 'pointerdown', 'keydown', 'wheel'].forEach(t => addEventListener(t, touch, { passive: true, capture: true }));
$('#viewer').addEventListener('scroll', touch, { passive: true });
// estudando = mexeu no app há pouco, ou está fazendo um simulado (que conta mesmo lendo parado)
const active = () => state.pdf && !App.reviewOpen && ((!document.hidden && Date.now() - lastActivity < IDLE) || (App.examRunning && App.examRunning()) || (App.pomoFocus && App.pomoFocus()) || (App.ttsActive && App.ttsActive()));

function markVisited(n){
  if (!n || state.stats.visited.includes(n)) return false;
  state.stats.visited.push(n); return true;
}
App.isStudying = () => !!state.pdf && !App.reviewOpen && !document.hidden && Date.now() - lastActivity < IDLE || !!(App.examRunning && App.examRunning());
App.docProgress = rec => rec && rec.kind === 'epub' ? Math.min(100, Math.round(rec.pct || 0)) : rec && rec.pages ? Math.min(100, Math.round(100 * (rec.visited || []).length / rec.pages)) : 0;
App.docTotalTime = rec => Object.values((rec && rec.time) || {}).reduce((a, b) => a + b, 0);

setInterval(() => {
  if (!state.pdf) return;
  // revisão também conta como tempo de estudo
  if (!(active() || (App.reviewOpen && Date.now() - lastActivity < IDLE && !document.hidden))) return;
  const k = App.dayKey();
  state.stats.time[k] = (state.stats.time[k] || 0) + TICK;
  if (!App.reviewOpen) markVisited(state.currentPage);
  render(); App.saveDocSoon();
}, TICK * 1000);

App.on('page:changed', ({ page }) => {
  const now = Date.now();
  if (pageEnter.page && now - pageEnter.t >= 8000 && now - lastActivity < IDLE) { if (markVisited(pageEnter.page)) render(); }
  pageEnter = { page, t: now };
});
App.on('doc:loaded', () => { pageEnter = { page: state.currentPage, t: Date.now() }; render(); });
App.on('doc:closed', render);

function stat(k, v){ const d = el('div', 'stat'); d.append(el('span', null, k), el('strong', null, v)); return d; }
function render(){
  const box = $('#statsBar'); box.innerHTML = '';
  if (!state.pdf) return;
  const today = state.stats.time[App.dayKey()] || 0;
  const total = Object.values(state.stats.time).reduce((a, b) => a + b, 0);
  const pct = Math.min(100, Math.round(100 * state.stats.visited.length / Math.max(1, state.pages.length)));
  const row = el('div', 'statsRow');
  row.append(stat('Hoje', App.fmtDuration(today)), stat('Total', App.fmtDuration(total)), stat('Lido', pct + '%'));
  const bar = el('div', 'progress'); const fill = el('div'); fill.style.width = pct + '%'; bar.append(fill);
  bar.title = `${state.stats.visited.length} de ${state.pages.length} páginas lidas (conta quando você fica pelo menos alguns segundos na página)`;
  box.append(row, bar);
}
App.renderStats = render;
})();
