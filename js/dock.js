/* Barra flutuante de marcação: arrastar para qualquer lugar (fica em pé encostada na lateral) e recolher. */
(() => {
'use strict';
const App = window.App;
const { $, ls, state } = App;

const dock = $('#dock'), stage = $('#stage'), grip = $('#dockGrip');
const EDGE = 90;   // distância da lateral para virar vertical
const MARGIN = 10;
let pos = ls.get('le.dockPos', null); // { x, y } = centro em frações da área de leitura; v = vertical

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const viewerScrollbar = () => { const v = $('#viewer'); return v.offsetWidth - v.clientWidth; };
// não deixa a barra ficar por cima da cápsula de página/zoom (canto inferior direito)
function limitTop(left, top, dw, dh){
  const pg = $('#pager');
  if (!pg || !pg.offsetParent || !pg.closest('#stage')) return top;
  const pl = pg.offsetLeft, pt = pg.offsetTop, pr = pl + pg.offsetWidth;
  const overlapX = left < pr && left + dw > pl;
  return overlapX ? Math.max(MARGIN, Math.min(top, pt - dh - 8)) : top;
}

function place(){
  if (dock.parentElement && dock.parentElement.id === 'topStrip') return;
  dock.classList.toggle('vertical', !!(pos && pos.v));
  if (!pos) {
    dock.classList.remove('moved');
    dock.style.left = dock.style.top = dock.style.bottom = dock.style.transform = '';
    return;
  }
  dock.classList.add('moved');
  const sw = stage.clientWidth - viewerScrollbar(), sh = stage.clientHeight;
  const dw = dock.offsetWidth, dh = dock.offsetHeight;
  const left = clamp(pos.x * sw - dw / 2, MARGIN, Math.max(MARGIN, sw - dw - MARGIN));
  const top = limitTop(left, clamp(pos.y * sh - dh / 2, MARGIN, Math.max(MARGIN, sh - dh - MARGIN)), dw, dh);
  Object.assign(dock.style, { left: left + 'px', top: top + 'px', bottom: 'auto', transform: 'none' });
}
App.placeDock = place;

// ---------- Arrastar ----------
let drag = null;
grip.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  e.preventDefault();
  const r = dock.getBoundingClientRect();
  drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false, sx: e.clientX, sy: e.clientY, id: e.pointerId };
  dock.classList.add('dragging');
});
const overTop = e => e.clientY < stage.getBoundingClientRect().top + 4;
addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 3) return;
  drag.moved = true;
  // presa no topo: puxar para baixo solta a barra, que segue o dedo/mouse
  if (inStrip(dock)) {
    if (e.clientY < strip.getBoundingClientRect().bottom + 14) return;
    ls.set('le.dockTop', false); applyTop(true);
    drag.dx = 18; drag.dy = dock.offsetHeight / 2;
  }
  // levando até o topo: mostra onde ela vai encaixar
  document.body.classList.toggle('strip-drop', canTop() && overTop(e));
  const sr = stage.getBoundingClientRect(), sw = stage.clientWidth - viewerScrollbar();
  const x = e.clientX - sr.left;
  // encostou na lateral: barra em pé (muda o tamanho, então recalcula o ponto de pega)
  const vertical = x < EDGE || x > sw - EDGE;
  if (vertical !== dock.classList.contains('vertical')) {
    dock.classList.toggle('vertical', vertical);
    drag.dx = Math.min(drag.dx, dock.offsetWidth - 10); drag.dy = 18;
  }
  const dw = dock.offsetWidth, dh = dock.offsetHeight;
  const left = clamp(e.clientX - sr.left - drag.dx, MARGIN, sw - dw - MARGIN);
  const top = limitTop(left, clamp(e.clientY - sr.top - drag.dy, MARGIN, stage.clientHeight - dh - MARGIN), dw, dh);
  dock.classList.add('moved');
  Object.assign(dock.style, { left: left + 'px', top: top + 'px', bottom: 'auto', transform: 'none' });
  drag.pos = { x: (left + dw / 2) / sw, y: (top + dh / 2) / stage.clientHeight, v: vertical };
});
const endDrag = e => {
  if (!drag || (e && e.pointerId !== drag.id)) return;
  dock.classList.remove('dragging');
  const drop = document.body.classList.contains('strip-drop');
  document.body.classList.remove('strip-drop');
  if (drop && e && e.type === 'pointerup') { drag = null; App.setBarTop('dock', true); return; }
  if (drag.moved && drag.pos) { pos = drag.pos; ls.set('le.dockPos', pos); }
  drag = null;
};
addEventListener('pointerup', endDrag);
addEventListener('pointercancel', endDrag);
grip.addEventListener('dblclick', () => {
  if (inStrip(dock)) { App.setBarTop('dock', false); return; }
  pos = null; ls.set('le.dockPos', null); place();
  App.toast('Barra de ferramentas de volta ao lugar');
});
new ResizeObserver(() => { if (pos) place(); }).observe(stage);

