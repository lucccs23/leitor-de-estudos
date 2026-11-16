/* Caneta no estilo de um caderno digital: espessura com prévia, cores personalizadas,
   borracha (traço inteiro ou só onde passar) e laço para mover, recolorir, duplicar ou apagar traços. */
(() => {
'use strict';
const App = window.App;
const { $, $$, el, ls, state } = App;
const SVGNS = 'http://www.w3.org/2000/svg';

// ---------- Painel de opções (espessura / borracha) ----------
let pop = null;
function closePenPop(){ if (pop) { pop.remove(); pop = null; } }
App.closePenPop = closePenPop;
addEventListener('pointerdown', e => { if (pop && !pop.contains(e.target) && !e.target.closest('#btnPenOpts')) closePenPop(); }, true);
addEventListener('keydown', e => { if (pop && e.key === 'Escape') { e.stopPropagation(); closePenPop(); } }, true);

function place(anchor){
  document.body.append(pop);
  const r = anchor.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
  let x = r.left + r.width / 2 - w / 2, y = r.top - h - 10;
  if (y < 8) y = r.bottom + 10;
  pop.style.left = Math.max(8, Math.min(innerWidth - w - 8, x)) + 'px';
  pop.style.top = Math.max(8, Math.min(innerHeight - h - 8, y)) + 'px';
}
const PRESETS = { pen: [0.8, 1.5, 2.4, 4, 6.5], marker: [7, 11, 14, 19, 25] };
function preview(k){
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', '0 0 200 40'); svg.setAttribute('class', 'ppPreview');
  const path = document.createElementNS(SVGNS, 'path');
  path.setAttribute('d', 'M14 26 C 50 6, 80 34, 110 20 S 170 10, 186 18');
  svg.append(path);
  const paint = () => {
    const c = App.colorOf(App.penColor(k));
    path.setAttribute('stroke-width', App.penWidth(k) * (k === 'marker' ? 1 : 1.6));
    path.style.stroke = k === 'marker' ? c.hex : c.ink;
    path.style.strokeOpacity = k === 'marker' ? '.5' : '1';
    path.style.strokeLinecap = k === 'marker' ? 'butt' : 'round';
  };
  paint(); svg.paint = paint;
  return svg;
}
App.penOptions = anchor => {
  if (pop) { closePenPop(); return; }
  App.closePop?.();
  pop = el('div', 'penPop'); pop.setAttribute('role', 'dialog');
  if (state.tool === 'erase') eraserOpts(); else widthOpts(state.tool === 'ink' ? state.pen : 'pen');
  place(anchor);
};
function widthOpts(k){
  const P = App.PENS[k];
  pop.setAttribute('aria-label', P.label + ': espessura');
  pop.append(el('div', 'ppTitle', P.label));
  const pv = preview(k); pop.append(pv);
  const row = el('div', 'ppRow');
  const range = el('input'); range.type = 'range'; range.min = P.min; range.max = P.max; range.step = 0.1; range.value = App.penWidth(k);
  range.setAttribute('aria-label', 'Espessura');
  const val = el('span', 'ppVal');
  const show = () => { val.textContent = (+range.value).toFixed(1); };
  range.oninput = () => { App.setPenWidth(k, range.value); show(); pv.paint(); paintDots(); };
  show(); row.append(range, val); pop.append(row);
  const dots = el('div', 'ppDots');
  const paintDots = () => dots.querySelectorAll('button').forEach(b => b.classList.toggle('on', Math.abs(+b.dataset.w - App.penWidth(k)) < 0.05));
  PRESETS[k].forEach(w => {
    const b = el('button', 'ppDot'); b.type = 'button'; b.dataset.w = w; b.title = w.toFixed(1);
    const d = el('span'); const s = k === 'marker' ? Math.max(4, w * 0.75) : Math.max(3, w * 2.4);
    d.style.cssText = `width:${s}px;height:${s}px` + (k === 'marker' ? ';border-radius:2px;opacity:.6' : '');
    b.append(d);
    b.onclick = () => { range.value = w; range.oninput(); };
    dots.append(b);
  });
  paintDots(); pop.append(dots);
  // dedo x caneta stylus
  const opt = el('label', 'ppCheck'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = !!state.penSeen;
  cb.onchange = () => { state.penSeen = cb.checked; ls.set('le.penSeen', cb.checked); App.toast(cb.checked ? 'Só a caneta stylus desenha; o dedo rola a página.' : 'O dedo também desenha.'); };
  opt.append(cb, el('span', null, 'Só a caneta stylus desenha (o dedo rola a página)'));
  pop.append(opt);
}
function eraserOpts(){
  pop.setAttribute('aria-label', 'Borracha');
  pop.append(el('div', 'ppTitle', 'Borracha'));
  const modes = el('div', 'ppModes');
  const mode = () => ls.get('le.eraseMode', 'stroke');
  const sizeRow = el('div', 'ppRow');
  [['stroke', 'Traço inteiro', 'apaga o traço todo ao tocar nele'], ['area', 'Só onde passar', 'apaga só o pedaço sob a borracha']].forEach(([id, t, sub]) => {
    const b = el('button', 'ppMode' + (mode() === id ? ' on' : '')); b.type = 'button';
    b.append(el('strong', null, t), el('small', null, sub));
    b.onclick = () => { ls.set('le.eraseMode', id); modes.querySelectorAll('.ppMode').forEach(x => x.classList.toggle('on', x === b)); sizeRow.hidden = id !== 'area'; App.updatePenBtn(); };
    modes.append(b);
  });
  pop.append(modes);
  const range = el('input'); range.type = 'range'; range.min = 6; range.max = 60; range.step = 1; range.value = ls.get('le.eraseSize', 18);
  range.setAttribute('aria-label', 'Tamanho da borracha');
  const val = el('span', 'ppVal', range.value);
  range.oninput = () => { ls.set('le.eraseSize', +range.value); val.textContent = range.value; App.updatePenBtn(); };
  sizeRow.append(el('span', 'ppLbl', 'Tamanho'), range, val); sizeRow.hidden = mode() !== 'area';
  pop.append(sizeRow);
  const clear = App.btn('Apagar tudo desta página', () => {
    const pg = state.currentPage || 1;
    const has = state.highlights.some(h => h.kind === 'ink' && h.parts.some(p => p.page === pg));
    if (!has) { App.toast('Não há traços de caneta nesta página.'); return; }
    App.snapshot();
    for (const h of state.highlights) if (h.kind === 'ink') h.parts = h.parts.filter(p => p.page !== pg);
    state.highlights = state.highlights.filter(h => h.kind !== 'ink' || h.parts.length);
    App.renderPageAnnots(state.pages[pg - 1]); App.renderPanel(); App.saveDocSoon(); App.emit('hl:changed');
    closePenPop(); App.toast(`Traços da página ${pg} apagados — Ctrl+Z desfaz`);
  }, 'sm outline danger ppClear');
  pop.append(clear);
}

// ---------- Paleta da caneta: 6 cores só dela. Tocar de novo na cor escolhida (ou segurar) troca a cor ali mesmo ----------
const HEX = /^#[0-9a-f]{6}$/i;
const slots = () => {
  const def = App.COLORS.map(c => c.ink.toLowerCase());
  const s0 = ls.get('le.inkSlots', null);
  return Array.from({ length: 6 }, (_, i) => (s0 && HEX.test(s0[i] || '') ? s0[i] : def[i] || '#3d63c9').toLowerCase());
};
const curHex = () => App.colorOf(App.penColor()).ink.toLowerCase();
const recents = () => ls.get('le.inkRecent', []).filter(c => HEX.test(c)).slice(0, 6);
const addRecent = hex => ls.set('le.inkRecent', [hex, ...recents().filter(c => c !== hex)].slice(0, 6));
function editSlot(i, anchor){
  const sl = slots(), old = sl[i], wasCur = old === curHex();
  openPicker(anchor, old, hex => {
    sl[i] = hex; ls.set('le.inkSlots', sl); addRecent(hex);
    if (state.tool === 'lasso') App.lassoRecolor?.(hex);
    else if (wasCur || state.tool === 'ink') App.setPenColor(state.pen, hex);
    App.buildPalette();
  });
}
App.penSlot = i => { const h = slots()[i]; if (h) App.pickColor(h); };
App.penPaletteExtras = pal => {
  pal.innerHTML = '';
  const cur = state.tool === 'ink' ? curHex() : null;
  slots().forEach((hex, i) => {
    const b = el('button', 'swatch' + (cur === hex ? ' current' : ''));
    b.style.setProperty('--c', hex);
    b.title = cur === hex ? 'Toque de novo para trocar esta cor' : `Cor ${i + 1} (toque de novo, segure ou botão direito para trocar)`;
    b.setAttribute('aria-label', `Cor da caneta ${i + 1}: ${hex}`);
    b.onmousedown = e => e.preventDefault();
    let held = false, t = null;
    b.onpointerdown = () => { held = false; t = setTimeout(() => { held = true; editSlot(i, b); }, 550); };
    b.onpointerup = b.onpointerleave = b.onpointercancel = () => clearTimeout(t);
    b.onclick = () => {
      if (held) return;
      if (state.tool === 'ink' && cur === hex) editSlot(i, b); // já era a cor da caneta: abre o seletor
      else App.pickColor(hex);
    };
    b.oncontextmenu = e => { e.preventDefault(); clearTimeout(t); editSlot(i, b); };
    pal.append(b);
  });
  const more = el('button', 'swatch moreColor'); more.type = 'button';
  more.title = 'Mais cores'; more.setAttribute('aria-label', 'Mais cores');
  more.onmousedown = e => e.preventDefault();
  more.onclick = () => {
    const sl = slots(); let i = sl.indexOf(curHex());
    if (i < 0) i = 0;
    editSlot(i, more);
  };
  pal.append(more);
};

// ---------- Seletor de cor (dentro do app, como num caderno digital) ----------
let cpop = null;
function closePicker(){ if (cpop) { cpop.remove(); cpop = null; } }
addEventListener('pointerdown', e => { if (cpop && !cpop.contains(e.target) && !e.target.closest('#palette')) closePicker(); }, true);
addEventListener('keydown', e => { if (cpop && e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); closePicker(); } }, true);
const toHex = (r, g, b) => '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const rgbOf = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
function hsv2hex(h, s, v){
  const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return toHex(f(5) * 255, f(3) * 255, f(1) * 255);
}
function hex2hsv(hex){
  const [r, g, b] = rgbOf(hex).map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx];
}
function hsl2hex(h, s, l){
  const a = s * Math.min(l, 1 - l), f = n => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return toHex(f(0) * 255, f(8) * 255, f(4) * 255);
}
// grade de amostras: cinzas + 11 tons, do mais claro ao mais escuro
const SWATCHES = (() => {
  const rows = 10, hues = [0, 25, 45, 60, 90, 140, 170, 200, 225, 260, 290, 330], out = [];
  for (let r = 0; r < rows; r++) {
    const l = 0.93 - r * 0.088;
    out.push([hsl2hex(0, 0, Math.max(0, 1 - r / (rows - 1))), ...hues.slice(0, 11).map(h => hsl2hex(h, r < 2 ? 0.9 : 0.85, Math.max(0.1, l)))]);
  }
  return out;
})();
function openPicker(anchor, initial, onDone){
  closePicker(); App.closePenPop?.();
  let cur = HEX.test(initial) ? initial.toLowerCase() : '#3d63c9';
  let [hh, ss, vv] = hex2hsv(cur);
  cpop = el('div', 'colorPop'); cpop.setAttribute('role', 'dialog'); cpop.setAttribute('aria-label', 'Escolher a cor');
  const tabs = el('div', 'cpTabs');
  const tSw = el('button', 'cpTab', 'Amostras'), tSp = el('button', 'cpTab', 'Espectro');
  tabs.append(tSw, tSp);
  const body = el('div', 'cpBody');
  // amostras
  const grid = el('div', 'cpGrid');
  SWATCHES.forEach(row => row.forEach(hex => {
    const c = el('button', 'cpCell'); c.style.background = hex; c.dataset.hex = hex; c.title = hex;
    c.onclick = () => setCur(hex, true);
    grid.append(c);
  }));
  // espectro
  const spec = el('div', 'cpSpec');
  const sv = el('div', 'cpSV'), knob = el('span', 'cpKnob'); sv.append(knob);
  const hue = el('input', 'cpHue'); hue.type = 'range'; hue.min = 0; hue.max = 360; hue.step = 1; hue.setAttribute('aria-label', 'Tom');
  spec.append(sv, hue);
  const paintSV = () => {
    sv.style.setProperty('--hue', `hsl(${hh} 100% 50%)`);
    knob.style.left = ss * 100 + '%'; knob.style.top = (1 - vv) * 100 + '%'; knob.style.background = cur;
    hue.value = hh;
  };
  const svAt = e => {
    const r = sv.getBoundingClientRect();
    ss = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); vv = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
    setCur(hsv2hex(hh, ss, vv), false);
  };
  sv.onpointerdown = e => { sv.setPointerCapture(e.pointerId); svAt(e); };
  sv.onpointermove = e => { if (e.buttons) svAt(e); };
  hue.oninput = () => { hh = +hue.value; setCur(hsv2hex(hh, ss || 0.8, vv || 0.8), false); };
  body.append(grid, spec);
  const show = which => {
    grid.hidden = which !== 'sw'; spec.hidden = which !== 'sp';
    tSw.classList.toggle('on', which === 'sw'); tSp.classList.toggle('on', which === 'sp');
    ls.set('le.cpTab', which); if (which === 'sp') paintSV();
  };
  tSw.onclick = () => show('sw'); tSp.onclick = () => show('sp');
  // valores: antes | agora, hex e RGB
  const vals = el('div', 'cpVals');
  const prev = el('div', 'cpPrev'), pOld = el('span'), pNew = el('span'); pOld.style.background = initial; prev.append(pOld, pNew);
  pOld.title = 'Cor de antes (toque para voltar)'; pOld.onclick = () => setCur(initial, true);
  const hexIn = el('input', 'cpHex'); hexIn.maxLength = 7; hexIn.spellcheck = false; hexIn.setAttribute('aria-label', 'Código hexadecimal');
  hexIn.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') done(); };
  hexIn.oninput = () => { let v = hexIn.value.trim(); if (v[0] !== '#') v = '#' + v; if (HEX.test(v)) setCur(v.toLowerCase(), true, true); };
  const rgb = el('div', 'cpRGB');
  const hexBox = el('label', 'cpField'); hexBox.append(el('small', null, 'Hexadecimal'), hexIn);
  vals.append(prev, hexBox, rgb);
  // recentes + conta-gotas
  const rec = el('div', 'cpRecent');
  recents().forEach(hex => { const c = el('button', 'cpRec'); c.style.background = hex; c.title = hex; c.onclick = () => setCur(hex, true); rec.append(c); });
  if (!recents().length) rec.append(el('span', 'muted small', 'As cores que você escolher aparecem aqui'));
  if (window.EyeDropper) {
    const eye = App.ibtn('pointer', null, async () => {
      try { const r = await new window.EyeDropper().open(); if (r && HEX.test(r.sRGBHex)) setCur(r.sRGBHex.toLowerCase(), true); } catch {}
    }, 'sm cpEye', 'Conta-gotas: pegar uma cor da tela');
    rec.append(eye);
  }
  const acts = el('div', 'cpActs');
  const done = () => { const v = cur; closePicker(); onDone(v); };
  acts.append(App.btn('Cancelar', closePicker, 'sm'), App.btn('Concluir', done, 'sm primary'));
  cpop.append(tabs, body, vals, rec, acts);
  function setCur(hex, syncHsv, fromInput){
    cur = hex;
    if (syncHsv) [hh, ss, vv] = hex2hsv(hex);
    pNew.style.background = hex;
    if (!fromInput) hexIn.value = hex.toUpperCase();
    const [r, g, b] = rgbOf(hex);
    rgb.innerHTML = '';
    [['Vermelho', r], ['Verde', g], ['Azul', b]].forEach(([n, v]) => { const f = el('div', 'cpField'); f.append(el('small', null, n), el('span', null, String(v))); rgb.append(f); });
    grid.querySelectorAll('.cpCell.on').forEach(c => c.classList.remove('on'));
    grid.querySelector(`.cpCell[data-hex="${hex}"]`)?.classList.add('on');
    if (!spec.hidden) paintSV();
  }
  setCur(cur, true);
  show(ls.get('le.cpTab', 'sw'));
  document.body.append(cpop);
  const r = anchor.getBoundingClientRect(), w = cpop.offsetWidth, h = cpop.offsetHeight;
  let x = r.left + r.width / 2 - w / 2, y = r.top - h - 12;
  if (y < 8) y = Math.min(innerHeight - h - 8, r.bottom + 12);
  cpop.style.left = Math.max(8, Math.min(innerWidth - w - 8, x)) + 'px';
  cpop.style.top = Math.max(8, y) + 'px';
}
App.openColorPicker = openPicker;

