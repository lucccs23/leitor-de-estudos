/* Ponte com o Focus (o app de pomodoro e estatísticas): só dentro deste computador.
   - o relógio da barra mostra e controla o timer do Focus;
   - o tempo de leitura vira sessão no Focus, na área/tema ligados ao PDF;
   - PDFs ligados a um tema aparecem nas anotações do tema, e o Focus pode pedir para abri-los aqui. */
(() => {
'use strict';
const App = window.App;
const { $, state, DB, safe, ls } = App;

const BASE = 'http://127.0.0.1:47615';
const TICK = 15000;
const F = { on: false, st: null, subjects: [], labels: { s: 'área', p: 'tema' }, fail: 0 };
App.focusConnected = () => F.on;
App.focusState = () => F.st;
App.focusRunningFocus = () => !!(F.on && F.st && F.st.running && F.st.focus);

const token = () => ls.get('le.bkToken', null);
// pasta do leitor (o Focus usa para abrir o leitor quando um tema pede um PDF)
const home = () => decodeURIComponent(location.pathname).replace(/^\//, '').replace(/\/[^/]*$/, '').replace(/\//g, '\\');
async function call(path, body){
  const t = token(); if (!t) throw new Error('sem senha');
  const url = `${BASE}${path}?t=${encodeURIComponent(t)}&home=${encodeURIComponent(home())}`;
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 2500);
  try {
    const opt = body == null ? { cache: 'no-store', signal: ctl.signal }
      : { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'Content-Type': 'text/plain' }, signal: ctl.signal };
    const r = await fetch(url, opt);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.error || 'HTTP ' + r.status);
    return j;
  } finally { clearTimeout(to); }
}
App.focusCall = call;

