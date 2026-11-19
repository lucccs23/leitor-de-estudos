/* Biblioteca: disciplinas (pastas) para organizar os PDFs e busca em todos os PDFs de uma vez. */
(() => {
'use strict';
const App = window.App;
const { $, el, state, DB, safe } = App;

// ---------- Menu suspenso genérico ----------
// items: { label, icon?, on, checked?, danger?, sub? } · { sep:true } · { input:true, placeholder, value?, onEnter }
let pop = null;
App.popOpen = () => !!pop;
App.closePop = () => { if (pop) { pop.remove(); pop = null; } };
App.popMenu = (anchor, items, opts = {}) => {
  App.closePop();
  const m = el('div', 'popMenu'); m.setAttribute('role', 'menu');
  if (opts.title) m.append(el('div', 'popTitle', opts.title));
  for (const it of items) {
    if (it.sep) { m.append(el('div', 'popSep')); continue; }
    if (it.input) {
      const f = el('input', 'popInput'); f.placeholder = it.placeholder || ''; f.value = it.value || ''; f.maxLength = 40;
      f.onkeydown = e => {
        e.stopPropagation();
        if (e.key === 'Enter' && f.value.trim()) { const v = f.value.trim(); App.closePop(); it.onEnter(v); }
        if (e.key === 'Escape') App.closePop();
      };
      m.append(f); setTimeout(() => f.focus(), 0); continue;
    }
    const b = el('button', 'popItem' + (it.checked ? ' on' : '') + (it.danger ? ' danger' : ''));
    b.setAttribute('role', 'menuitem');
    if (it.dot) { const d = el('span', 'popDot'); d.style.background = it.dot; b.append(d); }
    else if (it.icon) b.append(App.icon(it.icon));
    b.append(el('span', null, it.label));
    if (it.sub) b.append(el('small', null, it.sub));
    if (it.checked) b.append(App.icon('check', 'i popCheck'));
    b.onclick = e => { e.stopPropagation(); App.closePop(); it.on(); };
    m.append(b);
  }
  document.body.append(m); pop = m;
  let r = anchor && anchor.getBoundingClientRect();
  if (!r || (!r.width && !r.height)) { const tb = $('#toolbar').getBoundingClientRect(); r = { left: innerWidth / 2 - m.offsetWidth / 2, right: innerWidth / 2 + m.offsetWidth / 2, top: tb.bottom, bottom: tb.bottom }; }
  const w = m.offsetWidth, h = m.offsetHeight;
  let x = opts.alignRight ? r.right - w : r.left, y = r.bottom + 6;
  if (y + h > innerHeight - 8) y = Math.max(8, r.top - h - 6);
  m.style.left = Math.max(8, Math.min(innerWidth - w - 8, x)) + 'px'; m.style.top = y + 'px';
  return m;
};
document.addEventListener('mousedown', e => { if (pop && !pop.contains(e.target)) App.closePop(); }, true);
document.addEventListener('keydown', e => { if (pop && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); App.closePop(); } }, true);
addEventListener('resize', App.closePop);
addEventListener('blur', App.closePop);

// ---------- Disciplinas ----------
// lista com cor fixa por disciplina; cada documento guarda o nome em doc.subject
let subjects = App.ls.get('le.subjects', []).filter(s => s && s.name);
const saveSubjects = () => App.ls.set('le.subjects', subjects);
const COLOR_IDS = App.COLORS.map(c => c.id);
App.subjects = () => subjects.map(s => ({ ...s }));
App.subjectHex = name => App.colorOf((subjects.find(s => s.name === name) || {}).color).ink;
const sameName = (a, b) => App.fold(a).trim() === App.fold(b).trim();
function addSubject(name){
  const ex = subjects.find(s => sameName(s.name, name));
  if (ex) return ex.name;
  const used = subjects.map(s => s.color);
  const color = COLOR_IDS.find(c => !used.includes(c)) || COLOR_IDS[subjects.length % COLOR_IDS.length];
  subjects.push({ name, color }); saveSubjects();
  return name;
}
App.mergeSubjects = list => { for (const s of list || []) if (s && s.name && !subjects.some(x => sameName(x.name, s.name))) subjects.push({ name: s.name, color: s.color || 'b' }); saveSubjects(); };

async function setDocSubject(fp, name){
  await App.patchDoc(fp, { subject: name || '' });
  App.renderHome();
}
App.setDocSubject = setDocSubject;

async function renameSubject(oldName, newName){
  if (subjects.some(s => s.name !== oldName && sameName(s.name, newName))) { App.toast('Já existe uma disciplina com esse nome.'); return; }
  const s = subjects.find(x => x.name === oldName); if (s) s.name = newName; saveSubjects();
  for (const d of await safe(() => DB.all('docs'), [])) if (d.subject === oldName) await App.patchDoc(d.fp, cur => ({ subject: cur.subject === oldName ? newName : cur.subject }));
  if (filter === oldName) setFilter(newName); else App.renderHome();
}
async function deleteSubject(name){
  subjects = subjects.filter(s => s.name !== name); saveSubjects();
  for (const d of await safe(() => DB.all('docs'), [])) if (d.subject === name) await App.patchDoc(d.fp, cur => ({ subject: cur.subject === name ? '' : cur.subject }));
  if (filter === name) setFilter(null); else App.renderHome();
  App.toast(`Disciplina "${name}" excluída. Os PDFs continuam na lista.`);
}

// filtro da lista "Continuar lendo": null = todas, '' = sem disciplina
let filter = App.ls.get('le.subjFilter', null);
function setFilter(f){ filter = f; App.ls.set('le.subjFilter', f); App.renderHome(); }
App.subjectFilter = () => filter;
App.filterBySubject = docs => {
  if (filter !== null && filter !== '' && !subjects.some(s => s.name === filter)) filter = null;
  return filter === null ? docs : docs.filter(d => (d.subject || '') === filter);
};

// faixa de filtros acima da lista de recentes
App.renderSubjectBar = recent => {
  const bar = $('#subjBar'); bar.innerHTML = '';
  // disciplinas que aparecem nos documentos mas não estão na lista (ex.: vieram de um backup)
  for (const d of recent) if (d.subject && !subjects.some(s => s.name === d.subject)) addSubject(d.subject);
  const count = name => recent.filter(d => (d.subject || '') === name).length;
  const chip = (label, value, n, color) => {
    const b = el('button', 'subjChip' + (filter === value ? ' on' : ''));
    if (color) { const d = el('span', 'subjDot'); d.style.background = color; b.append(d); }
    b.append(el('span', null, label), el('span', 'subjN', n));
    b.onclick = () => setFilter(filter === value && value !== null ? null : value);
    return b;
  };
  bar.append(chip('Todos', null, recent.length));
  for (const s of subjects) {
    const b = chip(s.name, s.name, count(s.name), App.colorOf(s.color).ink);
    b.title = 'Clique para filtrar · botão direito para renomear, mudar a cor ou excluir';
    b.oncontextmenu = e => { e.preventDefault(); subjectMenu(b, s); };
    bar.append(b);
  }
  const none = count('');
  if (subjects.length && none) bar.append(chip('Sem disciplina', '', none));
  const add = App.ibtn('plus', subjects.length ? null : 'Criar disciplina', () => {
    App.popMenu(add, [{ input: true, placeholder: 'Ex.: Cardiologia', onEnter: v => { addSubject(v); App.renderHome(); App.toast(`Disciplina "${v}" criada. Use a etiqueta em cada PDF para colocá-lo nela.`); } }], { title: 'Nova disciplina' });
  }, 'sm subjAdd', 'Nova disciplina');
  bar.append(add);
};
function subjectMenu(anchor, s){
  App.popMenu(anchor, [
    { label: 'Renomear', icon: 'edit', on: () => App.popMenu(anchor, [{ input: true, value: s.name, placeholder: 'Nome da disciplina', onEnter: v => renameSubject(s.name, v) }], { title: 'Renomear disciplina' }) },
    { label: 'Mudar a cor', icon: 'sparkle', on: () => App.popMenu(anchor, App.COLORS.map(c => ({ label: c.name, dot: c.ink, checked: s.color === c.id, on: () => { s.color = c.id; saveSubjects(); App.renderHome(); } }))) },
    { sep: true },
    { label: 'Excluir disciplina', icon: 'trash', danger: true, sub: 'Os PDFs não são apagados', on: () => deleteSubject(s.name) },
  ], { title: s.name });
}

// etiqueta dentro de cada cartão de documento
App.subjectTag = d => {
  const b = el('button', 'subjTag' + (d.subject ? ' set' : ''));
  if (d.subject) { b.style.setProperty('--sc', App.subjectHex(d.subject)); b.append(el('span', 'subjDot'), d.subject); }
  else b.append(App.icon('plus'), 'Disciplina');
  b.title = 'Escolher a disciplina deste PDF';
  b.onclick = e => {
    e.stopPropagation();
    App.popMenu(b, [
      ...subjects.map(s => ({ label: s.name, dot: App.colorOf(s.color).ink, checked: d.subject === s.name, on: () => setDocSubject(d.fp, s.name) })),
      ...(subjects.length ? [{ sep: true }] : []),
      { input: true, placeholder: subjects.length ? 'Nova disciplina…' : 'Nome da disciplina (ex.: Cardio)', onEnter: v => setDocSubject(d.fp, addSubject(v)) },
      ...(d.subject ? [{ label: 'Tirar da disciplina', icon: 'x', on: () => setDocSubject(d.fp, '') }] : []),
    ], { title: 'Disciplina' });
  };
  return b;
};

// ---------- Índice de texto (para a busca em todos os PDFs) ----------
// Fica no IndexedDB (store meta, chave "tx:<fp>"): texto de cada página, original e "dobrado" (sem acento).
const IDX_V = 1;
const idxCache = new Map(); // fp → registro (memória, para buscas seguidas ficarem instantâneas)
const ocrCount = ocr => Object.keys(ocr || {}).length;
async function extractText(pdf, ocr, isCurrent){
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    let t = '';
    try {
      const tc = await (await pdf.getPage(n)).getTextContent();
      if (ocr && ocr[n] && App.textLength(tc) < App.MIN_TEXT) t = ocr[n].map(w => w[0]).join(' ');
      else for (const it of tc.items) if (typeof it.str === 'string') t += it.str + (it.hasEOL ? ' ' : '');
    } catch {}
    pages.push(t.replace(/\s+/g, ' ').trim());
    if (isCurrent && !isCurrent()) return null;
    if (n % 20 === 0) await new Promise(r => setTimeout(r, 0)); // não trava a tela em livros grandes
  }
  return pages;
}
async function saveIndex(fp, pages, ocr){
  const rec = { key: 'tx:' + fp, fp, v: IDX_V, ocrN: ocrCount(ocr), pages, folded: pages.map(App.fold) };
  await safe(() => DB.put('meta', rec));
  idxCache.set(fp, rec);
  return rec;
}
async function getIndex(fp){
  if (idxCache.has(fp)) return idxCache.get(fp);
  const rec = await safe(() => DB.get('meta', 'tx:' + fp), null);
  if (rec && rec.v === IDX_V) { idxCache.set(fp, rec); return rec; }
  return null;
}
// documento aberto: indexa em segundo plano (só quando ainda não tem índice ou o OCR mudou)
App.on('doc:loaded', async ({ fp }) => {
  await new Promise(r => setTimeout(r, 1500));
  if (state.fp !== fp || !state.pdf) return;
  const cur = await getIndex(fp);
  if (cur && cur.pages.length === state.pdf.numPages && cur.ocrN === ocrCount(state.ocr)) { App.emit('index:ready', { fp }); return; }
  await App.buildTextIndex();
});
App.getTextIndex = getIndex;
// índice do documento aberto (agora)
App.buildTextIndex = async () => {
  const fp = state.fp, token = state.token, pdf = state.pdf, ocr = state.ocr;
  if (!pdf) return null;
  const pages = await extractText(pdf, ocr, () => state.token === token);
  if (!pages) return null;
  const rec = await saveIndex(fp, pages, ocr);
  App.emit('index:ready', { fp });
  return rec;
};
App.on('ocr:done', () => { if (state.fp) { idxCache.delete(state.fp); safe(() => DB.del('meta', 'tx:' + state.fp)); } });
// limpeza (uma vez por sessão): índices de PDFs que saíram da lista não ocupam mais espaço
setTimeout(async () => {
  const keys = (await safe(() => DB.keys('meta'), [])).filter(k => typeof k === 'string' && k.startsWith('tx:'));
  if (!keys.length) return;
  const keep = new Set((await safe(() => DB.all('docs'), [])).filter(d => d.hasFile).map(d => d.fp));
  for (const k of keys) if (!keep.has(k.slice(3))) { await safe(() => DB.del('meta', k)); idxCache.delete(k.slice(3)); }
}, 15000);

