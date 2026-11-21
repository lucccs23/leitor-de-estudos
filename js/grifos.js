/* Grifos: criar, juntar grifo sobre grifo, notas soltas, desfazer/refazer e o desenho dos grifos na página. */
(() => {
'use strict';
const App = window.App;
const { $, $$, el, ls, uid, state, SVGNS, clamp01, distSeg, normHl, paintInk } = App;
const viewer = $('#viewer'), pagesEl = $('#pages');
// partes do núcleo (core.js), chamadas na hora do uso
function closePopup(...a){ return App.closePopup(...a); }
function showEditPopup(...a){ return App.editHl(...a); }
function scheduleRender(...a){ return App.scheduleRender(...a); }
function updateCurrentPage(...a){ return App.updateCurrentPage(...a); }

// ---------- Grifos ----------
const undoStack = [], redoStack = [];
const updUndo = () => { const u = $('#btnUndo'), r = $('#btnRedo'); if (u) u.disabled = !undoStack.length; if (r) r.disabled = !redoStack.length; };
App.updateUndoBtns = updUndo;
// Cópia de cada passo do desfazer: copia os grifos e as partes, mas COMPARTILHA a lista de pontos de cada traço.
// Os pontos de um traço nunca são alterados no lugar (apagar, mover ou mudar um traço cria pontos novos), então
// guardar 80 passos de um caderno cheio custa poucos objetos, não 80 cópias de todos os pontos.
function copiaGrifo(h){
  const { parts, ...resto } = h, c = structuredClone(resto);
  c.parts = parts.map(p => { const { paths, ...r } = p, cp = structuredClone(r); if (paths) cp.paths = paths.slice(); return cp; });
  return c;
}
function snapshot(){ undoStack.push(state.highlights.map(copiaGrifo)); if (undoStack.length > 80) undoStack.shift(); redoStack.length = 0; updUndo(); }
App.snapshot = snapshot;
// "assinatura" de cada página: o que está desenhado nela (para redesenhar só as páginas que mudaram).
// Cada lista de pontos é reconhecida pela identidade (sem converter os pontos em texto).
const idPontos = new WeakMap(); let nPontos = 0;
const idDe = a => { let i = idPontos.get(a); if (!i) idPontos.set(a, i = ++nPontos); return i; };
function porPagina(hls){
  const m = new Map();
  for (const h of hls) {
    const { parts, ...resto } = h, s = JSON.stringify(resto);
    for (const pt of parts) m.set(pt.page, (m.get(pt.page) || '') + s + '|' + (pt.rects ? JSON.stringify(pt.rects) : '') + '|' + (pt.paths ? pt.paths.map(idDe).join(',') : '') + ';');
  }
  return m;
}
function restoreFrom(from, to, msg){
  const antes = porPagina(state.highlights), selAntes = state.highlights.find(h => h.id === state.selected);
  // a lista que sai da tela não muda mais (a que entra é outra cópia): guarda ela mesma
  to.push(state.highlights);
  state.highlights = from.pop();
  state.lastInk = null; closePopup();
  // desfazer pela S Pen tem de ser imediato: redesenhar todas as páginas levava meio segundo num caderno cheio
  const depois = porPagina(state.highlights), sujas = new Set(selAntes ? selAntes.parts.map(pt => pt.page) : []);
  for (const n of new Set([...antes.keys(), ...depois.keys()])) if (antes.get(n) !== depois.get(n)) sujas.add(n);
  for (const n of sujas) renderPageAnnots(App.paginaDe(n));
  App.emit('page:annots');
  App.renderPanelSoon();
  App.saveDocSoon(); App.emit('hl:changed'); App.emit('undo:changed');
  updUndo();
  App.toast(msg);
}
App.undo = () => { if (!undoStack.length) { App.toast('Nada para desfazer'); return; } restoreFrom(undoStack, redoStack, 'Desfeito — Ctrl+Y refaz'); };
App.redo = () => { if (!redoStack.length) { App.toast('Nada para refazer'); return; } restoreFrom(redoStack, undoStack, 'Refeito'); };

function hasSelection(){
  const s = getSelection();
  return !!(state.pdf && state.tool === 'text' && s && s.rangeCount && !s.isCollapsed && pagesEl.contains(s.anchorNode) && s.toString().trim());
}
App.hasSelection = hasSelection;
function mergeRects(rects){
  rects.sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2) || a.x - b.x);
  const out = [];
  for (const r of rects) {
    const last = out[out.length - 1];
    if (last) {
      const overlapY = Math.min(last.y + last.h, r.y + r.h) - Math.max(last.y, r.y);
      const gap = r.x - (last.x + last.w);
      if (overlapY > 0.5 * Math.min(last.h, r.h) && gap < 0.015 && r.x + r.w > last.x - 0.015) {
        const x = Math.min(last.x, r.x), y = Math.min(last.y, r.y);
        const x2 = Math.max(last.x + last.w, r.x + r.w), y2 = Math.max(last.y + last.h, r.y + r.h);
        Object.assign(last, { x, y, w: x2 - x, h: y2 - y }); continue;
      }
    }
    out.push({ ...r });
  }
  return out.map(roundRect);
}
const roundRect = r => ({ x: +r.x.toFixed(5), y: +r.y.toFixed(5), w: +r.w.toFixed(5), h: +r.h.toFixed(5) });