// ---------- Recolher ----------
function setMin(on){
  if (inStrip(dock)) { if (on) App.toast('Presa no topo, a barra fica sempre aberta — arraste-a para baixo para soltar'); return; }
  dock.classList.toggle('min', on);
  ls.set('le.dockMin', on);
  $('#dockToggle').title = 'Recolher a barra (T)';
  requestAnimationFrame(place);
}
App.toggleDock = () => setMin(!dock.classList.contains('min'));
$('#dockToggle').onclick = () => setMin(true);
$('#dockMini').onclick = () => setMin(false);
$('#dockToggle').onmousedown = $('#dockMini').onmousedown = e => e.preventDefault();

// a bolinha da barra recolhida mostra a cor atual
const updateMini = () => {
  const c = App.colorOf(state.color);
  $('#miniSwatch').style.setProperty('--c', c.hex);
  $('#dockMini').title = `${App.labelOf(c.id)} — mostrar as ferramentas (T)`;
};
const build = App.buildPalette;
App.buildPalette = () => { build(); updateMini(); };

// a barra e o controle de página nunca ficam um por cima do outro: se não cabem lado a lado, o controle sobe
const pager = $('#pager'); let collideRaf = 0;
const checkCollide = () => {
  collideRaf = 0;
  const a = dock.getBoundingClientRect(), b = pager.getBoundingClientRect();
  const hit = a.width > 0 && b.width > 0 && !inStrip(dock) && !inStrip(pager) && !dock.classList.contains('moved') && a.right + 8 > b.left && b.right + 8 > a.left;
  document.body.classList.toggle('pager-up', hit);
};
const reqCollide = () => { if (!collideRaf) collideRaf = requestAnimationFrame(checkCollide); };
if (pager) {
  const ro = new ResizeObserver(reqCollide); ro.observe(dock); ro.observe(pager);
  new MutationObserver(reqCollide).observe(dock, { attributes: true, attributeFilter: ['class', 'style'] });
  addEventListener('resize', reqCollide);
}

