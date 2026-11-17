/* Modo revisão: cada grifo vira um cartão, com repetição espaçada simples (caixas de Leitner). */
(() => {
'use strict';
const App = window.App;
const { $, el, btn, state, ls } = App;

const box = $('#review');
const DAY = 864e5;
const INTERVALS = [0, 1, 3, 7, 16, 35]; // dias até a próxima revisão, por caixa
let deck = [], idx = 0, revealed = false, tally = { 1: 0, 2: 0, 3: 0 }, requeued = new Set();
let chosen = new Set(App.COLORS.map(c => c.id)), onlyDue = true, shuffle = true, revealFn = null;

const reviewable = () => state.highlights.filter(h => h.kind !== 'ink' && h.kind !== 'note' && (h.text || h.img));
const isDue = h => !h.srs || h.srs.due <= Date.now();
App.reviewOpen = false;

App.openReview = () => {
  if (!state.pdf) return;
  if (!reviewable().length) { App.toast('Grife alguns trechos primeiro — eles viram cartões de revisão.'); return; }
  App.closePopup();
  App.reviewOpen = true; box.hidden = false;
  setup();
};
$('#btnReview').onclick = App.openReview;

function close(){
  box.hidden = true; App.reviewOpen = false; deck = [];
  App.saveDocSoon(); App.renderPanel();
}

function setup(){
  deck = []; revealFn = null;
  box.innerHTML = '';
  const card = el('div', 'rvCard');
  card.append(el('h2', null, 'Revisar grifos'));
  card.append(el('p', 'muted', 'Cada grifo vira um cartão: tente lembrar o trecho antes de revelar. Dica: escreva uma pergunta na nota do grifo — ela aparece como enunciado do cartão.'));

  const all = reviewable();
  const chips = el('div', 'rvChips');
  for (const c of App.COLORS) {
    const n = all.filter(h => h.color === c.id).length;
    if (!n) continue;
    const b = el('button', 'rvChip' + (chosen.has(c.id) ? ' on' : ''), `${App.labelOf(c.id)} (${n})`);
    b.style.setProperty('--c', c.hex);
    b.onclick = () => { chosen.has(c.id) ? chosen.delete(c.id) : chosen.add(c.id); setup(); };
    chips.append(b);
  }
  card.append(el('div', 'rvLabel', 'Cores'), chips);

  const pool = all.filter(h => chosen.has(h.color));
  const due = pool.filter(isDue);
  const opts = el('div', 'rvOpts');
  opts.append(
    radio('Só os pendentes', due.length, onlyDue, () => { onlyDue = true; setup(); }),
    radio('Todos', pool.length, !onlyDue, () => { onlyDue = false; setup(); }),
  );
  const sh = el('label', 'rvCheck'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = shuffle;
  cb.onchange = () => { shuffle = cb.checked; };
  sh.append(cb, 'Embaralhar'); opts.append(sh);
  card.append(el('div', 'rvLabel', 'Quais cartões'), opts);

  const list = onlyDue ? due : pool;
  const actions = el('div', 'rvActions');
  const start = btn(list.length ? `Começar (${list.length})` : 'Nada pendente', () => begin(list), 'primary');
  start.disabled = !list.length;
  actions.append(start, btn('Exportar para o Anki', () => App.exportAnki(pool)), btn('Fechar (Esc)', close));
  card.append(actions);
  if (!due.length && pool.length) card.append(el('p', 'muted small', 'Tudo em dia! Cada cartão volta na data certa de revisão. Escolha "Todos" para revisar mesmo assim.'));
  box.append(card);
  start.focus();
}
function radio(label, count, on, fn){
  const b = el('button', 'rvRadio' + (on ? ' on' : ''));
  b.append(el('span', null, label), el('span', 'rvCount', count));
  b.onclick = fn; return b;
}

function begin(list){
  deck = shuffle ? [...list] : App.sortedHighlights(list);
  if (shuffle) for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  idx = 0; tally = { 1: 0, 2: 0, 3: 0 }; requeued = new Set();
  show();
}

function show(){
  if (idx >= deck.length) return finish();
  revealed = false;
  const h = deck[idx];
  box.innerHTML = '';
  const card = el('div', 'rvCard');
  const top = el('div', 'rvTop');
  const tag = el('span', 'rvTag', App.labelOf(h.color)); tag.style.setProperty('--c', App.colorOf(h.color).hex);
  top.append(tag, el('span', 'muted small', `p. ${App.anchorOf(h).page} · cartão ${idx + 1} de ${deck.length}`));
  const bar = el('div', 'progress'); const f = el('div'); f.style.width = (idx / deck.length * 100) + '%'; bar.append(f);
  card.append(top, bar);
  let body;
  if (h.q) {
    // questão errada no simulado: a questão fica visível, o gabarito é a resposta
    card.append(el('div', 'rvPrompt', `Questão ${h.q.n} — qual é a resposta?`));
    const qbox = el('div', 'rvBody');
    if (h.img) { const im = el('img', 'rvImg'); im.src = h.img; im.alt = ''; qbox.append(im); }
    else if (h.text) qbox.append(el('div', 'rvText', h.text));
    card.append(qbox);
    body = el('div', 'rvBody rvAnswer hidden'); body.title = 'Clique para revelar';
    body.append(el('div', 'rvKey', `Gabarito: ${h.q.key}`), el('div', 'muted', h.q.ans ? `No simulado você marcou ${h.q.ans}.` : 'No simulado você deixou em branco.'));
    if (h.q.comment) {
      const cm = el('div', 'rvComment');
      if (h.q.src) cm.append(el('div', 'resSrc', h.q.src));
      cm.append(el('div', null, h.q.comment));
      body.append(cm);
    }
    card.append(body);
  } else {
    card.append(el('div', 'rvPrompt', h.note || 'Lembra o que você grifou aqui?'));
    body = el('div', 'rvBody hidden'); body.title = 'Clique para revelar';
    if (h.img) { const im = el('img', 'rvImg'); im.src = h.img; im.alt = ''; body.append(im); }
    if (h.text) body.append(el('div', 'rvText', h.text));
    card.append(body);
  }
  const actions = el('div', 'rvActions');
  const rv = btn('Mostrar resposta (Espaço)', () => reveal(), 'primary');
  actions.append(rv); card.append(actions);
  const foot = el('div', 'rvFoot');
  const aiBtn = App.ibtn('sparkle', h.q ? 'Explicar com IA' : 'Perguntar à IA', () => {
    if (h.q) App.aiMenu(aiBtn, { text: h.text, image: h.img, page: App.anchorOf(h).page, src: 'trecho' }, { title: `Questão ${h.q.n}`, question: h });
    else App.aiMenu(aiBtn, { text: h.text, image: h.img, note: h.note, page: App.anchorOf(h).page, src: 'trecho' }, { title: 'Este cartão' });
  }, 'soft');
  foot.append(btn('Ver no PDF', () => { close(); App.jumpTo(h); }), aiBtn, btn('Encerrar (Esc)', finish));
  card.append(foot);
  box.append(card);
  rv.focus();
  function reveal(){
    if (revealed) return;
    revealed = true; body.classList.remove('hidden'); body.title = '';
    actions.innerHTML = '';
    [[1, 'Não lembrei', 'bad'], [2, 'Difícil', 'mid'], [3, 'Lembrei', 'good']].forEach(([g, l, c]) =>
      actions.append(btn(`${l} (${g})`, () => grade(g), 'grade ' + c)));
  }
  body.onclick = reveal;
  revealFn = reveal;
}

function grade(g){
  if (!revealed) return;
  const h = deck[idx], now = Date.now();
  const s = h.srs || { box: 0, due: 0 };
  if (g === 1) {
    s.box = 0; s.due = now;
    if (!requeued.has(h.id)) { requeued.add(h.id); deck.push(h); }
  } else if (g === 2) {
    s.box = Math.max(1, s.box); s.due = now + INTERVALS[s.box] * DAY;
  } else {
    s.box = Math.min(INTERVALS.length - 1, s.box + 1); s.due = now + INTERVALS[s.box] * DAY;
  }
  s.last = now; h.srs = s; tally[g]++;
  App.saveDocSoon();
  idx++; show();
}

function finish(){
  deck = []; revealed = false; revealFn = null;
  box.innerHTML = '';
  const card = el('div', 'rvCard center');
  card.append(el('h2', null, 'Revisão concluída'));
  card.append(el('p', null, `${tally[3]} lembrados · ${tally[2]} difíceis · ${tally[1]} para rever`));
  card.append(el('p', 'muted small', 'Os cartões voltam automaticamente: os fáceis em alguns dias, os difíceis antes.'));
  const a = el('div', 'rvActions');
  const again = btn('Voltar às opções', setup, 'primary');
  a.append(again, btn('Fechar (Esc)', close));
  card.append(a); box.append(card); again.focus();
}

document.addEventListener('keydown', e => {
  if (!App.reviewOpen) return;
  if (e.target.tagName === 'INPUT' && e.key !== 'Escape') return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (deck.length && idx < deck.length) finish(); else close(); return; }
  if (e.key === ' ' && deck.length && !revealed && revealFn) { e.preventDefault(); revealFn(); return; }
  if (['1', '2', '3'].includes(e.key) && revealed) { e.preventDefault(); grade(+e.key); }
}, true);
// ---------- Lembretes de revisão ----------
// ao abrir o Vetra (uma vez por dia) e ao abrir um PDF com cartões vencidos (uma vez por dia em cada PDF)
const dueIn = list => (list || []).filter(h => h.srs && h.srs.due <= Date.now() && h.kind !== 'ink' && h.kind !== 'note').length;
App.reviewRemind = () => ls.get('le.rvRemind', true);
App.toggleReviewRemind = () => { const on = !App.reviewRemind(); ls.set('le.rvRemind', on); App.toast(on ? 'Lembretes de revisão ligados.' : 'Lembretes de revisão desligados.'); App.refreshPins?.(); };
App.on('doc:loaded', () => {
  if (!App.reviewRemind() || App.examOpen?.()) return;
  const n = dueIn(state.highlights); if (!n) return;
  const today = App.dayKey(), seen = ls.get('le.rvHint', {});
  if (seen[state.fp] === today) return;
  seen[state.fp] = today;
  ls.set('le.rvHint', Object.fromEntries(Object.entries(seen).filter(([, d]) => d === today)));
  setTimeout(() => App.toast(`${n} cartão(ões) para revisar hoje neste PDF — aperte R para revisar.`), 1500);
});
setTimeout(async () => {
  if (!App.reviewRemind() || ls.get('le.rvDay', '') === App.dayKey()) return;
  const docs = await App.safe(() => App.DB.all('docs'), []);
  const n = docs.reduce((s2, d) => s2 + dueIn(d.highlights), 0);
  if (!n) return;
  ls.set('le.rvDay', App.dayKey());
  App.toast(`${n} revisão(ões) para hoje — veja "Para revisar hoje" na página inicial.`);
}, 5500);
})();