function createHighlight(color){
  if (!hasSelection()) return;
  const sel = getSelection(), range = sel.getRangeAt(0);
  const rects = [...range.getClientRects()];
  const bound = range.getBoundingClientRect();
  const parts = [];
  for (const p of state.pages) {
    const pr = p.el.getBoundingClientRect();
    if (pr.bottom < bound.top || pr.top > bound.bottom) continue;
    const list = [];
    for (const r of rects) {
      if (r.width < 1 || r.height < 1) continue;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (cx < pr.left || cx > pr.right || cy < pr.top || cy > pr.bottom) continue;
      if (r.height > pr.height * 0.2) continue; // ignora caixas de contêiner
      list.push({ x: (r.left - pr.left) / pr.width, y: (r.top - pr.top) / pr.height, w: r.width / pr.width, h: r.height / pr.height });
    }
    if (list.length) parts.push({ page: p.num, rects: mergeRects(list) });
  }
  if (!parts.length) return;
  const text = sel.toString().replace(/\s+/g, ' ').trim();
  // clique duplo seguido de triplo (palavra → linha): substitui o grifo de agora há pouco em vez de empilhar
  const prev = state.highlights[state.highlights.length - 1];
  const now = Date.now();
  if (prev && prev.kind === 'text' && now - prev.created < 900 && !prev.note && prev.parts[0].page === parts[0].page && text.includes(prev.text)) {
    state.highlights.pop();
  } else snapshot();
  const h = { id: uid(), kind: 'text', style: state.style, color, text, note: '', parts, created: now };
  const absorbed = absorbOverlaps(h);
  state.highlights.push(h); state.color = color;
  sel.removeAllRanges(); closePopup();
  if (absorbed.length) { renderAllAnnots(); App.renderPanel(); App.saveDocSoon(); App.emit('hl:changed'); }
  else refreshHighlight(h);
}

