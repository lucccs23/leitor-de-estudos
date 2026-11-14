/* Ferramentas de páginas: organizar (extrair, girar, apagar, reordenar), combinar PDFs e criar PDF a partir de fotos.
   Tudo gera um NOVO PDF (o original nunca é alterado) e leva junto os grifos, notas, marcadores e OCR das páginas usadas. */
(() => {
'use strict';
const App = window.App;
const { $, $$, el, btn, state, DB, safe } = App;

// ---------- Utilidades ----------
// "1-5, 9, 12-" → índices (0-based); vazio = todas
App.parseRange = (str, max) => {
  str = (str || '').trim();
  if (!str || /^(todas?|tudo)$/i.test(str)) return Array.from({ length: max }, (_, i) => i);
  const out = [];
  for (const part of str.replace(/\s*(?:[-–]|até|a)\s*/gi, '-').split(/[,;\s]+/).filter(Boolean)) {
    let a, b, m;
    if ((m = part.match(/^(\d+)$/))) a = b = +m[1];
    else if ((m = part.match(/^(\d*)-(\d*)$/))) { a = m[1] ? +m[1] : 1; b = m[2] ? +m[2] : max; }
    else return null;
    if (a > b) [a, b] = [b, a];
    for (let i = Math.max(1, a); i <= Math.min(max, b); i++) out.push(i - 1);
  }
  return out.length ? out : null;
};
const rotRect = (r, rot) => {
  if (rot === 90) return { x: 1 - r.y - r.h, y: r.x, w: r.h, h: r.w };
  if (rot === 180) return { x: 1 - r.x - r.w, y: 1 - r.y - r.h, w: r.w, h: r.h };
  if (rot === 270) return { x: r.y, y: 1 - r.x - r.w, w: r.h, h: r.w };
  return { ...r };
};
const rotPt = ([x, y], rot) => rot === 90 ? [1 - y, x] : rot === 180 ? [1 - x, 1 - y] : rot === 270 ? [y, 1 - x] : [x, y];

// leva grifos/marcadores/OCR das páginas de origem para as páginas novas
// map: Map(páginaOrigem(1-based) → [{ page: páginaNova(1-based), rot }])
function carryData(src, map){
  const highlights = [], bookmarks = [], ocr = {};
  for (const h of src.highlights || []) {
    const parts = [];
    for (const part of h.parts) for (const dest of map.get(part.page) || []) {
      if (part.paths) parts.push({ page: dest.page, paths: part.paths.map(pts => pts.map(p => rotPt(p, dest.rot).map(v => +v.toFixed(4)))) });
      else parts.push({ page: dest.page, rects: part.rects.map(r => rotRect(r, dest.rot)) });
    }
    if (parts.length) highlights.push({ ...h, id: App.uid(), parts, srs: undefined });
  }
  for (const b of src.bookmarks || []) for (const dest of map.get(b.page) || []) bookmarks.push({ ...b, id: App.uid(), page: dest.page });
  for (const [n, words] of Object.entries(src.ocr || {})) for (const dest of map.get(+n) || []) if (!dest.rot) ocr[dest.page] = words;
  return { highlights, bookmarks, ocr };
}

// abre o PDF gerado numa aba nova, já com os dados levados da origem
App.openGenerated = async (bytes, name, carry) => {
  const ok = await App.loadDoc(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), name);
  if (!ok) return false;
  if (carry && (carry.highlights.length || carry.bookmarks.length || Object.keys(carry.ocr).length)) {
    state.highlights = [...state.highlights, ...carry.highlights.map(App.normHl)];
    state.bookmarks = [...state.bookmarks, ...carry.bookmarks];
    state.ocr = { ...carry.ocr, ...state.ocr };
    for (const n of Object.keys(carry.ocr)) App.ocrUpdated(+n);
    App.renderAllAnnots(); App.renderPanel(); App.emit('bookmarks:reload'); App.emit('hl:changed');
    await App.saveDoc();
  }
  return true;
};
const pdfLibReady = () => { if (!window.PDFLib) { App.toast('Biblioteca pdf-lib não encontrada na pasta lib.'); return false; } return true; };

// ---------- Janela de ferramentas ----------
const toolsDlg = $('#toolsDlg');
App.openTools = () => { App.closePopup(); toolsDlg.showModal(); };
$('#btnTools').onclick = App.openTools;
$('#toolsClose').onclick = () => toolsDlg.close();
toolsDlg.addEventListener('click', e => {
  if (e.target === toolsDlg) { toolsDlg.close(); return; }
  const b = e.target.closest('[data-tool-open]'); if (!b) return;
  toolsDlg.close();
  ({ organize: openOrganizer, combine: openCombiner, photos: openImager, ocr: () => App.runOcr(), exam: () => App.openExam?.(), summary: () => App.openSummary?.() })[b.dataset.toolOpen]?.();
});

// ---------- Tela cheia genérica ----------
const sheet = $('#sheet');
let sheetKeys = null;
function openSheet(build, onKey){
  App.closePopup(); sheet.innerHTML = ''; sheet.hidden = false; sheetKeys = onKey || null;
  App.sheetOpen = true; build(sheet);
}
function closeSheet(){ sheet.hidden = true; sheet.innerHTML = ''; App.sheetOpen = false; sheetKeys = null; if (orgObs) { orgObs.disconnect(); orgObs = null; } }
App.closeSheet = closeSheet; App.openSheet = openSheet; App.sheetHeader = sheetHeader;
document.addEventListener('keydown', e => {
  if (!App.sheetOpen) return;
  if (e.key === 'Escape' && !e.target.closest('input,textarea')) { e.preventDefault(); e.stopPropagation(); closeSheet(); return; }
  if (sheetKeys && !e.target.closest('input,textarea')) sheetKeys(e);
}, true);
function sheetHeader(title, sub, actions){
  const top = el('div', 'sheetTop');
  const t = el('div', 'sheetTitle'); t.append(el('h2', null, title)); if (sub) t.append(sub);
  const a = el('div', 'sheetActions'); a.append(...actions, App.ibtn('x', null, closeSheet, '', 'Fechar (Esc)'));
  top.append(t, a); return top;
}

// ---------- Organizar páginas ----------
let org = null, orgObs = null;
function openOrganizer(){
  if (!state.pdf) { App.toast('Abra um PDF primeiro.'); return; }
  if (!pdfLibReady()) return;
  org = { items: state.pages.map((p, i) => ({ src: i, rot: 0, key: App.uid() })), sel: new Set(), last: null, srcName: state.name };
  openSheet(renderOrganizer, e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); org.items.forEach(it => org.sel.add(it.key)); refreshOrg(); }
    if (e.key === 'Delete') { e.preventDefault(); orgDelete(); }
  });
}
function renderOrganizer(root){
  const sub = el('span', 'sheetSub', '');
  const range = el('input', 'rangeInput'); range.placeholder = 'Selecionar páginas: ex. 120-180, 200'; range.setAttribute('aria-label', 'Selecionar páginas');
  range.onkeydown = e => { if (e.key === 'Enter') selectRange(); };
  const selectRange = () => {
    const idx = App.parseRange(range.value, org.items.length);
    if (!idx) { App.toast('Não entendi as páginas. Use algo como 1-10, 15, 20-25.'); return; }
    org.sel = new Set(idx.map(i => org.items[i].key)); refreshOrg();
    const first = root.querySelector(`.orgItem[data-key="${org.items[idx[0]].key}"]`); if (first) first.scrollIntoView({ block: 'center' });
  };
  const bar = el('div', 'sheetBar');
  const rangeBox = el('div', 'rangeBox'); rangeBox.append(range, btn('Selecionar', selectRange, 'sm outline'));
  const selAll = btn('Todas', () => { org.items.forEach(it => org.sel.add(it.key)); refreshOrg(); }, 'sm');
  const selNone = btn('Nenhuma', () => { org.sel.clear(); refreshOrg(); }, 'sm');
  const rl = App.ibtn('rotl', 'Girar', () => orgRotate(-90), 'sm outline needSel', 'Girar à esquerda');
  const rr = App.ibtn('rotr', null, () => orgRotate(90), 'sm outline needSel', 'Girar à direita');
  const del = App.ibtn('trash', 'Apagar', orgDelete, 'sm outline danger needSel', 'Tirar as páginas selecionadas (Del)');
  const reset = btn('Desfazer tudo', () => { org.items = state.pages.map((p, i) => ({ src: i, rot: 0, key: App.uid() })); org.sel.clear(); buildGrid(); }, 'sm');
  bar.append(rangeBox, selAll, selNone, el('span', 'barSep'), rl, rr, del, el('span', 'barSep'), reset);
  const extract = App.ibtn('pages', 'Extrair selecionadas', () => orgBuild(true), 'primary needSel', 'Cria um PDF só com as páginas selecionadas');
  const saveAll = App.ibtn('check', 'Salvar como novo PDF', () => orgBuild(false), 'outline', 'Cria um PDF com todas as mudanças (ordem, giros, páginas tiradas)');
  root.append(sheetHeader('Organizar páginas', sub, [saveAll, extract]), bar, el('div', 'orgGrid'),
    el('p', 'sheetHint', 'Clique para selecionar · Ctrl+clique soma · Shift+clique seleciona um intervalo · arraste para mudar a ordem. O PDF original não é alterado.'));
  org.ui = { sub, root };
  buildGrid();
}
function buildGrid(){
  const grid = org.ui.root.querySelector('.orgGrid'); grid.innerHTML = '';
  if (orgObs) orgObs.disconnect();
  orgObs = new IntersectionObserver(ents => { for (const e of ents) if (e.isIntersecting) orgThumb(e.target); }, { root: grid, rootMargin: '600px' });
  org.items.forEach((it, i) => {
    const p = state.pages[it.src];
    const item = el('div', 'orgItem'); item.dataset.key = it.key; item.draggable = true;
    const frame = el('div', 'orgFrame');
    const w = 132, h = Math.round(w * p.base.h / p.base.w);
    frame.style.width = w + 'px'; frame.style.height = h + 'px';
    const num = el('div', 'orgNum', `${i + 1}`); num.title = `Página original ${it.src + 1}`;
    item.append(frame, num);
    item.onclick = e => orgClick(it, e);
    item.ondragstart = e => { if (!org.sel.has(it.key)) { org.sel = new Set([it.key]); refreshOrg(); } e.dataTransfer.setData('text/plain', it.key); e.dataTransfer.effectAllowed = 'move'; item.classList.add('dragging'); };
    item.ondragend = () => item.classList.remove('dragging');
    item.ondragover = e => { e.preventDefault(); const r = item.getBoundingClientRect(); item.classList.toggle('dropL', e.clientX < r.left + r.width / 2); item.classList.toggle('dropR', e.clientX >= r.left + r.width / 2); };
    item.ondragleave = () => item.classList.remove('dropL', 'dropR');
    item.ondrop = e => { e.preventDefault(); const after = item.classList.contains('dropR'); item.classList.remove('dropL', 'dropR'); orgMove(it.key, after); };
    grid.append(item); orgObs.observe(item);
  });
  refreshOrg();
}
async function orgThumb(item){
  if (item.dataset.done) return; item.dataset.done = '1';
  const it = org.items.find(x => x.key === item.dataset.key); if (!it) return;
  try {
    const page = await state.pdf.getPage(it.src + 1);
    const vp1 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: 132 * 1.5 / vp1.width });
    const c = el('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    item.querySelector('.orgFrame').append(c);
  } catch { item.dataset.done = ''; }
}
function refreshOrg(){
  const n = org.sel.size;
  org.ui.sub.textContent = `${org.items.length} página${org.items.length === 1 ? '' : 's'}${n ? ` · ${n} selecionada${n === 1 ? '' : 's'}` : ''}`;
  org.ui.root.querySelectorAll('.needSel').forEach(b => { b.disabled = !n; });
  org.items.forEach((it, i) => {
    const item = org.ui.root.querySelector(`.orgItem[data-key="${it.key}"]`); if (!item) return;
    item.classList.toggle('sel', org.sel.has(it.key));
    item.querySelector('.orgNum').textContent = `${i + 1}`;
    const c = item.querySelector('.orgFrame'); c.style.transform = it.rot ? `rotate(${it.rot}deg)` : '';
  });
}
function orgClick(it, e){
  const keys = org.items.map(x => x.key);
  if (e.shiftKey && org.last) {
    const a = keys.indexOf(org.last), b = keys.indexOf(it.key);
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) org.sel.add(keys[i]);
  } else if (e.ctrlKey || e.metaKey) { org.sel.has(it.key) ? org.sel.delete(it.key) : org.sel.add(it.key); }
  else org.sel = org.sel.size === 1 && org.sel.has(it.key) ? new Set() : new Set([it.key]);
  org.last = it.key; refreshOrg();
}
function orgRotate(d){ for (const it of org.items) if (org.sel.has(it.key)) it.rot = (it.rot + d + 360) % 360; refreshOrg(); }
function orgDelete(){
  if (!org.sel.size) return;
  if (org.sel.size >= org.items.length) { App.toast('O PDF precisa ficar com pelo menos uma página.'); return; }
  org.items = org.items.filter(it => !org.sel.has(it.key)); org.sel.clear(); buildGrid();
}
function orgMove(targetKey, after){
  const moving = org.items.filter(it => org.sel.has(it.key));
  if (!moving.length || org.sel.has(targetKey)) return;
  const rest = org.items.filter(it => !org.sel.has(it.key));
  let at = rest.findIndex(it => it.key === targetKey) + (after ? 1 : 0);
  rest.splice(at, 0, ...moving); org.items = rest; buildGrid();
}
async function orgBuild(onlySelected){
  const items = onlySelected ? org.items.filter(it => org.sel.has(it.key)) : org.items;
  if (!items.length) return;
  const base = App.baseName(org.srcName);
  const label = onlySelected ? rangeLabel(items.map(it => it.src + 1)) : 'organizado';
  closeSheet();
  App.toast('Montando o novo PDF…'); App.setLoading(0.15);
  try {
    const { PDFDocument, degrees } = PDFLib;
    const src = await PDFDocument.load(new Uint8Array(state.bytes.slice(0)), { ignoreEncryption: true });
    App.setLoading(0.45);
    const out = await PDFDocument.create();
    const copied = await out.copyPages(src, items.map(it => it.src));
    copied.forEach((pg, i) => { if (items[i].rot) pg.setRotation(degrees((pg.getRotation().angle + items[i].rot) % 360)); out.addPage(pg); });
    App.setLoading(0.75);
    const bytes = await out.save();
    const map = new Map(); items.forEach((it, i) => { const k = it.src + 1; if (!map.has(k)) map.set(k, []); map.get(k).push({ page: i + 1, rot: it.rot }); });
    const carry = carryData(state, map);
    await App.openGenerated(bytes, `${base} (${label}).pdf`, carry);
    App.toast(`Novo PDF criado com ${items.length} página${items.length === 1 ? '' : 's'} — está numa aba nova.`);
  } catch (e) { console.error(e); App.setLoading(null); App.toast('Não consegui montar o PDF (o arquivo pode ser protegido).'); }
}
function rangeLabel(nums){
  const out = []; let a = nums[0], b = nums[0];
  for (let i = 1; i <= nums.length; i++) {
    if (nums[i] === b + 1) { b = nums[i]; continue; }
    out.push(a === b ? `${a}` : `${a}-${b}`); a = b = nums[i];
  }
  const s = out.join(', ');
  return 'p. ' + (s.length > 40 ? s.slice(0, 40) + '…' : s);
}

