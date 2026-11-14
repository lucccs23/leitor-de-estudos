/* Focus (o app de pomodoro e estatísticas do computador) — OPCIONAL e independente.
   O Vetra tem o próprio timer (pomodoro e cronômetro) e funciona igual no PC, no tablet e no celular.
   No computador, se o Focus estiver aberto, ele só recebe em segundo plano:
   - o tempo de leitura, como sessões na área/tema ligados ao PDF (dá para desligar);
   - os PDFs ligados a um tema (aparecem nas anotações do tema; o Focus pode pedir para abri-los aqui).
   Fechado ou ausente, nada muda no Vetra; o tempo fica guardado e vai quando o Focus abrir. */
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
    Object.assign(F, { on: true, fail: 0, st: j.state || null, subjects: j.subjects || [] });
    if (!was) flush();
    for (const o of j.open || []) openRequest(o);
  } catch {
    if (++F.fail >= 2 && F.on) { F.on = false; F.st = null; }
  }
  // conectado: a cada 5 s (pedidos para abrir PDFs); sem Focus: 15 s; janela escondida: mais devagar
  pollT = setTimeout(poll, (F.on ? 5000 : 15000) * (document.hidden ? 3 : 1));
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
App.focusPoll = poll;

async function cmd(c){
  try { await call('/command', c); } catch { App.toast('O Focus não respondeu.'); }
}

// ---------- Itens do Focus no menu do timer (só aparecem com o Focus aberto neste computador) ----------
const sendOn = () => App.focusLinkOn ? App.focusLinkOn() : false; // desligado por padrão: cada app por si
App.focusMenuItems = anchor => {
  if (!F.on) return [];
  const items = [{ sep: true }];
  if (state.pdf) items.push({ label: 'Tempo de leitura no Focus', sub: sendOn() ? linkLabel(linkCache.get(state.fp)) : 'desligado', icon: 'link', on: () => pickLink(anchor) });
  else items.push({ label: 'Mandar o tempo para o Focus', sub: sendOn() ? 'ligado' : 'desligado', icon: 'link', checked: sendOn(),
    on: () => { App.setFocusLink(!sendOn()); App.toast(sendOn() ? 'O tempo de leitura e do timer vai para o Focus' : 'Nada mais vai para o Focus'); } });
  items.push({ label: 'Abrir o Focus', icon: 'expand', on: () => cmd('show') });
  return items;
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
  if (!sendOn() && !(link && link.off)) App.setFocusLink(true);
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
    { label: 'Não registrar este PDF no Focus', icon: 'x', on: () => setLink(fp, name, { off: true }) },
    { label: sendOn() ? 'Não mandar a leitura de nenhum PDF' : 'Voltar a mandar a leitura ao Focus', icon: sendOn() ? 'x' : 'check',
      on: () => { App.setFocusLink(!sendOn()); App.toast(sendOn() ? 'O tempo de leitura e do timer vai para o Focus' : 'Nada mais vai para o Focus'); } });
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
  // com o timer do Vetra em foco, o tempo vai como sessão do timer (não conta em dobro)
  if (App.isWeb || !sendOn() || !state.pdf || !App.isStudying?.() || App.pomoFocus?.()) return;
  const now = Date.now();
  if (!cur || cur.fp !== state.fp || now - cur.end > 5 * 60000) {
    cur = { id: App.uid(), fp: state.fp, name: state.name, start: now - TICK, end: now - TICK, ms: 0, sent: 0 };
    queue.push(cur);
  }
  cur.ms += TICK; cur.end = now; cur.dirty = true;
  saveQueue();
}, TICK);
let flushing = false;
// sessões do timer (deste e dos outros aparelhos, pela sincronização) ainda não mandadas ao Focus
let sentIds = new Set(ls.get('le.focusSentSessions', []));
const pendingTimer = () => (App.timerSessions ? App.timerSessions() : []).filter(x => !sentIds.has(x.id) && x.start >= (ls.get('le.focusLinkSince', 0) || 0));
App.focusPending = () => pendingTimer().length + queue.filter(x => x.dirty && x.ms >= 60000).length;
App.on('focuslink:changed', () => { if (sendOn() && !ls.get('le.focusLinkSince', 0)) ls.set('le.focusLinkSince', Date.now() - 30 * 86400000); });
async function flush(){
  if (!F.on || flushing || !sendOn()) return;
  flushing = true;
  try {
    for (const t of pendingTimer()) {
      const link = t.fp ? await linkFor(t.fp) : null;
      if (link && link.off) { sentIds.add(t.id); continue; }
      await call('/session', { id: 'vetra-' + t.id, start: t.start, ms: t.ms, subjectId: link ? link.subjectId : null, topicId: link ? link.topicId : null,
        title: (t.kind === 'cronometro' ? 'Cronômetro' : 'Pomodoro') + (t.name ? ' · ' + App.baseName(t.name) : '') });
      sentIds.add(t.id); ls.set('le.focusSentSessions', [...sentIds].slice(-6000));
    }
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
App.on('sessions:changed', () => flush());
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