// ---------- Grifo por cima de grifo: vira um só (sem "camadas" de cor) ----------
const rectArea = r => Math.max(0, r.w) * Math.max(0, r.h);
const interArea = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
// junta dois trechos de texto que se sobrepõem ("…sódio em" + "sódio em 24 horas")
function joinText(a, b){
  if (!a) return b; if (!b) return a;
  if (b.includes(a)) return b; if (a.includes(b)) return a;
  for (let k = Math.min(a.length, b.length); k >= 3; k--) if (a.endsWith(b.slice(0, k))) return a + b.slice(k);
  return a + ' ' + b;
}
const firstPos = h => { const p = h.parts[0], r = p.rects[0]; return p.page * 10 + r.y + r.x * 0.001; };
function absorbOverlaps(h){
  const absorbed = [];
  for (const o of [...state.highlights]) {
    if (o.kind !== 'text' || o.style !== h.style || o.q) continue;
    let inter = 0, area = 0;
    for (const op of o.parts) for (const r of op.rects) {
      area += rectArea(r);
      const np = h.parts.find(p => p.page === op.page); if (!np) continue;
      // conta só a sobreposição com a mesma linha (altura parecida), não com a linha de cima/baixo
      for (const n of np.rects) {
        const oy = Math.min(r.y + r.h, n.y + n.h) - Math.max(r.y, n.y);
        if (oy > 0.5 * Math.min(r.h, n.h)) inter += interArea(r, n);
      }
    }
    if (!area || inter < area * 0.02) continue;
    // sobrepõe: o antigo entra no novo
    for (const op of o.parts) {
      const np = h.parts.find(p => p.page === op.page);
      if (np) np.rects = mergeRects([...np.rects, ...op.rects]);
      else h.parts.push({ page: op.page, rects: op.rects.map(r => ({ ...r })) });
    }
    h.parts.sort((p, q) => p.page - q.page);
    h.text = firstPos(o) <= firstPos(h) ? joinText(o.text, h.text) : joinText(h.text, o.text);
    if (o.note) h.note = h.note ? h.note + '\n\n' + o.note : o.note;
    for (const k of ['tags', 'link', 'tag', 'srs']) if (o[k] != null && h[k] == null) h[k] = o[k];
    h.created = Math.min(h.created, o.created || h.created);
    state.highlights = state.highlights.filter(x => x !== o);
    absorbed.push(o);
  }
  return absorbed;
}
App.absorbOverlaps = absorbOverlaps;
// grifos antigos, feitos antes da 1.20.3, podem estar empilhados: junta tudo (o mais novo dá a cor)
function mergeAllOverlaps(dry){
  const before = state.highlights;
  if (dry) state.highlights = JSON.parse(JSON.stringify(before));
  let merged = 0;
  for (let pass = 0; pass < 3; pass++) {
    let list = state.highlights.slice(), out = [], now = 0;
    while (list.length) {
      const h = list.pop();
      if (h.kind !== 'text' || h.q) { out.unshift(h); continue; }
      state.highlights = list;
      now += absorbOverlaps(h).length;
      list = state.highlights;
      out.unshift(h);
    }
    state.highlights = out; merged += now;
    if (!now) break;
  }
  if (dry) state.highlights = before;
  return merged;
}
App.countOverlaps = () => mergeAllOverlaps(true);
App.cleanOverlaps = () => {
  if (!state.pdf) return;
  const n = mergeAllOverlaps(true);
  if (!n) { App.toast('Nenhum grifo sobreposto neste PDF.'); return; }
  snapshot();
  mergeAllOverlaps(false);
  renderAllAnnots(); App.renderPanel(); App.saveDocSoon(); App.emit('hl:changed');
  App.toast(`${n} grifo(s) sobreposto(s) juntado(s) — Ctrl+Z desfaz.`);
};
// ao abrir um PDF com grifos empilhados, avisa uma vez
App.on('doc:loaded', () => setTimeout(() => {
  if (!state.pdf) return;
  const seen = ls.get('le.overlapHint', []);
  if (seen.includes(state.fp)) return;
  const n = mergeAllOverlaps(true);
  if (!n) return;
  ls.set('le.overlapHint', [...seen, state.fp].slice(-300));
  App.toast(`Este PDF tem ${n} grifo(s) sobreposto(s) (cor mais forte). Estudar → "Juntar grifos sobrepostos" arruma.`);
}, 2500));