// ---------- Conexão ----------
let pollT;
async function poll(){
  clearTimeout(pollT);
  if (App.isWeb) return; // o Focus de desktop só conversa com o leitor do computador
  if (!token()) { pollT = setTimeout(poll, 10000); return; } // sem a senha do serviço local do leitor não há como conversar
  try {
    const j = await call('/status');
    const was = F.on;
    Object.assign(F, { on: true, fail: 0, st: j.state || null, subjects: j.subjects || [], modes: j.modes || [] });
    if (!was) { ls.set('le.focusSeen', Date.now()); App.toast('Conectado ao Focus'); flush(); }
    for (const o of j.open || []) openRequest(o);
  } catch {
    if (++F.fail >= 2 && F.on) { F.on = false; F.st = null; }
  }
  render();
  // conectado: 1 s (relógio ao vivo); já usou o Focus: 6 s; nunca usou: 10 s; janela escondida: mais devagar
  const idle = ls.get('le.focusSeen', 0) ? 6000 : 10000;
  pollT = setTimeout(poll, F.on ? (document.hidden ? 5000 : 1000) : (document.hidden ? idle * 3 : idle));
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
App.focusPoll = poll;

async function cmd(c){
  try { await call('/command', c); } catch { App.toast('O Focus não respondeu.'); }
  setTimeout(poll, 150);
}

// ---------- Relógio da barra ----------
const chip = $('#btnPomo'), chipTime = $('#pomoTime');
App.renderFocusChip = () => {
  const s = F.st || {};
  chip.classList.toggle('running', !!s.started);
  chip.classList.toggle('brk', !!s.started && !s.focus);
  chip.classList.toggle('paused', !!s.started && !s.running);
  chip.classList.add('focusLinked');
  chipTime.textContent = s.started ? s.text : '';
  chip.title = s.started ? `Focus: ${s.text} · ${s.running ? s.label : 'pausado'}${s.task ? ' — ' + s.task : ''}` : 'Focus conectado — clique para iniciar o timer';
};
function render(){
  if (!F.on) chip.classList.remove('focusLinked');
  App.renderPomoChip?.();
  if (!state.pdf) App.renderPomoCard?.();
  renderFloat();
}

// ---------- Timer flutuante sobre o PDF ----------
const fl = $('#focusFloat');
const floatOn = () => ls.get('le.focusFloat', true);
App.toggleFocusFloat = () => { ls.set('le.focusFloat', !floatOn()); renderFloat(); App.toast(floatOn() ? 'Timer do Focus na página' : 'Timer flutuante escondido (volta pelo relógio da barra)'); };
let flBuilt = false;
function buildFloat(){
  fl.innerHTML = '';
  const dot = App.el('span', 'ffDot');
  const info = App.el('div', 'ffInfo');
  const lbl = App.el('button', 'ffLbl'); lbl.type = 'button'; lbl.title = 'Trocar o modo (Pomodoro, pausas, Cronômetro…)';
  lbl.onclick = e => { e.stopPropagation(); App.focusModeMenu(lbl); };
  info.append(App.el('div', 'ffTime'), lbl);
  const play = App.ibtn('play', null, () => cmd('toggle'), 'sm ffPlay', 'Iniciar / pausar');
  const acts = App.el('div', 'ffActs');
  acts.append(play, App.ibtn('right', null, () => cmd('skip'), 'sm', 'Pular'), App.ibtn('expand', null, () => cmd('show'), 'sm', 'Abrir o Focus'), App.ibtn('x', null, App.toggleFocusFloat, 'sm ffClose', 'Esconder'));
  const bar = App.el('div', 'ffBar'); bar.append(App.el('i'));
  fl.append(dot, info, acts, bar);
  flBuilt = true;
}
function renderFloat(){
  const show = F.on && !!state.pdf && floatOn();
  fl.hidden = !show;
  if (!show) return;
  if (!flBuilt) { buildFloat(); placeFloat(); }
  const s = F.st || {};
  fl.classList.toggle('brk', !!s.started && !s.focus);
  fl.classList.toggle('paused', !!s.started && !s.running);
  fl.querySelector('.ffTime').textContent = s.started ? s.text : (s.text || 'Focus');
  fl.querySelector('.ffLbl').textContent = s.started ? (s.running ? s.label : 'pausado') + (s.task ? ' · ' + s.task : '') : 'pronto para começar';
  const play = fl.querySelector('.ffPlay');
  play.replaceChildren(App.icon(s.running ? 'pause' : 'play')); play.title = s.running ? 'Pausar' : (s.started ? 'Continuar' : 'Iniciar');
  fl.querySelector('.ffBar i').style.width = (s.started && s.progress >= 0 ? Math.round(s.progress * 100) : 0) + '%';
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

// modos do Focus (Pomodoro, pausas, Cronômetro e os timers personalizados): escolher já começa a contar
const modeItems = () => {
  const s = F.st || {};
  return (F.modes || []).map(m => ({
    label: m.label, icon: m.id === 'stopwatch' ? 'clock' : m.focus ? 'play' : 'pause',
    sub: m.id === 'stopwatch' ? 'conta para cima' : m.min ? `${m.min} min` : undefined,
    checked: s.modeId === m.id,
    on: () => cmd('mode:' + m.id),
  }));
};
App.focusModeMenu = anchor => {
  const s = F.st || {};
  const warn = s.started ? ' · o atual é salvo' : '';
  App.popMenu(anchor, modeItems(), { title: 'Modo do Focus' + warn, alignRight: true });
};
App.focusMenu = anchor => {
  const s = F.st || {};
  const modes = modeItems();
  const items = [
    { label: s.running ? 'Pausar' : (s.started ? 'Continuar' : 'Iniciar'), icon: s.running ? 'pause' : 'play', on: () => cmd('toggle') },
    { label: 'Pular', icon: 'right', on: () => cmd('skip') },
  ];
  if (s.started) items.push({ label: 'Parar e salvar', icon: 'check', on: () => cmd('stop') });
  if (modes.length) items.push({ sep: true }, { label: 'Trocar o modo', sub: (modes.find(m => m.checked) || {}).label, icon: 'list', on: () => App.focusModeMenu(anchor) });
  items.push({ sep: true }, { label: 'Abrir o Focus', icon: 'expand', on: () => cmd('show') },
    { label: 'Timer flutuante na página', icon: 'clock', checked: floatOn(), on: App.toggleFocusFloat },
    { label: 'Mini-timer do Focus', sub: 'por cima de tudo', icon: 'shrink', on: () => cmd('mini') });
  if (state.pdf) {
    const link = linkCache.get(state.fp);
    items.push({ sep: true }, { label: 'Leitura vai para', sub: linkLabel(link), icon: 'link', on: () => pickLink(anchor) });
  }
  App.popMenu(anchor, items, { title: s.started ? `Focus · ${s.text}${s.running ? '' : ' (pausado)'}` : 'Focus conectado', alignRight: true });
};

// controles no cartão "Hoje"
App.renderFocusPomo = pb => {
  const s = F.st || {};
  if (s.started) {
    pb.classList.toggle('brk', !s.focus);
    pb.append(App.el('span', 'pomoBig', s.text), App.el('span', 'muted small', `Focus · ${s.running ? s.label.toLowerCase() : 'pausado'}`));
  } else pb.append(App.ibtn('play', 'Iniciar no Focus', () => cmd('toggle'), 'outline sm'), App.el('span', 'muted small', 'timer do Focus'));
  const acts = App.el('div', 'pomoActs');
  if (s.started) acts.append(App.ibtn(s.running ? 'pause' : 'play', null, () => cmd('toggle'), 'sm', s.running ? 'Pausar' : 'Continuar'), App.ibtn('right', null, () => cmd('skip'), 'sm', 'Pular'));
  acts.append(App.ibtn('expand', null, () => cmd('show'), 'sm', 'Abrir o Focus'));
  pb.append(acts);
};

// ---------- PDF ↔ área/tema do Focus ----------
// guardado no documento (doc.focus = { subjectId, topicId } ou { off: true })
const linkCache = new Map();
const fold = s => App.fold(String(s || '')).trim();
async function linkFor(fp){
  if (linkCache.has(fp)) return linkCache.get(fp);
  const rec = await safe(() => DB.get('docs', fp), null);
  let link = rec && rec.focus;
  // sem ligação: usa a área do Focus com o mesmo nome da disciplina do PDF
  if (!link && rec && rec.subject) { const s = F.subjects.find(x => fold(x.name) === fold(rec.subject)); if (s) link = { subjectId: s.id, topicId: null, auto: true }; }
  link = link || null;
  if (F.on || (rec && rec.focus)) linkCache.set(fp, link);
  return link;
}
App.focusLinkFor = linkFor;
function linkLabel(link){
  if (!link) return `sem ${F.labels.s} (só o tempo)`;
  if (link.off) return 'não registrar';
  const s = F.subjects.find(x => x.id === link.subjectId);
  if (!s) return `sem ${F.labels.s} (só o tempo)`;
  const t = s.topics.find(x => x.id === link.topicId);
  return s.name + (t ? ' · ' + t.name : '') + (link.auto ? ' (pela disciplina)' : '');
}
async function setLink(fp, name, link){
  if (!(await App.patchDoc(fp, { focus: link }))) return;
  linkCache.set(fp, link);
  // tema: o PDF aparece nas anotações do tema no Focus (sem tema: tira de onde estava)
  try { await call('/link', { fp, name, topicId: link && !link.off ? link.topicId : null, page: state.fp === fp ? state.currentPage : 1 }); } catch {}
  if (cur && cur.fp === fp) { cur.dirty = true; saveQueue(); flush(); }
  App.toast(link && link.off ? 'A leitura deste PDF não vai para o Focus' : `Leitura registrada em: ${linkLabel(link)}`);
}
function pickLink(anchor){
  const fp = state.fp, name = state.name;
  const items = F.subjects.map(s => ({ label: s.name, dot: s.color, sub: s.topics.length ? `${s.topics.length} ${s.topics.length === 1 ? F.labels.p : F.labels.p + 's'}` : undefined,
    on: () => {
      if (!s.topics.length) { setLink(fp, name, { subjectId: s.id, topicId: null }); return; }
      App.popMenu(anchor, [
        { label: `Só a ${F.labels.s} (sem ${F.labels.p})`, icon: 'check', on: () => setLink(fp, name, { subjectId: s.id, topicId: null }) },
        { sep: true },
        ...s.topics.map(t => ({ label: t.name, on: () => setLink(fp, name, { subjectId: s.id, topicId: t.id }) })),
      ], { title: s.name, alignRight: true });
    } }));
  if (!items.length) items.push({ label: `Nenhuma ${F.labels.s} no Focus ainda`, icon: 'x', on: () => {} });
  items.push({ sep: true }, { label: `Sem ${F.labels.s} (só o tempo)`, icon: 'clock', on: () => setLink(fp, name, { subjectId: null, topicId: null }) },
    { label: 'Não registrar este PDF no Focus', icon: 'x', on: () => setLink(fp, name, { off: true }) });
  App.popMenu(anchor, items, { title: `Registrar a leitura de "${App.baseName(name)}" em`, alignRight: true });
}
App.focusPickLink = pickLink;

// ---------- Tempo de leitura → sessões no Focus ----------
// Conta enquanto você está lendo (mesma regra do tempo de estudo do leitor). Não conta quando o timer de
// foco do Focus está rodando: nesse caso o próprio Focus já registra o tempo (sem contar em dobro).
let queue = ls.get('le.focusQueue', []).filter(x => x && x.id);
let cur = null;
const saveQueue = () => ls.set('le.focusQueue', queue.slice(-300));
setInterval(() => {
  if (!state.pdf || !App.isStudying?.() || App.focusRunningFocus()) return;
  const now = Date.now();
  if (!cur || cur.fp !== state.fp || now - cur.end > 5 * 60000) {
    cur = { id: App.uid(), fp: state.fp, name: state.name, start: now - TICK, end: now - TICK, ms: 0, sent: 0 };
    queue.push(cur);
  }
  cur.ms += TICK; cur.end = now; cur.dirty = true;
  saveQueue();
}, TICK);
let flushing = false;
async function flush(){
  if (!F.on || flushing) return;
  flushing = true;
  try {
    for (const q of queue.filter(x => x.dirty && x.ms >= 60000)) {
      const link = await linkFor(q.fp);
      if (link && link.off) { q.dirty = false; q.dropped = true; continue; }
      await call('/session', { id: q.id, start: q.start, ms: q.ms, subjectId: link ? link.subjectId : null, topicId: link ? link.topicId : null, title: App.baseName(q.name) });
      q.dirty = false; q.sent = q.ms;
    }
  } catch { /* Focus fechado: tenta de novo depois */ }
  finally {
    // enviadas e encerradas saem da fila
    queue = queue.filter(x => x === cur || x.dirty || (!x.dropped && x.ms < 60000 && Date.now() - x.end < 10 * 60000));
    saveQueue(); flushing = false;
  }
}
setInterval(flush, 60000);
App.focusFlush = flush;
App.on('doc:closed', () => { cur = null; flush(); });
App.on('doc:loaded', ({ fp }) => { linkCache.delete(fp); flush(); });
addEventListener('beforeunload', () => saveQueue());
App.focusQueue = () => queue;

// ---------- Pedidos do Focus para abrir um PDF ----------
async function openRequest(o){
  const docs = (await safe(() => DB.all('docs'), [])).filter(d => d.hasFile);
  const d = docs.find(x => x.fp === o.fp) || docs.find(x => fold(App.baseName(x.name)) === fold(App.baseName(o.name)));
  if (!d) { App.toast(`Não achei "${App.baseName(o.name)}" no leitor. Abra o arquivo uma vez para ele aparecer aqui.`); return; }
  if (App.examViewOpen || App.sheetOpen) return;
  if (state.fp !== d.fp) await App.switchTab(d.fp, d.name);
  if (state.fp === d.fp) { App.goToPage(o.page || 1); App.toast(`Aberto pelo Focus: ${App.baseName(d.name)}`); }
}
App.focusOpenRequest = openRequest;

// primeira tentativa depois da inicialização (a senha do serviço local é lida em main.js)
setTimeout(poll, 600);
})();