// ---------- Barras presas no topo ----------
// a barra de marcação e o controle de página podem morar numa faixa logo abaixo da barra superior
// (tablet e computador; no celular continuam flutuando, que é onde cabem)
function inStrip(n){ return !!n && n.parentElement === strip; }
const strip = $('#topStrip');
const spot = n => { const c = document.createComment(n.id + ' (lugar flutuante)'); n.before(c); return c; };
const homeDock = spot(dock), homePager = spot(pager);
const phoneMQ = matchMedia('(max-width:700px)');
const KEY = { dock: 'le.dockTop', pager: 'le.pagerTop' };
const wantTop = k => !!ls.get(KEY[k], false);
const canTop = () => !phoneMQ.matches && !document.body.classList.contains('focus') && !document.body.classList.contains('tb-auto');
function applyTop(keepPos){
  const ok = canTop(), dT = ok && wantTop('dock'), pT = ok && wantTop('pager');
  if (dT && !inStrip(dock)) {
    strip.prepend(dock);
    dock.classList.remove('min', 'moved', 'vertical');
    dock.style.left = dock.style.top = dock.style.bottom = dock.style.transform = '';
  } else if (!dT && inStrip(dock)) {
    homeDock.after(dock);
    if (!keepPos) { dock.classList.toggle('min', ls.get('le.dockMin', false)); place(); }
  }
  if (pT && !inStrip(pager)) strip.append(pager);
  else if (!pT && inStrip(pager)) homePager.after(pager);
  strip.hidden = !(dT || pT);
  requestAnimationFrame(() => document.body.style.setProperty('--strip-h', strip.offsetHeight + 'px'));
  document.body.classList.toggle('strip-on', dT || pT);
  reqCollide();
}
App.setBarTop = (k, on) => {
  ls.set(KEY[k], !!on);
  applyTop();
  const nome = k === 'dock' ? 'Barra de marcação' : 'Controle de página';
  if (on && !canTop()) App.toast(phoneMQ.matches ? `${nome}: no celular as barras ficam flutuando (vale no tablet e no computador)` : `${nome} vai para o topo quando sair da tela cheia`);
  else App.toast(on ? `${nome} presa no topo` : `${nome} flutuando de novo`);
  App.refreshPins?.();
};
// posição do controle de página: esquerda, centro ou direita (flutuando e preso no topo)
const pagerAlign = () => { const a = ls.get('le.pagerAlign', 'right'); return ['left', 'center', 'right'].includes(a) ? a : 'right'; };
const applyAlign = () => { const a = pagerAlign(); document.body.classList.toggle('pager-c', a === 'center'); document.body.classList.toggle('pager-l', a === 'left'); reqCollide(); };
App.setPagerAlign = a => { ls.set('le.pagerAlign', a); applyAlign(); App.refreshPins?.(); };
App.pagerAlign = pagerAlign;
applyAlign();
App.toggleBarTop = k => App.setBarTop(k, !wantTop(k));
App.barTop = wantTop;
// clique direito (ou toque longo) na barra: escolher onde ela fica
function placeMenu(k, e){
  const top = wantTop(k);
  e.preventDefault();
  App.popMenu({ getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY, width: 1, height: 1 }) }, [
    { icon: 'pin', label: top ? 'Deixar flutuando sobre a página' : 'Prender na barra de cima', on: () => App.setBarTop(k, !top) },
    ...(k === 'pager' ? [{ sep: true }, ...[['left', 'À esquerda'], ['center', 'No centro'], ['right', 'À direita']].map(([a, l]) => ({ icon: a === 'center' ? 'fit' : a === 'left' ? 'left' : 'right', label: l, checked: pagerAlign() === a, on: () => App.setPagerAlign(a) }))] : []),
    ...(k === 'dock' && !top && pos ? [{ icon: 'restore', label: 'Voltar ao lugar padrão', on: () => { pos = null; ls.set('le.dockPos', null); place(); } }] : []),
  ], { title: k === 'dock' ? 'Barra de marcação' : 'Controle de página' });
}
dock.addEventListener('contextmenu', e => { if (e.target.closest('button:not(.dockGrip), .swatch, input')) return; placeMenu('dock', e); });
pager.addEventListener('contextmenu', e => { if (e.target.closest('input')) return; placeMenu('pager', e); });
phoneMQ.addEventListener?.('change', () => applyTop());
new ResizeObserver(() => document.body.style.setProperty('--strip-h', strip.offsetHeight + 'px')).observe(strip);
new MutationObserver(() => { if (canTop() !== !!strip.dataset.can) { strip.dataset.can = canTop() ? '1' : ''; applyTop(); } }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

App.initDock = () => {
  strip.dataset.can = canTop() ? '1' : '';
  applyTop();
  App.on('tool:changed', reqCollide);
  updateMini();
  dock.classList.toggle('min', ls.get('le.dockMin', false));
  App.on('doc:loaded', () => requestAnimationFrame(place));
  place();
};
})();