function cropImage(p, r){
  if (!p.canvas) return null;
  const c = p.canvas;
  const sx = r.x * c.width, sy = r.y * c.height, sw = r.w * c.width, sh = r.h * c.height;
  if (sw < 2 || sh < 2) return null;
  const k = Math.min(1, 1100 / sw, 1100 / sh); // figuras e tabelas legíveis no resumo
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(sw * k)); out.height = Math.max(1, Math.round(sh * k));
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(c, sx, sy, sw, sh, 0, 0, out.width, out.height);
  return out.toDataURL('image/jpeg', 0.82);
}
// copia uma figura (data URL) para colar no Word, Notion, IA…
App.copyImage = async dataUrl => {
  try {
    const img = new Image(); img.src = dataUrl; await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    App.toast('Figura copiada — cole onde quiser');
  } catch (e) { console.warn(e); App.toast('Não consegui copiar a figura neste aparelho'); }
};
function createAreaHighlight(p, r){
  snapshot();
  const h = { id: uid(), kind: 'area', style: 'fill', color: state.color, text: '', note: '', parts: [{ page: p.num, rects: [roundRect(r)] }], created: Date.now(), img: cropImage(p, r) };
  state.highlights.push(h);
  refreshHighlight(h);
  App.pageText(p.num).then(pt => {
    const t = pt.items.filter(it => {
      const cx = it.x + it.w / 2, cy = it.y + it.h / 2;
      return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h;
    }).map(it => it.str).join(' ').replace(/\s+/g, ' ').trim();
    if (t && state.highlights.includes(h)) { h.text = t; App.renderPanel(); App.saveDocSoon(); }
  }).catch(() => {});
}
function commitInk(p, pts, P){
  const now = Date.now();
  const rounded = pts.map(q => q.length > 2 ? [+q[0].toFixed(4), +q[1].toFixed(4), q[2]] : [+q[0].toFixed(4), +q[1].toFixed(4)]);
  const li = state.lastInk;
  const same = (a, b) => (a || '') === (b || '');
  let h = li && state.highlights.includes(li.h) && li.page === p.num && li.h.color === P.color && (li.h.width || 2.4) === P.w && !!li.h.marker === !!P.marker
    && same(li.h.tip, P.tip) && same(li.h.line, P.line) && same(li.h.opacity, P.opacity) && !!li.h.pressao === !!P.pressao && now - li.t < 2500 ? li.h : null;
  snapshot();
  if (h) h.parts[0].paths.push(rounded);
  else {
    h = { id: uid(), kind: 'ink', style: 'fill', color: P.color, text: '', note: '', width: P.w, parts: [{ page: p.num, paths: [rounded] }], created: now };
    if (P.marker) h.marker = true;
    if (P.tip) h.tip = P.tip;
    if (P.line) h.line = P.line;
    if (P.pressao) h.pressao = true;
    if (P.opacity) h.opacity = P.opacity;
    state.highlights.push(h);
  }
  state.lastInk = { h, page: p.num, t: now };
  refreshHighlight(h);
}
// ---------- Notas soltas (post-it na página) ----------
const NOTE_W = 0.03, NOTE_H = 0.022;
function createNote(p, [x, y]){
  snapshot();
  const r = { x: +clamp01(x - NOTE_W / 2).toFixed(4), y: +clamp01(y - NOTE_H / 2).toFixed(4), w: NOTE_W, h: NOTE_H };
  const h = { id: uid(), kind: 'note', style: 'fill', color: state.color, text: '', note: '', parts: [{ page: p.num, rects: [r] }], created: Date.now() };
  state.highlights.push(h);
  refreshHighlight(h);
  App.setTool('text');
  const m = p.notes.querySelector(`[data-id="${h.id}"]`).getBoundingClientRect();
  showEditPopup(h, m.left + m.width / 2, m.bottom, true);
}
// clicar abre a nota; arrastar muda de lugar
pagesEl.addEventListener('pointerdown', e => {
  const m = e.target.closest('.noteMark');
  if (!m || e.button !== 0) return;
  e.preventDefault(); e.stopPropagation();
  const h = state.highlights.find(x => x.id === m.dataset.id); if (!h) return;
  const p = App.paginaDe(h.parts[0].page), pr = p.el.getBoundingClientRect();
  const start = { x: e.clientX, y: e.clientY }, r0 = { ...h.parts[0].rects[0] };
  let moved = false;
  m.setPointerCapture(e.pointerId);
  const move = ev => {
    if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4) return;
    if (!moved) { moved = true; snapshot(); closePopup(); }
    const r = h.parts[0].rects[0];
    r.x = +clamp01(r0.x + (ev.clientX - start.x) / pr.width).toFixed(4);
    r.y = +clamp01(r0.y + (ev.clientY - start.y) / pr.height).toFixed(4);
    m.style.left = r.x * 100 + '%'; m.style.top = r.y * 100 + '%';
  };
  const up = () => {
    m.removeEventListener('pointermove', move); m.removeEventListener('pointerup', up);
    if (moved) { refreshHighlight(h); return; }
    const b = m.getBoundingClientRect();
    showEditPopup(h, b.left + b.width / 2, b.bottom, true);
  };
  m.addEventListener('pointermove', move); m.addEventListener('pointerup', up);
}, true);

