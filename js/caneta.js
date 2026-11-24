/* Caneta e S Pen: caneta e marca-texto (cor, espessura, ponta), desenho na página (traço, borracha, área, laço),
   rejeição da palma e o botão da S Pen (no ar e segurando na tela). */
(() => {
'use strict';
const App = window.App;
const { $, $$, el, ls, state, SVGNS, clamp01, distSeg } = App;
// aparência do traço (traco.js) e grifos (grifos.js), já carregados
const { paintInk, detectShape, inkNow, simplify, commitInk, createAreaHighlight, createNote, hitTest, snapshot, drawPageAnnots: renderPageAnnots } = App;
const viewer = $('#viewer'), pagesEl = $('#pages');
// partes do núcleo (core.js), chamadas na hora do uso
function closePopup(...a){ return App.closePopup(...a); }
function showEditPopup(...a){ return App.editHl(...a); }

// ---------- Caneta: caneta e marca-texto (cada um com cor e espessura próprias) e caneta stylus ----------
const PENS = App.PENS = {
  pen:    { label: 'Caneta', min: 0.6, max: 9, def: 2.4 },
  marker: { label: 'Marca-texto', min: 5, max: 40, def: 14, marker: true },
};
{ // versões antigas guardavam fina/média/grossa
  const old = ls.get('le.pen', 'pen'), W = { fine: 1.3, mid: 2.4, bold: 4.5 };
  if (W[old]) { if (ls.get('le.penW', null) == null) ls.set('le.penW', W[old]); ls.set('le.pen', 'pen'); }
}
state.pen = PENS[ls.get('le.pen', 'pen')] ? ls.get('le.pen', 'pen') : 'pen';
const penKey = (k, what) => `le.${k === 'marker' ? 'marker' : 'pen'}${what}`;
App.penWidth = (k = state.pen) => { const P = PENS[k]; const w = +ls.get(penKey(k, 'W'), P.def); return Math.max(P.min, Math.min(P.max, w || P.def)); };
App.setPenWidth = (k, w) => { ls.set(penKey(k, 'W'), +(+w).toFixed(2)); App.updatePenBtn(); };
App.penColor = (k = state.pen) => ls.get(penKey(k, 'Color'), null) || (k === 'marker' ? (App.COLORS[0] && App.COLORS[0].id) : state.color);
App.setPenColor = (k, c) => { ls.set(penKey(k, 'Color'), c); App.buildPalette(); App.updatePenBtn(); };
// tipo de ponta, estilo da linha e demais ajustes de cada ferramenta
App.PEN_TIPS = {
  pen: [['ball', 'Esferográfica'], ['fountain', 'Caneta-tinteiro'], ['callig', 'Caligráfica'], ['pencil', 'Lápis'], ['brush', 'Pincel']],
  marker: [['chisel', 'Ponta chanfrada'], ['round', 'Ponta redonda']],
};
App.PEN_LINES = [['solid', 'Linha contínua'], ['taper', 'Linha afinada nas pontas'], ['dash', 'Linha tracejada'], ['dot', 'Linha pontilhada']];
const PEN_OPTS = { pen: { tip: 'ball', line: 'solid', straight: false, smooth: 0, shapes: false, pressao: false }, marker: { tip: 'chisel', opacity: 45, straight: false, fit: false, smooth: 0, shapes: false } };
App.penOpt = (k, o) => { const v = { ...PEN_OPTS[k], ...ls.get(penKey(k, 'Opts'), {}) }; return o ? v[o] : v; };
App.setPenOpt = (k, o, val) => { ls.set(penKey(k, 'Opts'), { ...ls.get(penKey(k, 'Opts'), {}), [o]: val }); App.updatePenBtn(); };
// o que fica guardado no traço: só o que difere do padrão (traços antigos continuam iguais)
App.penStyle = (k = state.pen) => {
  const o = App.penOpt(k), s = { marker: k === 'marker' };
  if (o.tip !== PEN_OPTS[k].tip) s.tip = o.tip;
  if (k === 'pen' && o.line !== 'solid') s.line = o.line;
  // esferográfica sensível à pressão (opção): a espessura acompanha a força da caneta
  if (k === 'pen' && o.pressao && o.tip === 'ball') s.pressao = true;
  if (k === 'marker' && o.opacity !== PEN_OPTS.marker.opacity) s.opacity = o.opacity;
  return s;
};
App.curPen = () => { const o = App.penOpt(state.pen); return { w: App.penWidth(), color: App.penColor(), straight: o.straight, fit: !!o.fit, smooth: +o.smooth || 0, shapes: !!o.shapes, ...App.penStyle() }; };
// com caneta stylus (S Pen etc.): só a caneta desenha, o dedo rola a página
state.penSeen = ls.get('le.penSeen', false);
App.setPen = id => {
  if (!PENS[id]) return;
  state.pen = id; ls.set('le.pen', id);
  if (state.tool !== 'ink') App.setTool('ink'); else { App.buildPalette(); App.updatePenBtn(); }
};
App.updatePenBtn = () => {
  const ink = state.tool === 'ink';
  $$('[data-penkind]').forEach(b => b.classList.toggle('on', ink && b.dataset.penkind === state.pen));
  const b = $('#btnPenOpts'); if (!b) return;
  const erase = state.tool === 'erase';
  const P = PENS[state.pen], w = App.penWidth();
  b.classList.toggle('marker', ink && !!P.marker);
  b.classList.toggle('eraserOpts', erase);
  b.style.setProperty('--pw', (erase ? Math.max(3, Math.min(14, ls.get('le.eraseSize', 18) / 2.5)) : Math.max(2, Math.min(12, w * (P.marker ? 0.55 : 1.5)))) + 'px');
  b.style.setProperty('--pc', erase ? 'currentColor' : App.colorOf(App.penColor()).ink);
  b.title = erase ? 'Borracha: modo e opções' : `${P.label}: ponta, espessura e cor`;
};
App.penMenu = anchor => App.penOptions?.(anchor);
addEventListener('pointerdown', e => {
  if (e.pointerType !== 'pen' || state.penSeen) return;
  state.penSeen = true; ls.set('le.penSeen', true);
  if (state.pdf) App.toast('Caneta stylus detectada: com a Caneta, só ela desenha e o dedo rola a página.');
}, true);
App.setStyle = s => {
  state.style = s; ls.set('le.style', s);
  $$('[data-style]').forEach(b => b.classList.toggle('on', b.dataset.style === s));
};


// ---------- Área e caneta ----------
let drawing = null;
// última vez que a caneta deu sinal (pairando ou encostada) e onde estava
let penUlt = -1e9;
App.penPos = null;
for (const tipo of ['pointerdown', 'pointermove', 'pointerup']) addEventListener(tipo, e => {
  if (e.pointerType !== 'pen') return;
  penUlt = performance.now(); App.penPos = { x: e.clientX, y: e.clientY, t: penUlt };
}, { capture: true, passive: true });
App.penRecente = (ms = 700) => performance.now() - penUlt < ms;
App.penOcupada = () => !!drawing || App.penRecente(1200);
// mão apoiada na tela: com a caneta por perto (ou um toque largo, de palma) o toque não rola nem desenha
const ehPalma = e => e.pointerType === 'touch' && state.penSeen && penTools.has(state.tool) && (App.penRecente(700) || Math.max(e.width || 0, e.height || 0) > 48);
// posição do evento na página (frações 0–1); com a página girada, a conversão considera a rotação
const normPt = (e, r) => { if (r.rot) { const [x, y] = App.telaParaPagina(r.el, e.clientX, e.clientY, r.caixa); return [clamp01(x), clamp01(y)]; } return [clamp01((e.clientX - r.left) / r.width), clamp01((e.clientY - r.top) / r.height)]; };
// botão lateral: pelo navegador (botões 2/32) ou pelo app de Android, que lê o botão direto da caneta (spenNativo)
let spenNativo = false;
const isSidePen = e => e.pointerType === 'pen' && (e.button === 2 || e.button === 5 || !!(e.buttons & 34) || spenNativo);
const penTools = new Set(['ink', 'erase', 'lasso']);

// ---------- Botão da S Pen (configurável) ----------
// "ar": apertar o botão com a caneta perto da tela, sem encostar; "tela": segurar o botão e passar a caneta na página
App.SPEN_AR = [['desfazer', 'Desfazer'], ['refazer', 'Refazer'], ['borracha', 'Ligar/desligar a borracha'], ['caneta', 'Alternar caneta e texto'],
  ['marcatexto', 'Alternar caneta e marca-texto'], ['proxima', 'Próxima página'], ['anterior', 'Página anterior'], ['nada', 'Nada']];
App.SPEN_TELA = [['borracha', 'Apagar (borracha)'], ['marcatexto', 'Marca-texto'], ['laco', 'Laço (selecionar)'], ['nada', 'Nada']];
App.spen = () => ({ ar: 'desfazer', tela: 'borracha', ...ls.get('le.spen', {}) });
App.setSpen = (k, v) => ls.set('le.spen', { ...App.spen(), [k]: v });
let spenVolta = null; // ferramenta para onde a borracha (ou o texto) volta
App.spenAcao = acao => {
  const antes = { u: App.undoStack.length, r: App.redoStack.length };
  App.calarAvisos(true);
  let feito;
  try { feito = spenFaz(acao); } finally { App.calarAvisos(false); }
  if (!feito) return;
  const aviso = acao === 'desfazer' ? ['undo', antes.u ? 'Desfeito' : 'Nada para desfazer']
    : acao === 'refazer' ? ['redo', antes.r ? 'Refeito' : 'Nada para refazer']
    : acao === 'borracha' ? (state.tool === 'erase' ? ['eraser', 'Borracha'] : ['pen', 'Borracha desligada'])
    : acao === 'caneta' ? (state.tool === 'ink' ? ['pen', PENS[state.pen].label] : ['text', 'Seleção de texto'])
    : acao === 'marcatexto' ? ['highlighter', PENS[state.pen].label] : null;
  if (aviso && !App.spenAviso?.(...aviso)) App.toast(aviso[1]);
};
App.spenBotao = () => spenNativo || spenApertado;
function spenFaz(acao){
  const livro = App.bookOpen?.() || document.body.classList.contains('lendo');
  if (acao === 'proxima' || acao === 'anterior') {
    if (livro) document.dispatchEvent(new KeyboardEvent('keydown', { key: acao === 'proxima' ? 'ArrowRight' : 'ArrowLeft', bubbles: true }));
    else if (state.pdf) App.pageStep(acao === 'proxima' ? 1 : -1);
    return false;
  }
  if (livro || !state.pdf) return false;
  if (acao === 'desfazer') App.undo();
  else if (acao === 'refazer') App.redo();
  else if (acao === 'borracha') {
    if (state.tool === 'erase') { App.setTool(spenVolta && spenVolta !== 'erase' ? spenVolta : 'ink'); App.toast('Borracha desligada'); }
    else { spenVolta = state.tool; App.setTool('erase'); App.toast('Borracha (aperte o botão de novo para voltar)'); }
  } else if (acao === 'caneta') {
    if (state.tool === 'ink') { App.setTool('text'); App.toast('Seleção de texto'); } else { App.setTool('ink'); App.toast(PENS[state.pen].label); }
  } else if (acao === 'marcatexto') {
    App.setPen(state.tool === 'ink' && state.pen === 'marker' ? 'pen' : 'marker'); App.toast(PENS[state.pen].label);
  } else return false;
  return true;
}
// apertar no ar: o Android avisa pela mudança dos botões da caneta (sem contato) ou pelo "menu de contexto" da caneta
// (um clique no ar nunca vem com a caneta encostando: toque na tela nos últimos instantes = é traço, não clique)
let spenApertado = false, spenUltimo = 0, spenToque = 0, spenPendenteNav = false;
let spenViaAndroid = false; // o app de Android avisa o botão: ele é a fonte (o navegador às vezes avisa o mesmo clique)
App.spenNoAr = (nativo) => {
  const agora = Date.now();
  if (App.spenTeste || drawing || (!nativo && spenViaAndroid)) return;
  if (agora - spenUltimo < 120 || (!nativo && agora - spenToque < 400)) return;
  spenUltimo = agora; App.spenAcao(App.spen().ar);
};
// registro do que chega do botão (painel da caneta → "Testar o botão"): mostra se o aparelho avisa e como
App.spenLog = [];
const spenRegistra = (origem, txt) => { App.spenLog.push({ t: Date.now(), origem, txt }); if (App.spenLog.length > 8) App.spenLog.shift(); App.emit('spen:log'); };
// app de Android: o MainActivity avisa quando o botão é apertado ou solto
// "apertar no ar" = apertar e soltar o botão sem encostar; apertar e depois encostar é "segurar na tela"
let spenPendenteNativo = false;
window.vetraSpenBotao = (apertado, encostada) => {
  spenNativo = !!apertado; spenViaAndroid = true;
  spenRegistra('Android', apertado ? (encostada ? 'apertou, encostada na tela' : 'apertou, no ar') : 'soltou');
  if (apertado) { spenPendenteNativo = !encostada; if (encostada) spenConverteTraco(); }
  else { if (spenPendenteNativo) App.spenNoAr(true); spenPendenteNativo = false; }
};
App.spenOuvir = doc => {
  doc.addEventListener('pointermove', e => {
    if (e.pointerType !== 'pen') return;
    if ((e.buttons & 34) && !spenApertado) spenRegistra('navegador', `botão lateral ${e.buttons & 1 ? 'encostada' : 'no ar'} (buttons=${e.buttons})`);
    const lateral = !!(e.buttons & 34);
    if (lateral && !spenApertado) spenPendenteNav = !(e.buttons & 1) && !drawing; // apertou no ar
    if (e.buttons & 1) spenPendenteNav = false;                                     // encostou: é traço
    if (!lateral && spenApertado && spenPendenteNav) App.spenNoAr();               // soltou sem encostar
    if (!lateral) spenPendenteNav = false;
    spenApertado = lateral;
  }, true);
  for (const tipo of ['pointerdown', 'pointerup']) doc.addEventListener(tipo, e => { if (e.pointerType !== 'pen') return; spenToque = Date.now(); if (tipo === 'pointerdown') { spenPendenteNativo = false; spenPendenteNav = false; } if (e.button > 0 || (e.buttons & ~1)) spenRegistra('navegador', `${tipo === 'pointerdown' ? 'encostou' : 'levantou'} (button=${e.button}, buttons=${e.buttons})`); }, true);
  doc.addEventListener('contextmenu', e => { if (e.pointerType !== 'pen') return; spenRegistra('navegador', `menu de contexto (buttons=${e.buttons})`); if (!(e.buttons & 1) && !drawing) { e.preventDefault(); App.spenNoAr(); } }, true);
};
App.spenOuvir(document);
function beginDraw(e, dl, p, rect, start, side){
  if (state.tool === 'note') { createNote(p, start); return null; }
  if (!e.lupa) try { dl.setPointerCapture(e.pointerId); } catch {} // da lupa: o ponteiro fica com ela
  // com caneta stylus, o dedo só rola a página
  if (e.pointerType === 'touch' && state.penSeen && penTools.has(state.tool)) return { type: 'pan', sx: e.clientX, sy: e.clientY, st: viewer.scrollTop, sl: viewer.scrollLeft, cx: e.clientX, cy: e.clientY };
  if (side === 'laco' && App.lassoStart) return App.lassoStart(p, rect, start, dl, e);
  if (side === 'borracha' || (!side && state.tool === 'erase')) { const d = { type: 'erase', p, rect, erased: false, cx: e.clientX, cy: e.clientY, last: start }; eraseAt(d, start); return d; }
  if (!side && state.tool === 'lasso') return App.lassoStart ? App.lassoStart(p, rect, start, dl, e) : null;
  if (state.tool === 'area') {
    const col = App.colorOf(state.color), box = el('div', 'areaPreview');
    box.style.setProperty('--c', col.hex); box.style.setProperty('--ci', col.ink);
    dl.appendChild(box);
    return { type: 'area', p, rect, start, end: start, box, cx: e.clientX, cy: e.clientY };
  }
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${p.base.w} ${p.base.h}`); svg.setAttribute('preserveAspectRatio', 'none');
  // botão da S Pen em "marca-texto": este traço sai com o marca-texto, sem trocar a ferramenta
  const penAntes = state.pen; if (side === 'marcatexto') state.pen = 'marker';
  const path = document.createElementNS(SVGNS, 'path'), P = App.curPen(), pc = App.colorOf(P.color);
  state.pen = penAntes;
  path.style.setProperty('--c', pc.hex); path.style.setProperty('--ci', pc.ink);
  svg.appendChild(path); dl.appendChild(svg);
  const press = e.pointerType === 'pen' && !P.marker && (P.tip === 'fountain' || P.tip === 'brush' || P.pressao);
  const d = { type: 'ink', p, rect, pts: [press ? [...start, +(e.pressure || 0.5).toFixed(2)] : start], svg, path, cx: e.clientX, cy: e.clientY, pen: P, press, far: 0, sm: start, raf: 0, hold: null, holdAt: start, minD: e.pointerType === 'pen' ? 1 : 2 };
  if (P.marker && P.fit) App.pageText(p.num).then(t => { d.textItems = t.items; }).catch(() => {});
  armHold(d); paintStroke(d);
  return d;
}
function paintStroke(d){
  d.raf = 0; const now = inkNow(d);
  const extra = d.pred && !d.shape && !d.pen.straight && !(d.pen.marker && d.pen.fit) ? d.pred.map(q => d.press ? [...q, now.pts[now.pts.length - 1][2] ?? 0.5] : q) : null;
  paintInk(d.path, extra ? now.pts.concat(extra) : now.pts, now.P, d.p.base);
}
function armHold(d){
  clearTimeout(d.hold); d.hold = null;
  if (!d.pen.shapes) return;
  d.hold = setTimeout(() => {
    const s = detectShape(d.pts, d.rect, d.pen); if (!s || drawing !== d) return;
    d.shape = s; navigator.vibrate?.(8); paintStroke(d);
  }, 550);
}
function addInkPoint(d, ev){
  const raw = normPt(ev, d.rect), k = d.pen.smooth ? 1 / (1 + d.pen.smooth * 0.75) : 1;
  d.sm = [d.sm[0] + (raw[0] - d.sm[0]) * k, d.sm[1] + (raw[1] - d.sm[1]) * k];
  const last = d.pts[d.pts.length - 1], px = (a, b) => Math.hypot((a[0] - b[0]) * d.rect.width, (a[1] - b[1]) * d.rect.height);
  d.far = Math.max(d.far, px(raw, d.pts[0]));
  if (px(d.sm, last) < d.minD) return;
  d.pts.push(d.press ? [...d.sm, +(ev.pressure || 0.5).toFixed(2)] : d.sm);
  if (px(raw, d.holdAt) >= 4) { d.holdAt = raw; armHold(d); }
}
function comecarTraco(e){
  const telaS = App.spen().tela, dl = e.target.closest('.drawLayer'), side = isSidePen(e) && telaS !== 'nada' && penTools.has(state.tool) ? telaS : null;
  if (!dl || (e.button !== 0 && !side) || state.tool === 'text') return;
  if (ehPalma(e)) { e.preventDefault(); return; }
  if (drawing) {
    if (e.pointerId === drawing.id) return;
    if (e.pointerType === 'pen' && drawing.kind === 'touch') finishDrawing(e, true); // a caneta tem prioridade sobre a mão apoiada
    else { if (e.pointerType === 'touch' && drawing.kind === 'touch' && drawing.type !== 'pan') finishDrawing(e, true); return; } // dois dedos: é pinça, não traço
  }
  const p = App.paginaDe(+dl.parentElement.dataset.page); if (!p) return;
  if (p.folha && state.tool === 'area') return; // marcar área recorta a imagem do PDF: não há PDF na folha
  const rect = App.retPagina(p.el), start = normPt(e, rect);
  e.preventDefault(); closePopup();
  drawing = beginDraw(e, dl, p, rect, start, side);
  if (drawing) { drawing.id = e.pointerId; drawing.kind = e.pointerType; drawing.t0 = performance.now(); drawing.dl = dl; drawing.side = side; drawing.e0 = { pointerId: e.pointerId, pointerType: e.pointerType, clientX: e.clientX, clientY: e.clientY, pressure: e.pressure }; }
}
function spenConverteTraco(){
  const d = drawing, tela = App.spen().tela;
  if (!d || d.kind !== 'pen' || d.type !== 'ink' || d.side || !d.e0 || performance.now() - d.t0 > 400) return;
  if (tela === 'nada' || !penTools.has(state.tool)) return;
  const pts = d.pts.map(q => [q[0], q[1]]);
  finishDrawing(null, true);
  const nd = beginDraw(d.e0, d.dl, d.p, d.rect, pts[0], tela);
  if (!nd) return;
  Object.assign(nd, { id: d.id, kind: 'pen', t0: d.t0, dl: d.dl, side: tela, e0: d.e0 });
  drawing = nd;
  for (const q of pts.slice(1)) { const [cx, cy] = App.paginaParaTela(d.p.el, q[0], q[1]); moverTraco(nd, q, { clientX: cx, clientY: cy, pressure: 0.5, pointerId: d.id }); }
}
pagesEl.addEventListener('pointerdown', comecarTraco);
// S Pen com o botão lateral já apertado ao encostar: o navegador não manda "pointerdown" (é um botão a mais num
// botão já apertado), só um movimento com o encosto junto; e ao levantar, só um movimento sem o encosto
let penEncostada = false;
pagesEl.addEventListener('pointermove', e => {
  if (e.pointerType !== 'pen') return;
  const encosta = !!(e.buttons & 1), lateral = !!(e.buttons & 34) || spenNativo;
  if (encosta && !penEncostada && lateral && !drawing) comecarTraco(e);
  else if (!encosta && penEncostada && drawing && e.pointerId === drawing.id && drawing.kind === 'pen') finishDrawing(e);
  penEncostada = encosta;
}, true);
pagesEl.addEventListener('contextmenu', e => { if (e.target.closest('.drawLayer') && (drawing || e.pointerType === 'pen')) e.preventDefault(); });
pagesEl.addEventListener('pointermove', e => {
  const d = drawing;
  if (!d || e.pointerId !== d.id) return;
  if (d.type === 'pan') { viewer.scrollTop = d.st - (e.clientY - d.sy); viewer.scrollLeft = d.sl - (e.clientX - d.sx); return; }
  moverTraco(d, normPt(e, d.rect), e);
});
function moverTraco(d, pt, e){
  if (d.type === 'ext') { d.move(pt, e); return; }
  if (d.type === 'erase') {
    // passa também pelos pontos entre um movimento e outro (gesto rápido)
    const [lx, ly] = d.last, dx = (pt[0] - lx) * d.rect.width, dy = (pt[1] - ly) * d.rect.height;
    const steps = Math.min(40, Math.ceil(Math.hypot(dx, dy) / 6));
    for (let k = 1; k <= steps; k++) eraseAt(d, [lx + (pt[0] - lx) * k / steps, ly + (pt[1] - ly) * k / steps]);
    d.last = pt; return;
  }
  if (d.type === 'area') {
    d.end = pt;
    const r = rectFrom(d.start, pt);
    d.box.style.cssText = `left:${r.x * 100}%;top:${r.y * 100}%;width:${r.w * 100}%;height:${r.h * 100}%`;
    return;
  }
  if (d.shape) return;
  // a caneta manda vários pontos por quadro: usa todos, e desenha uma vez por quadro
  const all = e.getCoalescedEvents?.();
  for (const ev of all && all.length ? all : [e]) addInkPoint(d, ev);
  // pontos previstos (para onde a caneta está indo): só na tela, enquanto desenha, para a tinta não ficar atrás da ponta
  const prev = e.getPredictedEvents?.();
  d.pred = prev && prev.length ? prev.slice(0, 2).map(ev => normPt(ev, d.rect)) : null;
  if (!d.raf) d.raf = requestAnimationFrame(() => { if (drawing === d) paintStroke(d); });
}
// borracha: apaga o traço inteiro da caneta que estiver sob o dedo/caneta
// apaga só o pedaço do traço que fica dentro do círculo da borracha (o resto vira traços separados)
function cutPath(pts, x, y, r, b){
  const px = q => [q[0] * b.w, q[1] * b.h], out = [];
  const inside = q => { const c = px(q); return Math.hypot(c[0] - x, c[1] - y) <= r; };
  const at = (A, B, t) => { const q = [+(A[0] + (B[0] - A[0]) * t).toFixed(4), +(A[1] + (B[1] - A[1]) * t).toFixed(4)]; if (A.length > 2 && B.length > 2) q.push(+(A[2] + (B[2] - A[2]) * t).toFixed(2)); return q; };
  if (pts.length === 1) return inside(pts[0]) ? [] : null;
  let cur = inside(pts[0]) ? [] : [pts[0]], changed = !cur.length;
  const flush = () => { if (cur.length > 1) out.push(cur); cur = []; };
  for (let i = 1; i < pts.length; i++) {
    const A = pts[i - 1], B = pts[i], [ax, ay] = px(A), [bx, by] = px(B), dx = bx - ax, dy = by - ay, fx = ax - x, fy = ay - y;
    const qa = dx * dx + dy * dy, qb = 2 * (fx * dx + fy * dy), qc = fx * fx + fy * fy - r * r, disc = qb * qb - 4 * qa * qc;
    const t1 = qa && disc > 0 ? (-qb - Math.sqrt(disc)) / (2 * qa) : 2, t2 = qa && disc > 0 ? (-qb + Math.sqrt(disc)) / (2 * qa) : -1;
    if (t2 <= 0 || t1 >= 1) { cur.push(B); continue; }
    changed = true;
    if (t1 > 0) cur.push(at(A, B, t1));
    flush();
    if (t2 < 1) cur = [at(A, B, t2), B];
  }
  flush();
  return changed ? out : null;
}
function eraseAt(d, [x, y]){
  const p = d.p, b = p.base, tol = 9 / Math.max(0.5, state.scale);
  const partial = ls.get('le.eraseMode', 'stroke') === 'area', rr = ls.get('le.eraseSize', 18) / 2 / Math.max(0.3, state.scale);
  const onlyMarker = ls.get('le.eraseOnlyMarker', false);
  let changed = false;
  for (const h of [...state.highlights]) {
    if (h.kind !== 'ink' || (onlyMarker && !h.marker)) continue;
    let hit = false;
    for (const part of h.parts) {
      if (part.page !== p.num) continue;
      if (partial) {
        const r = rr + (h.width || 2.4) / 2;
        let any = false; const next = [];
        for (const pts of part.paths) { const cut = cutPath(pts, x * b.w, y * b.h, r, b); if (cut) { any = true; next.push(...cut); } else next.push(pts); }
        if (!any) continue;
        if (!d.erased && !changed) snapshot();
        part.paths = next; changed = hit = true;
        continue;
      }
      const w = (h.width || 2.4) / 2 + tol;
      const keep = part.paths.filter(pts => {
        for (let k = 0; k < pts.length; k++) {
          const a = pts[k], c = pts[Math.min(k + 1, pts.length - 1)];
          if (distSeg(x * b.w, y * b.h, a[0] * b.w, a[1] * b.h, c[0] * b.w, c[1] * b.h) <= w) return false;
        }
        return true;
      });
      if (keep.length === part.paths.length) continue;
      if (!d.erased && !changed) snapshot();
      part.paths = keep; changed = hit = true;
    }
    if (hit && h.parts.every(pt => !pt.paths || !pt.paths.length)) state.highlights = state.highlights.filter(x => x !== h);
  }
  if (changed) { d.erased = true; if (!d.raf) d.raf = requestAnimationFrame(() => { d.raf = 0; renderPageAnnots(p); }); }
}
const rectFrom = (a, b) => ({ x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]) });
function finishDrawing(e, cancel){
  if (!drawing) return;
  const d = drawing; drawing = null;
  if (d.type === 'pan') return;
  if (d.type === 'ext') { d.end(e, cancel); return; }
  if (d.type === 'erase') { if (d.raf) { cancelAnimationFrame(d.raf); d.raf = 0; renderPageAnnots(d.p); } if (d.erased) { App.renderPanelSoon(); App.saveDocSoon(); App.emit('hl:changed'); } return; }
  if (d.type === 'ink') { clearTimeout(d.hold); cancelAnimationFrame(d.raf); }
  (d.box || d.svg).remove();
  if (cancel) return;
  const tap = d.type === 'ink' ? d.far < 4 : Math.hypot(e.clientX - d.cx, e.clientY - d.cy) < 4;
  if (tap) {
    const h = d.kind === 'pen' && d.type === 'ink' ? null : hitTest(d.p.el, e.clientX, e.clientY);
    if (h) showEditPopup(h, e.clientX, e.clientY);
    // toque da caneta (ou clique no vazio) faz um ponto: pingo do i, ponto final
    else if (d.type === 'ink' && d.kind !== 'touch' && !d.pen.marker) commitInk(d.p, [d.pts[0]], { ...d.pen, width: d.pen.w });
    return;
  }
  if (d.type === 'area') {
    const r = rectFrom(d.start, d.end);
    if (r.w * d.rect.width < 6 || r.h * d.rect.height < 6) return;
    createAreaHighlight(d.p, r);
  } else {
    if (!d.shape && d.pen.smooth) d.pts.push(normPt(e, d.rect)); // o fim do traço fica onde a caneta parou
    const now = inkNow(d); commitInk(d.p, d.shape ? now.pts : simplify(now.pts, d.rect, now.P), now.P);
  }
}
pagesEl.addEventListener('pointerup', e => { if (drawing && e.pointerId === drawing.id) finishDrawing(e); });
pagesEl.addEventListener('pointercancel', e => { if (drawing && e.pointerId === drawing.id) finishDrawing(e, true); });

// lupa de escrita (lupa.js): o traço feito nela entra pelo mesmo caminho do desenho na página
App.lupaTraco = {
  inicio: e => comecarTraco(e),
  move: e => { const d = drawing; if (!d || e.pointerId !== d.id || d.type === 'pan') return; moverTraco(d, normPt(e, d.rect), e); },
  fim: (e, cancela) => { if (drawing && e.pointerId === drawing.id) finishDrawing(e, cancela); },
  atual: () => drawing,
};
App.updatePenBtn(); // botão da caneta já com a cor e a espessura guardadas
})();
