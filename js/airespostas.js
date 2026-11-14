/* Respostas da IA: depois de perguntar, a resposta copiada do Claude/ChatGPT/Gemini pode ser colada de volta.
   Ela vira nota do grifo (ou uma nota na página) e fica no histórico "Respostas guardadas". */
(() => {
'use strict';
const App = window.App;
const { $, el, state, ls, DB, safe } = App;

const MAX = 150;
let hist = ls.get('le.aiHistory', []).filter(x => x && x.id);
const save = () => ls.set('le.aiHistory', hist.slice(-MAX));
const PNAME = { claude: 'Claude', chatgpt: 'ChatGPT', gemini: 'Gemini' };

// cada pedido enviado fica guardado (para colar a resposta e para pedir de novo)
App.aiRemember = (prompt, ctx, label) => {
  const e = { id: App.uid(), t: Date.now(), provider: App.aiProvider(), label: String(label || '').slice(0, 120), src: ctx.src,
    page: ctx.page || null, pages: ctx.pages || null, fp: state.fp, name: state.name, hid: ctx.hid || null, y: ctx.y != null ? ctx.y : null,
    excerpt: String(ctx.text || (ctx.image ? '(figura)' : '')).replace(/\s+/g, ' ').trim().slice(0, 220),
    prompt: prompt.length <= 60000 ? prompt : null, answer: '' };
  hist.push(e); save();
  showBar(e);
  return e;
};
App.aiHistory = () => hist;

// ---------- Barra "guardar a resposta" ----------
const bar = el('div', 'aiReturn'); bar.hidden = true; bar.setAttribute('role', 'status');
document.body.append(bar);
let barT;
function showBar(e){
  bar.innerHTML = '';
  const txt = el('div', 'aiRetTxt');
  txt.append(App.icon('ai'), el('span', null, `Quando o ${PNAME[e.provider] || 'site'} responder, copie a resposta e guarde aqui.`));
  bar.append(txt, App.btn('Guardar resposta', () => openSave(e), 'primary sm'), App.ibtn('x', null, () => { bar.hidden = true; }, 'sm', 'Fechar'));
  // aparece depois do aviso "Abrindo o Claude…" (no celular os dois ficam no mesmo lugar)
  clearTimeout(barT);
  const show = () => { if ($('#toast').classList.contains('show')) { barT = setTimeout(show, 300); return; } bar.hidden = false; barT = setTimeout(() => { bar.hidden = true; }, 30 * 60000); };
  bar.hidden = true; barT = setTimeout(show, 300);
}

// ---------- Janela de colar ----------
async function openSave(e){
  const dlg = App.dialog('aiSaveDlg', 'pomoDlg aiSaveDlg'); dlg.setAttribute('aria-label', 'Guardar a resposta da IA');
  dlg.innerHTML = '';
  const head = el('div', 'helpHead');
  head.append(el('h2', null, 'Guardar a resposta'), App.ibtn('x', null, () => dlg.close(), 'sm', 'Fechar (Esc)'));
  const body = el('div', 'pomoBody');
  body.append(el('p', 'muted small', `${e.label ? '“' + e.label + '” · ' : ''}${App.baseName(e.name || '')}${e.page ? ', p. ' + e.page : ''}`));
  const ta = el('textarea', 'aiPromptText aiAnswer'); ta.placeholder = 'Cole aqui a resposta (Ctrl+V ou segure e cole)'; ta.value = e.answer || '';
  ta.onkeydown = ev => ev.stopPropagation();
  body.append(ta);
  // destino da resposta
  const h = e.hid && e.fp === state.fp ? state.highlights.find(x => x.id === e.hid) : null;
  const canHl = !!e.hid;
  const opts = el('div', 'mdScope');
  const radio = (val, label, checked) => { const w = el('label', 'mdOpt'); const r = el('input'); r.type = 'radio'; r.name = 'aiDest'; r.value = val; r.checked = checked; w.append(r, el('span', null, label)); opts.append(w); };
  if (canHl) radio('hl', 'Como nota do grifo', true);
  if (e.page && e.fp) radio('page', `Como nota na página ${e.page}`, !canHl);
  radio('hist', 'Só nas respostas guardadas', !canHl && !(e.page && e.fp));
  body.append(opts);
  const foot = el('div', 'lookFoot');
  foot.append(App.btn('Ver respostas guardadas', () => { dlg.close(); App.openAiHistory(); }, 'sm outline'), App.btn('Guardar', async () => {
    const text = ta.value.trim();
    if (!text) { App.toast('Cole a resposta primeiro.'); ta.focus(); return; }
    const dest = (opts.querySelector('input:checked') || {}).value || 'hist';
    e.answer = text; e.saved = Date.now(); e.dest = dest; save();
    const label = `IA (${PNAME[e.provider] || 'IA'}${e.label ? ' · ' + e.label : ''}):\n${text}`;
    if (dest === 'hl') await addToHighlight(e, label);
    else if (dest === 'page') await addPageNote(e, label);
    dlg.close(); bar.hidden = true;
    App.toast(dest === 'hl' ? 'Resposta guardada na nota do grifo' : dest === 'page' ? `Resposta guardada como nota na página ${e.page}` : 'Resposta guardada');
  }, 'primary'));
  dlg.append(head, body, foot);
  if (!dlg.open) dlg.showModal();
  // tenta já colar o que está copiado (quando o navegador deixa sem perguntar)
  try {
    const p = navigator.permissions && await navigator.permissions.query({ name: 'clipboard-read' });
    if (p && p.state === 'granted' && !ta.value) { const c = await navigator.clipboard.readText(); if (c && c.trim().length > 20 && !e.prompt?.includes(c.trim().slice(0, 60))) ta.value = c.trim(); }
  } catch {}
  ta.focus();
}
App.aiSaveAnswer = id => { const e = hist.find(x => x.id === id); if (e) openSave(e); };

async function addToHighlight(e, label){
  if (e.fp === state.fp) {
    const h = state.highlights.find(x => x.id === e.hid);
    if (h) { App.snapshot(); h.note = (h.note ? h.note.trim() + '\n\n' : '') + label; App.refreshHighlight(h); return; }
  }
  await App.patchDoc(e.fp, cur => ({ highlights: (cur.highlights || []).map(x => x.id === e.hid ? { ...x, note: (x.note ? x.note.trim() + '\n\n' : '') + label } : x) }));
}
async function addPageNote(e, label){
  const y = Math.max(0.01, Math.min(0.95, e.y != null ? e.y : 0.04));
  const n = { id: App.uid(), kind: 'note', style: 'fill', color: 'v', text: '', note: label, parts: [{ page: e.page, rects: [{ x: 0.93, y: +y.toFixed(4), w: 0.03, h: 0.022 }] }], created: Date.now() };
  if (e.fp === state.fp) { App.snapshot(); state.highlights.push(App.normHl(n)); App.refreshHighlight(n); return; }
  await App.patchDoc(e.fp, cur => ({ highlights: [...(cur.highlights || []), n] }));
}

// ---------- Histórico ----------
App.openAiHistory = () => {
  const dlg = App.dialog('aiHistDlg', 'pomoDlg aiHistDlg'); dlg.setAttribute('aria-label', 'Respostas da IA');
  const build = () => {
    dlg.innerHTML = '';
    const head = el('div', 'helpHead');
    head.append(el('h2', null, 'Respostas da IA'), App.ibtn('x', null, () => dlg.close(), 'sm', 'Fechar (Esc)'));
    const body = el('div', 'pomoBody');
    const list = [...hist].reverse();
    if (!list.length) body.append(App.emptyState('ai', 'Nenhuma pergunta ainda', 'Pergunte à IA sobre um trecho, um grifo ou o capítulo. Depois cole a resposta aqui para guardá-la.'));
    for (const e of list.slice(0, 60)) {
      const card = el('div', 'aiHistCard' + (e.answer ? ' has' : ''));
      const top = el('div', 'aiHistTop');
      const when = new Date(e.t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      top.append(el('strong', null, e.label || 'Pergunta'), el('span', 'muted small', `${PNAME[e.provider] || ''} · ${when}`));
      card.append(top, el('div', 'muted small', `${App.baseName(e.name || '')}${e.pages ? ', p. ' + e.pages : e.page ? ', p. ' + e.page : ''}${e.excerpt ? ' — “' + e.excerpt.slice(0, 110) + (e.excerpt.length > 110 ? '…' : '') + '”' : ''}`));
      if (e.answer) { const a = el('details', 'aiHistAns'); a.append(el('summary', null, 'Resposta'), el('div', 'aiHistText', e.answer)); card.append(a); }
      const acts = el('div', 'aiHistActs');
      if (e.fp && e.page) acts.append(App.ibtn('right', 'Ir', async () => { dlg.close(); if (state.fp !== e.fp) await App.switchTab(e.fp, e.name); if (state.fp === e.fp) App.goToPage(e.page); }, 'sm'));
      acts.append(App.ibtn('note', e.answer ? 'Editar resposta' : 'Guardar resposta', () => { dlg.close(); openSave(e); }, 'sm'));
      if (e.answer) acts.append(App.ibtn('copy', null, () => App.copyText(e.answer), 'sm', 'Copiar a resposta'));
      if (e.prompt) acts.append(App.ibtn('restore', null, async () => { await navigator.clipboard.writeText(e.prompt).catch(() => {}); const P = { claude: q => 'https://claude.ai/new?q=' + encodeURIComponent(q), chatgpt: q => 'https://chatgpt.com/?q=' + encodeURIComponent(q) }[e.provider];
        App.openExternal(P && encodeURIComponent(e.prompt).length < 6000 ? P(e.prompt) : e.provider === 'gemini' ? 'https://gemini.google.com/app' : e.provider === 'chatgpt' ? 'https://chatgpt.com/' : 'https://claude.ai/new'); App.toast('Pedido aberto de novo (também está copiado)'); }, 'sm', 'Perguntar de novo'));
      acts.append(App.ibtn('trash', null, () => { hist = hist.filter(x => x !== e); save(); build(); }, 'sm danger', 'Apagar do histórico'));
      card.append(acts);
      body.append(card);
    }
    const foot = el('div', 'lookFoot');
    foot.append(hist.length ? App.btn('Limpar histórico', () => { if (confirm('Apagar todo o histórico da IA? As notas já guardadas nos grifos continuam.')) { hist = []; save(); build(); } }, 'sm outline danger') : el('span'), App.btn('Fechar', () => dlg.close(), 'primary'));
    dlg.append(head, body, foot);
  };
  build();
  if (!dlg.open) dlg.showModal();
};
})();