function deleteHighlight(h){
  snapshot();
  state.highlights = state.highlights.filter(x => x.id !== h.id);
  closePopup(); refreshHighlight(h);
  App.toast('Apagado — Ctrl+Z desfaz');
}


function renderPageAnnots(p){
  if (!p) return;
  p.hl.innerHTML = ''; p.ink.innerHTML = ''; p.notes.innerHTML = '';
  for (const h of state.highlights) for (const part of h.parts) {
    if (part.page !== p.num) continue;
    const col = App.colorOf(h.color);
    if (h.kind === 'note') {
      const r = part.rects[0];
      const m = el('button', 'noteMark' + (state.selected === h.id ? ' selected' : '') + (h.note ? '' : ' empty'));
      m.dataset.id = h.id; m.style.left = r.x * 100 + '%'; m.style.top = r.y * 100 + '%';
      m.style.setProperty('--c', col.hex); m.style.setProperty('--ci', col.ink);
      m.title = h.note || 'Nota vazia'; m.setAttribute('aria-label', 'Nota: ' + (h.note || 'vazia'));
      m.append(App.icon('note'));
      p.notes.appendChild(m);
      continue;
    }
    if (h.kind === 'ink') {
      const pi = h.parts.indexOf(part);
      for (const [k, pts] of part.paths.entries()) {
        const path = document.createElementNS(SVGNS, 'path');
        path.dataset.k = pi + ':' + k;
        paintInk(path, pts, h, p.base);
        if (state.selected === h.id) path.classList.add('selected');
        path.dataset.id = h.id;
        path.style.setProperty('--c', col.hex); path.style.setProperty('--ci', col.ink);
        p.ink.appendChild(path);
      }
      continue;
    }
    const style = h.kind === 'area' ? 'fill' : h.style;
    const g = el('div', `hl k-${h.kind} s-${style}` + (h.q ? ' q' : '') + (h.note && !h.q ? ' has-note' : '') + (h.link ? ' has-link' : '') + (state.selected === h.id ? ' selected' : ''));
    g.dataset.id = h.id;
    g.style.setProperty('--c', col.hex); g.style.setProperty('--ci', col.ink);
    for (const r of part.rects) {
      const d = el('div');
      d.style.cssText = `left:${r.x * 100}%;top:${r.y * 100}%;width:${r.w * 100}%;height:${r.h * 100}%`;
      g.appendChild(d);
    }
    p.hl.appendChild(g);
  }
}
const renderAllAnnots = App.renderAllAnnots = () => { state.pages.forEach(renderPageAnnots); App.folhas?.lista().forEach(renderPageAnnots); App.emit('page:annots'); };
App.renderPageAnnots = p => { renderPageAnnots(p); App.emit('page:annots', p); };
let painelT = 0;
App.renderPanelSoon = () => { if (painelT) return; painelT = requestAnimationFrame(() => setTimeout(() => { painelT = 0; App.renderPanel(); }, 0)); };
function refreshHighlight(h){
  new Set(h.parts.map(x => x.page)).forEach(n => renderPageAnnots(App.paginaDe(n)));
  App.renderPanelSoon(); App.saveDocSoon(); App.emit('hl:changed');
}
App.refreshHighlight = refreshHighlight;
function markSelected(){
  $$('.hl.selected, .inkLayer path.selected').forEach(x => x.classList.remove('selected'));
  if (state.selected) $$(`[data-id="${state.selected}"]`).forEach(x => { if (x.closest('.page')) x.classList.add('selected'); });
}
function hitTest(pageEl, cx, cy){
  const r = pageEl.getBoundingClientRect();
  const x = (cx - r.left) / r.width, y = (cy - r.top) / r.height, num = +pageEl.dataset.page;
  const b = App.paginaDe(num).base;
  for (let i = state.highlights.length - 1; i >= 0; i--) {
    const h = state.highlights[i];
    if (h.kind === 'note') continue; // notas têm o próprio botão
    for (const part of h.parts) {
      if (part.page !== num) continue;
      if (h.kind === 'ink') {
        const tol = Math.max(5, (h.width || 2.4) + 3) / Math.max(0.5, state.scale);
        for (const pts of part.paths) for (let k = 0; k < pts.length; k++) {
          const a = pts[k], c = pts[Math.min(k + 1, pts.length - 1)];
          if (distSeg(x * b.w, y * b.h, a[0] * b.w, a[1] * b.h, c[0] * b.w, c[1] * b.h) <= tol) return h;
        }
      } else {
        for (const q of part.rects) if (x >= q.x - .002 && x <= q.x + q.w + .002 && y >= q.y - .002 && y <= q.y + q.h + .002) return h;
      }
    }
  }
  return null;
}
App.anchorOf = h => {
  const part = h.parts[0];
  if (h.kind === 'ink') {
    let y = 1, x = 1;
    for (const pts of part.paths) for (const [px, py] of pts) { if (py < y) y = py; if (px < x) x = px; }
    return { page: part.page, y, x };
  }
  return { page: part.page, y: part.rects[0].y, x: part.rects[0].x };
};
App.sortedHighlights = list => [...list].sort((a, b) => {
  if (a.ep && b.ep) return a.ep.ch - b.ep.ch || a.ep.s - b.ep.s;
  const A = App.anchorOf(a), B = App.anchorOf(b);
  return App.ordemPagina(A.page) - App.ordemPagina(B.page) || A.y - B.y || A.x - B.x;
});
App.jumpTo = h => {
  const a = App.anchorOf(h), p = App.paginaDe(a.page);
  if (!p) return;
  viewer.scrollTop = p.el.offsetTop + a.y * p.el.offsetHeight - viewer.clientHeight * 0.3;
  updateCurrentPage(); scheduleRender();
  state.selected = h.id; markSelected();
  $$(`.page [data-id="${h.id}"]`).forEach(g => { g.classList.remove('flash'); void g.getBoundingClientRect(); g.classList.add('flash'); });
};


// para o núcleo e os outros arquivos
Object.assign(App, { undoStack, redoStack, commitInk, createAreaHighlight, createHighlight, createNote, deleteHighlight, hitTest, markSelected });
App.drawPageAnnots = renderPageAnnots; // sem avisar "page:annots" (App.renderPageAnnots avisa)
updUndo(); // botões de desfazer/refazer começam desligados
})();
