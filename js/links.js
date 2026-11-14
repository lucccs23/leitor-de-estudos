/* Ligar trechos: um grifo (ou nota) aponta para outra página — do mesmo PDF ou de outro (ex.: da aula para o livro).
   Tocar no grifo leva até lá; um botão "Voltar" traz de volta. Se o destino for um grifo, a ligação vale nos dois sentidos. */
(() => {
'use strict';
const App = window.App;
const { $, el, state, DB, safe } = App;

let linking = null;   // { fp, name, hid } enquanto escolhe o destino
let back = [];        // pilha de lugares para "Voltar"

// ---------- Barra de ligação / botão voltar ----------
const bar = el('div', 'linkBar'); bar.hidden = true; bar.setAttribute('role', 'status');
$('#stage').append(bar);
function renderBar(){
  bar.innerHTML = '';
  if (linking) {
    bar.hidden = false; bar.className = 'linkBar linking';
    const txt = el('span', 'linkTxt');
    txt.append(App.icon('link'), el('span', null, 'Vá até o destino (pode trocar de PDF) e toque em '), el('strong', null, 'Ligar aqui'));
    bar.append(txt,
      App.btn('Ligar aqui', () => finishLink(), 'primary sm'),
      App.btn('Cancelar', () => { linking = null; renderBar(); }, 'sm'));
    return;
  }
  const b = back[back.length - 1];
  if (!b) { bar.hidden = true; return; }
  bar.hidden = false; bar.className = 'linkBar back';
  const go = App.ibtn('left', `Voltar para ${b.fp === state.fp ? 'a p. ' + b.page : App.baseName(b.name) + ', p. ' + b.page}`, () => goBack(), 'sm');
  const x = App.ibtn('x', null, () => { back = []; renderBar(); }, 'sm', 'Fechar');
  bar.append(go, x);
}

// ---------- Ir e voltar ----------
const here = () => ({ fp: state.fp, name: state.name, page: state.currentPage, frac: curFrac() });
function curFrac(){
  const p = state.pages[state.currentPage - 1], v = $('#viewer');
  return p ? Math.max(0, Math.min(1, +((v.scrollTop - p.el.offsetTop) / p.el.offsetHeight).toFixed(4))) : 0;
}
async function goTo(t){
  if (t.fp !== state.fp) {
    if (!(await safe(() => DB.has('files', t.fp), false))) { App.toast(`O PDF "${App.baseName(t.name)}" não está mais neste aparelho. Abra-o de novo para a ligação funcionar.`); return false; }
    await App.switchTab(t.fp, t.name);
    if (state.fp !== t.fp) return false;
  }
  const h = t.hid && state.highlights.find(x => x.id === t.hid);
  if (h) App.jumpTo(h); else App.goToPage(t.page, t.frac || 0);
  return true;
}
App.followLink = async h => {
  if (!h.link) return;
  App.closePopup();
  const from = here();
  if (await goTo(h.link)) { back.push(from); back = back.slice(-20); renderBar(); }
};
async function goBack(){
  const b = back.pop(); renderBar();
  if (b) await goTo(b);
  renderBar();
}
App.on('doc:closed', () => { linking = null; renderBar(); });
App.on('doc:loaded', renderBar);

// ---------- Criar a ligação ----------
// o grifo tocado antes de "Ligar aqui" (o clique na barra fecha o balão e desmarca o grifo)
let selAtDown = null;
addEventListener('pointerdown', e => { if (linking && bar.contains(e.target)) selAtDown = state.selected; }, true);
App.startLink = h => {
  App.closePopup();
  linking = { fp: state.fp, name: state.name, hid: h.id, page: App.anchorOf(h).page };
  renderBar();
  App.toast('Agora vá até o destino e toque em "Ligar aqui". Se tocar num grifo antes, a ligação vai até ele.');
};
// grava a ligação num grifo (do documento aberto ou de outro, direto no banco)
async function setLink(fp, hid, link){
  if (fp === state.fp) {
    const h = state.highlights.find(x => x.id === hid); if (!h) return false;
    App.snapshot(); h.link = link; App.refreshHighlight(h); return true;
  }
  const out = await App.patchDoc(fp, cur => ({ highlights: (cur.highlights || []).map(x => x.id === hid ? { ...x, link } : x) }));
  return !!out;
}
async function finishLink(){
  const L = linking; linking = null;
  if (!L || !state.pdf) { renderBar(); return; }
  const sel = selAtDown || state.selected; selAtDown = null;
  const target = state.highlights.find(x => x.id === sel && x.id !== L.hid);
  const dest = target ? { fp: state.fp, name: state.name, page: App.anchorOf(target).page, hid: target.id }
                      : { fp: state.fp, name: state.name, page: state.currentPage, frac: curFrac() };
  if (L.fp === dest.fp && !target && L.page === dest.page) { App.toast('O destino é a mesma página do grifo. Vá para outra página.'); linking = L; return; }
  await App.saveDoc();
  await setLink(L.fp, L.hid, dest);
  // destino é um grifo: liga de volta também
  if (target && !target.link) await setLink(state.fp, target.id, { fp: L.fp, name: L.name, page: L.page, hid: L.hid });
  renderBar();
  App.toast(`Ligado: ${dest.fp === L.fp ? 'página ' + dest.page : App.baseName(dest.name) + ', p. ' + dest.page}${target ? ' (nos dois sentidos)' : ''}`);
}

// ---------- No balão do grifo ----------
App.popupExtras = (h, actions, reopen) => {
  if (h.kind === 'ink') return;
  if (h.link) {
    const t = h.link;
    const lb = App.ibtn('link', null, () => App.followLink(h), 'sm on', `Ir para ${t.fp === state.fp ? 'a página ' + t.page : `"${App.baseName(t.name)}", p. ${t.page}`}`);
    const more = App.ibtn('more', null, () => App.popMenu(more, [
      { label: 'Ir para o destino', icon: 'link', on: () => App.followLink(h) },
      { label: 'Ligar a outro lugar', icon: 'edit', on: () => App.startLink(h) },
      { label: 'Remover a ligação', icon: 'x', danger: true, on: () => { App.snapshot(); delete h.link; App.refreshHighlight(h); reopen(); } },
    ], { title: `Ligado a ${t.fp === state.fp ? 'p. ' + t.page : App.baseName(t.name) + ', p. ' + t.page}` }), 'sm', 'Opções da ligação');
    actions.append(lb, more);
  } else actions.append(App.ibtn('link', null, () => App.startLink(h), 'sm', 'Ligar a outra página ou outro PDF'));
};
})();
