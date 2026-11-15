/* Estatísticas do estudo: tempo lendo (contado sozinho em cada PDF) e sessões do timer (pomodoro e cronômetro).
   As sessões ficam guardadas no aparelho e vão para os outros pela sincronização.
   Vínculo com o Focus (opcional, só no computador): liga/desliga aqui; desligado, nada vai para o Focus. */
(() => {
'use strict';
const App = window.App;
const { $, el, state, ls, DB, safe } = App;

// ---------- Sessões do timer ----------
// { id, start, ms, kind: 'pomodoro'|'cronometro', fp?, name?, subject?, dev }
const MAX = 4000;
let sessions = ls.get('le.sessions', []).filter(s => s && s.id && s.ms > 0);
const saveSessions = () => ls.set('le.sessions', sessions.slice(-MAX));
App.timerSessions = () => sessions;
App.addSessions = list => { // da sincronização: junta pelo id
  const have = new Set(sessions.map(s => s.id)); let n = 0;
  for (const s of list || []) if (s && s.id && !have.has(s.id) && s.ms > 0) { sessions.push(s); have.add(s.id); n++; }
  if (n) { sessions.sort((a, b) => a.start - b.start); saveSessions(); App.emit('sessions:changed'); }
  return n;
};
App.recordSession = async (kind, start, ms) => {
  if (ms < 60000) return null; // menos de 1 min não conta
  let subject = '';
  if (state.fp) subject = ((await safe(() => DB.get('docs', state.fp), null)) || {}).subject || '';
  const s = { id: App.uid(), start: Math.round(start), ms: Math.round(ms), kind, dev: App.deviceName ? App.deviceName() : '' };
  if (state.fp) Object.assign(s, { fp: state.fp, name: state.name, subject });
  sessions.push(s); saveSessions();
  App.emit('sessions:changed', s);
  return s;
};

// ---------- Vínculo com o Focus (opcional) ----------
App.focusLinkOn = () => ls.get('le.focusLink', false);
App.setFocusLink = on => { ls.set('le.focusLink', !!on); App.emit('focuslink:changed'); if (on) App.focusFlush?.(); };

// ---------- Contas ----------
const DAY = 86400000;
const dayKey = App.dayKey;
function periodDays(n){ const out = []; for (let i = n - 1; i >= 0; i--) { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - i); out.push(d); } return out; }
const fmt = s => App.fmtDuration(Math.round(s));
const short = s => App.fmtShort(Math.round(s));
function streak(readByDay, timerByDay){
  const tot = k => (readByDay.get(k) || 0) + (timerByDay.get(k) || 0);
  const d = new Date(); let n = 0;
  if (tot(dayKey(d)) < 600) d.setDate(d.getDate() - 1);
  while (tot(dayKey(d)) >= 600 && n < 9999) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

// ---------- Janela ----------
let period = ls.get('le.statsPeriod', 7);
App.openStats = async () => {
  if (state.fp) await App.saveDoc();
  const docs = await safe(() => DB.all('docs'), []);
  const dlg = App.dialog('statsDlg', 'pomoDlg statsDlg'); dlg.setAttribute('aria-label', 'Estatísticas');
  const build = () => {
    dlg.innerHTML = '';
    const head = el('div', 'helpHead');
    head.append(el('h2', null, 'Estatísticas'), App.ibtn('x', null, () => dlg.close(), 'sm', 'Fechar (Esc)'));
    const body = el('div', 'pomoBody statsBody');
    // período
    const seg = el('div', 'seg statsSeg');
    [[7, '7 dias'], [30, '30 dias'], [90, '3 meses'], [365, '1 ano']].forEach(([n, l]) => {
      const b = el('button', 'btn' + (period === n ? ' on' : ''), l); b.type = 'button';
      b.onclick = () => { period = n; ls.set('le.statsPeriod', n); build(); }; seg.append(b);
    });
    body.append(seg);

    const days = periodDays(period), keys = days.map(d => dayKey(d)), inP = new Set(keys);
    const since = days[0].getTime() - 12 * 3600000;
    // leitura por dia / por PDF / por disciplina
    const readByDay = new Map(), readByDoc = new Map(), bySubj = new Map();
    for (const d of docs) for (const [k, v] of Object.entries(d.time || {})) {
      readByDay.set(k, (readByDay.get(k) || 0) + v);
      if (!inP.has(k)) continue;
      readByDoc.set(d.fp, (readByDoc.get(d.fp) || 0) + v);
      const sj = d.subject || 'Sem disciplina';
      bySubj.set(sj, { read: ((bySubj.get(sj) || {}).read || 0) + v, timer: (bySubj.get(sj) || {}).timer || 0 });
    }
    const timerByDay = new Map();
    const inSessions = sessions.filter(s => s.start >= since);
    for (const s of sessions) { const k = dayKey(new Date(s.start)); timerByDay.set(k, (timerByDay.get(k) || 0) + s.ms / 1000); }
    for (const s of inSessions) {
      const sj = s.subject || (docs.find(d => d.fp === s.fp) || {}).subject || 'Sem disciplina';
      bySubj.set(sj, { read: (bySubj.get(sj) || {}).read || 0, timer: ((bySubj.get(sj) || {}).timer || 0) + s.ms / 1000 });
    }
    const readTot = keys.reduce((a, k) => a + (readByDay.get(k) || 0), 0);
    const timerTot = inSessions.reduce((a, s) => a + s.ms / 1000, 0);
    const pomos = inSessions.filter(s => s.kind === 'pomodoro' && !s.partial).length;
    const activeDays = keys.filter(k => (readByDay.get(k) || 0) + (timerByDay.get(k) || 0) >= 60).length;

    // números
    const tiles = el('div', 'statTiles');
    const tile = (v, l, sub) => { const t = el('div', 'statTile'); t.append(el('strong', null, v), el('span', null, l)); if (sub) t.append(el('small', 'muted', sub)); tiles.append(t); };
    tile(fmt(readTot), 'lendo', 'contado sozinho nos PDFs');
    tile(fmt(timerTot), 'de foco no timer', App.plural(pomos, 'pomodoro', 'pomodoros'));
    // por dia: o maior entre o tempo lendo e o do timer (os dois correm juntos; não soma em dobro)
    const studyTot = keys.reduce((t, k) => t + Math.max(readByDay.get(k) || 0, timerByDay.get(k) || 0), 0);
    tile(short(studyTot / Math.max(1, activeDays)), 'por dia de estudo', App.plural(activeDays, 'dia', 'dias') + ` de ${period}`);
    tile(App.plural(streak(readByDay, timerByDay), 'dia', 'dias'), 'seguidos', '10 min ou mais por dia');
    body.append(tiles);

    // gráfico por dia (ou por semana, em períodos longos)
    const groups = [];
    const step = period <= 30 ? 1 : 7;
    for (let i = 0; i < keys.length; i += step) {
      const ks = keys.slice(i, i + step);
      groups.push({ label: step === 1 ? days[i].toLocaleDateString('pt-BR', period <= 7 ? { weekday: 'short' } : { day: 'numeric' }).replace('.', '') : days[i].toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', ''),
        title: step === 1 ? days[i].toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' }) : `semana de ${days[i].toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}`,
        read: ks.reduce((a, k) => a + (readByDay.get(k) || 0), 0), timer: ks.reduce((a, k) => a + (timerByDay.get(k) || 0), 0), today: ks.includes(dayKey()) });
    }
    const max = Math.max(1800, ...groups.map(g => Math.max(g.read, g.timer)));
    const chart = el('div', 'statChart' + (groups.length > 20 ? ' dense' : ''));
    for (const g of groups) {
      const col = el('div', 'scCol' + (g.today ? ' today' : ''));
      col.title = `${g.title}: ${fmt(g.read)} lendo · ${fmt(g.timer)} no timer`;
      const bars = el('div', 'scBars');
      const b1 = el('i', 'scRead'); b1.style.height = Math.max(2, g.read / max * 100) + '%';
      const b2 = el('i', 'scTimer'); b2.style.height = Math.max(g.timer ? 2 : 0, g.timer / max * 100) + '%';
      bars.append(b1, b2);
      col.append(bars, el('span', 'scLbl', g.label));
      chart.append(col);
    }
    const legend = el('div', 'statLegend');
    legend.append(el('span', 'lgRead', 'lendo'), el('span', 'lgTimer', 'foco no timer'));
    body.append(el('h3', 'statH', step === 1 ? 'Por dia' : 'Por semana'), chart, legend);

    // por disciplina
    const subj = [...bySubj.entries()].map(([n, v]) => ({ n, ...v, tot: v.read + v.timer })).filter(x => x.tot >= 60).sort((a, b) => b.tot - a.tot);
    if (subj.length) {
      body.append(el('h3', 'statH', 'Por disciplina'));
      const mx = subj[0].tot, list = el('div', 'statList');
      for (const x of subj.slice(0, 10)) {
        const r = el('div', 'statRow');
        const bar = el('span', 'statBar'); const f = el('i'); f.style.width = Math.round(100 * x.tot / mx) + '%';
        if (x.n !== 'Sem disciplina' && App.subjectHex) f.style.background = App.subjectHex(x.n);
        bar.append(f);
        r.append(el('span', 'statName', x.n), bar, el('span', 'statVal', short(x.tot)));
        r.title = `${x.n}: ${fmt(x.read)} lendo · ${fmt(x.timer)} no timer`;
        list.append(r);
      }
      body.append(list);
    }
    // PDFs mais lidos
    const top = [...readByDoc.entries()].filter(([, v]) => v >= 60).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (top.length) {
      body.append(el('h3', 'statH', 'PDFs mais lidos'));
      const list = el('div', 'statList'), mx = top[0][1];
      for (const [fp, v] of top) {
        const d = docs.find(x => x.fp === fp) || {};
        const r = el('button', 'statRow statLink'); r.type = 'button';
        const bar = el('span', 'statBar'); const f = el('i'); f.style.width = Math.round(100 * v / mx) + '%'; bar.append(f);
        r.append(el('span', 'statName', App.baseName(d.name || 'PDF')), bar, el('span', 'statVal', short(v)));
        r.title = 'Abrir'; r.disabled = !d.hasFile;
        r.onclick = () => { dlg.close(); App.switchTab(fp, d.name); };
        list.append(r);
      }
      body.append(list);
    }
    // horário
    if (inSessions.length >= 3) {
      const hours = new Array(24).fill(0);
      for (const s of inSessions) hours[new Date(s.start).getHours()] += s.ms / 1000;
      const best = hours.indexOf(Math.max(...hours));
      body.append(el('h3', 'statH', 'Quando você mais foca'));
      const hb = el('div', 'statHours'), mh = Math.max(...hours, 1);
      hours.forEach((v, h) => { const i = el('i'); i.style.height = Math.max(2, v / mh * 100) + '%'; i.title = `${h}h: ${fmt(v)}`; if (h === best) i.className = 'best'; hb.append(i); });
      body.append(hb, el('p', 'muted small', `Seu melhor horário: entre ${best}h e ${best + 1}h.`));
    }
    // sessões recentes
    body.append(el('h3', 'statH', 'Sessões do timer'));
    if (!sessions.length) body.append(el('p', 'muted small', 'Nenhuma ainda. Use o relógio da barra: um pomodoro ou o cronômetro vira uma sessão quando passa de 1 minuto.'));
    else {
      const list = el('div', 'statSessions');
      for (const s of [...sessions].sort((a, b) => b.start - a.start).slice(0, 12)) {
        const d = new Date(s.start);
        const r = el('div', 'sessRow');
        r.append(el('span', 'sessWhen', d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })),
          el('span', 'sessKind', s.kind === 'cronometro' ? 'cronômetro' : 'pomodoro'),
          el('span', 'sessName', s.name ? App.baseName(s.name) : '—'),
          el('span', 'sessDur', short(s.ms / 1000)));
        if (s.dev) r.title = 'Feita no ' + s.dev;
        list.append(r);
      }
      body.append(list);
    }

    // simulados (evolução)
    if (App.examEvolution) { const evo = el('div', 'resEvo statEvo'); body.append(evo); App.examEvolution(evo).then(() => { const h = evo.querySelector('.rvLabel'); if (h) h.className = 'statH'; }); }
    // Focus
    const fx = el('div', 'statFocus');
    fx.append(el('h3', 'statH', 'Focus (opcional)'));
    if (App.isWeb) fx.append(el('p', 'muted small', 'O vínculo com o Focus é ligado no Vetra do computador. Com a sincronização ligada, as sessões deste aparelho chegam lá e vão para o Focus também.'));
    else {
      const on = App.focusLinkOn(), conn = App.focusConnected && App.focusConnected();
      const w = el('label', 'mdOpt'); const c = el('input'); c.type = 'checkbox'; c.checked = on;
      c.onchange = () => { App.setFocusLink(c.checked); build(); };
      w.append(c, el('span', null, 'Mandar o tempo para o Focus'),
        el('small', 'muted', on ? (conn ? 'Focus aberto: o tempo de leitura e as sessões do timer vão para lá' : 'O Focus está fechado: o que juntar vai quando ele abrir') : 'Desligado: o Vetra e o Focus funcionam cada um por si'));
      fx.append(w);
      const pend = App.focusPending ? App.focusPending() : 0;
      if (on && pend) fx.append(el('p', 'muted small', `${App.plural(pend, 'sessão esperando', 'sessões esperando')} o Focus abrir.`));
    }
    body.append(fx);
    const foot = el('div', 'lookFoot');
    foot.append(el('span', 'muted small', 'Tempo lendo conta sozinho enquanto você usa um PDF; o timer conta o que você marcar.'), App.btn('Fechar', () => dlg.close(), 'primary'));
    dlg.append(head, body, foot);
  };
  build();
  if (!dlg.open) dlg.showModal();
};

// "Sua semana" na tela inicial abre as estatísticas
const weekCard = $('#week') && $('#week').closest('.card');
if (weekCard) {
  const b = App.ibtn('chart', 'Estatísticas', () => App.openStats(), 'sm statsOpen');
  weekCard.querySelector('.cardHead').append(b);
  const ic = weekCard.querySelector('.cardHead > svg'); if (ic) ic.remove();
}
})();