// documento sem índice (aberto antes desta versão): abre só para ler o texto
async function indexFromFile(d){
  const f = await safe(() => DB.get('files', d.fp), null); if (!f) return null;
  let pdf;
  try { pdf = await pdfjsLib.getDocument({ data: new Uint8Array(f.data.slice(0)) }).promise; } catch { return null; }
  try { return await saveIndex(d.fp, await extractText(pdf, d.ocr), d.ocr); } finally { pdf.destroy(); }
}

// ---------- Busca em todos os PDFs ----------
const input = $('#libQuery'), out = $('#libResults');
let runId = 0, t;
input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 300); });
input.addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.stopPropagation(); input.value = ''; run(); input.blur(); }
  if (e.key === 'Enter') { clearTimeout(t); run(); }
});
$('#libClear').onclick = () => { input.value = ''; run(); input.focus(); };
App.searchAll = q => {
  if (state.pdf) { App.closeDoc().then(() => App.searchAll(q)); return; }
  input.value = q || input.value; input.focus(); input.select(); run();
};

async function run(){
  const id = ++runId, q = input.value.trim();
  $('#libClear').hidden = !q;
  document.body.classList.toggle('lib-searching', q.length >= 2);
  out.innerHTML = '';
  if (q.length < 2) return;
  const words = App.fold(q).split(/\s+/).filter(Boolean);
  const re = new RegExp(words.map(App.escapeRe).join('\\s*'), 'g');
  const docs = (await safe(() => DB.all('docs'), [])).filter(d => d.hasFile && d.kind !== 'epub').sort((a, b) => b.ts - a.ts);
  const scope = App.filterBySubject(docs);
  const status = el('p', 'libStatus muted small'); out.append(status);
  const list = el('div', 'libList'); out.append(list);
  let total = 0, docsHit = 0;
  for (let i = 0; i < scope.length; i++) {
    const d = scope[i];
    let idx = await getIndex(d.fp);
    if (id !== runId) return;
    if (!idx) {
      status.textContent = `Preparando "${App.baseName(d.name)}" para a busca (só na primeira vez)…`;
      idx = await indexFromFile(d);
      if (id !== runId) return;
      if (!idx) continue;
    }
    const hits = [];
    let count = 0;
    idx.folded.forEach((f, p) => {
      re.lastIndex = 0; let m;
      while ((m = re.exec(f))) {
        if (!m[0].length) { re.lastIndex++; continue; }
        count++;
        if (hits.length < 4 && !hits.some(h => h.page === p + 1)) hits.push({ page: p + 1, start: m.index, end: m.index + m[0].length, text: idx.pages[p] });
      }
    });
    if (!count) continue;
    total += count; docsHit++;
    list.append(docResult(d, hits, count, q));
    status.textContent = `${total} resultado${total === 1 ? '' : 's'} em ${docsHit} PDF${docsHit === 1 ? '' : 's'}…`;
  }
  if (id !== runId) return;
  const where = filter !== null ? ` (só em ${filter === '' ? '"Sem disciplina"' : '"' + filter + '"'})` : '';
  status.textContent = total ? `${total} resultado${total === 1 ? '' : 's'} em ${docsHit} PDF${docsHit === 1 ? '' : 's'}${where}` : '';
  if (!total) out.append(App.emptyState('search', 'Nada encontrado' + where, scope.length ? 'Maiúsculas e acentos são ignorados. A busca vale para os PDFs da lista "Continuar lendo"; PDFs escaneados precisam de OCR.' : 'Abra alguns PDFs: eles entram na busca automaticamente.'));
}
function docResult(d, hits, count, q){
  const box = el('div', 'libDoc');
  const head = el('div', 'libHead');
  head.append(App.icon('file'), el('strong', null, App.baseName(d.name)));
  if (d.subject) { const s = el('span', 'subjTag set static'); s.style.setProperty('--sc', App.subjectHex(d.subject)); s.append(el('span', 'subjDot'), d.subject); head.append(s); }
  head.append(el('span', 'libCount', `${count} ${count === 1 ? 'ocorrência' : 'ocorrências'}`));
  box.append(head);
  for (const h of hits) {
    const b = el('button', 'sr');
    b.append(el('span', 'pg', 'Página ' + h.page));
    const s = h.text, a = Math.max(0, h.start - 60), z = Math.min(s.length, h.end + 90);
    b.append((a > 0 ? '…' : '') + s.slice(a, h.start), el('mark', null, s.slice(h.start, h.end)), s.slice(h.end, z) + (z < s.length ? '…' : ''));
    b.onclick = () => openAt(d, h.page, q);
    box.append(b);
  }
  return box;
}
async function openAt(d, page, q){
  if (state.fp !== d.fp) await App.switchTab(d.fp, d.name);
  if (state.fp !== d.fp) return;
  App.goToPage(page);
  App.searchFor?.(q);
}
App.on('home:show', () => { if (input.value.trim().length >= 2) run(); });
})();
