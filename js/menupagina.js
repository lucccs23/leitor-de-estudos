/* Menu do botão direito na página do PDF (como nos programas de PDF): nota aqui, marcador da página,
   copiar o texto da página, ferramentas (Selecionar, Mão, Marcação de zoom), zoom, busca, imprimir e propriedades.
   Clique direito num grifo abre a edição do grifo. Com texto selecionado, fica o menu normal (copiar).
   Também traz duas ferramentas novas: Mão (arrastar a página) e Marcação de zoom (contornar o trecho a ampliar). */
(() => {
'use strict';
const App = window.App;
const { $, el, state } = App;
const viewer = $('#viewer'), pagesEl = $('#pages');
const ponto = (x, y) => ({ getBoundingClientRect: () => ({ left: x, right: x, top: y, bottom: y, width: 1, height: 1 }) });
const paginaEm = (x, y) => { const pe = document.elementFromPoint(x, y)?.closest?.('.page'); return pe ? App.paginaDe(+pe.dataset.page) : null; };

// ---------- O menu ----------
document.addEventListener('contextmenu', e => {
  // só o mouse (no toque, segurar o dedo é selecionar texto); o que outro recurso já tratou fica com ele
  if (e.defaultPrevented || !state.pdf || (e.pointerType && e.pointerType !== 'mouse')) return;
  if (!e.target.closest || !e.target.closest('#pages')) return;
  if (App.hasSelection()) return; // texto selecionado: menu normal do navegador (copiar)
  const p = paginaEm(e.clientX, e.clientY); if (!p) return;
  e.preventDefault();
  App.closePopup();
  const h = App.hlAt(p.el, e.clientX, e.clientY);
  if (h) { App.editHl(h, e.clientX, e.clientY); return; }
  const r = p.el.getBoundingClientRect(), pt = [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  const marcada = state.bookmarks.some(b => b.page === p.num);
  const ferramenta = (id, nome, icone, sub) => ({ label: nome, icon: icone, sub, checked: state.tool === id, on: () => App.setTool(id) });
  // folha de anotação: só o que vale numa folha (sem PDF: sem texto, marcador ou marcar área)
  if (p.folha) {
    App.popMenu(ponto(e.clientX, e.clientY), [
      { label: 'Adicionar nota aqui', icon: 'note', on: () => App.createNoteAt(p, pt) },
      { label: 'Lupa de escrita aqui', icon: 'search', on: () => App.lupa.abrir(p, pt) },
      { sep: true },
      ferramenta('text', 'Ferramenta Selecionar', 'text', 'V'),
      ferramenta('hand', 'Ferramenta Mão', 'pointer', 'H'),
      { sep: true },
      { label: 'Apagar esta folha', icon: 'trash', on: () => App.folhas.apagar(p.num) },
    ]);
    return;
  }
  App.popMenu(ponto(e.clientX, e.clientY), [
    { label: 'Adicionar nota aqui', icon: 'note', on: () => App.createNoteAt(p, pt) },
    { label: 'Lupa de escrita aqui', icon: 'search', on: () => App.lupa.abrir(p, pt) },
    { label: 'Folha de anotação depois desta página', icon: 'file', on: () => App.folhas.inserir(p.num) },
    { label: marcada ? `Remover o marcador da página ${p.num}` : `Marcar a página ${p.num}`, icon: 'bookmark', checked: marcada, on: () => { App.goToPage(p.num, 0); setTimeout(App.toggleBookmark, 50); } },
    { label: 'Copiar o texto desta página', icon: 'copy', on: async () => { const t = await App.pageText(p.num); App.copyText((t.text || '').replace(/\s+/g, ' ').trim()); } },
    { sep: true },
    ferramenta('text', 'Ferramenta Selecionar', 'text', 'V'),
    ferramenta('hand', 'Ferramenta Mão', 'pointer', 'H'),
    ferramenta('zoom', 'Marcação de zoom', 'search', 'Z'),
    ferramenta('area', 'Marcar área', 'area', 'A'),
    { sep: true },
    { label: 'Aumentar o zoom aqui', icon: 'plus', on: () => App.zoomBy(1.25, { x: e.clientX, y: e.clientY }) },
    { label: 'Diminuir o zoom', icon: 'minus', on: () => App.zoomBy(1 / 1.25, { x: e.clientX, y: e.clientY }) },
    { label: 'Ajustar à largura', icon: 'fit', sub: 'Ctrl+0', on: () => App.fitWidth() },
    { sep: true },
    { label: 'Localizar', icon: 'search', sub: 'Ctrl+F', on: () => App.openSearch() },
    { label: 'Imprimir…', icon: 'printer', sub: 'Ctrl+P', on: () => App.filePrint() },
    { label: 'Propriedades do documento…', icon: 'info', on: () => App.fileProps() },
  ]);
});

// ---------- Ferramenta Mão: arrastar a página ----------
let arrasto = null;
viewer.addEventListener('pointerdown', e => {
  if (!state.pdf || e.button !== 0 || (state.tool !== 'hand' && state.tool !== 'zoom')) return;
  if (e.target.closest('button, input, .dock, #pager, #popup, .noteMark')) return;
  e.preventDefault(); e.stopPropagation();
  try { viewer.setPointerCapture(e.pointerId); } catch {}
  if (state.tool === 'hand') { arrasto = { tipo: 'mao', id: e.pointerId, x: e.clientX, y: e.clientY, st: viewer.scrollTop, sl: viewer.scrollLeft }; document.body.classList.add('arrastando'); return; }
  const caixa = el('div', 'zoomCaixa'); document.body.append(caixa);
  arrasto = { tipo: 'zoom', id: e.pointerId, x: e.clientX, y: e.clientY, caixa };
  desenhaCaixa(e);
}, true);
function desenhaCaixa(e){
  const c = arrasto.caixa, x = Math.min(arrasto.x, e.clientX), y = Math.min(arrasto.y, e.clientY);
  Object.assign(c.style, { left: x + 'px', top: y + 'px', width: Math.abs(e.clientX - arrasto.x) + 'px', height: Math.abs(e.clientY - arrasto.y) + 'px' });
}
viewer.addEventListener('pointermove', e => {
  if (!arrasto || e.pointerId !== arrasto.id) return;
  e.preventDefault(); e.stopPropagation();
  if (arrasto.tipo === 'mao') { viewer.scrollTop = arrasto.st - (e.clientY - arrasto.y); viewer.scrollLeft = arrasto.sl - (e.clientX - arrasto.x); }
  else desenhaCaixa(e);
}, true);
const soltar = e => {
  if (!arrasto || e.pointerId !== arrasto.id) return;
  const a = arrasto; arrasto = null;
  document.body.classList.remove('arrastando');
  if (a.tipo !== 'zoom') return;
  a.caixa.remove();
  const w = Math.abs(e.clientX - a.x), h = Math.abs(e.clientY - a.y), vr = viewer.getBoundingClientRect();
  const cx = (a.x + e.clientX) / 2, cy = (a.y + e.clientY) / 2;
  // clique simples: aproxima naquele ponto; caixa: o trecho contornado ocupa a tela
  const f = w < 12 || h < 12 ? 1.5 : Math.min(vr.width / w, vr.height / h) * 0.95;
  App.zoomBy(Math.max(0.3, Math.min(6, f)), { x: cx, y: cy });
  requestAnimationFrame(() => { viewer.scrollLeft += cx - (vr.left + vr.width / 2); viewer.scrollTop += cy - (vr.top + vr.height / 2); });
  App.setTool('text'); // a marcação de zoom vale para um contorno, como nos programas de PDF
};
viewer.addEventListener('pointerup', soltar, true);
viewer.addEventListener('pointercancel', e => { if (arrasto && e.pointerId === arrasto.id) { arrasto.caixa?.remove(); arrasto = null; document.body.classList.remove('arrastando'); } }, true);

// atalhos: H = Mão, Z = Marcação de zoom (fora de campos de texto)
document.addEventListener('keydown', e => {
  if (e.defaultPrevented || App.examOpen?.() || !state.pdf || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable) return;
  if (document.querySelector('dialog[open]') || App.reviewOpen || App.examViewOpen || document.body.classList.contains('lendo')) return;
  const k = e.key.toLowerCase();
  if (k === 'h') { e.preventDefault(); App.setTool(state.tool === 'hand' ? 'text' : 'hand'); App.toast(state.tool === 'hand' ? 'Mão: arraste a página (H volta à seleção)' : 'Seleção de texto'); }
  else if (k === 'z') { e.preventDefault(); App.setTool('zoom'); App.toast('Marcação de zoom: contorne o trecho que quer ampliar'); }
});
})();
