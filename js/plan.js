/* Plano de leitura com prazo: "ler das páginas X a Y até tal dia" vira uma meta de páginas por dia,
   que aparece no cartão Hoje. O progresso conta as páginas lidas (as mesmas da barra de progresso). */
(() => {
'use strict';
const App = window.App;
const { $, el, state, ls } = App;

// ---------- Capítulos (sumário do PDF, 1º nível) — usados aqui e na exportação ----------
const chapCache = new Map();
App.chapters = async (pdf = state.pdf) => {
  if (!pdf) return [];
  const key = pdf.fingerprints[0];
  if (chapCache.has(key)) return chapCache.get(key);
  const out = [];
  try {
    const ol = await pdf.getOutline();
    for (const it of ol || []) {
      let dest = it.dest;
      try {
        if (typeof dest === 'string') dest = await pdf.getDestination(dest);
        if (!Array.isArray(dest)) continue;
        const idx = typeof dest[0] === 'object' ? await pdf.getPageIndex(dest[0]) : dest[0];
        out.push({ title: (it.title || '').trim() || 'Sem título', page: idx + 1 });
      } catch {}
    }
  } catch {}
  out.sort((a, b) => a.page - b.page);
  chapCache.set(key, out);
  return out;
};
// capítulo de uma página (ou null)
App.chapterOf = (chaps, page) => { let c = null; for (const x of chaps) { if (x.page <= page) c = x; else break; } return c; };

// ---------- Contas ----------
const DAY = 86400000;
const parseDay = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const daysLeft = due => Math.max(1, Math.round((parseDay(due) - parseDay(App.dayKey())) / DAY) + 1); // inclui hoje
const fmtDue = due => parseDay(due).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '');
const doneIn = (plan, visited) => (visited || []).filter(n => n >= plan.from && n <= plan.to).length;
// resumo do plano: quantas páginas faltam, meta de hoje e quanto já foi hoje
App.planInfo = rec => {
  const plan = rec && rec.plan; if (!plan) return null;
  const total = plan.to - plan.from + 1;
  const done = doneIn(plan, rec.visited);
  const today = App.dayKey();
  const startDone = plan.day && plan.day.k === today ? plan.day.done : done;
  const late = App.dayKey() > plan.due;
  const left = daysLeft(plan.due);
  const remainingAtStart = Math.max(0, total - startDone);
  const target = late ? remainingAtStart : Math.ceil(remainingAtStart / left);
  const readToday = Math.max(0, done - startDone);
  // próxima página ainda não lida do trecho
  let next = plan.from;
  const vis = new Set(rec.visited || []);
  while (next <= plan.to && vis.has(next)) next++;
  return { plan, total, done, target, readToday, left, late, finished: done >= total, next: Math.min(next, plan.to), needsDay: !(plan.day && plan.day.k === today) };
};
// grava quantas páginas já estavam lidas no começo do dia (para contar o "hoje")
async function stampDay(rec){
  const info = App.planInfo(rec);
  if (!info || !info.needsDay) return;
  const day = { k: App.dayKey(), done: info.done };
  rec.plan = { ...rec.plan, day };
  await App.patchDoc(rec.fp, cur => ({ plan: cur.plan ? { ...cur.plan, day } : cur.plan }));
}

// ---------- Janela do plano ----------
App.openPlan = async () => {
  if (!state.pdf) { App.toast('Abra um PDF primeiro.'); return; }
  await App.saveDoc();
  const rec = await App.safe(() => App.DB.get('docs', state.fp), null) || {};
  const n = state.pages.length;
  const cur = rec.plan;
  const dlg = App.dialog('planDlg', 'pomoDlg planDlg'); dlg.setAttribute('aria-label', 'Plano de leitura');
  dlg.innerHTML = '';
  const head = el('div', 'helpHead');
  head.append(el('h2', null, 'Plano de leitura'), App.ibtn('x', null, () => dlg.close(), 'sm', 'Fechar (Esc)'));
  const body = el('div', 'pomoBody');
  body.append(el('p', 'muted small', 'Diga o trecho e até quando quer terminar: o leitor divide em páginas por dia e mostra no cartão Hoje.'));

  const num = (v, label) => {
    const w = el('label', 'planField'); w.append(el('span', null, label));
    const i = el('input', 'pomoNum'); i.type = 'number'; i.min = 1; i.max = n; i.value = v;
    i.onkeydown = e => e.stopPropagation(); w.append(i); return [w, i];
  };
  const [fw, from] = num(cur ? cur.from : state.currentPage, 'Da página');
  const [tw, to] = num(cur ? cur.to : n, 'até a página');
  const dw = el('label', 'planField'); dw.append(el('span', null, 'Terminar até'));
  const due = el('input', 'pomoNum planDate'); due.type = 'date'; due.min = App.dayKey();
  const d7 = new Date(); d7.setDate(d7.getDate() + 6);
  due.value = cur ? cur.due : App.dayKey(d7);
  due.onkeydown = e => e.stopPropagation(); dw.append(due);
  const row = el('div', 'planRow'); row.append(fw, tw, dw);
  body.append(row);

  // capítulos: escolher um preenche as páginas
  const chaps = await App.chapters();
  if (chaps.length > 1) {
    const sel = el('select', 'planChap');
    sel.append(new Option('Ou escolha um capítulo do sumário…', ''));
    chaps.forEach((c, i) => sel.append(new Option(`${c.title} (p. ${c.page})`, i)));
    sel.onchange = () => {
      const i = +sel.value; if (sel.value === '') return;
      from.value = chaps[i].page; to.value = i + 1 < chaps.length ? Math.max(chaps[i].page, chaps[i + 1].page - 1) : n; upd();
    };
    body.append(sel);
  }
  const preview = el('p', 'planPreview');
  body.append(preview);
  const read = () => {
    let a = Math.max(1, Math.min(n, Math.round(+from.value || 1))), b = Math.max(1, Math.min(n, Math.round(+to.value || n)));
    if (a > b) [a, b] = [b, a];
    return { from: a, to: b, due: due.value && due.value >= App.dayKey() ? due.value : App.dayKey() };
  };
  function upd(){
    const p = read(), info = App.planInfo({ ...rec, plan: p });
    preview.textContent = info.finished ? 'Esse trecho já está todo lido.'
      : `${App.plural(info.total - info.done, 'página falta', 'páginas faltam')} em ${App.plural(info.left, 'dia', 'dias')}: cerca de ${App.plural(info.target, 'página', 'páginas')} por dia.`;
  }
  [from, to, due].forEach(i => { i.oninput = upd; });
  upd();

  const foot = el('div', 'lookFoot');
  const left = el('div');
  if (cur) left.append(App.btn('Remover o plano', async () => {
    await App.patchDoc(state.fp, { plan: null }); dlg.close(); App.toast('Plano removido'); App.emit('plan:changed');
  }, 'sm outline danger'));
  foot.append(left, App.btn('Salvar plano', async () => {
    const p = read();
    const visited = state.stats.visited;
    p.day = { k: App.dayKey(), done: doneIn(p, visited) };
    p.created = Date.now();
    await App.patchDoc(state.fp, { plan: p });
    dlg.close();
    const info = App.planInfo({ plan: p, visited });
    App.toast(info.finished ? 'Plano salvo — o trecho já está lido.' : `Plano salvo: ${App.plural(info.target, 'página', 'páginas')} por dia até ${fmtDue(p.due)}.`);
    App.emit('plan:changed');
  }, 'primary'));
  dlg.append(head, body, foot);
  if (!dlg.open) dlg.showModal();
};

// ---------- Cartão Hoje ----------
const baseToday = App.renderToday;
App.renderToday = docs => {
  baseToday(docs);
  const box = $('#todayCard'); if (!box) return;
  const plans = docs.filter(d => d.plan && d.hasFile).map(d => ({ d, info: App.planInfo(d) })).filter(x => x.info && !x.info.finished);
  plans.forEach(x => { if (x.info.needsDay) stampDay(x.d); });
  if (!plans.length) return;
  plans.sort((a, b) => a.d.plan.due.localeCompare(b.d.plan.due));
  const sec = el('div', 'todayPlans');
  sec.append(el('div', 'rvLabel', 'Plano de leitura'));
  for (const { d, info } of plans.slice(0, 5)) {
    const b = el('button', 'planRowBtn' + (info.late ? ' late' : '') + (info.readToday >= info.target ? ' ok' : ''));
    const top = el('span', 'planTop');
    top.append(el('span', 'nm', App.baseName(d.name)),
      el('span', 'planCount', info.readToday >= info.target ? 'feito hoje ✓' : `${info.readToday}/${info.target} pág. hoje`));
    const bar = el('span', 'planBar'); const fill = el('span'); fill.style.width = Math.round(100 * info.done / info.total) + '%'; bar.append(fill);
    const sub = el('span', 'muted small', info.late ? `atrasado — prazo era ${fmtDue(d.plan.due)}` : `p. ${d.plan.from}–${d.plan.to} · até ${fmtDue(d.plan.due)} · ${App.plural(info.left, 'dia', 'dias')}`);
    b.append(top, bar, sub);
    b.title = `Continuar na página ${info.next}`;
    b.onclick = async () => { await App.switchTab(d.fp, d.name); if (state.fp === d.fp) App.goToPage(info.next); };
    sec.append(b);
  }
  const rv = box.querySelector('.todayReview');
  box.insertBefore(sec, rv || null);
};

// ---------- No leitor: avisa quando bater a meta de hoje ----------
let lastInfoKey = null;
setInterval(async () => {
  if (!state.pdf || !state.fp) return;
  const rec = await App.safe(() => App.DB.get('docs', state.fp), null);
  if (!rec || !rec.plan) return;
  const info = App.planInfo({ ...rec, visited: state.stats.visited });
  if (info.needsDay) { stampDay(rec); return; }
  const k = state.fp + App.dayKey();
  if (info.readToday >= info.target && info.target > 0 && lastInfoKey !== k && !ls.get('le.planDone.' + k, false)) {
    lastInfoKey = k; ls.set('le.planDone.' + k, true);
    App.toast(info.finished ? 'Plano de leitura concluído!' : `Meta de hoje do plano cumprida: ${App.plural(info.readToday, 'página', 'páginas')}.`);
  }
}, 30000);
App.on('plan:changed', () => App.renderHome?.());
})();
