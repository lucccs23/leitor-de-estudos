/* Siglas: o leitor encontra no PDF as definições do tipo "insuficiência cardíaca (IC)" e monta uma lista.
   Selecionar uma sigla mostra o significado no balão; a lista completa fica em Estudar → Siglas.
   As siglas de todos os PDFs valem juntas (uma sigla definida no livro aparece também na aula). */
(() => {
'use strict';
const App = window.App;
const { el, state, DB, safe } = App;
const V = 2;

// letra sem acento e minúscula, mantendo a posição (para casar a sigla com o texto)
const plain = c => c.normalize('NFD')[0].toLowerCase();
const isAlnum = c => /[\p{L}\p{N}]/u.test(c || '');
const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'em', 'na', 'no', 'por', 'para', 'com', 'the', 'of', 'and', 'in', 'to', 'for']);
// Schwartz & Hearst: acha, de trás para frente, a forma longa cujas letras formam a sigla
function longForm(sf, lf){
  let s = sf.length - 1, l = lf.length - 1;
  while (s >= 0) {
    const c = plain(sf[s]);
    if (!isAlnum(c)) { s--; continue; }
    while ((l >= 0 && plain(lf[l]) !== c) || (s === 0 && l > 0 && isAlnum(lf[l - 1]))) l--;
    if (l < 0) return null;
    l--; s--;
  }
  const start = lf.lastIndexOf(' ', l) + 1;
  return lf.slice(start).trim();
}
const ACR = /^(?=(?:.*[A-Z]){2})[A-Z][A-Za-z0-9\-]{1,9}$/; // 2+ maiúsculas (IC, IECA, HbA1c, TNF-α não)
App.extractSiglas = pages => {
  const found = new Map();
  const re = /\(([A-Z][A-Za-z0-9\-]{1,9})\)/g;
  pages.forEach((text, i) => {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(text))) {
      let sf = m[1];
      const plural = /[A-Z]s$/.test(sf);
      if (!ACR.test(sf)) continue;
      if (plural) sf = sf.slice(0, -1);
      if (found.has(sf)) { found.get(sf).n++; continue; }
      const before = text.slice(Math.max(0, m.index - 160), m.index).replace(/[\s,;:]+$/, '');
      const letters = sf.replace(/[^A-Za-z0-9]/g, '').length;
      const words = before.split(/\s+/);
      const cand = words.slice(-Math.min(letters + 5, letters * 2 + 1)).join(' ');
      let lf = longForm(sf, cand);
      if (!lf) continue;
      lf = lf.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[-‐]\s+/g, '');
      const sig = lf.split(/\s+/).filter(w => !STOP.has(w.toLowerCase()));
      if (lf.length <= sf.length + 2 || sig.length > letters + 2 || sig.length < 1) continue;
      if (lf.split(/\s+/).length > letters + 6) continue;
      // a 1ª letra da sigla tem que começar a 1ª palavra
      if (plain(lf[0]) !== plain(sf[0])) continue;
      found.set(sf, { s: sf, l: lf, p: i + 1, n: 1 });
    }
  });
  return [...found.values()].sort((a, b) => a.s.localeCompare(b.s, 'pt-BR'));
};

// ---------- Guardar por documento ----------
const mem = new Map(); // fp → lista
async function siglasOf(fp){
  if (mem.has(fp)) return mem.get(fp);
  const rec = await safe(() => DB.get('meta', 'sg:' + fp), null);
  if (rec && rec.v === V) { mem.set(fp, rec.list); return rec.list; }
  return null;
}
async function build(fp){
  const idx = await App.getTextIndex?.(fp);
  if (!idx) return null;
  const list = App.extractSiglas(idx.pages);
  await safe(() => DB.put('meta', { key: 'sg:' + fp, fp, v: V, list }));
  mem.set(fp, list); all = null;
  return list;
}
App.on('index:ready', async ({ fp }) => { if (!(await siglasOf(fp))) build(fp); });
App.on('ocr:done', () => { if (state.fp) { mem.delete(state.fp); safe(() => DB.del('meta', 'sg:' + state.fp)); all = null; } });

