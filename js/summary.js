/* Caderno de resumo: junta os grifos e notas de um ou vários PDFs num PDF organizado, bom para revisar na véspera. */
(() => {
'use strict';
const App = window.App;
const { $, el, state, DB, safe } = App;

let opt = { order: App.ls.get('le.sumOrder', 'page'), notes: true, images: true, colors: new Set(App.COLORS.map(c => c.id)) };
let docs = [], chosen = new Set();

const usable = h => !h.q && h.kind !== 'ink' && (h.text || h.img || h.note);

App.openSummary = async () => {
  if (!window.PDFLib) { App.toast('Biblioteca pdf-lib não encontrada na pasta lib.'); return; }
  await App.saveDoc();
  const all = await safe(() => DB.all('docs'), []);
  docs = all.filter(d => (d.highlights || []).some(usable)).sort((a, b) => (b.fp === state.fp) - (a.fp === state.fp) || b.ts - a.ts);
  chosen = new Set(state.fp && docs.some(d => d.fp === state.fp) ? [state.fp] : docs.slice(0, 1).map(d => d.fp));
  App.openSheet(build);
};

function build(root){
  const go = App.ibtn('download', 'Salvar PDF', () => generate(false), 'primary');
  const open = App.ibtn('book', 'Abrir no leitor', () => generate(true), 'outline');
  root.append(App.sheetHeader('Caderno de resumo', el('span', 'sheetSub', 'Seus grifos e notas organizados num PDF para revisar'), [open, go]));
  const body = el('div', 'sumBody');
  root.append(body);
  const ui = { go, open };
  const refresh = () => { renderBody(body, ui); };
  refresh();
}

function renderBody(body, ui){
  body.innerHTML = '';
  if (!docs.length) {
    body.append(App.emptyState('highlighter', 'Ainda não há grifos', 'Grife trechos dos seus PDFs: eles aparecem aqui para virar um caderno de resumo.'));
    ui.go.disabled = ui.open.disabled = true; return;
  }
  const left = el('div', 'sumCol');
  left.append(el('div', 'rvLabel', 'Documentos'));
  const list = el('div', 'sumDocs');
  for (const d of docs) {
    const n = (d.highlights || []).filter(usable).length;
    const row = el('label', 'pickRow');
    const cb = el('input'); cb.type = 'checkbox'; cb.checked = chosen.has(d.fp);
    cb.onchange = () => { cb.checked ? chosen.add(d.fp) : chosen.delete(d.fp); renderBody(body, ui); };
    row.append(cb, el('span', 'pickName', App.baseName(d.name)));
    if (d.subject) { const s = el('span', 'subjTag set static'); s.style.setProperty('--sc', App.subjectHex(d.subject)); s.append(el('span', 'subjDot'), d.subject); row.append(s); }
    row.append(el('span', 'muted small', `${n} ${n === 1 ? 'item' : 'itens'}`));
    list.append(row);
  }
  left.append(list);
  if (App.subjects().length) {
    const bySubj = el('div', 'sumQuick');
    bySubj.append(el('span', 'muted small', 'Marcar por disciplina:'));
    for (const s of App.subjects()) {
      const b = App.btn(s.name, () => { chosen = new Set(docs.filter(d => d.subject === s.name).map(d => d.fp)); renderBody(body, ui); }, 'sm outline');
      bySubj.append(b);
    }
    left.append(bySubj);
  }

  const right = el('div', 'sumCol');
  const sel = docs.filter(d => chosen.has(d.fp));
  right.append(el('div', 'rvLabel', 'Cores'));
  const chips = el('div', 'rvChips');
  for (const c of App.COLORS) {
    const n = sel.reduce((s, d) => s + (d.highlights || []).filter(h => usable(h) && h.color === c.id).length, 0);
    if (!n) continue;
    const b = el('button', 'rvChip' + (opt.colors.has(c.id) ? ' on' : ''), `${App.labelOf(c.id)} (${n})`);
    b.style.setProperty('--c', c.hex);
    b.onclick = () => { opt.colors.has(c.id) ? opt.colors.delete(c.id) : opt.colors.add(c.id); renderBody(body, ui); };
    chips.append(b);
  }
  right.append(chips);
  right.append(el('div', 'rvLabel', 'Organizar'));
  const ord = el('div', 'rvOpts');
  const radio = (label, v) => { const b = el('button', 'rvRadio' + (opt.order === v ? ' on' : ''), label); b.onclick = () => { opt.order = v; App.ls.set('le.sumOrder', v); renderBody(body, ui); }; return b; };
  ord.append(radio('Na ordem das páginas', 'page'), radio('Por cor (etiqueta)', 'color'));
  right.append(ord);
  right.append(el('div', 'rvLabel', 'Incluir'));
  const inc = el('div', 'rvOpts');
  const check = (label, key) => { const l = el('label', 'rvCheck'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = opt[key]; cb.onchange = () => { opt[key] = cb.checked; renderBody(body, ui); }; l.append(cb, label); return l; };
  inc.append(check('Notas escritas nos grifos e post-its', 'notes'), check('Figuras marcadas com a ferramenta Área', 'images'));
  right.append(inc);

  const items = collect();
  const total = items.reduce((s, g) => s + g.items.length, 0);
  right.append(el('p', 'muted small sumCount', total ? `${total} ${total === 1 ? 'item' : 'itens'} de ${items.length} PDF${items.length === 1 ? '' : 's'} ${total === 1 ? 'vai' : 'vão'} para o caderno.` : 'Nada selecionado.'));
  ui.go.disabled = ui.open.disabled = !total;
  body.append(left, right);
}

// grupos por documento, já filtrados e ordenados
function collect(){
  const out = [];
  for (const d of docs.filter(x => chosen.has(x.fp))) {
    let items = (d.highlights || []).map(App.normHl).filter(h => usable(h) && opt.colors.has(h.color))
      .filter(h => h.kind !== 'note' || opt.notes)
      .filter(h => h.text || (opt.images && h.img) || (opt.notes && h.note));
    items = App.sortedHighlights(items);
    if (opt.order === 'color') items.sort((a, b) => App.COLORS.findIndex(c => c.id === a.color) - App.COLORS.findIndex(c => c.id === b.color));
    if (items.length) out.push({ doc: d, items });
  }
  return out;
}

// ---------- Geração do PDF ----------
const hexRgb = hex => { const n = parseInt(hex.slice(1), 16); return PDFLib.rgb((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255); };
// a fonte padrão do PDF só tem o alfabeto latino: letras gregas e símbolos comuns viram texto equivalente
const SUBS = { 'α':'alfa', 'β':'beta', 'γ':'gama', 'δ':'delta', 'Δ':'Delta', 'ε':'épsilon', 'κ':'kappa', 'λ':'lambda', 'μ':'µ', 'π':'pi', 'σ':'sigma', 'τ':'tau', 'ω':'ômega', 'Ω':'Ômega',
  '≥':'>=', '≤':'<=', '≠':'!=', '→':'->', '←':'<-', '↑':'(aumenta)', '↓':'(diminui)', '⇒':'=>', '≈':'~', '∼':'~', '×':'x', '−':'-', '‐':'-', '‑':'-', '﻿':'', '­':'', '​':'' };
function cleaner(font){
  const ok = new Map();
  return s => {
    let o = '';
    for (const ch of (s || '').normalize('NFC')) {
      const c = SUBS[ch] != null ? SUBS[ch] : ch;
      for (const x of c) {
        if (!ok.has(x)) { try { font.widthOfTextAtSize(x, 10); ok.set(x, true); } catch { ok.set(x, false); } }
        o += ok.get(x) ? x : '?';
      }
    }
    return o;
  };
}
function wrap(text, font, size, width){
  const lines = [];
  for (const para of text.split(/\n+/)) {
    let line = '';
    for (let w of para.split(/\s+/).filter(Boolean)) {
      // palavra maior que a linha: quebra no meio
      while (font.widthOfTextAtSize(w, size) > width) {
        let k = w.length - 1; while (k > 1 && font.widthOfTextAtSize(w.slice(0, k), size) > width) k--;
        if (line) { lines.push(line); line = ''; }
        lines.push(w.slice(0, k)); w = w.slice(k);
      }
      const t = line ? line + ' ' + w : w;
      if (font.widthOfTextAtSize(t, size) > width && line) { lines.push(line); line = w; } else line = t;
    }
    if (line) lines.push(line);
  }
  return lines;
}

async function generate(openIt){
  const groups = collect();
  if (!groups.length) return;
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const pdf = await PDFDocument.create();
  const F = await pdf.embedFont(StandardFonts.Helvetica), FB = await pdf.embedFont(StandardFonts.HelveticaBold), FI = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const clean = cleaner(F);
  const W = 595.28, H = 841.89, M = 54, CW = W - 2 * M;
  const ink = rgb(0.12, 0.12, 0.11), muted = rgb(0.47, 0.45, 0.42), rule = rgb(0.85, 0.83, 0.79), accent = rgb(0.35, 0.34, 0.84);
  let page, y;
  const newPage = () => { page = pdf.addPage([W, H]); y = H - M; };
  const ensure = h => { if (y - h < M + 14) { newPage(); return true; } return false; };
  const text = (t, x, size, font, color) => page.drawText(t, { x, y, size, font, color });

  newPage();
  const total = groups.reduce((s, g) => s + g.items.length, 0);
  const date = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  y -= 8; text('Caderno de resumo', M, 24, FB, ink); y -= 20;
  text(clean(`${groups.length === 1 ? App.baseName(groups[0].doc.name) : groups.length + ' documentos'} · ${total} itens · ${date}`), M, 10.5, F, muted); y -= 14;
  page.drawRectangle({ x: M, y, width: CW, height: 2, color: accent }); y -= 22;

  const outline = [];
  for (const g of groups) {
    if (groups.length > 1) {
      ensure(60);
      if (y < H - M - 60) y -= 10;
      outline.push({ title: App.baseName(g.doc.name), page: pdf.getPageCount() });
      for (const ln of wrap(clean(App.baseName(g.doc.name)), FB, 15, CW)) { ensure(20); text(ln, M, 15, FB, ink); y -= 19; }
      const meta = [g.doc.subject, `${g.items.length} itens`].filter(Boolean).join(' · ');
      text(clean(meta), M, 9.5, F, muted); y -= 8;
      page.drawRectangle({ x: M, y, width: CW, height: 0.8, color: rule }); y -= 18;
    }
    let lastColor = null;
    for (const h of g.items) {
      const col = App.colorOf(h.color);
      if (opt.order === 'color' && h.color !== lastColor) {
        lastColor = h.color;
        ensure(40); y -= 4;
        page.drawRectangle({ x: M, y: y - 1, width: 9, height: 9, color: hexRgb(col.hex), borderColor: hexRgb(col.ink), borderWidth: 0.6 });
        text(clean(App.labelOf(h.color)), M + 15, 11.5, FB, ink); y -= 18;
      }
      await drawItem(h, col);
    }
  }

  async function drawItem(h, col){
    const pg = App.anchorOf(h).page;
    const X = M + 46, TW = CW - 46;
    const blocks = [];
    if (h.img && opt.images && h.kind === 'area') blocks.push({ img: h.img });
    else if (h.text && h.kind !== 'note') blocks.push({ lines: wrap(clean(h.text), F, 10.5, TW), font: F, size: 10.5, lead: 14.2, color: ink });
    if (h.note && opt.notes) blocks.push({ lines: wrap(clean((h.kind === 'note' ? 'Post-it: ' : 'Nota: ') + h.note), FI, 10, TW), font: FI, size: 10, lead: 13.5, color: rgb(0.3, 0.29, 0.27) });
    if (!blocks.length) return;
    ensure(30);
    let segTop = y + 10, first = true;
    const bar = () => page.drawRectangle({ x: X - 10, y: y + 6, width: 3, height: Math.max(4, segTop - y - 6), color: hexRgb(col.hex) });
    const label = () => text(`p. ${pg}`, M, 9, FB, muted);
    label();
    for (const b of blocks) {
      if (b.img) {
        let im;
        try { im = b.img.startsWith('data:image/png') ? await pdf.embedPng(b.img) : await pdf.embedJpg(b.img); } catch { continue; }
        const k = Math.min(1, TW / im.width, 300 / im.height, 0.75);
        const w = im.width * k, hh = im.height * k;
        if (y - hh < M + 14) { if (!first) bar(); newPage(); segTop = y + 10; label(); }
        page.drawImage(im, { x: X, y: y - hh + 8, width: w, height: hh });
        y -= hh + 6;
      } else {
        for (const ln of b.lines) {
          if (y - b.lead < M + 14) { bar(); newPage(); segTop = y + 10; label(); }
          text(ln, X, b.size, b.font, b.color); y -= b.lead;
        }
        y -= 2;
      }
      first = false;
    }
    bar();
    y -= 10;
  }

  // rodapé com numeração
  const n = pdf.getPageCount();
  pdf.getPages().forEach((p, i) => {
    const t = `Caderno de resumo · ${i + 1} de ${n}`;
    p.drawText(t, { x: W - M - F.widthOfTextAtSize(t, 8.5), y: 28, size: 8.5, font: F, color: muted });
  });
  pdf.setTitle('Caderno de resumo'); pdf.setCreator('Leitor de Estudos');
  const bytes = await pdf.save();
  const base = groups.length === 1 ? App.baseName(groups[0].doc.name) : 'vários PDFs';
  const fname = `Resumo - ${base}.pdf`;
  App.lastSummary = { bytes, groups: groups.length, items: total, pages: n, outline };
  if (openIt) {
    App.closeSheet();
    await App.openGenerated(bytes, fname, null);
  } else {
    App.download(bytes, fname, 'application/pdf');
    App.toast(`Caderno de resumo salvo na pasta Downloads (${n} página${n === 1 ? '' : 's'}).`);
  }
}
})();
