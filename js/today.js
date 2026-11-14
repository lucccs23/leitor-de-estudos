/* "Hoje": meta diária de estudo, sequência de dias, revisões pendentes e o timer do Vetra
   (pomodoro com esquemas, cronômetro e timer flutuante na página). Funciona sozinho em qualquer aparelho. */
(() => {
'use strict';
const App = window.App;
const { $, el, state, ls } = App;

// ---------- Pomodoro ----------
// Estado no localStorage (vale para todas as janelas):
//   pomodoro: { phase:'focus'|'break', len, end, paused, left, brk }
//   cronômetro: { phase:'focus', sw:true, t0, paused, left }  (left = segundos contados, quando pausado)
let P = ls.get('le.pomo', null);
const save = () => ls.set('le.pomo', P);
const isSW = () => !!(P && P.sw);
const secsLeft = () => !P ? 0 : P.paused ? P.left : P.sw ? Math.round((Date.now() - P.t0) / 1000) : Math.max(0, Math.round((P.end - Date.now()) / 1000));
const mmss = s => s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
App.pomoFocus = () => (!!P && P.phase === 'focus' && !P.paused) || !!App.focusRunningFocus?.();
const todayCount = () => (ls.get('le.pomoDays', {})[App.dayKey()] || 0);

function start(phase, min, brk){
  P = { phase, len: min * 60, end: Date.now() + min * 60000, paused: false, brk: brk || (P && P.brk) || 5 };
  save(); render();
}
function startSW(){ P = { phase: 'focus', sw: true, t0: Date.now(), paused: false, left: 0 }; save(); render(); }
function pauseResume(){
  if (!P) return;
  if (P.paused) { if (P.sw) P.t0 = Date.now() - P.left * 1000; else P.end = Date.now() + P.left * 1000; P.paused = false; }
  else { P.left = secsLeft(); P.paused = true; }
  save(); render();
}
function addMin(m){ if (!P || P.sw) return; if (P.paused) P.left += m * 60; else P.end += m * 60000; P.len += m * 60; save(); render(); }
function stop(){
  if (P && P.sw) {
    const s = secsLeft();
    if (s >= 60) { App.recordSession?.('cronometro', Date.now() - s * 1000, s * 1000); App.toast(`Cronômetro parado: ${App.fmtDuration(s)} de foco`); }
  } else if (P && P.phase === 'focus') {
    // pomodoro interrompido: o tempo já feito também conta
    const done = P.len - secsLeft();
    if (done >= 60) App.recordSession?.('pomodoro', Date.now() - done * 1000, done * 1000).then(s => { if (s) { s.partial = true; ls.set('le.sessions', App.timerSessions()); } });
  }
  P = null; save(); render();
}
// encerra a etapa agora (o que foi feito do foco é o que conta)
function endNow(){ if (!P || P.sw) return; if (P.phase === 'focus') P.done = P.len - secsLeft(); P.end = Date.now(); P.paused = false; save(); finish(); }

// ---------- Esquemas de foco (configuráveis) ----------
const DEFAULT_CFG = {
  schemes: [{ id: 'a', name: '', focus: 25, brk: 5 }, { id: 'b', name: '', focus: 50, brk: 10 }, { id: 'c', name: '', focus: 90, brk: 15 }],
  longEvery: 4, longMin: 15, autoBreak: true, sound: true,
};
const cfg = () => { const c = { ...DEFAULT_CFG, ...ls.get('le.pomoCfg', {}) }; if (!Array.isArray(c.schemes) || !c.schemes.length) c.schemes = DEFAULT_CFG.schemes.map(x => ({ ...x })); return c; };
const saveCfg = c => ls.set('le.pomoCfg', c);
const schemeName = s => (s.name || '').trim() || `Foco de ${s.focus} min`;
App.pomoSchemes = () => cfg().schemes;
function startScheme(s){ ls.set('le.pomoLast', { focus: s.focus, brk: s.brk }); start('focus', s.focus, s.brk); }

function finish(){
  // outra janela pode já ter tratado o fim deste ciclo
  const cur = ls.get('le.pomo', null);
  if (!cur || cur.end !== P.end || cur.phase !== P.phase) { P = cur; render(); return; }
  const C = cfg();
  if (C.sound) beep(P.phase === 'focus');
  if (P.phase === 'focus') {
    // vira uma sessão nas estatísticas (encerrado antes da hora: conta só o que passou)
    const done = Math.max(0, P.done != null ? P.done : P.len);
    App.recordSession?.('pomodoro', Date.now() - done * 1000, done * 1000);
    const days = ls.get('le.pomoDays', {}); const k = App.dayKey();
    days[k] = (days[k] || 0) + 1; ls.set('le.pomoDays', days);
    const n = days[k], long = C.longEvery > 0 && n % C.longEvery === 0;
    const brk = long ? Math.max(C.longMin, P.brk) : P.brk;
    const again = () => start('focus', Math.round((cur.len || 1500) / 60), cur.brk);
    if (C.autoBreak) {
      start('break', brk);
      alertBox(`Pomodoro concluído (${n} hoje). Pausa de ${brk} min${long ? ` — a cada ${C.longEvery}, uma pausa maior` : ''}.`, [['Pular a pausa', again], ['OK', null]]);
    } else {
      stop();
      alertBox(`Pomodoro concluído (${n} hoje). Hora de uma pausa de ${brk} min.`, [['Começar a pausa', () => start('break', brk)], ['Mais um foco', again]]);
    }
  } else {
    const last = ls.get('le.pomoLast', { focus: 25, brk: 5 });
    stop();
    alertBox('A pausa terminou. Bora voltar?', [['Mais um pomodoro', () => start('focus', last.focus, last.brk)], ['Agora não', null]]);
  }
  App.renderHome && !state.pdf && App.renderHome();
}
addEventListener('storage', e => { if (e.key === 'le.pomo') { P = ls.get('le.pomo', null); render(); } });

let audio;
function beep(long){
  try {
    audio = audio || new AudioContext();
    const notes = long ? [660, 880, 990] : [880, 660];
    notes.forEach((f, i) => {
      const o = audio.createOscillator(), g = audio.createGain(), t0 = audio.currentTime + i * 0.28;
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
      o.connect(g).connect(audio.destination); o.start(t0); o.stop(t0 + 0.27);
    });
  } catch {}
}
let alertEl = null, alertT;
function alertBox(msg, actions){
  alertEl?.remove(); clearTimeout(alertT);
  const a = el('div', 'pomoAlert'); a.setAttribute('role', 'alert');
  a.append(App.icon('clock'), el('span', null, msg));
  const acts = el('div', 'pomoAlertActs');
  actions.forEach(([label, fn], i) => acts.append(App.btn(label, () => { a.remove(); fn && fn(); }, i === actions.length - 1 ? 'primary sm' : 'sm')));
  a.append(acts); document.body.append(a); alertEl = a;
  alertT = setTimeout(() => a.remove(), 30000);
}

// ---------- Janela "Esquemas de foco" ----------
let dlg = null;
function openPomoSettings(){
  dlg = App.dialog('pomoDlg', 'pomoDlg'); dlg.setAttribute('aria-label', 'Esquemas de foco');
  buildDlg();
  if (!dlg.open) dlg.showModal();
}
App.openPomoSettings = openPomoSettings;
function buildDlg(){
  const C = cfg();
  dlg.innerHTML = '';
  const head = el('div', 'helpHead');
  head.append(el('h2', null, 'Esquemas de foco'), App.ibtn('x', null, () => dlg.close(), 'sm', 'Fechar (Esc)'));
  const body = el('div', 'pomoBody');
  body.append(el('p', 'muted small', 'Cada esquema aparece no menu do relógio. Dê um nome se quiser (ex.: "Questões", "Leitura de livro").'));
  const list = el('div', 'pomoList');
  const head2 = el('div', 'pomoRow pomoRowHead');
  head2.append(el('span', null, 'Nome (opcional)'), el('span', null, 'Foco'), el('span', null, 'Pausa'), el('span'));
  list.append(head2);
  const save = () => saveCfg(C);
  const num = (v, min, max, on) => {
    const i = el('input', 'pomoNum'); i.type = 'number'; i.min = min; i.max = max; i.value = v;
    i.onchange = () => { const n = Math.max(min, Math.min(max, Math.round(+i.value || min))); i.value = n; on(n); save(); };
    i.onkeydown = e => e.stopPropagation();
    const w = el('label', 'pomoNumWrap'); w.append(i, el('span', null, 'min')); return w;
  };
  C.schemes.forEach((s, idx) => {
    const row = el('div', 'pomoRow');
    const name = el('input', 'pomoName'); name.type = 'text'; name.maxLength = 30; name.value = s.name || ''; name.placeholder = `Foco de ${s.focus} min`;
    name.oninput = () => { s.name = name.value; save(); };
    name.onkeydown = e => e.stopPropagation();
    const del = App.ibtn('trash', null, () => { C.schemes.splice(idx, 1); save(); buildDlg(); }, 'sm', 'Remover esquema');
    del.disabled = C.schemes.length === 1;
    row.append(name, num(s.focus, 1, 240, n => { s.focus = n; name.placeholder = `Foco de ${n} min`; }), num(s.brk, 1, 60, n => { s.brk = n; }), del);
    list.append(row);
  });
  body.append(list);
  const add = App.ibtn('plus', 'Adicionar esquema', () => {
    C.schemes.push({ id: App.uid(), name: '', focus: 40, brk: 8 }); save(); buildDlg();
    const rows = dlg.querySelectorAll('.pomoList .pomoName'); rows[rows.length - 1]?.focus();
  }, 'sm outline');
  add.disabled = C.schemes.length >= 8;
  body.append(add);

  const opts = el('div', 'pomoOpts');
  const longRow = el('div', 'pomoLong');
  longRow.append(el('span', null, 'Pausa maior a cada'));
  const every = el('input', 'pomoNum'); every.type = 'number'; every.min = 0; every.max = 12; every.value = C.longEvery;
  every.onchange = () => { C.longEvery = Math.max(0, Math.min(12, Math.round(+every.value || 0))); every.value = C.longEvery; save(); };
  every.onkeydown = e => e.stopPropagation();
  longRow.append(every, el('span', null, 'focos, de'), num(C.longMin, 1, 60, n => { C.longMin = n; }));
  opts.append(longRow, el('p', 'muted small', 'Use 0 para nunca ter pausa maior.'));
  const chk = (label, key, sub) => {
    const l = el('label', 'lookCheck'); const c = el('input'); c.type = 'checkbox'; c.checked = !!C[key];
    c.onchange = () => { C[key] = c.checked; save(); };
    const t = el('span'); t.append(label); if (sub) t.append(el('small', null, sub)); l.append(c, t); return l;
  };
  opts.append(chk('Começar a pausa sozinho', 'autoBreak', 'desligado, o leitor pergunta antes'), chk('Tocar um aviso no fim', 'sound'));
  body.append(opts);
  const foot = el('div', 'lookFoot');
  foot.append(App.btn('Restaurar padrão', () => { saveCfg({ ...DEFAULT_CFG, schemes: DEFAULT_CFG.schemes.map(x => ({ ...x })) }); buildDlg(); }, 'sm outline'), App.btn('Pronto', () => dlg.close(), 'primary'));
  dlg.append(head, body, foot);
}

const chip = $('#btnPomo'), chipTime = $('#pomoTime');
function render(){ renderChip(); renderPomoCard(); renderFloat(); }
function renderChip(){
  const s = secsLeft();
  chip.classList.toggle('running', !!P);
  chip.classList.toggle('brk', !!P && P.phase === 'break');
  chip.classList.toggle('paused', !!P && P.paused);
  chipTime.textContent = P ? mmss(s) : '';
  chip.title = !P ? 'Timer — pomodoro ou cronômetro' : P.sw ? `Cronômetro: ${mmss(s)}${P.paused ? ' (pausado)' : ''}` : `${P.phase === 'focus' ? 'Foco' : 'Pausa'}: faltam ${mmss(s)}${P.paused ? ' (pausado)' : ''}`;
}
App.renderPomoChip = renderChip;
setInterval(() => {
  if (!P) return;
  if (!P.paused && !P.sw && secsLeft() <= 0) { finish(); return; }
  chipTime.textContent = mmss(secsLeft());
  const t = $('#todayPomo .pomoBig'); if (t) t.textContent = mmss(secsLeft());
  tickFloat();
}, 1000);

const floatItem = () => ({ label: 'Timer flutuante na página', icon: 'clock', checked: floatOn(), on: toggleFloat });
// itens extras do Focus (só no computador, com o Focus aberto): para onde vai o tempo de leitura
const focusItems = anchor => (App.focusMenuItems ? App.focusMenuItems(anchor) : []);
function pomoMenu(anchor){
  const n = todayCount();
  const title = `Timer · ${App.plural(n, 'pomodoro', 'pomodoros')} hoje`;
  if (!P) {
    const C = cfg();
    App.popMenu(anchor, [
      ...C.schemes.map(s => ({ label: schemeName(s), sub: `${(s.name || '').trim() ? s.focus + ' min · ' : ''}pausa de ${s.brk}`, icon: 'play', on: () => startScheme(s) })),
      { label: 'Cronômetro', sub: 'conta para cima', icon: 'clock', on: startSW },
      { sep: true },
      { label: 'Só uma pausa de 5 min', icon: 'pause', on: () => start('break', 5) },
      { label: 'Configurar esquemas…', icon: 'edit', on: openPomoSettings },
      { label: 'Estatísticas', icon: 'chart', on: () => App.openStats?.() },
      floatItem(),
      ...focusItems(anchor),
    ], { title, alignRight: true });
  } else {
    App.popMenu(anchor, [
      { label: P.paused ? 'Continuar' : 'Pausar', icon: P.paused ? 'play' : 'pause', on: pauseResume },
      ...(P.sw ? [] : [{ label: 'Mais 5 minutos', icon: 'plus', on: () => addMin(5) }]),
      ...(P.phase === 'focus' && !P.sw ? [{ label: 'Encerrar e ir para a pausa', icon: 'check', on: endNow }] : []),
      { sep: true },
      { label: P.sw ? 'Parar o cronômetro' : 'Parar o pomodoro', icon: 'x', danger: true, on: stop },
      floatItem(),
      ...focusItems(anchor),
    ], { title: `${P.sw ? 'Cronômetro' : P.phase === 'focus' ? 'Foco' : 'Pausa'} · ${mmss(secsLeft())}`, alignRight: true });
  }
}
App.pomoMenu = pomoMenu;
chip.onclick = () => pomoMenu(chip);

// ---------- Timer flutuante sobre o PDF (aparece com o timer ligado) ----------
const fl = $('#focusFloat');
const floatOn = () => ls.get('le.focusFloat', true);
function toggleFloat(){ ls.set('le.focusFloat', !floatOn()); renderFloat(); App.toast(floatOn() ? 'Timer flutuante na página ligado' : 'Timer flutuante escondido (o relógio da barra continua)'); }
App.toggleFocusFloat = toggleFloat;
let flBuilt = false;
function buildFloat(){
  fl.innerHTML = '';
  const dot = el('span', 'ffDot');
  const info = el('div', 'ffInfo');
  const lbl = el('button', 'ffLbl'); lbl.type = 'button'; lbl.title = 'Opções do timer';
  lbl.onclick = e => { e.stopPropagation(); pomoMenu(lbl); };
  info.append(el('div', 'ffTime'), lbl);
  const acts = el('div', 'ffActs');
  acts.append(App.ibtn('play', null, pauseResume, 'sm ffPlay', 'Pausar / continuar'),
    App.ibtn('right', null, endNow, 'sm ffSkip', 'Pular para a próxima etapa'),
    App.ibtn('x', null, stop, 'sm', 'Parar'),
    App.ibtn('shrink', null, toggleFloat, 'sm ffClose', 'Esconder o timer flutuante'));
  const bar = el('div', 'ffBar'); bar.append(el('i'));
  fl.append(dot, info, acts, bar);
  flBuilt = true;
}
function renderFloat(){
  const show = !!P && !!state.pdf && floatOn();
  fl.hidden = !show;
  if (!show) return;
  if (!flBuilt) { buildFloat(); placeFloat(); }
  fl.classList.toggle('brk', P.phase === 'break');
  fl.classList.toggle('paused', !!P.paused);
  fl.classList.toggle('sw', !!P.sw);
  const play = fl.querySelector('.ffPlay');
  play.replaceChildren(App.icon(P.paused ? 'play' : 'pause')); play.title = P.paused ? 'Continuar' : 'Pausar';
  fl.querySelector('.ffSkip').hidden = !!P.sw;
  fl.querySelector('.ffLbl').textContent = (P.sw ? 'cronômetro' : P.phase === 'focus' ? 'foco' : 'pausa') + (P.paused ? ' · pausado' : '');
  tickFloat();
}
function tickFloat(){
  if (fl.hidden || !P) return;
  const s = secsLeft();
  fl.querySelector('.ffTime').textContent = mmss(s);
  fl.querySelector('.ffBar i').style.width = P.sw ? '0%' : Math.round(100 * Math.max(0, Math.min(1, 1 - s / Math.max(1, P.len)))) + '%';
}
// arrastável; a posição fica guardada (em frações da área do PDF)
function placeFloat(){
  const pos = ls.get('le.focusFloatPos', null), st = $('#stage');
  if (!pos) { fl.style.left = ''; fl.style.top = ''; fl.classList.remove('moved'); return; }
  const x = Math.max(8, Math.min(st.clientWidth - fl.offsetWidth - 8, pos.x * st.clientWidth));
  const y = Math.max(8, Math.min(st.clientHeight - fl.offsetHeight - 8, pos.y * st.clientHeight));
  fl.style.left = x + 'px'; fl.style.top = y + 'px'; fl.classList.add('moved');
}
fl.addEventListener('pointerdown', e => {
  if (e.button !== 0 || e.target.closest('button')) return;
  e.preventDefault();
  const st = $('#stage').getBoundingClientRect(), r = fl.getBoundingClientRect();
  const ox = e.clientX - r.left, oy = e.clientY - r.top;
  fl.setPointerCapture(e.pointerId); fl.classList.add('dragging');
  const move = ev => {
    const x = Math.max(8, Math.min(st.width - r.width - 8, ev.clientX - st.left - ox));
    const y = Math.max(8, Math.min(st.height - r.height - 8, ev.clientY - st.top - oy));
    fl.style.left = x + 'px'; fl.style.top = y + 'px'; fl.classList.add('moved');
  };
  const up = () => {
    fl.removeEventListener('pointermove', move); fl.removeEventListener('pointerup', up); fl.classList.remove('dragging');
    ls.set('le.focusFloatPos', { x: parseFloat(fl.style.left) / st.width, y: parseFloat(fl.style.top) / st.height });
  };
  fl.addEventListener('pointermove', move); fl.addEventListener('pointerup', up);
});
fl.addEventListener('dblclick', e => { if (e.target.closest('button')) return; ls.set('le.focusFloatPos', null); placeFloat(); });
addEventListener('resize', () => { if (!fl.hidden) placeFloat(); });
App.on('doc:loaded', renderFloat); App.on('doc:closed', renderFloat);
render();

// ---------- Cartão "Hoje" ----------
const GOALS = [30, 60, 90, 120, 180, 240, 300, 360, 480];
const goalMin = () => ls.get('le.goal', 120);
const fmtGoal = m => m < 60 ? m + ' min' : `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}`;
let lastDocs = [];

function streak(docs){
  const tot = k => docs.reduce((s, d) => s + ((d.time || {})[k] || 0), 0);
  const d = new Date(); let n = 0;
  if (tot(App.dayKey(d)) < 600) d.setDate(d.getDate() - 1); // hoje ainda não conta até 10 min
  while (tot(App.dayKey(d)) >= 600 && n < 999) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
function ring(frac){
  const NS = 'http://www.w3.org/2000/svg', s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 64 64'); s.setAttribute('class', 'ring');
  const c = (cls, dash) => { const e = document.createElementNS(NS, 'circle'); e.setAttribute('cx', 32); e.setAttribute('cy', 32); e.setAttribute('r', 27); e.setAttribute('class', cls); if (dash != null) { e.setAttribute('stroke-dasharray', `${dash} 999`); } return e; };
  const L = 2 * Math.PI * 27;
  s.append(c('ringBg'), c('ringFg' + (frac >= 1 ? ' done' : ''), Math.max(0.001, Math.min(1, frac)) * L));
  return s;
}
App.renderToday = docs => {
  lastDocs = docs;
  const box = $('#todayCard'); if (!box) return;
  box.innerHTML = '';
  const today = docs.reduce((s, d) => s + ((d.time || {})[App.dayKey()] || 0), 0);
  const goal = goalMin() * 60, frac = today / goal;
  const head = el('div', 'cardHead'); head.append(el('h2', null, 'Hoje'));
  const gb = App.btn(`Meta: ${fmtGoal(goalMin())}`, () => App.popMenu(gb, GOALS.map(m => ({ label: fmtGoal(m), checked: m === goalMin(), on: () => { ls.set('le.goal', m); App.renderToday(lastDocs); } })), { title: 'Meta de estudo por dia', alignRight: true }), 'sm goalBtn');
  gb.title = 'Mudar a meta diária';
  head.append(gb); box.append(head);

  const main = el('div', 'todayMain');
  const r = el('div', 'ringWrap'); r.append(ring(frac), el('span', 'ringPct', Math.min(999, Math.round(frac * 100)) + '%'));
  const txt = el('div', 'todayTxt');
  txt.append(el('strong', null, App.fmtDuration(today)), el('span', 'muted small', frac >= 1 ? 'Meta do dia cumprida!' : `faltam ${App.fmtDuration(goal - today)} para a meta`));
  const facts = el('div', 'todayFacts');
  const st = streak(docs), pn = todayCount();
  const fact = (icon, t) => { const s = el('span'); s.append(App.icon(icon), t); return s; };
  if (st) facts.append(fact('sparkle', `${st} ${st === 1 ? 'dia' : 'dias'} seguidos`));
  facts.append(fact('clock', `${pn} pomodoro${pn === 1 ? '' : 's'}`));
  txt.append(facts);
  main.append(r, txt); box.append(main);

  const pb = el('div', 'todayPomo'); pb.id = 'todayPomo';
  renderPomoInto(pb); box.append(pb);

  // revisões vencidas (só grifos que já entraram no ciclo de revisão)
  const now = Date.now();
  const due = docs.filter(d => d.hasFile).map(d => ({ d, n: (d.highlights || []).filter(h => h.srs && h.srs.due <= now && h.kind !== 'ink' && h.kind !== 'note').length }))
    .filter(x => x.n).sort((a, b) => b.n - a.n);
  if (due.length) {
    const rv = el('div', 'todayReview');
    rv.append(el('div', 'rvLabel', 'Para revisar hoje'));
    for (const { d, n } of due.slice(0, 4)) {
      const b = el('button', 'todayRvRow');
      b.append(App.icon('cards'), el('span', 'nm', App.baseName(d.name)), el('span', 'rvCount', n));
      b.title = 'Abrir e revisar';
      b.onclick = async () => { await App.switchTab(d.fp, d.name); if (state.fp === d.fp) App.openReview(); };
      rv.append(b);
    }
    box.append(rv);
  }
};
function renderPomoInto(pb){
  pb.innerHTML = '';
  if (!P) {
    const b = App.ibtn('play', 'Começar o timer', () => pomoMenu(b), 'outline sm');
    b.title = 'Pomodoro (blocos de foco com pausas) ou cronômetro'; pb.append(b);
  } else {
    pb.classList.toggle('brk', P.phase === 'break');
    pb.append(el('span', 'pomoBig', mmss(secsLeft())), el('span', 'muted small', (P.sw ? 'cronômetro' : P.phase === 'focus' ? 'foco' : 'pausa') + (P.paused ? ' · pausado' : '')));
    const acts = el('div', 'pomoActs');
    acts.append(App.ibtn(P.paused ? 'play' : 'pause', null, pauseResume, 'sm', P.paused ? 'Continuar' : 'Pausar'), App.ibtn('x', null, stop, 'sm', 'Parar'));
    pb.append(acts);
  }
}
function renderPomoCard(){ const pb = $('#todayPomo'); if (pb) { pb.className = 'todayPomo'; renderPomoInto(pb); } }
App.renderPomoCard = renderPomoCard;
})();