// todas as siglas conhecidas (deste PDF primeiro)
let all = null;
async function lookup(sf){
  const key = sf.replace(/s$/, '');
  const cur = state.fp && await siglasOf(state.fp);
  const hit = cur && (cur.find(x => x.s === sf) || cur.find(x => x.s === key));
  if (hit) return { ...hit, here: true };
  if (!all) {
    all = new Map();
    const keys = (await safe(() => DB.keys('meta'), [])).filter(k => typeof k === 'string' && k.startsWith('sg:'));
    const docs = new Map((await safe(() => DB.all('docs'), [])).map(d => [d.fp, d]));
    for (const k of keys) {
      const fp = k.slice(3), d = docs.get(fp); if (!d || !d.hasFile) continue;
      for (const x of (await siglasOf(fp)) || []) if (!all.has(x.s)) all.set(x.s, { ...x, doc: d.name });
    }
  }
  return all.get(sf) || all.get(key) || null;
}
App.lookupSigla = lookup;

// ---------- Balão da seleção: mostra o significado ----------
App.selectionExtras = async (popup, text) => {
  const t = (text || '').trim().replace(/^[(\[]|[)\].,;:]$/g, '');
  if (!t || t.length > 11 || /\s/.test(t) || !/^(?=(?:.*[A-Z]){2})[A-Z]/.test(t)) return;
  const x = await lookup(t);
  if (!x || popup.hidden) return;
  const box = el('div', 'siglaLine');
  box.append(el('strong', null, x.s), el('span', null, ' = ' + x.l));
  const src = el('button', 'siglaSrc', x.here ? `p. ${x.p}` : App.baseName(x.doc || ''));
  src.title = x.here ? 'Ir para onde a sigla é definida' : 'Definida em outro PDF';
  src.onclick = () => { if (x.here) { App.closePopup(); App.goToPage(x.p); } };
  box.append(src);
  popup.prepend(box);
};

// ---------- Lista de siglas ----------
App.openSiglas = async () => {
  if (!state.pdf) { App.toast('Abra um PDF primeiro.'); return; }
  const fp = state.fp;
  const dlg = App.dialog('siglasDlg', 'pomoDlg siglasDlg'); dlg.setAttribute('aria-label', 'Siglas');
  dlg.innerHTML = '';
  const head = el('div', 'helpHead');
  head.append(el('h2', null, 'Siglas deste PDF'), App.ibtn('x', null, () => dlg.close(), 'sm', 'Fechar (Esc)'));
  const body = el('div', 'pomoBody');
  const search = el('input', 'popInput siglaSearch'); search.placeholder = 'Procurar sigla ou significado…'; search.type = 'search';
  search.onkeydown = e => e.stopPropagation();
  const list = el('div', 'siglaList');
  body.append(search, list);
  dlg.append(head, body);
  if (!dlg.open) dlg.showModal();
  list.append(el('p', 'muted small', 'Procurando siglas no texto…'));
  let items = await siglasOf(fp);
  if (!items) {
    if (!(await App.getTextIndex?.(fp))) await App.buildTextIndex?.();
    items = await build(fp);
  }
  if (state.fp !== fp) return;
  const render = () => {
    list.innerHTML = '';
    const q = App.fold(search.value.trim());
    const shown = (items || []).filter(x => !q || App.fold(x.s + ' ' + x.l).includes(q));
    if (!items || !items.length) { list.append(App.emptyState('list', 'Nenhuma sigla encontrada', 'O leitor procura siglas definidas entre parênteses, como "insuficiência cardíaca (IC)". PDF escaneado? Rode o OCR antes.')); return; }
    if (!shown.length) { list.append(el('p', 'muted small', 'Nada com esse nome.')); return; }
    for (const x of shown) {
      const r = el('button', 'siglaRow');
      r.append(el('strong', null, x.s), el('span', 'siglaLong', x.l), el('span', 'muted small', `p. ${x.p}`));
      r.title = `Ir para a página ${x.p}`;
      r.onclick = () => { dlg.close(); App.goToPage(x.p); };
      list.append(r);
    }
  };
  search.oninput = render;
  render();
  head.querySelector('h2').textContent = `Siglas deste PDF${items && items.length ? ` (${items.length})` : ''}`;
  setTimeout(() => search.focus(), 50);
};
})();