// ---------- Combinar PDFs ----------
let comb = null;
function openCombiner(){
  if (!pdfLibReady()) return;
  comb = { items: [] };
  openSheet(renderCombiner);
  if (state.pdf) addCombineSource({ name: state.name, fp: state.fp, pages: state.pages.length, getBytes: async () => state.bytes });
}
function renderCombiner(root){
  const list = el('div', 'combList');
  const name = el('input', 'nameInput'); name.value = `Combinado ${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}`; name.setAttribute('aria-label', 'Nome do novo PDF');
  const fileIn = el('input'); fileIn.type = 'file'; fileIn.accept = 'application/pdf,.pdf'; fileIn.multiple = true; fileIn.hidden = true;
  fileIn.onchange = async () => { for (const f of fileIn.files) await addCombineFile(f); fileIn.value = ''; };
  const go = App.ibtn('merge', 'Combinar', () => buildCombined(name.value), 'primary');
  const bar = el('div', 'sheetBar');
  bar.append(App.ibtn('folder', 'Do computador…', () => fileIn.click(), 'sm outline'), App.ibtn('file', 'Dos documentos recentes…', () => pickRecent(), 'sm outline'),
    el('span', 'barSep'), el('label', 'nameLabel', 'Nome do novo PDF'), name);
  root.append(sheetHeader('Combinar PDFs', el('span', 'sheetSub', 'Junte aulas, provas ou capítulos num PDF só'), [go]), bar, list, fileIn,
    el('p', 'sheetHint', 'Arraste pela alça para mudar a ordem. Em "Páginas", deixe vazio para usar todas ou escreva algo como 1-10, 15. Cada arquivo ganha um marcador no início.'));
  comb.ui = { list, go, root };
  root.ondragover = e => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); };
  root.ondrop = async e => { if (!e.dataTransfer.files.length) return; e.preventDefault(); e.stopPropagation(); for (const f of e.dataTransfer.files) await addCombineFile(f); };
  renderCombList();
}
async function addCombineFile(f){
  if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') { App.toast(`"${f.name}" não é PDF.`); return; }
  const buf = await f.arrayBuffer();
  try {
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
    addCombineSource({ name: f.name, fp: pdf.fingerprints[0], pages: pdf.numPages, getBytes: async () => buf });
    pdf.destroy();
  } catch { App.toast(`Não consegui abrir "${f.name}".`); }
}
function addCombineSource(s){ comb.items.push({ ...s, key: App.uid(), range: '' }); renderCombList(); }
async function pickRecent(){
  const docs = (await safe(() => DB.all('docs'), [])).filter(d => d.hasFile).sort((a, b) => b.ts - a.ts);
  const dlg = $('#picker'); const box = $('#pickerBody'); box.innerHTML = '';
  if (!docs.length) box.append(App.emptyState('file', 'Nenhum documento recente', 'Abra PDFs no leitor para eles aparecerem aqui.'));
  for (const d of docs) {
    const row = el('label', 'pickRow');
    const cb = el('input'); cb.type = 'checkbox'; cb.value = d.fp;
    row.append(cb, el('span', 'pickName', App.baseName(d.name)), el('span', 'muted small', `${d.pages || '?'} p.`));
    box.append(row);
  }
  $('#pickerOk').onclick = () => {
    for (const cb of box.querySelectorAll('input:checked')) {
      const d = docs.find(x => x.fp === cb.value);
      addCombineSource({ name: d.name, fp: d.fp, pages: d.pages, getBytes: async () => (await DB.get('files', d.fp)).data });
    }
    dlg.close();
  };
  dlg.showModal();
}
function renderCombList(){
  if (!comb.ui) return;
  const list = comb.ui.list; list.innerHTML = '';
  comb.ui.go.disabled = comb.items.length < 2;
  if (!comb.items.length) { list.append(App.emptyState('merge', 'Adicione os PDFs que quer juntar', 'Do computador, dos recentes, ou arraste os arquivos para cá.')); return; }
  let total = 0;
  comb.items.forEach((it, i) => {
    const row = el('div', 'combRow'); row.draggable = true; row.dataset.key = it.key;
    const grip = el('span', 'combGrip'); grip.append(App.icon('grip'));
    const range = el('input', 'rangeInput small'); range.placeholder = `todas (${it.pages})`; range.value = it.range; range.setAttribute('aria-label', 'Páginas');
    range.oninput = () => { it.range = range.value; const r = App.parseRange(it.range, it.pages); range.classList.toggle('bad', !r); updateTotal(); };
    const info = el('div', 'combInfo'); info.append(el('div', 'combName', App.baseName(it.name)), el('div', 'muted small', `${it.pages} páginas`));
    const up = App.ibtn('up', null, () => { if (i) { [comb.items[i - 1], comb.items[i]] = [comb.items[i], comb.items[i - 1]]; renderCombList(); } }, 'sm', 'Subir');
    const down = App.ibtn('down', null, () => { if (i < comb.items.length - 1) { [comb.items[i + 1], comb.items[i]] = [comb.items[i], comb.items[i + 1]]; renderCombList(); } }, 'sm', 'Descer');
    const rm = App.ibtn('x', null, () => { comb.items.splice(i, 1); renderCombList(); }, 'sm', 'Tirar da lista');
    row.append(grip, el('span', 'combIdx', i + 1), info, el('span', 'muted small', 'Páginas'), range, up, down, rm);
    row.ondragstart = e => { e.dataTransfer.setData('text/plain', it.key); row.classList.add('dragging'); };
    row.ondragend = () => row.classList.remove('dragging');
    row.ondragover = e => { e.preventDefault(); };
    row.ondrop = e => { e.preventDefault(); const from = comb.items.findIndex(x => x.key === e.dataTransfer.getData('text/plain')); if (from < 0 || from === i) return; const [m] = comb.items.splice(from, 1); comb.items.splice(i, 0, m); renderCombList(); };
    list.append(row);
  });
  const foot = el('div', 'combTotal'); list.append(foot);
  function updateTotal(){ total = comb.items.reduce((s, it) => s + ((App.parseRange(it.range, it.pages) || []).length), 0); foot.textContent = `Total: ${total} páginas`; }
  updateTotal();
}
async function buildCombined(name){
  if (comb.items.length < 2) return;
  const ranges = comb.items.map(it => App.parseRange(it.range, it.pages));
  if (ranges.some(r => !r)) { App.toast('Confira as páginas marcadas em vermelho.'); return; }
  const items = comb.items.slice();
  closeSheet(); App.toast('Juntando os PDFs…'); App.setLoading(0.1);
  try {
    const { PDFDocument } = PDFLib;
    const out = await PDFDocument.create();
    const carry = { highlights: [], bookmarks: [], ocr: {} };
    let offset = 0;
    for (let k = 0; k < items.length; k++) {
      const it = items[k], idx = ranges[k];
      const src = await PDFDocument.load(new Uint8Array((await it.getBytes()).slice(0)), { ignoreEncryption: true });
      (await out.copyPages(src, idx)).forEach(pg => out.addPage(pg));
      const rec = it.fp === state.fp ? state : (await safe(() => DB.get('docs', it.fp), null)) || {};
      const map = new Map(); idx.forEach((s, i) => { if (!map.has(s + 1)) map.set(s + 1, []); map.get(s + 1).push({ page: offset + i + 1, rot: 0 }); });
      const c = carryData(rec, map);
      carry.highlights.push(...c.highlights); carry.bookmarks.push(...c.bookmarks); Object.assign(carry.ocr, c.ocr);
      carry.bookmarks.push({ id: App.uid(), page: offset + 1, title: 'Início: ' + App.baseName(it.name), created: Date.now() });
      offset += idx.length;
      App.setLoading(0.1 + 0.75 * (k + 1) / items.length);
    }
    const bytes = await out.save();
    const fname = (name || 'Combinado').replace(/[\\/:*?"<>|]/g, '-').replace(/\.pdf$/i, '') + '.pdf';
    await App.openGenerated(bytes, fname, carry);
    App.toast(`PDF combinado com ${offset} páginas — está numa aba nova.`);
  } catch (e) { console.error(e); App.setLoading(null); App.toast('Não consegui juntar os PDFs (algum pode ser protegido).'); }
}

// ---------- Criar PDF a partir de fotos ----------
let img = null;
function openImager(){
  if (!pdfLibReady()) return;
  img = { items: [], docMode: App.ls.get('le.imgDocMode', true), a4: App.ls.get('le.imgA4', true), ocr: true };
  openSheet(renderImager);
}
function renderImager(root){
  const fileIn = el('input'); fileIn.type = 'file'; fileIn.accept = 'image/*'; fileIn.multiple = true; fileIn.hidden = true;
  fileIn.onchange = () => { addImages(fileIn.files); fileIn.value = ''; };
  const name = el('input', 'nameInput'); name.value = `Fotos ${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}`; name.setAttribute('aria-label', 'Nome do novo PDF');
  const opt = (label, key, tip) => { const l = el('label', 'optCheck'); l.title = tip || ''; const cb = el('input'); cb.type = 'checkbox'; cb.checked = img[key]; cb.onchange = () => { img[key] = cb.checked; if (key !== 'ocr') App.ls.set(key === 'docMode' ? 'le.imgDocMode' : 'le.imgA4', cb.checked); renderImgList(); }; l.append(cb, label); return l; };
  const go = App.ibtn('check', 'Criar PDF', () => buildFromImages(name.value), 'primary');
  const bar = el('div', 'sheetBar');
  bar.append(App.ibtn('camera', 'Escolher fotos…', () => fileIn.click(), 'sm outline'), el('span', 'barSep'),
    opt('Modo documento (mais contraste)', 'docMode', 'Deixa o papel mais branco e o texto mais escuro — bom para fotos de caderno, lousa e apostila'),
    opt('Folha A4', 'a4', 'Cada foto vira uma folha A4; desmarcado, a página fica do tamanho da foto'),
    opt('Reconhecer texto depois (OCR)', 'ocr', 'Para poder buscar e grifar o texto das fotos'),
    el('span', 'barSep'), el('label', 'nameLabel', 'Nome'), name);
  const list = el('div', 'imgGrid');
  root.append(sheetHeader('Criar PDF de fotos', el('span', 'sheetSub', 'Fotos de lousa, caderno, slides ou apostila viram um PDF para ler e grifar'), [go]), bar, list, fileIn,
    el('p', 'sheetHint', 'Arraste as fotos para mudar a ordem. Fotos do iPhone em HEIC precisam ser convertidas para JPG antes.'));
  img.ui = { list, go };
  root.ondragover = e => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); };
  root.ondrop = e => { if (!e.dataTransfer.files.length) return; e.preventDefault(); e.stopPropagation(); addImages(e.dataTransfer.files); };
  renderImgList();
}
function addImages(files){
  for (const f of files) {
    if (/hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name)) { App.toast(`"${f.name}" é HEIC — converta para JPG primeiro.`); continue; }
    if (!f.type.startsWith('image/')) continue;
    img.items.push({ key: App.uid(), file: f, url: URL.createObjectURL(f), rot: 0 });
  }
  renderImgList();
}
function renderImgList(){
  if (!img.ui) return;
  const list = img.ui.list; list.innerHTML = '';
  img.ui.go.disabled = !img.items.length;
  if (!img.items.length) { list.append(App.emptyState('camera', 'Escolha ou arraste as fotos', 'JPG, PNG ou WEBP. Cada foto vira uma página, na ordem da lista.')); return; }
  img.items.forEach((it, i) => {
    const card = el('div', 'imgItem'); card.draggable = true; card.dataset.key = it.key;
    const fr = el('div', 'imgFrame' + (img.docMode ? ' doc' : ''));
    const im = el('img'); im.src = it.url; im.alt = ''; im.style.transform = `rotate(${it.rot}deg)`; fr.append(im);
    const tools = el('div', 'imgTools');
    tools.append(el('span', 'imgNum', i + 1), App.ibtn('rotl', null, () => { it.rot = (it.rot + 270) % 360; renderImgList(); }, 'sm', 'Girar à esquerda'),
      App.ibtn('rotr', null, () => { it.rot = (it.rot + 90) % 360; renderImgList(); }, 'sm', 'Girar à direita'),
      App.ibtn('trash', null, () => { URL.revokeObjectURL(it.url); img.items.splice(i, 1); renderImgList(); }, 'sm danger', 'Tirar'));
    card.append(fr, tools);
    card.ondragstart = e => { e.dataTransfer.setData('text/plain', it.key); card.classList.add('dragging'); };
    card.ondragend = () => card.classList.remove('dragging');
    card.ondragover = e => e.preventDefault();
    card.ondrop = e => { e.preventDefault(); e.stopPropagation(); const from = img.items.findIndex(x => x.key === e.dataTransfer.getData('text/plain')); if (from < 0 || from === i) return; const [m] = img.items.splice(from, 1); img.items.splice(i, 0, m); renderImgList(); };
    list.append(card);
  });
}
const loadImage = url => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
async function buildFromImages(name){
  const items = img.items.slice(), opts = { docMode: img.docMode, a4: img.a4, ocr: img.ocr };
  if (!items.length) return;
  closeSheet(); App.toast('Montando o PDF das fotos…'); App.setLoading(0.05);
  try {
    const { PDFDocument } = PDFLib;
    const out = await PDFDocument.create();
    for (let k = 0; k < items.length; k++) {
      const it = items[k], im = await loadImage(it.url);
      const k1 = Math.min(1, 2400 / Math.max(im.naturalWidth, im.naturalHeight));
      const w0 = Math.round(im.naturalWidth * k1), h0 = Math.round(im.naturalHeight * k1);
      const side = it.rot % 180 !== 0;
      const c = document.createElement('canvas'); c.width = side ? h0 : w0; c.height = side ? w0 : h0;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      if (opts.docMode) ctx.filter = 'grayscale(1) contrast(1.45) brightness(1.08)';
      ctx.translate(c.width / 2, c.height / 2); ctx.rotate(it.rot * Math.PI / 180); ctx.drawImage(im, -w0 / 2, -h0 / 2, w0, h0);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.86));
      const jpg = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
      c.width = 0;
      let pw, ph;
      if (opts.a4) { const land = jpg.width > jpg.height; pw = land ? 841.89 : 595.28; ph = land ? 595.28 : 841.89; }
      else { const s = 842 / Math.max(jpg.width, jpg.height); pw = jpg.width * s; ph = jpg.height * s; }
      const page = out.addPage([pw, ph]);
      const m = opts.a4 ? 18 : 0, s = Math.min((pw - 2 * m) / jpg.width, (ph - 2 * m) / jpg.height);
      page.drawImage(jpg, { x: (pw - jpg.width * s) / 2, y: (ph - jpg.height * s) / 2, width: jpg.width * s, height: jpg.height * s });
      App.setLoading(0.05 + 0.85 * (k + 1) / items.length);
    }
    const bytes = await out.save();
    items.forEach(it => URL.revokeObjectURL(it.url));
    const fname = (name || 'Fotos').replace(/[\\/:*?"<>|]/g, '-').replace(/\.pdf$/i, '') + '.pdf';
    const ok = await App.openGenerated(bytes, fname, null);
    if (ok) {
      App.ls.set('le.ocrAsked.' + state.fp, true);
      if (opts.ocr) App.runOcr(); else App.toast(`PDF criado com ${items.length} página${items.length === 1 ? '' : 's'}.`);
    }
  } catch (e) { console.error(e); App.setLoading(null); App.toast('Não consegui montar o PDF com essas fotos.'); }
}
})();