// ---------- Círculo da borracha (modo "só onde passar") ----------
const ring = el('div', 'eraserRing'); ring.hidden = true; document.body.append(ring);
addEventListener('pointermove', e => {
  const show = state.tool === 'erase' && ls.get('le.eraseMode', 'stroke') === 'area' && !!e.target.closest?.('.drawLayer');
  ring.hidden = !show; if (!show) return;
  const s = ls.get('le.eraseSize', 18);
  ring.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - s / 2}px;top:${e.clientY - s / 2}px`;
}, { passive: true });

// ---------- Laço ----------
let sel = null; // { p, items: [{ h, pi, k }], box, bar, bb }
const pathsOf = (h, pi) => h.parts[pi] && h.parts[pi].paths;
function inPoly(x, y, poly){
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function clearSel(){
  if (!sel) return;
  sel.box?.remove(); sel.bar?.remove();
  sel.p.ink.querySelectorAll('.lassoSel').forEach(x => x.classList.remove('lassoSel'));
  sel = null;
}
App.lassoClear = clearSel;
function bbox(){
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0, w = 0;
  for (const it of sel.items) {
    const pts = pathsOf(it.h, it.pi)[it.k]; if (!pts) continue;
    w = Math.max(w, it.h.width || 2.4);
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  const px = (w / 2 + 6) / sel.p.base.w, py = (w / 2 + 6) / sel.p.base.h;
  return { x: x0 - px, y: y0 - py, w: x1 - x0 + 2 * px, h: y1 - y0 + 2 * py };
}
function markSel(){
  if (!sel) return;
  sel.p.ink.querySelectorAll('.lassoSel').forEach(x => x.classList.remove('lassoSel'));
  for (const it of sel.items) sel.p.ink.querySelector(`path[data-id="${it.h.id}"][data-k="${it.pi}:${it.k}"]`)?.classList.add('lassoSel');
}
function showSel(){
  if (!sel) return;
  sel.items = sel.items.filter(it => state.highlights.includes(it.h) && pathsOf(it.h, it.pi) && pathsOf(it.h, it.pi)[it.k]);
  if (!sel.items.length) { clearSel(); return; }
  markSel();
  const b = sel.bb = bbox();
  if (!sel.box) { sel.box = el('div', 'lassoBox'); sel.p.el.append(sel.box); }
  sel.box.style.cssText = `left:${b.x * 100}%;top:${b.y * 100}%;width:${b.w * 100}%;height:${b.h * 100}%`;
  if (!sel.bar) {
    sel.bar = el('div', 'lassoBar'); sel.bar.setAttribute('role', 'toolbar'); sel.bar.setAttribute('aria-label', 'Traços selecionados');
    sel.bar.addEventListener('pointerdown', e => e.stopPropagation());
    sel.bar.append(
      App.ibtn('copy', 'Duplicar', duplicate, 'sm'),
      App.ibtn('trash', 'Apagar', removeSel, 'sm danger'),
      App.ibtn('x', null, clearSel, 'sm', 'Tirar a seleção (Esc)'));
    sel.p.el.append(sel.bar);
  }
  sel.bar.style.left = (b.x + b.w / 2) * 100 + '%';
  sel.bar.style.top = b.y * 100 + '%';
  sel.bar.classList.toggle('below', b.y < 0.06);
  if (sel.bar.classList.contains('below')) sel.bar.style.top = (b.y + b.h) * 100 + '%';
}
function commit(p){
  App.renderPageAnnots(p); App.renderPanel(); App.saveDocSoon(); App.emit('hl:changed');
  showSel();
}
// separa os traços escolhidos em um grifo próprio (para mudar a cor só deles); devolve os novos itens
function detach(mutate){
  const groups = new Map();
  for (const it of sel.items) { const g = groups.get(it.h) || []; g.push(it); groups.set(it.h, g); }
  const out = [];
  for (const [h, its] of groups) {
    const total = h.parts.reduce((n, pt) => n + (pt.paths ? pt.paths.length : 0), 0);
    if (its.length === total) { mutate(h); h.parts.forEach((pt, pi) => pt.paths.forEach((_, k) => out.push({ h, pi, k }))); continue; }
    const taken = its.map(it => pathsOf(it.h, it.pi)[it.k]);
    its.slice().sort((a, b) => b.k - a.k).forEach(it => pathsOf(it.h, it.pi).splice(it.k, 1));
    const nh = { ...JSON.parse(JSON.stringify(h)), id: App.uid(), created: Date.now(), parts: [{ page: sel.p.num, paths: taken }] };
    mutate(nh); state.highlights.push(nh);
    taken.forEach((_, k) => out.push({ h: nh, pi: 0, k }));
  }
  // os índices dos que ficaram mudaram: refaz a seleção a partir dos novos
  return out;
}
App.lassoRecolor = c => {
  if (!sel) { App.toast('Contorne alguns traços com o laço para mudar a cor deles.'); return; }
  App.snapshot();
  sel.items = detach(h => { h.color = c; });
  commit(sel.p);
};
function removeSel(){
  if (!sel) return;
  App.snapshot();
  const groups = new Map();
  for (const it of sel.items) { const g = groups.get(it.h) || []; g.push(it); groups.set(it.h, g); }
  for (const [h, its] of groups) {
    its.slice().sort((a, b) => b.pi - a.pi || b.k - a.k).forEach(it => pathsOf(h, it.pi).splice(it.k, 1));
    h.parts = h.parts.filter(pt => !pt.paths || pt.paths.length);
  }
  state.highlights = state.highlights.filter(h => h.kind !== 'ink' || h.parts.length);
  const p = sel.p, n = sel.items.length; clearSel();
  App.renderPageAnnots(p); App.renderPanel(); App.saveDocSoon(); App.emit('hl:changed');
  App.toast(`${n} traço${n > 1 ? 's' : ''} apagado${n > 1 ? 's' : ''} — Ctrl+Z desfaz`);
}
function duplicate(){
  if (!sel) return;
  App.snapshot();
  const dx = 18 / sel.p.base.w, dy = 18 / sel.p.base.h, out = [];
  const groups = new Map();
  for (const it of sel.items) { const g = groups.get(it.h) || []; g.push(it); groups.set(it.h, g); }
  for (const [h, its] of groups) {
    const paths = its.map(it => pathsOf(h, it.pi)[it.k].map(([x, y]) => [+Math.min(1, x + dx).toFixed(4), +Math.min(1, y + dy).toFixed(4)]));
    const nh = { ...JSON.parse(JSON.stringify(h)), id: App.uid(), created: Date.now(), parts: [{ page: sel.p.num, paths }] };
    state.highlights.push(nh);
    paths.forEach((_, k) => out.push({ h: nh, pi: 0, k }));
  }
  sel.items = out; commit(sel.p);
  App.toast('Duplicado: arraste a cópia para onde quiser');
}
// começo de um gesto com o laço: dentro da seleção arrasta; fora, desenha um laço novo
App.lassoStart = (p, rect, start, dl) => {
  if (sel && sel.p === p && sel.bb) {
    const b = sel.bb;
    if (start[0] >= b.x && start[0] <= b.x + b.w && start[1] >= b.y && start[1] <= b.y + b.h) return moveGesture(p, rect, start);
  }
  clearSel();
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', '0 0 1000 1000'); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('class', 'lassoDraw');
  const line = document.createElementNS(SVGNS, 'polygon'); svg.append(line); dl.append(svg);
  const pts = [start];
  const draw = () => line.setAttribute('points', pts.map(([x, y]) => `${(x * 1000).toFixed(1)},${(y * 1000).toFixed(1)}`).join(' '));
  draw();
  return {
    type: 'ext', rect,
    move(pt){ const l = pts[pts.length - 1]; if (Math.hypot((pt[0] - l[0]) * rect.width, (pt[1] - l[1]) * rect.height) >= 3) { pts.push(pt); draw(); } },
    end(e, cancel){
      svg.remove();
      if (cancel || pts.length < 3) return;
      const items = [];
      for (const h of state.highlights) {
        if (h.kind !== 'ink') continue;
        h.parts.forEach((part, pi) => {
          if (part.page !== p.num) return;
          part.paths.forEach((path, k) => {
            const inside = path.filter(([x, y]) => inPoly(x, y, pts)).length;
            if (inside && inside >= path.length * 0.5) items.push({ h, pi, k });
          });
        });
      }
      if (!items.length) { App.toast('Nenhum traço da caneta dentro do laço.'); return; }
      sel = { p, items }; showSel();
    },
  };
};
function moveGesture(p, rect, start){
  const els = sel.items.map(it => p.ink.querySelector(`path[data-id="${it.h.id}"][data-k="${it.pi}:${it.k}"]`)).filter(Boolean);
  const b0 = sel.bb; let d = [0, 0];
  sel.bar.hidden = true;
  return {
    type: 'ext', rect,
    move(pt){
      d = [Math.max(-b0.x, Math.min(1 - b0.x - b0.w, pt[0] - start[0])), Math.max(-b0.y, Math.min(1 - b0.y - b0.h, pt[1] - start[1]))];
      const tx = d[0] * p.base.w, ty = d[1] * p.base.h;
      els.forEach(x => x.setAttribute('transform', `translate(${tx.toFixed(1)} ${ty.toFixed(1)})`));
      sel.box.style.left = (b0.x + d[0]) * 100 + '%'; sel.box.style.top = (b0.y + d[1]) * 100 + '%';
    },
    end(e, cancel){
      sel.bar.hidden = false;
      if (cancel || Math.hypot(d[0] * p.base.w, d[1] * p.base.h) < 1) { els.forEach(x => x.removeAttribute('transform')); showSel(); return; }
      App.snapshot();
      for (const it of sel.items) {
        const path = pathsOf(it.h, it.pi)[it.k];
        for (const q of path) { q[0] = +(q[0] + d[0]).toFixed(4); q[1] = +(q[1] + d[1]).toFixed(4); }
      }
      commit(p);
    },
  };
}
// a seleção some ao trocar de ferramenta, desfazer, trocar de PDF; e volta a ser marcada se a página for redesenhada
App.on('tool:changed', () => { clearSel(); closePenPop(); closePicker(); ring.hidden = true; });
App.on('undo:changed', clearSel);
App.on('doc:loaded', clearSel);
App.on('doc:closed', clearSel);
App.on('page:annots', markSel);
addEventListener('keydown', e => {
  if (!sel || e.target.closest?.('input,textarea')) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); removeSel(); }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); clearSel(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); e.stopPropagation(); duplicate(); }
}, true);
})();
