/* Caneta no estilo de um caderno digital: espessura com prévia, cores personalizadas,
   borracha (traço inteiro ou só onde passar) e laço para mover, recolorir, duplicar ou apagar traços. */
(() => {
'use strict';
const App = window.App;
const { $, $$, el, ls, state } = App;
const SVGNS = 'http://www.w3.org/2000/svg';

// ---------- Painel de opções (espessura / borracha) ----------
let pop = null;
// fechar o painel também encerra o "Testar o botão" (o botão da S Pen volta a fazer as ações)
let spenDesenha = null;
App.on('spen:log', () => { if (spenDesenha) spenDesenha(); });
function closePenPop(){ if (pop) { pop.remove(); pop = null; } App.spenTeste = false; spenDesenha = null; }
App.closePenPop = closePenPop;
addEventListener('pointerdown', e => { if (pop && !pop.contains(e.target) && !e.target.closest('#btnPenOpts,[data-penkind],#penSeg [data-tool=erase]')) closePenPop(); }, true);
addEventListener('keydown', e => { if (pop && e.key === 'Escape') { e.stopPropagation(); closePenPop(); } }, true);

function place(anchor){
  if (!pop.isConnected) document.body.append(pop);
  const r = anchor.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
  let x = r.left + r.width / 2 - w / 2, y = r.top - h - 10;
  if (y < 8) y = r.bottom + 10;
  pop.style.left = Math.max(8, Math.min(innerWidth - w - 8, x)) + 'px';
  pop.style.top = Math.max(8, Math.min(innerHeight - h - 8, y)) + 'px';
}
// ---------- Desenhos dos botões do painel ----------
const svgEl = (html, cls) => { const s = el('span', cls); s.innerHTML = html; return s; };
const STAR = on => `<svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 3.6l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.8 1-5.9L3.5 9.8l5.9-.8z" fill="${on ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`;
const PEN_STAR = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l1-4L15 6l3 3L8 19z"/><path d="M17.5 14.5l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3z"/></svg>';
const DROPPER = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 6l4 4M12.5 7.5l4 4L8 20H4v-4z"/><path d="M15 5l1.5-1.5a2.1 2.1 0 013 3L18 8"/></svg>';
const NIBS = {
  ball: '<path d="M10 24l3.4-16h1.2L18 24z" fill="#b9bdc6"/><path d="M13.3 8L14 3l.7 5z" fill="var(--tc)"/>',
  fountain: '<path d="M9 24c0-7 3-11 5-20 2 9 5 13 5 20z" fill="#c9ccd4"/><path d="M14 8v11" stroke="#555" stroke-width=".9"/><circle cx="14" cy="19" r="1.3" fill="#555"/>',
  callig: '<path d="M10 24l1-13h6l1 13z" fill="#b9bdc6"/><path d="M10.5 11L18 4v7z" fill="var(--tc)"/>',
  pencil: '<path d="M9 24l5-18 5 18z" fill="#e8c9a0"/><path d="M12.6 11L14 5l1.4 6z" fill="var(--tc)"/>',
  brush: '<path d="M11 24h6l1-5c0-6-3-10-4-16-1 6-4 10-4 16z" fill="var(--tc)"/>',
  chisel: '<path d="M9 24V12l10-6v18z" fill="var(--tc)"/>',
  round: '<path d="M9.5 24V13a4.5 4.5 0 019 0v11z" fill="var(--tc)"/>',
};
const tipArt = id => `<svg viewBox="0 0 28 60" width="30" height="62" aria-hidden="true">${NIBS[id] || NIBS.ball}<path d="M8 24h12l1 36H7z" fill="#70757f"/><path d="M7.7 34h12.6l.3 9H7.4z" fill="var(--tc)"/></svg>`;
const LINE_ART = {
  solid: '<path d="M4 8h36" stroke-width="3.2"/>',
  taper: '<path d="M3 8c10-2.2 28-2.2 38 0-10 2.2-28 2.2-38 0z" fill="currentColor" stroke="none"/>',
  dash: '<path d="M4 8h36" stroke-width="3" stroke-dasharray="9 6"/>',
  dot: '<path d="M4 8h36" stroke-width="3" stroke-dasharray=".01 5.5"/>',
};
// ---------- Cores do painel (a primeira página são as recentes) ----------
const COLOR_PAGES = [
  ['#e01515', '#ffffff', '#000000', '#1238e0', '#0aa84f', '#8a1cf0', '#3fe8a0', '#ff8a00'],
  ['#d40000', '#ffb020', '#ffe600', '#1fd6c0', '#2f9bff', '#1547ff', '#8a2cf5', '#d9d9d9'],
  ['#ff9aa8', '#ffc9a0', '#fff0a0', '#b8f0c0', '#a8e4f5', '#b4c6ff', '#d8b8ff', '#f5c6e8'],
  ['#7a1f1f', '#8a5a2b', '#6b6b1f', '#1f5c3a', '#1f5560', '#1f2f6b', '#4b2470', '#444a55'],
];
let colorPage = null, showFavs = false, anchorEl = null;
const hexOf = k => { const c = App.colorOf(App.penColor(k)); return (k === 'marker' ? c.hex : c.ink).toLowerCase(); };
const stateOf = k => ({ k, w: App.penWidth(k), color: hexOf(k), ...App.penOpt(k) });
const sameCfg = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
const favs = () => ls.get('le.penFavs', []).filter(f => f && App.PENS[f.k]);
function redraw(){ montaTrilho(); if (!pop) return; pop.innerHTML = ''; fillPop(); place(anchorEl); }

// ---------- Canetas favoritas sempre à mão: trilho na lateral da área de leitura ----------
// Aparece com a Caneta, quando há favoritos (estrela no painel da caneta) e a tela não é de celular.
const trilho = el('div', 'favRail'); trilho.hidden = true;
trilho.setAttribute('role', 'toolbar'); trilho.setAttribute('aria-label', 'Canetas favoritas');
$('#stage').append(trilho);
function montaTrilho(){
  const list = favs();
  const mostra = !!state.pdf && state.tool === 'ink' && list.length > 0 && innerWidth > 600 && !document.body.classList.contains('lendo');
  trilho.hidden = !mostra;
  if (!mostra) return;
  // dock em pé encostado à esquerda: o trilho vai para a direita
  const dock = $('#dock'), st = $('#stage').getBoundingClientRect(), dr = dock.getBoundingClientRect();
  trilho.classList.toggle('direita', dock.classList.contains('vertical') && dr.left + dr.width / 2 < st.left + st.width / 2);
  const cur = stateOf(state.pen);
  trilho.replaceChildren(...list.map(f => {
    const on = f.k === state.pen && sameCfg(f, cur), b = el('button', 'favPen' + (on ? ' on' : ''));
    b.type = 'button'; b.title = `${App.PENS[f.k].label} · ${f.w}`; b.setAttribute('aria-label', b.title); b.setAttribute('aria-pressed', String(on));
    const d = el('span'), lado = Math.max(8, Math.min(20, f.w * (f.k === 'marker' ? 0.9 : 2.4)));
    d.style.background = f.color; d.style.width = d.style.height = lado + 'px';
    if (f.k === 'marker') d.classList.add('marca');
    b.append(d);
    b.onmousedown = e => e.preventDefault();
    b.onclick = () => applyFav(f);
    return b;
  }));
}
App.on('tool:changed', montaTrilho); App.on('doc:loaded', montaTrilho); App.on('doc:closed', montaTrilho);
addEventListener('resize', montaTrilho);
new MutationObserver(montaTrilho).observe(document.body, { attributes: true, attributeFilter: ['class'] });
function fillPop(){ if (state.tool === 'erase') eraserOpts(); else penPanel(state.tool === 'ink' ? state.pen : 'pen'); }
App.penOptions = anchor => {
  if (pop) { closePenPop(); return; }
  App.closePop?.();
  anchorEl = anchor;
  pop = el('div', 'penPop'); pop.setAttribute('role', 'dialog');
  fillPop(); place(anchor);
};
function preview(k){
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', '0 0 200 40'); svg.setAttribute('class', 'ppPreview');
  const path = document.createElementNS(SVGNS, 'path');
  svg.append(path);
  const pts = Array.from({ length: 33 }, (_, i) => { const t = i / 32; return [0.07 + t * 0.86, 0.5 + Math.sin(t * Math.PI * 2.2) * 0.2]; });
  svg.paint = () => {
    const c = App.colorOf(App.penColor(k)), s = App.penStyle(k);
    path.style.setProperty('--c', c.hex); path.style.setProperty('--ci', c.ink);
    // com "Sensível à pressão", a prévia mostra a caneta apertando mais no meio do traço
    const pp = s.pressao ? pts.map((q, i) => [q[0], q[1], +(0.3 + 0.65 * Math.sin(i / 32 * Math.PI)).toFixed(2)]) : pts;
    App.paintInk(path, pp, { ...s, width: App.penWidth(k) * (k === 'marker' ? 1 : 1.6) }, { w: 200, h: 40 });
  };
  svg.paint();
  return svg;
}
function iconBtn(cls, title, art, fn){
  const b = el('button', 'ppIcon ' + cls); b.type = 'button'; b.title = title; b.setAttribute('aria-label', title);
  if (typeof art === 'string') b.innerHTML = art; else b.append(art);
  b.onclick = fn; return b;
}
function stepRow(cls, label, min, max, step, get, set, fmt, jump = step * 5){
  const row = el('div', 'ppRow ' + cls);
  const range = el('input'); range.type = 'range'; range.min = min; range.max = max; range.step = step; range.value = get();
  range.setAttribute('aria-label', label);
  const val = el('span', 'ppVal');
  const show = () => { val.textContent = fmt(+range.value); };
  const apply = v => { range.value = Math.max(min, Math.min(max, +(+v).toFixed(2))); range.oninput(); };
  range.oninput = () => { set(+range.value); show(); };
  show();
  row.append(iconBtn('ppStep', `Diminuir: ${label}`, App.icon('minus'), () => apply(+range.value - jump)), range,
    iconBtn('ppStep', `Aumentar: ${label}`, App.icon('plus'), () => apply(+range.value + jump)), val);
  const box = el('div', 'ppStepBox'); box.append(el('span', 'ppLbl', label), row);
  return box;
}
// botão lateral da S Pen: o que ele faz no ar e segurando na tela
function spenBox(){
  const box = el('div', 'ppSpen'), sp = App.spen();
  box.append(el('span', 'ppLbl', 'Botão da S Pen'));
  const linha = (rotulo, k, ops) => {
    const row = el('label', 'ppSelRow'), s = el('select', 'ppSel');
    for (const [v, nome] of ops) { const o = el('option', null, nome); o.value = v; o.selected = sp[k] === v; s.append(o); }
    s.onchange = () => { App.setSpen(k, s.value); App.toast('Botão da S Pen: ' + s.selectedOptions[0].textContent); };
    row.append(el('span', null, rotulo), s); return row;
  };
  box.append(linha('Apertar no ar', 'ar', App.SPEN_AR), linha('Segurar na tela', 'tela', App.SPEN_TELA));
  // teste: mostra o que o aparelho avisa quando o botão é apertado (as ações ficam pausadas enquanto testa)
  const teste = el('div', 'ppSpenTeste'); teste.hidden = true;
  const lista = el('div', 'ppSpenLog');
  const desenha = () => {
    lista.innerHTML = '';
    const ultimos = App.spenLog.filter(x => x.t >= inicio);
    if (!ultimos.length) lista.append(el('span', 'muted', 'Nada chegou ainda. Aperte o botão com a caneta perto da tela, e depois encostando.'));
    for (const x of ultimos.slice(-6)) lista.append(el('span', null, `${x.origem}: ${x.txt}`));
  };
  let inicio = 0;
  const bt = App.btn('Testar o botão', () => {
    teste.hidden = !teste.hidden; App.spenTeste = !teste.hidden; bt.textContent = teste.hidden ? 'Testar o botão' : 'Parar o teste';
    spenDesenha = teste.hidden ? null : desenha;
    if (!teste.hidden) { inicio = Date.now(); desenha(); }
  }, 'sm outline ppSpenBtn');
  teste.append(el('span', 'ppLbl', 'Enquanto testa, o botão não faz as ações.'), lista);
  box.append(bt, teste);
  return box;
}
function switchRow(label, on, set){
  const row = el('label', 'ppSwitch'); const cb = el('input'); cb.type = 'checkbox'; cb.setAttribute('role', 'switch'); cb.checked = !!on;
  cb.onchange = () => set(cb.checked);
  row.append(el('span', null, label), cb, el('i'));
  return row;
}
function applyFav(f){
  App.setPen(f.k); App.setPenWidth(f.k, f.w); App.setPenColor(f.k, f.color);
  for (const o of Object.keys(App.penOpt(f.k))) if (f[o] !== undefined) App.setPenOpt(f.k, o, f[o]);
  redraw(); montaTrilho();
}
function penPanel(k){
  const P = App.PENS[k], compact = ls.get('le.penCompact', false), cur = stateOf(k), list = favs();
  const isFav = list.some(f => sameCfg(f, cur));
  pop.setAttribute('aria-label', P.label + ': opções');
  pop.style.setProperty('--tc', k === 'marker' ? App.colorOf(App.penColor(k)).hex : App.colorOf(App.penColor(k)).ink);
  // cabeçalho: favoritos, guardar, compacto e fechar
  const head = el('div', 'ppHead');
  head.append(iconBtn('ppFavList' + (showFavs ? ' on' : ''), 'Ver favoritos', PEN_STAR, () => { showFavs = !showFavs; redraw(); }),
    iconBtn('ppStar' + (isFav ? ' on' : ''), isFav ? 'Tirar dos favoritos' : 'Guardar nos favoritos', STAR(isFav), () => {
      const next = isFav ? list.filter(f => !sameCfg(f, cur)) : [cur, ...list].slice(0, 8);
      ls.set('le.penFavs', next); if (!isFav) showFavs = true; montaTrilho();
      App.toast(isFav ? 'Tirado dos favoritos' : 'Guardado nos favoritos'); redraw();
    }),
    el('span', 'ppTitle', P.label),
    iconBtn('ppCompact', compact ? 'Mostrar todas as opções' : 'Painel compacto', App.icon(compact ? 'expand' : 'shrink'), () => { ls.set('le.penCompact', !compact); redraw(); }),
    iconBtn('ppClose', 'Fechar', App.icon('x'), closePenPop));
  pop.append(head);
  if (showFavs) {
    const row = el('div', 'ppFavs');
    if (!list.length) row.append(el('span', 'ppHint', 'Toque na estrela para guardar esta configuração.'));
    list.forEach(f => {
      const b = el('button', 'ppFav' + (sameCfg(f, cur) ? ' on' : '')); b.type = 'button';
      b.title = `${App.PENS[f.k].label} · ${f.w}`; b.setAttribute('aria-label', b.title);
      const d = el('span'); d.style.background = f.color; d.style.height = Math.max(3, Math.min(14, f.w * (f.k === 'marker' ? 0.6 : 1.6))) + 'px';
      if (f.k === 'marker') d.style.opacity = '.55';
      b.append(d); b.onclick = () => applyFav(f); row.append(b);
    });
    pop.append(row);
  }
  // tipos de ponta
  const tips = el('div', 'ppTips');
  App.PEN_TIPS[k].forEach(([id, label]) => {
    const b = el('button', 'ppTip' + (cur.tip === id ? ' on' : '')); b.type = 'button'; b.title = label; b.setAttribute('aria-label', label);
    b.setAttribute('aria-pressed', String(cur.tip === id)); b.dataset.tip = id; b.innerHTML = tipArt(id);
    b.onclick = () => { App.setPenOpt(k, 'tip', id); redraw(); };
    tips.append(b);
  });
  pop.append(tips);
  const pv = preview(k);
  if (!compact) pop.append(pv);
  pop.append(stepRow('ppWidth', 'Espessura', P.min, P.max, k === 'marker' ? 0.5 : 0.1, () => App.penWidth(k), v => { App.setPenWidth(k, v); pv.paint(); }, v => v.toFixed(1)));
  if (k === 'marker') pop.append(stepRow('ppOpacity', 'Opacidade', 10, 100, 1, () => App.penOpt(k, 'opacity'), v => { App.setPenOpt(k, 'opacity', v); pv.paint(); }, v => v + '%'));
  if (compact) return;
  pop.append(stepRow('ppSmooth', 'Estabilizar o traço', 0, 10, 1, () => App.penOpt(k, 'smooth'), v => App.setPenOpt(k, 'smooth', v), v => v ? String(v) : 'não', 1));
  if (k === 'pen') {
    const lines = el('div', 'ppLines');
    App.PEN_LINES.forEach(([id, label]) => {
      const b = el('button', 'ppLine' + (cur.line === id ? ' on' : '')); b.type = 'button'; b.title = label; b.setAttribute('aria-label', label); b.dataset.line = id;
      b.setAttribute('aria-pressed', String(cur.line === id));
      b.innerHTML = `<svg viewBox="0 0 44 16" width="44" height="16" fill="none" stroke="currentColor" stroke-linecap="round">${LINE_ART[id]}</svg>`;
      b.onclick = () => { App.setPenOpt(k, 'line', id); redraw(); };
      lines.append(b);
    });
    pop.append(lines);
  }
  if (k === 'pen' && cur.tip === 'ball') pop.append(switchRow('Sensível à pressão (S Pen)', cur.pressao, v => { App.setPenOpt(k, 'pressao', v); pv.paint(); redraw(); }));
  pop.append(switchRow('Endireitar as linhas', cur.straight, v => { App.setPenOpt(k, 'straight', v); redraw(); }));
  if (k === 'marker') pop.append(switchRow('Ajustar a espessura ao texto', cur.fit, v => { App.setPenOpt(k, 'fit', v); redraw(); }));
  pop.append(switchRow('Segurar no fim vira reta ou forma', cur.shapes, v => { App.setPenOpt(k, 'shapes', v); redraw(); }));
  pop.append(switchRow('Só a caneta stylus desenha', state.penSeen, v => { state.penSeen = v; ls.set('le.penSeen', v); App.toast(v ? 'Só a caneta stylus desenha; o dedo rola a página.' : 'O dedo também desenha.'); }));
  pop.append(spenBox());
  colorRow(k, cur.color);
}
function colorRow(k, curC){
  const rec = recents(), base = k === 'marker' ? App.COLORS.map(c => c.hex.toLowerCase()) : slots(), pages = [rec.includes(curC) || !base.includes(curC) && rec.length ? rec : base, ...COLOR_PAGES];
  if (colorPage === null || colorPage >= pages.length) colorPage = Math.max(0, pages.findIndex(p => p.includes(curC)));
  const row = el('div', 'ppColors');
  pages[colorPage].slice(0, 8).forEach(hex => {
    const b = el('button', 'ppColor' + (hex === curC ? ' on' : '')); b.type = 'button'; b.style.setProperty('--c', hex); b.dataset.hex = hex; b.title = hex; b.setAttribute('aria-label', `Cor ${hex}`);
    if (hex === curC) b.append(App.icon('check'));
    b.onclick = () => { App.setPenColor(k, hex); addRecent(hex); redraw(); };
    row.append(b);
  });
  const anchor = anchorEl, done = hex => { App.setPenColor(k, hex); addRecent(hex); App.penOptions(anchor); };
  if (window.EyeDropper) row.append(iconBtn('ppColorTool', 'Conta-gotas: pegar uma cor da tela', DROPPER, async () => {
    try { const r = await new window.EyeDropper().open(); if (r && HEX.test(r.sRGBHex)) { App.setPenColor(k, r.sRGBHex.toLowerCase()); addRecent(r.sRGBHex.toLowerCase()); redraw(); } } catch {}
  }));
  const more = iconBtn('ppColorTool ppMore', 'Mais cores', '', () => openPicker(more, curC, done));
  row.append(more);
  pop.append(row);
  const dots = el('div', 'ppPages');
  pages.forEach((_, i) => {
    const b = el('button', 'ppPage' + (i === colorPage ? ' on' : '') + (i ? '' : ' recent')); b.type = 'button';
    const t = i ? `Cores ${i}` : 'Cores recentes'; b.title = t; b.setAttribute('aria-label', t);
    b.onclick = () => { colorPage = i; redraw(); };
    dots.append(b);
  });
  pop.append(dots);
}
function eraserOpts(){
  pop.setAttribute('aria-label', 'Borracha');
  const head = el('div', 'ppHead');
  head.append(el('span', 'ppTitle', 'Borracha'), iconBtn('ppClose', 'Fechar', App.icon('x'), closePenPop));
  pop.append(head);
  const modes = el('div', 'ppModes'); modes.setAttribute('role', 'radiogroup'); modes.setAttribute('aria-label', 'Modo da borracha');
  const mode = () => ls.get('le.eraseMode', 'stroke');
  const sizeRow = el('div', 'ppRow');
  [['stroke', 'Borracha de traço', 'apaga o traço inteiro ao tocar nele'], ['area', 'Borracha de área', 'apaga só o pedaço sob a borracha']].forEach(([id, t, sub]) => {
    const b = el('button', 'ppMode' + (mode() === id ? ' on' : '')); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(mode() === id));
    const txt = el('span', 'ppModeTxt'); txt.append(el('strong', null, t), el('small', null, sub));
    b.append(el('i', 'ppRadio'), txt);
    b.onclick = () => { ls.set('le.eraseMode', id); App.updatePenBtn(); redraw(); };
    modes.append(b);
  });
  pop.append(modes);
  const range = el('input'); range.type = 'range'; range.min = 6; range.max = 60; range.step = 1; range.value = ls.get('le.eraseSize', 18);
  range.setAttribute('aria-label', 'Tamanho da borracha');
  const val = el('span', 'ppVal', range.value);
  range.oninput = () => { ls.set('le.eraseSize', +range.value); val.textContent = range.value; App.updatePenBtn(); };
  sizeRow.append(el('span', 'ppLbl', 'Tamanho'), range, val); sizeRow.hidden = mode() !== 'area';
  pop.append(sizeRow);
  const only = ls.get('le.eraseOnlyMarker', false);
  pop.append(switchRow('Apagar somente marca-texto', only, v => { ls.set('le.eraseOnlyMarker', v); redraw(); }));
  const clear = App.btn(only ? 'Apagar todo o marca-texto da página' : 'Apagar toda a escrita à mão da página', () => {
    const pg = state.currentPage || 1, alvo = h => h.kind === 'ink' && (!only || h.marker);
    if (!state.highlights.some(h => alvo(h) && h.parts.some(p => p.page === pg))) { App.toast(only ? 'Não há marca-texto à mão nesta página.' : 'Não há escrita à mão nesta página.'); return; }
    App.snapshot();
    for (const h of state.highlights) if (alvo(h)) h.parts = h.parts.filter(p => p.page !== pg);
    state.highlights = state.highlights.filter(h => h.kind !== 'ink' || h.parts.length);
    App.renderPageAnnots(state.pages[pg - 1]); App.renderPanel(); App.saveDocSoon(); App.emit('hl:changed');
    closePenPop(); App.toast(`${only ? 'Marca-texto' : 'Escrita à mão'} da página ${pg} apagado — Ctrl+Z desfaz`);
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

// ---------- Círculo da borracha e prévia da ponta (mouse e S Pen pairando sobre a página) ----------
const ring = el('div', 'eraserRing'); ring.hidden = true; document.body.append(ring);
addEventListener('pointermove', e => {
  const dl = e.target.closest?.('.drawLayer'), erase = state.tool === 'erase' && ls.get('le.eraseMode', 'stroke') === 'area';
  const ink = state.tool === 'ink' && e.pointerType !== 'touch' && !e.buttons;
  const show = !!dl && (erase || ink);
  ring.hidden = !show; if (!show) return;
  let s = ls.get('le.eraseSize', 18);
  if (ink) { const pg = state.pages[+dl.parentElement.dataset.page - 1]; s = Math.max(3, App.penWidth() * dl.getBoundingClientRect().width / pg.base.w); }
  ring.classList.toggle('inkRing', ink);
  ring.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - s / 2}px;top:${e.clientY - s / 2}px`;
  if (ink) { const c = App.colorOf(App.penColor()); ring.style.setProperty('--rc', state.pen === 'marker' ? c.hex : c.ink); }
}, { passive: true });
// [ e ] mudam a espessura da ferramenta atual
addEventListener('keydown', e => {
  if ((e.key !== '[' && e.key !== ']') || state.tool !== 'ink' || e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input,textarea,[contenteditable]')) return;
  const P = App.PENS[state.pen], step = state.pen === 'marker' ? 2 : 0.4, w = Math.max(P.min, Math.min(P.max, App.penWidth() + (e.key === ']' ? step : -step)));
  e.preventDefault(); App.setPenWidth(state.pen, w); App.toast(`${P.label}: espessura ${w.toFixed(1)}`);
});

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
    const paths = its.map(it => pathsOf(h, it.pi)[it.k].map(([x, y, ...resto]) => [+Math.min(1, x + dx).toFixed(4), +Math.min(1, y + dy).toFixed(4), ...resto]));
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
      // pontos novos (os antigos ficam como estavam, para o desfazer)
      for (const it of sel.items) {
        const paths = pathsOf(it.h, it.pi);
        paths[it.k] = paths[it.k].map(q => [+(q[0] + d[0]).toFixed(4), +(q[1] + d[1]).toFixed(4), ...q.slice(2)]);
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
