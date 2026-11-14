/* Menu "Arquivo" (canto superior esquerdo): abrir, salvar, salvar como, exportar, imprimir, propriedades,
   recentes. "Salvar" grava os grifos no próprio arquivo (quando ele foi aberto por aqui) — fica legível em
   qualquer leitor de PDF, e os grifos continuam editáveis no Leitor de Estudos. */
(() => {
'use strict';
const App = window.App;
const { $, el, state, DB, safe, ls } = App;

const FSA = 'showOpenFilePicker' in window;
const PDF_TYPES = [{ description: 'Documento PDF', accept: { 'application/pdf': ['.pdf'] } }];

// ---------- Arquivo ligado a cada documento ----------
const handleKey = fp => 'fh:' + fp;
const getHandle = fp => safe(() => DB.get('meta', handleKey(fp)), null).then(r => r && r.handle ? r : null);
const setHandle = (fp, handle) => safe(() => DB.put('meta', { key: handleKey(fp), handle, name: handle.name, at: Date.now() }));
App.fileHandleFor = getHandle;
App.fileOpenHandle = h => openHandle(h);

async function openHandle(h){
  try {
    const f = await h.getFile();
    const ok = await App.loadDoc(await f.arrayBuffer(), f.name);
    if (ok && state.fp) await setHandle(state.fp, h);
    return ok;
  } catch (e) { console.warn(e); App.toast(`Não consegui abrir "${h.name}".`); return false; }
}

// ---------- Abrir ----------
App.fileOpen = async () => {
  if (!FSA) { $('#fileInput').click(); return; }
  let hs;
  try { hs = await showOpenFilePicker({ types: PDF_TYPES, multiple: true, excludeAcceptAllOption: false, id: 'abrir-pdf' }); }
  catch (e) { if (e.name !== 'AbortError') $('#fileInput').click(); return; }
  for (const h of hs) await openHandle(h);
};
// arrastar arquivos para a janela: também guarda o arquivo (o "Salvar" grava nele)
App.openDrop = dt => {
  const items = [...(dt.items || [])].filter(it => it.kind === 'file');
  const files = [...dt.files];
  if (items.length && items[0].getAsFileSystemHandle) {
    const ps = items.map(it => it.getAsFileSystemHandle()); // precisa ser chamado durante o evento
    (async () => {
      const hs = (await Promise.all(ps.map(p => p.catch(() => null)))).filter(h => h && h.kind === 'file' && /\.pdf$/i.test(h.name));
      if (!hs.length) { App.openFiles(files); return; }
      for (const h of hs) await openHandle(h);
    })();
    return;
  }
  App.openFiles(files);
};

// ---------- Salvar / Salvar como ----------
async function writeTo(handle, bytes){
  const w = await handle.createWritable();
  await w.write(bytes); await w.close();
}
async function canWrite(handle){
  try {
    if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
    return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
  } catch { return false; }
}
// depois de gravar: o PDF salvo vira a versão atual (e o arquivo guardado no leitor é atualizado)
async function adopt(bytes, name){
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  state.bytes = buf;
  await safe(() => DB.put('files', { fp: state.fp, data: buf }));
  if (name && name !== state.name) {
    state.name = name; document.title = name + ' — Leitor de Estudos';
    App.renameTab?.(state.fp, name);
    await App.saveDoc();
  }
  setDirty(false);
}
let busy = false;
App.fileSave = async () => {
  if (!state.pdf || busy) return;
  const rec = await getHandle(state.fp);
  if (!rec) return App.fileSaveAs();
  // a permissão é pedida antes de gerar o PDF (o pedido precisa vir logo depois do clique/atalho)
  if (!(await canWrite(rec.handle))) { App.toast('Sem permissão para gravar no arquivo. Use "Salvar como".'); return; }
  busy = true; App.setLoading(0.3);
  try {
    await App.saveDoc();
    const { bytes, count } = await App.buildPdfBytes();
    await writeTo(rec.handle, bytes);
    await adopt(bytes, rec.handle.name);
    App.toast(`Salvo em "${rec.handle.name}" — ${count} marcação(ões)`);
  } catch (e) {
    console.error(e);
    App.toast(e && e.name === 'NoModificationAllowedError' ? 'O arquivo está aberto em outro programa ou é somente leitura. Use "Salvar como".' : 'Não consegui salvar o arquivo. Tente "Salvar como".');
  } finally { busy = false; App.setLoading(null); }
};
App.fileSaveAs = async () => {
  if (!state.pdf || busy) return;
  if (!FSA || !('showSaveFilePicker' in window)) { App.savePdf(); return; }
  let handle;
  try {
    const cur = await getHandle(state.fp);
    handle = await showSaveFilePicker({ suggestedName: state.name.replace(/\.pdf$/i, '') + '.pdf', types: PDF_TYPES, id: 'salvar-pdf', ...(cur ? { startIn: cur.handle } : {}) });
  } catch (e) { if (e.name !== 'AbortError') App.toast('Não consegui abrir a janela de salvar.'); return; }
  busy = true; App.setLoading(0.3);
  try {
    await App.saveDoc();
    const { bytes, count } = await App.buildPdfBytes();
    await writeTo(handle, bytes);
    await setHandle(state.fp, handle);
    await adopt(bytes, handle.name);
    App.toast(`Salvo como "${handle.name}" — ${count} marcação(ões). Ctrl+S grava neste arquivo.`);
  } catch (e) { console.error(e); App.toast('Não consegui salvar o arquivo.'); }
  finally { busy = false; App.setLoading(null); }
};

// alterações desde o último "Salvar" (bolinha na aba e no menu)
let dirty = false;
function setDirty(on){
  dirty = on;
  document.body.classList.toggle('file-dirty', on);
  $('#btnFile')?.classList.toggle('dirty', on);
}
App.on('hl:changed', () => { if (state.pdf) setDirty(true); });
App.on('doc:loaded', () => setDirty(false));
App.on('doc:closed', () => setDirty(false));
App.fileDirty = () => dirty;

// ---------- Compartilhar (celular/tablet) ----------
App.canShareFiles = () => !!(navigator.canShare && navigator.canShare({ files: [new File([new Uint8Array(1)], 'a.pdf', { type: 'application/pdf' })] }));
App.fileShare = async () => {
  if (!state.pdf) return;
  try {
    await App.saveDoc();
    const { bytes } = state.highlights.length ? await App.buildPdfBytes() : { bytes: new Uint8Array(state.bytes) };
    const file = new File([bytes], state.name.replace(/\.pdf$/i, '') + '.pdf', { type: 'application/pdf' });
    await navigator.share({ files: [file], title: App.baseName(state.name) });
    setDirty(false);
  } catch (e) { if (e && e.name !== 'AbortError') { console.warn(e); App.toast('Não consegui compartilhar. Use Arquivo → Salvar como.'); } }
};

// ---------- Imprimir ----------
App.filePrint = async () => {
  if (!state.pdf) return;
  App.toast('Preparando para imprimir…');
  try {
    const { bytes } = state.highlights.length ? await App.buildPdfBytes() : { bytes: new Uint8Array(state.bytes) };
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const fr = el('iframe'); fr.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;border:0;right:0;bottom:0';
    fr.src = url; document.body.append(fr);
    fr.onload = () => {
      setTimeout(() => {
        try { fr.contentWindow.focus(); fr.contentWindow.print(); }
        catch { window.open(url, '_blank'); }
      }, 400);
      setTimeout(() => { fr.remove(); URL.revokeObjectURL(url); }, 120000);
    };
  } catch (e) { console.error(e); App.toast('Não consegui preparar a impressão.'); }
};

// ---------- Propriedades ----------
const fmtBytes = n => n > 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const pdfDate = s => {
  const m = /D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?/.exec(s || '');
  return m ? new Date(+m[1], (+m[2] || 1) - 1, +m[3] || 1, +m[4] || 0, +m[5] || 0).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
};
App.fileProps = async () => {
  if (!state.pdf) return;
  const dlg = App.dialog('propsDlg', 'propsDlg');
  const md = await safe(() => state.pdf.getMetadata(), {});
  const info = (md && md.info) || {};
  const p1 = await state.pdf.getPage(1), vp = p1.getViewport({ scale: 1 });
  const mm = v => Math.round(v * 25.4 / 72);
  const h = await getHandle(state.fp);
  const time = Object.values(state.stats.time || {}).reduce((a, b) => a + b, 0);
  const kinds = k => state.highlights.filter(x => x.kind === k).length;
  const rows = [
    ['Arquivo', state.name],
    ['Salvar grava em', h ? h.name : 'ainda não ligado — o primeiro "Salvar" pergunta onde gravar'],
    ['Tamanho', fmtBytes(state.bytes ? state.bytes.byteLength : 0)],
    ['Páginas', String(state.pdf.numPages)],
    ['Tamanho da página', `${mm(vp.width)} × ${mm(vp.height)} mm`],
    ['Título', info.Title || '—'], ['Autor', info.Author || '—'],
    ['Criado em', pdfDate(info.CreationDate) || '—'], ['Modificado em', pdfDate(info.ModDate) || '—'],
    ['Programa', [info.Creator, info.Producer].filter(Boolean).join(' · ') || '—'],
    ['Versão do PDF', info.PDFFormatVersion || '—'],
    ['Grifos', [App.plural(kinds('text') + kinds('area'), 'grifo', 'grifos'), App.plural(kinds('note'), 'nota', 'notas'), App.plural(kinds('ink'), 'desenho', 'desenhos'), App.plural(state.bookmarks.length, 'marcador', 'marcadores')].join(' · ')],
    ['Tempo de estudo', App.fmtDuration(time)],
    ['Lido', `${Math.min(100, Math.round(100 * state.stats.visited.length / Math.max(1, state.pdf.numPages)))}%`],
  ];
  dlg.innerHTML = '';
  const head = el('div', 'helpHead');
  head.append(el('h2', null, 'Propriedades'), App.ibtn('x', null, () => dlg.close(), 'sm', 'Fechar (Esc)'));
  const dl = el('dl', 'propsList');
  for (const [k, v] of rows) dl.append(el('dt', null, k), el('dd', null, v));
  dlg.append(head, dl);
  if (!dlg.open) dlg.showModal();
};

// ---------- O menu ----------
const btn = $('#btnFile'), menu = $('#fileMenu');
const isMac = /Mac/.test(navigator.platform);
const K = s => isMac ? s.replace('Ctrl', '⌘') : s;
function item(icon, label, shortcut, on, opts = {}){
  const b = el('button', 'fmItem' + (opts.cls ? ' ' + opts.cls : ''));
  b.type = 'button';
  b.append(icon ? App.icon(icon) : el('span', 'fmNoIcon'), el('span', 'fmLabel', label));
  if (opts.sub) b.querySelector('.fmLabel').append(el('small', null, opts.sub));
  if (shortcut) b.append(el('kbd', null, K(shortcut)));
  b.disabled = !!opts.disabled;
  b.onclick = e => { e.stopPropagation(); if (opts.keepOpen) { on(e); return; } closeMenu(); on(); };
  return b;
}
const sep = () => el('div', 'fmSep');
function closeMenu(){ menu.hidden = true; btn.classList.remove('on'); }
async function openMenu(){
  const doc = !!state.pdf;
  menu.innerHTML = '';
  const h = doc ? await getHandle(state.fp) : null;
  menu.append(
    item('folder', 'Abrir…', 'Ctrl+O', App.fileOpen),
    item('restore', 'Reabrir a aba fechada', 'Ctrl+Shift+T', App.reopenClosedTab, { disabled: !ls.get('le.closedTabs', []).length }),
    sep(),
    item('download', 'Salvar', 'Ctrl+S', App.fileSave, { disabled: !doc, sub: doc ? (h ? `grava os grifos em "${h.name}"` : 'escolha onde gravar (1ª vez)') : '' }),
    item(null, 'Salvar como…', 'Ctrl+Shift+S', App.fileSaveAs, { disabled: !doc }),
  );
  if (App.canShareFiles()) menu.append(item('upload', 'Compartilhar PDF com grifos…', '', App.fileShare, { disabled: !doc, sub: 'WhatsApp, Drive, e-mail…' }));
  // Exportar para ▸
  const exp = el('div', 'fmSubWrap');
  const expBtn = item('upload', 'Exportar para', '', () => exp.classList.toggle('open'), { keepOpen: true, cls: 'fmHasSub' });
  expBtn.append(App.icon('right', 'i fmChev'));
  const sub = el('div', 'fileMenu fmSub');
  sub.append(
    item('pdf', 'Cópia do PDF com grifos', '', App.savePdf, { disabled: !doc, sub: 'vai para Downloads' }),
    item('book', 'Caderno de resumo (PDF)', '', () => App.openSummary?.(), { sub: 'grifos de um ou vários PDFs' }),
    item('markdown', 'Resumo em texto (.md)', '', App.exportMd, { sub: 'Obsidian, Notion — um PDF ou uma disciplina' }),
    item('cards', 'Anki', '', () => App.exportAnki(), { disabled: !doc }),
  );
  exp.append(expBtn, sub);
  menu.append(exp, sep(),
    item('x', 'Fechar arquivo', 'Ctrl+W', () => App.closeTab(state.fp), { disabled: !doc }),
    item('list', 'Propriedades…', 'Ctrl+D', App.fileProps, { disabled: !doc }),
    sep(),
    item('pages', 'Imprimir…', 'Ctrl+P', App.filePrint, { disabled: !doc }),
    sep());
  // recentes
  const docs = (await safe(() => DB.all('docs'), [])).filter(d => d.hasFile).sort((a, b) => b.ts - a.ts).slice(0, 8);
  docs.forEach((d, i) => {
    const r = item(null, `${i + 1}  ${d.name}`, '', () => App.switchTab(d.fp, d.name), { cls: 'fmRecent' + (d.fp === state.fp ? ' cur' : '') });
    r.title = d.name + (d.pages ? ` · ${d.pages} páginas` : '');
    menu.append(r);
  });
  menu.append(item(null, 'Exibir todos os arquivos recentes…', '', () => App.closeDoc()), sep(),
    item(null, 'Sair do aplicativo', 'Ctrl+Q', quit));
  menu.hidden = false; btn.classList.add('on');
}
async function quit(){
  await App.saveDoc();
  if (dirty && !confirm('Há grifos que ainda não foram gravados no arquivo do PDF (eles continuam salvos no leitor). Sair mesmo assim?')) return;
  window.close();
  setTimeout(() => App.toast('Feche a janela pelo X (o navegador não deixou fechar por aqui).'), 300);
}
btn.onclick = e => { e.stopPropagation(); if (menu.hidden) openMenu(); else closeMenu(); };
document.addEventListener('mousedown', e => { if (!menu.hidden && !e.target.closest?.('.fileWrap')) closeMenu(); });
document.addEventListener('keydown', e => { if (!menu.hidden && e.key === 'Escape') { e.preventDefault(); closeMenu(); btn.focus(); } }, true);

// ---------- Atalhos ----------
document.addEventListener('keydown', e => {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod || e.altKey) return;
  const k = e.key.toLowerCase();
  const run = fn => { e.preventDefault(); e.stopPropagation(); closeMenu(); fn(); };
  if (k === 's' && e.shiftKey) return run(App.fileSaveAs);
  if (k === 's') return run(App.fileSave);
  if (k === 't' && e.shiftKey) return run(App.reopenClosedTab);
  if (k === 'q') return run(quit);
  if (!state.pdf || App.examViewOpen) return;
  if (k === 'w') return run(() => App.closeTab(state.fp));
  if (k === 'p') return run(App.filePrint);
  if (k === 'd') return run(App.fileProps);
}, true);
})();
