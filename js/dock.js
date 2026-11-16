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
  if (!pg || !pg.offsetParent) return top;
  const pl = pg.offsetLeft, pt = pg.offsetTop, pr = pl + pg.offsetWidth;
  const overlapX = left < pr && left + dw > pl;
  return overlapX ? Math.max(MARGIN, Math.min(top, pt - dh - 8)) : top;
}

function place(){
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
  grip.setPointerCapture(e.pointerId);
  const r = dock.getBoundingClientRect();
  drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false, sx: e.clientX, sy: e.clientY };
  dock.classList.add('dragging');
});
grip.addEventListener('pointermove', e => {
  if (!drag) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 3) return;
  drag.moved = true;
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
const endDrag = () => {
  if (!drag) return;
  dock.classList.remove('dragging');
  if (drag.moved && drag.pos) { pos = drag.pos; ls.set('le.dockPos', pos); }
  drag = null;
};
grip.addEventListener('pointerup', endDrag);
grip.addEventListener('pointercancel', endDrag);
grip.addEventListener('dblclick', () => {
  pos = null; ls.set('le.dockPos', null); place();
  App.toast('Barra de ferramentas de volta ao lugar');
});
new ResizeObserver(() => { if (pos) place(); }).observe(stage);

// ---------- Recolher ----------
function setMin(on){
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
  const hit = a.width > 0 && b.width > 0 && !dock.classList.contains('moved') && !dock.classList.contains('min') && a.right + 8 > b.left && b.right + 8 > a.left;
  document.body.classList.toggle('pager-up', hit);
};
const reqCollide = () => { if (!collideRaf) collideRaf = requestAnimationFrame(checkCollide); };
if (pager) {
  const ro = new ResizeObserver(reqCollide); ro.observe(dock); ro.observe(pager);
  new MutationObserver(reqCollide).observe(dock, { attributes: true, attributeFilter: ['class', 'style'] });
  addEventListener('resize', reqCollide);
}

App.initDock = () => {
  App.on('tool:changed', reqCollide);
  updateMini();
  dock.classList.toggle('min', ls.get('le.dockMin', false));
  App.on('doc:loaded', () => requestAnimationFrame(place));
  place();
};
})();
