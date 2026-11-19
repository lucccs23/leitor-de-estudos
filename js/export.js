/* Exportações (Markdown, Anki, PDF grifado) e backup (manual e automático numa pasta). */
(() => {
'use strict';
const App = window.App;
const { $, el, btn, state, DB, safe } = App;

// ---------- Menu ----------
const menu = $('#menu');
$('#btnMenu').onclick = e => { e.stopPropagation(); menu.hidden = !menu.hidden; if (!menu.hidden) renderBackupStatus(); };
document.addEventListener('mousedown', e => { if (!menu.hidden && !e.target.closest('.menuWrap')) menu.hidden = true; });
menu.addEventListener('click', e => {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  menu.hidden = true;
  ({ backup: App.exportBackup,
     restore: () => $('#backupInput').click(), look: () => App.openLook?.(), toolbar: () => App.customizeToolbar?.(), install: () => App.installApp?.(), news: () => App.openNews?.(), updates: () => App.checkUpdates?.(true), sync: () => App.openSync?.(), summary: () => App.openSummary?.(), auto: App.setupAutoBackup, help: App.openHelp, localbk: App.backupNow,
     keepimg: () => { const on = !App.ls.get('le.keepImages', true); App.setKeepImages(on); renderKeepImg();
       App.toast(on ? 'Modo escuro: imagens com as cores originais' : 'Modo escuro: imagens invertidas junto com a página'); } })[b.dataset.act]?.();
});
function renderKeepImg(){
  const on = App.ls.get('le.keepImages', true);
  $('#keepImgIcon').setAttribute('href', on ? '#i-check' : '#i-x');
  $('#keepImgLabel').textContent = on ? 'Ligado — radiografias e fotos não ficam invertidas' : 'Desligado — imagens invertem junto com a página';
}
renderKeepImg();
$('#btnExportMd').onclick = () => App.exportMd();
$('#homeBackup').onclick = () => App.backupNow();
$('#homeExport').onclick = () => App.exportBackup();
$('#homeRestore').onclick = () => $('#backupInput').click();
$('#homeAuto').onclick = () => App.setupAutoBackup();
$('#backupInput').onchange = async () => {
  const f = $('#backupInput').files[0]; $('#backupInput').value = '';
  if (f) App.importBackup(f);
};

const docName = () => App.baseName(state.name);
const pageOf = h => App.anchorOf(h).page;

// ---------- Markdown (Obsidian, Notion…) ----------
// por capítulo (sumário do PDF) quando existir; de um PDF, de uma disciplina inteira ou de todos
const oneLine = t => String(t || '').replace(/\s*\n+\s*/g, ' ').trim();
async function chaptersFor(rec){
  if (rec.fp === state.fp) return App.chapters ? App.chapters() : [];
  const f = await safe(() => DB.get('files', rec.fp), null);
  if (!f || !window.pdfjsLib) return [];
  let pdf = null;
  try { pdf = await pdfjsLib.getDocument({ data: new Uint8Array(f.data.slice(0)) }).promise; return await App.chapters(pdf); }
  catch { return []; } finally { pdf && pdf.destroy(); }
}
function mdDoc(rec, chaps, opt, level){
  const H = n => '#'.repeat(level + n) + ' ';
  const hls = App.sortedHighlights((rec.highlights || []).map(App.normHl)).filter(h => !h.q);
  const bms = [...(rec.bookmarks || [])].sort((a, c) => a.page - c.page);
  if (!hls.length && !bms.length) return '';
  let md = '';
  if (bms.length && opt.bookmarks) {
    md += `\n${H(1)}Marcadores\n\n`;
    for (const b of bms) md += `- p. ${b.page}${b.title ? ' — ' + b.title : ''}\n`;
  }
  let lastChap, lastPage = null, drawings = 0;
  const useChaps = opt.chapters && chaps.length > 1;
  for (const h of hls) {
    if (h.kind === 'ink') { drawings++; continue; }
    const pg = App.anchorOf(h).page;
    if (useChaps) {
      const c = App.chapterOf(chaps, pg);
      const key = c ? c.title + c.page : '';
      if (key !== lastChap) { md += `\n${H(1)}${c ? c.title : 'Antes do primeiro capítulo'}\n\n`; lastChap = key; }
    } else if (pg !== lastPage) { md += `\n${H(1)}Página ${pg}\n\n`; lastPage = pg; }
    const ref = useChaps ? ` _(p. ${pg})_` : '';
    if (h.kind === 'note') { if (h.note.trim()) md += `- 📝 **Nota:** ${oneLine(h.note)}${ref}\n`; continue; }
    const body = h.text ? oneLine(h.text) : (h.kind === 'area' ? '_(figura)_' : '');
    md += `- **[${App.labelOf(h.color)}]** ${body}${ref}\n`;
    if (h.img && opt.images) md += `\n  ![figura, p. ${pg}](${h.img})\n\n`;
    if (h.note) md += `  - *Nota:* ${oneLine(h.note)}\n`;
    if (h.link) md += `  - 🔗 ligado a ${h.link.fp === rec.fp ? 'p. ' + h.link.page : `${App.baseName(h.link.name)}, p. ${h.link.page}`}\n`;
  }
  if (drawings) md += `\n_${App.plural(drawings, 'desenho à mão não incluído', 'desenhos à mão não incluídos')} — use "Salvar PDF com grifos" para levá-los._\n`;
  return md;
}
App.buildMarkdown = async (recs, opt, title) => {
  const many = recs.length > 1 || !!opt.perDoc;
  let md = `# ${title}\n\n_Exportado do Vetra em ${new Date().toLocaleString('pt-BR')}_\n`;
  let n = 0;
  for (const rec of recs) {
    const chaps = opt.chapters ? await chaptersFor(rec) : [];
    const part = mdDoc(rec, chaps, opt, many ? 2 : 1);
    if (!part) continue;
    n++;
    md += many ? `\n## ${App.baseName(rec.name)}\n${part}` : part;
  }
  return n ? md : null;
};
App.exportMd = async () => {
  if (state.fp) await App.saveDoc();
  const docs = (await safe(() => DB.all('docs'), [])).filter(d => d.hasFile && ((d.highlights || []).length || (d.bookmarks || []).length));
  const subjects = [...new Set(docs.map(d => d.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const dlg = App.dialog('mdDlg', 'pomoDlg mdDlg'); dlg.setAttribute('aria-label', 'Exportar em Markdown');
  dlg.innerHTML = '';
  const head = el('div', 'helpHead');
  head.append(el('h2', null, 'Resumo em texto (.md)'), App.ibtn('x', null, () => dlg.close(), 'sm', 'Fechar (Esc)'));
  const body = el('div', 'pomoBody');
  body.append(el('p', 'muted small', 'Arquivo de texto com seus grifos e notas, para abrir no Obsidian, Notion, Google Docs ou qualquer editor.'));
  const radio = (val, label, checked, extra) => {
    const w = el('label', 'mdOpt'); const r = el('input'); r.type = 'radio'; r.name = 'mdScope'; r.value = val; r.checked = checked;
    w.append(r, el('span', null, label)); if (extra) w.append(extra); return w;
  };
  const subjSel = el('select', 'planChap mdSubj');
  subjects.forEach(s => subjSel.append(new Option(s, s)));
  const scope = el('div', 'mdScope');
  if (state.fp) scope.append(radio('doc', `Este PDF (${App.baseName(state.name)})`, true));
  if (subjects.length) scope.append(radio('subj', 'Uma disciplina inteira:', !state.fp, subjSel));
  scope.append(radio('all', `Todos os PDFs com grifos (${docs.length})`, !state.fp && !subjects.length));
  subjSel.onchange = () => { scope.querySelector('input[value=subj]').checked = true; };
  const check = (label, on, sub) => { const w = el('label', 'mdOpt'); const c = el('input'); c.type = 'checkbox'; c.checked = on; w.append(c, el('span', null, label)); if (sub) w.append(el('small', 'muted', sub)); return [w, c]; };
  const [cw, chap] = check('Organizar por capítulo', true, 'usa o sumário do PDF; sem sumário, fica por página');
  const [iw, img] = check('Incluir as figuras recortadas', false, 'o arquivo fica maior; o Obsidian mostra as imagens');
  const [bw, bm] = check('Incluir os marcadores', true);
  body.append(scope, cw, iw, bw);
  const foot = el('div', 'lookFoot');
  foot.append(el('span'), App.btn('Exportar', async () => {
    const sc = (scope.querySelector('input[name=mdScope]:checked') || {}).value || 'all';
    let recs, title;
    if (sc === 'doc') { recs = [{ fp: state.fp, name: state.name, highlights: state.highlights, bookmarks: state.bookmarks }]; title = App.baseName(state.name) + ' — grifos'; }
    else if (sc === 'subj') { recs = docs.filter(d => d.subject === subjSel.value); title = subjSel.value; }
    else { recs = docs; title = 'Meus grifos'; }
    recs.sort((a, c) => a.name.localeCompare(c.name, 'pt-BR'));
    const md = await App.buildMarkdown(recs, { chapters: chap.checked, images: img.checked, bookmarks: bm.checked, perDoc: sc !== 'doc' }, title);
    if (!md) { App.toast('Ainda não há grifos para exportar aí.'); return; }
    dlg.close();
    App.download(md, `${title.replace(/[\\/:*?"<>|]/g, '-')}.md`, 'text/markdown');
  }, 'primary'));
  dlg.append(head, body, foot);
  if (!dlg.open) dlg.showModal();
};

// ---------- Anki ----------
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\t/g, ' ').replace(/\r?\n/g, '<br>');
App.exportAnki = list => {
  list = (list || state.highlights).filter(h => h.kind !== 'ink' && h.text);
  if (!list.length) { App.toast('Nenhum grifo com texto para exportar.'); return; }
  const tagDoc = docName().replace(/\s+/g, '_').replace(/[^\w\-À-ÿ]/g, '').slice(0, 40) || 'pdf';
  let out = '#separator:tab\n#html:true\n#tags column:3\n';
  for (const h of App.sortedHighlights(list)) {
    const lab = App.labelOf(h.color);
    const front = (h.note ? esc(h.note) + '<br><br>' : '') + `<small>[${esc(lab)}] ${esc(docName())}, p. ${pageOf(h)}</small>`;
    out += `${front}\t${esc(h.text)}\t${tagDoc} ${lab.replace(/\s+/g, '_')}\n`;
  }
  App.download(out, `${docName()} - anki.txt`, 'text/plain');
  App.toast('No Anki: Arquivo → Importar e escolha este arquivo.');
};

// ---------- PDF com grifos ----------
const rgb = hex => [1, 3, 5].map(i => +(parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(3));
// ---------- PDF com os grifos ----------
// Gera o PDF com os grifos como marcações comuns (aparecem em qualquer leitor), o texto do OCR invisível
// e uma cópia dos dados do leitor dentro do arquivo (assim os grifos voltam se o PDF for aberto em outro PC).
// O identificador do PDF é mantido, então o arquivo salvo continua ligado aos mesmos grifos aqui.
const OWN = 'Vetra';
App.OWN_ANNOT = OWN;
App.buildPdfBytes = async () => {
  const { PDFDocument, PDFHexString, PDFName, PDFString, PDFDict } = PDFLib;
  const doc = await PDFDocument.load(new Uint8Array(state.bytes.slice(0)), { ignoreEncryption: true, updateMetadata: false });
  const pages = doc.getPages();
  // tira as marcações que o próprio leitor gravou antes (salvar de novo não duplica)
  for (const page of pages) {
    const annots = page.node.Annots(); if (!annots) continue;
    for (let i = annots.size() - 1; i >= 0; i--) {
      const a = annots.lookupMaybe ? annots.lookupMaybe(i, PDFDict) : annots.lookup(i);
      const t = a && a.lookup && a.lookup(PDFName.of('T'));
      if (t && t.decodeText && App.isOwnAuthor(t.decodeText())) annots.remove(i);
    }
  }
  const vps = new Map();
  let count = 0;
  for (const h of state.highlights) for (const part of h.parts) {
    const page = pages[part.page - 1]; if (!page) continue;
    let vp = vps.get(part.page);
    if (!vp) { vp = (await state.pdf.getPage(part.page)).getViewport({ scale: 1 }); vps.set(part.page, vp); }
    const P = (x, y) => vp.convertToPdfPoint(x * vp.width, y * vp.height);
    const col = App.colorOf(h.color);
    const dict = {
      Type: 'Annot', F: 4,
      C: rgb((h.kind === 'ink' && !h.marker) || (h.kind === 'text' && h.style !== 'fill') ? col.ink : col.hex),
      T: PDFHexString.fromText(OWN),
      NM: PDFHexString.fromText(h.id + '-' + part.page),
    };
    if (h.note) dict.Contents = PDFHexString.fromText(h.note);
    const xs = [], ys = [];
    if (h.kind === 'note') {
      if (!h.note.trim()) continue;
      const r = part.rects[0], [px, py] = P(r.x, r.y);
      dict.Subtype = 'Text'; dict.Name = 'Comment'; dict.Open = false; dict.C = rgb(col.hex);
      dict.Rect = [px, py - 20, px + 20, py];
      page.node.addAnnot(doc.context.register(doc.context.obj(dict)));
      count++; continue;
    }
    if (h.kind === 'ink') {
      dict.Subtype = 'Ink';
      dict.InkList = part.paths.map(pts => pts.flatMap(([x, y]) => { const [px, py] = P(x, y); xs.push(px); ys.push(py); return [px, py]; }));
      const bw = +((h.width || 2.4) * 0.75).toFixed(2);
      dict.BS = h.line === 'dash' ? { W: bw, S: 'D', D: [+(bw * 2.6).toFixed(2), +(bw * 2.4).toFixed(2)] } : h.line === 'dot' ? { W: bw, S: 'D', D: [bw, +(bw * 2.2).toFixed(2)] } : { W: bw, S: 'S' };
      if (h.marker) dict.CA = h.opacity ? h.opacity / 100 : 0.4;
      else if (h.tip === 'pencil') dict.CA = 0.72;
    } else {
      const q = [];
      for (const r of part.rects) {
        const corners = [P(r.x, r.y), P(r.x + r.w, r.y), P(r.x, r.y + r.h), P(r.x + r.w, r.y + r.h)];
        for (const c of corners) { q.push(c[0], c[1]); xs.push(c[0]); ys.push(c[1]); }
      }
      dict.Subtype = h.kind === 'area' || h.style === 'fill' ? 'Highlight' : h.style === 'underline' ? 'Underline' : 'StrikeOut';
      dict.QuadPoints = q;
    }
    if (!xs.length) continue;
    const pad = 2;
    dict.Rect = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
    page.node.addAnnot(doc.context.register(doc.context.obj(dict)));
    count++;
  }
  // páginas escaneadas com OCR: texto invisível por cima, para o PDF ficar pesquisável em qualquer leitor
  let ocrPages = 0;
  const info = doc.getInfoDict();
  const doneRaw = info.lookup(PDFName.of('LeitorOCR'));
  const done = new Set(String(doneRaw && doneRaw.decodeText ? doneRaw.decodeText() : '').split(',').filter(Boolean).map(Number));
  const ocrNums = Object.keys(state.ocr || {}).map(Number).filter(n => pages[n - 1] && !done.has(n));
  if (ocrNums.length) {
    const { StandardFonts } = PDFLib;
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const safeText = t => { try { font.encodeText(t); return t; } catch { return [...t].map(c => { try { font.encodeText(c); return c; } catch { return '?'; } }).join(''); } };
    for (const n of ocrNums) {
      const page = pages[n - 1];
      if (page.getRotation().angle % 360) continue;
      let vp = vps.get(n); if (!vp) { vp = (await state.pdf.getPage(n)).getViewport({ scale: 1 }); vps.set(n, vp); }
      for (const [t, x, y, w, h] of state.ocr[n]) {
        const [px, py] = vp.convertToPdfPoint(x * vp.width, (y + h * 0.82) * vp.height);
        const size = Math.max(2, h * vp.height * 0.9), txt = safeText(t);
        const nat = font.widthOfTextAtSize(txt, size) || 1;
        page.drawText(txt, { x: px, y: py, size: size * Math.min(1, (w * vp.width) / nat), font, opacity: 0 });
      }
      ocrPages++;
    }
  }
  const ocrAll = [...done, ...ocrNums.filter(n => !(pages[n - 1].getRotation().angle % 360))];
  if (ocrAll.length) info.set(PDFName.of('LeitorOCR'), PDFString.of(ocrAll.join(',')));
  // dados do leitor (sem as imagens das áreas, para o arquivo não crescer)
  const data = { v: 1, app: 'leitor-de-estudos', highlights: state.highlights.map(({ img, srs, ...h }) => h), bookmarks: state.bookmarks };
  info.set(PDFName.of('LeitorDeEstudos'), PDFHexString.fromText(JSON.stringify(data)));
  if (!doc.context.trailerInfo.ID && /^[0-9a-f]{32}$/i.test(state.fp || '')) {
    doc.context.trailerInfo.ID = doc.context.obj([PDFHexString.of(state.fp), PDFHexString.of(state.fp)]);
  }
  const bytes = await doc.save();
  return { bytes, count, ocrPages };
};

// Exportar uma cópia (vai para Downloads)
App.savePdf = async () => {
  if (!state.pdf) return;
  if (!window.PDFLib) { App.toast('Biblioteca pdf-lib não encontrada na pasta lib.'); return; }
  if (!state.highlights.length && !Object.keys(state.ocr || {}).length) { App.toast('Ainda não há grifos para salvar no PDF.'); return; }
  App.toast('Gerando o PDF…');
  try {
    const { bytes, count, ocrPages } = await App.buildPdfBytes();
    App.download(bytes, `${docName()} (grifado).pdf`, 'application/pdf');
    App.toast(`PDF salvo com ${count} marcação(ões)${ocrPages ? ` e texto pesquisável em ${ocrPages} página(s)` : ''} — veja na pasta Downloads.`);
  } catch (e) {
    console.error(e);
    App.toast('Não consegui gerar o PDF grifado (o arquivo pode ser protegido).');
  }
};

// ---------- Backup ----------
async function buildBackup(){
  await App.saveDoc();
  const docs = await safe(() => DB.all('docs'), []);
  return {
    app: 'leitor-de-estudos', version: 1, exported: new Date().toISOString(), labels: { ...App.labels }, subjects: App.subjects ? App.subjects() : [],
    docs: docs.map(({ hasFile, ...d }) => d),
  };
}
App.exportBackup = async () => {
  const data = await buildBackup();
  App.download(JSON.stringify(data), `leitor-backup-${App.dayKey()}.json`, 'application/json');
  App.toast(`Backup de ${data.docs.length} documento(s) salvo na pasta Downloads.`);
};

function mergeById(a = [], b = []){
  const map = new Map(a.map(x => [x.id, x]));
  for (const x of b) if (x && x.id && !map.has(x.id)) map.set(x.id, x);
  return [...map.values()];
}
App.importBackup = async file => {
  let data;
  try { data = JSON.parse(await file.text()); } catch { App.toast('Esse arquivo não é um backup válido.'); return; }
  if (!data || data.app !== 'leitor-de-estudos' || !Array.isArray(data.docs)) { App.toast('Esse arquivo não é um backup do Vetra.'); return; }
  await App.saveDoc();
  let nDocs = 0, nHl = 0;
  for (const d of data.docs) {
    if (!d || !d.fp) continue;
    let before = 0;
    const merged = await safe(() => DB.update('docs', d.fp, cur => {
      const m = cur ? { ...cur } : { ...d, hasFile: false };
      before = (cur?.highlights || []).length;
      m.highlights = mergeById(cur?.highlights, d.highlights);
      m.bookmarks = mergeById(cur?.bookmarks, d.bookmarks);
      m.time = { ...(d.time || {}) };
      for (const [k, v] of Object.entries(cur?.time || {})) m.time[k] = Math.max(v, m.time[k] || 0);
      m.visited = [...new Set([...(cur?.visited || []), ...(d.visited || [])])];
      m.ocr = { ...(d.ocr || {}), ...(cur?.ocr || {}) };
      m.exams = mergeById(cur?.exams, d.exams);
      m.subject = cur?.subject || d.subject || '';
      m.focus = cur?.focus || d.focus;
      m.name = cur?.name || d.name; m.pages = cur?.pages || d.pages;
      m.lastPage = cur?.lastPage || d.lastPage; m.ts = cur?.ts || d.ts || Date.now();
      return m;
    }), null);
    if (!merged) continue;
    nDocs++; nHl += merged.highlights.length - before;
  }
  for (const [k, v] of Object.entries(data.labels || {})) if (v && !App.labels[k]) App.labels[k] = v;
  App.mergeSubjects?.(data.subjects);
  App.saveLabels(); App.refreshLegendInputs(); App.buildPalette();
  if (state.fp) {
    const rec = await safe(() => DB.get('docs', state.fp), null);
    if (rec) {
      state.highlights = (rec.highlights || []).map(App.normHl);
      state.bookmarks = rec.bookmarks || [];
      state.stats = { time: rec.time || {}, visited: rec.visited || [] };
      state.ocr = rec.ocr || {}; state.exams = rec.exams || [];
      for (const n of Object.keys(state.ocr)) App.ocrUpdated(+n);
      App.emit('exams:reload');
      App.renderAllAnnots(); App.renderPanel(); App.emit('bookmarks:reload'); App.emit('hl:changed'); App.renderStats?.();
    }
  } else App.renderHome?.();
  App.toast(`Backup restaurado: ${nDocs} documento(s), ${nHl} grifo(s) novo(s).`);
};

// ---------- Backup automático numa pasta (ex.: OneDrive) ----------
let dirHandle = null, needsPermission = false, lastWrite = 0, writeT = null;
const canPickDir = () => typeof window.showDirectoryPicker === 'function';

App.setupAutoBackup = async () => {
  if (!canPickDir()) { App.toast('Este navegador não permite backup automático numa pasta. Use "Fazer backup de tudo".'); return; }
  if (dirHandle && needsPermission) { await regrant(); return; }
  let h;
  try { h = await window.showDirectoryPicker({ id: 'leitor-backup', mode: 'readwrite' }); } catch { return; }
  dirHandle = h; needsPermission = false;
  await safe(() => DB.put('meta', { key: 'backupDir', handle: h }));
  await writeAutoBackup(true);
  App.toast(`Backup automático ligado na pasta "${h.name}". Dica: escolha uma pasta do OneDrive para ter cópia na nuvem.`);
  renderBackupStatus();
};
async function regrant(){
  try {
    const p = await dirHandle.requestPermission({ mode: 'readwrite' });
    needsPermission = p !== 'granted';
    if (!needsPermission) { await writeAutoBackup(true); App.toast('Backup automático reativado.'); }
  } catch { needsPermission = true; }
  renderBackupStatus();
}
async function writeAutoBackup(force){
  if (!dirHandle || needsPermission) return;
  const now = Date.now();
  if (!force && now - lastWrite < 60000) { // no máximo 1 gravação por minuto
    clearTimeout(writeT); writeT = setTimeout(() => writeAutoBackup(true), 60000 - (now - lastWrite)); return;
  }
  lastWrite = now;
  try {
    const json = JSON.stringify(await buildBackup());
    const write = async (dir, name) => { const fh = await dir.getFileHandle(name, { create: true }); const w = await fh.createWritable(); await w.write(json); await w.close(); };
    await write(dirHandle, 'leitor-backup.json');
    const hist = await dirHandle.getDirectoryHandle('historico', { create: true });
    await write(hist, `leitor-backup-${App.dayKey()}.json`);
    App.ls.set('le.lastAutoBackup', now);
  } catch (e) {
    console.warn('backup automático falhou', e);
    if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) { needsPermission = true; renderBackupStatus(); }
  }
}
let docSavedT;
App.on('doc:saved', () => { if (!dirHandle || needsPermission) return; clearTimeout(docSavedT); docSavedT = setTimeout(() => writeAutoBackup(false), 5000); });
addEventListener('visibilitychange', () => { if (document.hidden && dirHandle && !needsPermission) writeAutoBackup(true); });

// ---------- Backup automático local (serviço do Windows instalado pelo "Instalar atalho") ----------
// O serviço grava em Documentos\Leitor de Estudos\Backups: um arquivo por dia (últimos 30) + ultimo-backup.json.
const localBase = () => 'http://127.0.0.1:' + (App.ls.get('le.svcPort', 47613) || 47613);
let local = { ok: false, checked: false, pasta: '', ultimo: null }, lastLocal = 0, localT = null;
const startedAt = Date.now();
const localToken = () => App.ls.get('le.bkToken', null);
async function localFetch(path, opts){
  const t = localToken(); if (!t) throw new Error('sem senha');
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(`${localBase()}${path}?t=${t}`, { cache: 'no-store', signal: ctrl.signal, ...opts });
    const j = await r.json(); if (!r.ok || !j.ok) throw new Error(j.erro || r.status);
    return j;
  } finally { clearTimeout(to); }
}
// usado por outras partes (OCR): o serviço local está disponível?
App.localService = {
  ok: () => local.ok,
  check: () => checkLocal(),
  post: (path, body, timeout = 60000) => {
    const t = localToken(); if (!t) return Promise.reject(new Error('sem senha'));
    const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), timeout);
    return fetch(`${localBase()}${path}?t=${t}`, { method: 'POST', body, cache: 'no-store', signal: ctrl.signal })
      .then(async r => { const j = await r.json(); if (!r.ok || !j.ok) throw new Error(j.erro || r.status); return j; })
      .finally(() => clearTimeout(to));
  },
};
// links externos (IA, GitHub): no app do computador, abrem no Chrome (ou no navegador padrão) pelo serviço local
App.openExternal = async url => {
  if (!App.isWeb && (local.ok || await checkLocal())) {
    try { await App.localService.post('/abrir', url, 8000); return true; } catch (e) { console.warn('abrir no navegador padrão', e); }
  }
  window.open(url, '_blank', 'noopener');
  return true;
};
async function checkLocal(){
  if (App.isWeb) { local = { ok: false, checked: true }; renderBackupStatus(); return false; }
  try { const j = await localFetch('/status'); local = { ok: true, checked: true, pasta: j.pasta, ultimo: j.ultimo, arquivos: j.arquivos }; }
  catch { local = { ...local, ok: false, checked: true }; }
  renderBackupStatus();
  return local.ok;
}
// força = ignora o intervalo mínimo (ao abrir o app, ao fechar, ao pedir manualmente)
async function writeLocal(force){
  if (!local.ok) return false;
  const now = Date.now();
  if (!force && now - lastLocal < 120000) { // no máximo 1 cópia a cada 2 min enquanto você estuda
    clearTimeout(localT); localT = setTimeout(() => writeLocal(true), 120000 - (now - lastLocal)); return false;
  }
  clearTimeout(localT); lastLocal = now;
  try {
    const json = JSON.stringify(await buildBackup());
    const j = await localFetch('/backup', { method: 'POST', body: json, keepalive: json.length < 60000 });
    local = { ok: true, checked: true, pasta: j.pasta, ultimo: j.ultimo, arquivos: j.arquivos };
    renderBackupStatus(); return true;
  } catch (e) {
    console.warn('backup local falhou', e);
    await checkLocal(); return false;
  }
}
App.backupNow = async () => {
  if (!local.ok && !(await checkLocal())) { App.toast('O serviço de backup não está rodando. Abra o Vetra pelo atalho "Vetra".'); return; }
  if (await writeLocal(true)) App.toast('Backup feito em ' + local.pasta);
};
let localSavedT;
App.on('doc:saved', () => { if (!local.ok) return; clearTimeout(localSavedT); localSavedT = setTimeout(() => writeLocal(false), 5000); });
addEventListener('visibilitychange', () => { if (document.hidden) writeLocal(true); });
const fmtWhen = iso => {
  if (!iso) return '';
  const d = new Date(iso), today = App.dayKey() === App.dayKey(d);
  return today ? 'hoje às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};
const shortPath = p => (p || '').replace(/^.*\\(Documents|Documentos)\\/i, 'Documentos\\');

function renderBackupStatus(){
  // backup local
  const ll = $('#localBackupLabel'), hint = $('#backupHint'), dot = $('#backupDot');
  if (App.isWeb) {
    ll.textContent = 'Só no computador';
    hint.textContent = 'Neste aparelho tudo fica salvo no próprio app. Para garantir, exporte um backup de vez em quando (ou salve os PDFs com os grifos).';
    dot.className = 'statusDot'; dot.title = '';
    $('#autoBackupLabel').textContent = 'Não disponível neste aparelho'; $('#backupBanner').hidden = true;
    return;
  }
  if (local.ok) {
    ll.textContent = `Ligado — ${shortPath(local.pasta)}${local.ultimo ? ' · último ' + fmtWhen(local.ultimo) : ''}`;
    hint.textContent = `Automático e ligado. ${local.ultimo ? 'Última cópia ' + fmtWhen(local.ultimo) + '. ' : ''}Os últimos 30 dias ficam em ${shortPath(local.pasta)}.`;
    dot.className = 'statusDot ok'; dot.title = 'Backup automático ligado';
  } else if (local.checked && Date.now() - startedAt < 15000) {
    // o serviço leva alguns segundos para ligar depois que o app abre
    ll.textContent = 'Ligando…';
    hint.textContent = 'Ligando o backup automático…';
    dot.className = 'statusDot'; dot.title = 'Ligando o backup automático';
  } else if (local.checked) {
    const app = !!window.vetraDesktop;
    ll.textContent = app ? 'Parado — feche e abra o Vetra' : 'Parado — abra o leitor pelo atalho para ativar';
    hint.textContent = app ? 'O backup automático não respondeu. Feche e abra o Vetra; se continuar, instale de novo pelo instalador (seus dados ficam).'
      : 'O backup automático está parado. Abra pelo atalho "Vetra (testes)" (ou rode "Instalar atalho" de novo) para ativá-lo.';
    dot.className = 'statusDot off'; dot.title = 'Backup automático parado';
  }
  // cópia extra numa pasta escolhida (ex.: OneDrive)
  const label = $('#autoBackupLabel'), banner = $('#backupBanner');
  if (!canPickDir()) { label.textContent = 'Não disponível neste navegador'; banner.hidden = true; return; }
  if (!dirHandle) { label.textContent = 'Opcional — escolha uma pasta do OneDrive para ter cópia na nuvem'; banner.hidden = true; return; }
  if (needsPermission) {
    label.textContent = `Pasta "${dirHandle.name}" — clique para reativar`;
    banner.hidden = false; banner.innerHTML = '';
    banner.append(el('span', null, `O backup automático na pasta "${dirHandle.name}" precisa da sua permissão de novo.`), btn('Reativar', regrant, 'primary sm'));
    return;
  }
  const last = App.ls.get('le.lastAutoBackup', 0);
  label.textContent = `Ligado — pasta "${dirHandle.name}"${last ? ' · último: ' + new Date(last).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : ''}`;
  banner.hidden = true;
}
App.renderBackupStatus = renderBackupStatus;

App.initBackup = async () => {
  // backup local: confere o serviço e faz uma cópia logo ao abrir
  // o serviço pode estar ligando junto com o app: tenta de novo algumas vezes nos primeiros segundos
  const tentar = async () => { const ok = await checkLocal(); if (ok) writeLocal(true); return ok; };
  tentar().then(ok => { if (ok) return; [1500, 3500, 7000, 12000, 16000].forEach(ms => setTimeout(() => { if (!local.ok) tentar(); else renderBackupStatus(); }, ms)); });
  setInterval(() => { if (!local.ok) checkLocal(); }, 60000); // se o serviço subir depois, detecta sozinho
  const rec = await safe(() => DB.get('meta', 'backupDir'), null);
  if (rec && rec.handle) {
    dirHandle = rec.handle;
    try { needsPermission = (await dirHandle.queryPermission({ mode: 'readwrite' })) !== 'granted'; } catch { needsPermission = true; }
    if (!needsPermission) writeAutoBackup(true);
  }
  renderBackupStatus();
};
})();
