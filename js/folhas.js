/* Folhas de anotação do Vetra: folhas em branco (pautadas, quadriculadas ou lisas) entre as páginas do PDF,
   para resolver uma questão ou fazer um esquema ao lado do conteúdo. O PDF não é alterado: as folhas ficam
   guardadas com os grifos (state.folhas = [{ id, depois, estilo }]) e aparecem depois da página indicada.
   Cada folha tem um número próprio, acima de FOLHA_BASE, usado como "página" pelos traços e notas dela, então
   caneta, borracha, laço, desfazer, notas e lupa funcionam nela como numa página. O que é do PDF (impressão,
   exportação, busca, simulado, miniaturas) não enxerga as folhas. */
(() => {
'use strict';
const App = window.App;
const { $, el, ls, state, SVGNS } = App;
const BASE = App.FOLHA_BASE = 100000;
const viewer = $('#viewer');
const folhas = new Map(); // id → objeto da folha (como o de uma página: el, hl, ink, draw, notes, base)
const ESTILOS = [['pautada', 'Pautada'], ['quadriculada', 'Quadriculada'], ['lisa', 'Lisa']];
const nomeEstilo = id => (ESTILOS.find(e => e[0] === id) || ESTILOS[0])[1];

// número → página do PDF ou folha
App.paginaDe = n => (n > BASE ? folhas.get(n) : state.pages[n - 1]) || null;
// posição para ordenar (a folha vem logo depois da página dela) e nome para mostrar
const dados = n => (state.folhas || []).find(f => f.id === n);
App.ordemPagina = n => { if (n <= BASE) return n; const f = dados(n); return f ? f.depois + 0.5 + (state.folhas.indexOf(f) + 1) / 1e4 : 1e9; };
App.rotuloPagina = n => { if (n <= BASE) return 'Página ' + n; const f = dados(n); return f ? `Folha de anotação (depois da p. ${f.depois})` : 'Folha de anotação'; };

function cria(f){
  const pdfP = state.pages[f.depois - 1]; if (!pdfP) return null;
  const base = { w: pdfP.base.w, h: pdfP.base.h };
  const pe = el('div', 'page folha'); pe.dataset.page = f.id; pe.dataset.estilo = f.estilo || 'pautada';
  const hl = el('div', 'hlLayer');
  const ink = document.createElementNS(SVGNS, 'svg');
  ink.setAttribute('class', 'inkLayer'); ink.setAttribute('viewBox', `0 0 ${base.w} ${base.h}`); ink.setAttribute('preserveAspectRatio', 'none');
  const search = el('div', 'searchLayer'), draw = el('div', 'drawLayer'), notes = el('div', 'noteLayer');
  const barra = el('div', 'folhaBarra');
  pe.append(hl, ink, search, draw, notes, barra);
  const p = { num: f.id, el: pe, hl, ink, search, draw, notes, base, folha: true, canvas: null, tl: null };
  montaBarra(p, f);
  folhas.set(f.id, p);
  return p;
}
function montaBarra(p, f, confirmando){
  const barra = p.el.querySelector('.folhaBarra'); barra.innerHTML = '';
  const parar = b => { b.onmousedown = e => e.preventDefault(); b.addEventListener('pointerdown', e => e.stopPropagation()); return b; };
  if (confirmando) {
    barra.append(el('span', 'folhaNome', 'Apagar a folha e o que está nela?'),
      parar(App.btn('Apagar', () => apagar(f.id), 'sm danger')), parar(App.btn('Não', () => montaBarra(p, f), 'sm')));
    return;
  }
  barra.append(el('span', 'folhaNome', 'Folha de anotação'),
    parar(App.btn(nomeEstilo(f.estilo), () => trocaEstilo(p, f), 'sm folhaEstilo')),
    parar(App.ibtn('trash', null, () => montaBarra(p, f, true), 'sm', 'Apagar esta folha')));
  barra.querySelector('.folhaEstilo').title = 'Trocar o fundo: pautada, quadriculada ou lisa';
}
function trocaEstilo(p, f){
  const i = ESTILOS.findIndex(e => e[0] === (f.estilo || 'pautada'));
  f.estilo = ESTILOS[(i + 1) % ESTILOS.length][0];
  ls.set('le.folhaEstilo', f.estilo); // a próxima folha já vem assim
  p.el.dataset.estilo = f.estilo; montaBarra(p, f);
  App.saveDocSoon(); App.emit('hl:changed');
}
// depois da página (e das folhas que já estavam depois dela)
function posiciona(p, f){
  let ref = state.pages[f.depois - 1]?.el; if (!ref) return;
  while (ref.nextElementSibling && ref.nextElementSibling.classList.contains('folha')) ref = ref.nextElementSibling;
  ref.after(p.el);
}
function tamanho(p){
  const s = state.scale;
  p.el.style.width = p.base.w * s + 'px'; p.el.style.height = p.base.h * s + 'px';
  p.el.style.setProperty('--linha', (p.base.h / 34) * s + 'px'); // ~34 linhas por folha, em qualquer zoom
}
const proximoId = () => Math.max(BASE, ...(state.folhas || []).map(f => f.id)) + 1;

function apagar(id){
  const p = folhas.get(id); if (!p) return;
  // apaga a folha e o que está nela (sem desfazer: o histórico é limpo para não ressuscitar traços sem folha)
  state.highlights = state.highlights.filter(h => !h.parts.some(pt => pt.page === id));
  state.folhas = state.folhas.filter(f => f.id !== id);
  App.undoStack.length = 0; App.redoStack.length = 0; App.updateUndoBtns();
  App.closePopup(); App.lupa?.aberta() && App.lupa.fechar();
  p.el.remove(); folhas.delete(id);
  App.renderPanelSoon(); App.saveDocSoon(); App.emit('hl:changed'); App.emit('folhas:changed');
  App.toast('Folha apagada');
}

App.folhas = {
  lista: () => [...folhas.values()],
  // (re)monta todas as folhas do documento aberto
  montar(){
    for (const p of folhas.values()) p.el.remove();
    folhas.clear();
    for (const f of state.folhas || []) { const p = cria(f); if (p) { posiciona(p, f); tamanho(p); App.drawPageAnnots(p); } }
  },
  escala(){ for (const p of folhas.values()) tamanho(p); },
  inserir(depois){
    if (!state.pdf) return null;
    depois = Math.max(1, Math.min(state.pages.length, depois | 0));
    const f = { id: proximoId(), depois, estilo: ls.get('le.folhaEstilo', 'pautada'), criada: Date.now() };
    state.folhas = [...(state.folhas || []), f];
    const p = cria(f); posiciona(p, f); tamanho(p);
    App.saveDocSoon(); App.emit('hl:changed'); App.emit('folhas:changed');
    viewer.scrollTop = p.el.offsetTop - 12;
    if (!['ink', 'erase', 'lasso'].includes(state.tool)) App.setTool('ink');
    App.toast(`Folha de anotação depois da página ${depois}: escreva nela com a caneta`);
    return p;
  },
  apagar,
};
})();
