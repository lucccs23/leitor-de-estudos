/* Lupa de escrita: uma faixa embaixo da tela mostra, ampliado, o trecho da página marcado por um retângulo.
   O que se escreve na faixa vai para a página, no lugar certo (mesmo caminho do desenho normal: desfazer,
   borracha, laço e favoritas funcionam igual). ← e → andam pelo trecho; "Próxima linha" desce; perto da
   borda direita a lupa avança sozinha. O PDF é redesenhado na escala da lupa (nítido, sem ampliar pixels). */
(() => {
'use strict';
const App = window.App;
const { $, el, state, SVGNS, CSS_UNITS } = App;
const stage = $('#stage'), viewer = $('#viewer');

let alvo = null;           // { p, x, y, w, h, x0 } em frações da página; x0 = margem para "próxima linha"
let tarefa = null, pintaT = 0, obs = null;

// ---------- Elementos ----------
const caixa = el('div', 'lupa'); caixa.hidden = true;
caixa.setAttribute('role', 'region'); caixa.setAttribute('aria-label', 'Lupa de escrita');
const barra = el('div', 'lupaBarra');
const bt = (icone, titulo, fn) => { const b = App.ibtn(icone, null, fn, 'sm', titulo); b.onmousedown = e => e.preventDefault(); return b; };
barra.append(
  bt('left', 'Voltar o trecho (←)', () => andar(-1)),
  bt('right', 'Avançar o trecho (→)', () => andar(1)),
  App.ibtn('down', 'Próxima linha', () => proximaLinha(), 'sm lupaLinha', 'Próxima linha'),
  el('span', 'lupaDica', 'Escreva aqui: vai para a página, no retângulo'),
  bt('x', 'Fechar a lupa', () => App.lupa.fechar()));
const vista = el('div', 'lupaVista');
const fundo = el('canvas', 'pageCanvas lupaCanvas');
const tinta = document.createElementNS(SVGNS, 'svg'); tinta.setAttribute('class', 'inkLayer lupaTinta'); tinta.setAttribute('preserveAspectRatio', 'none');
const viva = document.createElementNS(SVGNS, 'svg'); viva.setAttribute('class', 'inkLayer lupaViva'); viva.setAttribute('preserveAspectRatio', 'none');
const vivoPath = document.createElementNS(SVGNS, 'path');
vista.append(fundo, tinta, viva);
caixa.append(barra, vista);
stage.append(caixa);
const quadro = el('div', 'lupaAlvo'), pega = el('button', 'lupaPega');
pega.type = 'button'; pega.title = 'Arraste para mover o trecho da lupa'; pega.setAttribute('aria-label', pega.title);
pega.append(App.icon('grip'));
quadro.append(pega);

// ---------- Posição e tamanho ----------
function lugar(){
  // acima do dock quando ele está embaixo; senão encostada no pé da área de leitura
  const st = stage.getBoundingClientRect(), dock = $('#dock'), dr = dock.getBoundingClientRect();
  const sobreDock = !dock.classList.contains('vertical') && !dock.classList.contains('min') && dr.top > st.top + st.height / 2;
  const fundoPx = sobreDock ? st.bottom - dr.top + 8 : 16;
  const W = Math.min(st.width - 32, 1100), H = Math.round(Math.max(136, Math.min(320, st.height * 0.3)));
  Object.assign(caixa.style, { width: W + 'px', bottom: fundoPx + 'px', left: Math.round((st.width - W) / 2) + 'px' });
  vista.style.height = H + 'px';
}
const proporcao = () => { const p = alvo.p; return (vista.clientHeight / vista.clientWidth) * (p.base.w / p.base.h); };
function ajusta(){
  const p = alvo.p;
  alvo.w = Math.max(0.12, Math.min(0.9, alvo.w));
  alvo.h = alvo.w * proporcao();
  alvo.x = Math.max(0, Math.min(1 - alvo.w, alvo.x));
  alvo.y = Math.max(0, Math.min(1 - alvo.h, alvo.y));
  if (quadro.parentElement !== p.el) p.el.append(quadro);
  Object.assign(quadro.style, { left: alvo.x * 100 + '%', top: alvo.y * 100 + '%', width: alvo.w * 100 + '%', height: alvo.h * 100 + '%' });
  const vb = `${alvo.x * p.base.w} ${alvo.y * p.base.h} ${alvo.w * p.base.w} ${alvo.h * p.base.h}`;
  tinta.setAttribute('viewBox', vb); viva.setAttribute('viewBox', vb);
  copiaTinta(); pintaDepois();
}
// o trecho fica visível acima da lupa
function mostraTrecho(){
  const q = quadro.getBoundingClientRect(), v = viewer.getBoundingClientRect(), topoLupa = caixa.getBoundingClientRect().top;
  if (q.top < v.top + 8 || q.bottom > topoLupa - 8) viewer.scrollTop += q.top - (v.top + Math.max(16, (topoLupa - v.top - q.height) / 3));
}

// ---------- O que aparece na lupa ----------
function copiaTinta(){
  if (!alvo) return;
  tinta.replaceChildren(...[...alvo.p.ink.childNodes].map(n => n.cloneNode(true)));
}
function observaTinta(){
  obs?.disconnect();
  let raf = 0;
  obs = new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; copiaTinta(); }); });
  obs.observe(alvo.p.ink, { childList: true, subtree: true, attributes: true });
}
function pintaDepois(){ clearTimeout(pintaT); pintaT = setTimeout(pintaFundo, 60); }
async function pintaFundo(){
  if (!alvo || !state.pdf) return;
  const p = alvo.p, W = vista.clientWidth, H = vista.clientHeight;
  if (!W || !H) return;
  if (p.folha) { fundoDaFolha(p, W, H); return; }
  try {
    tarefa?.cancel();
    const page = await state.pdf.getPage(p.num);
    const k = W / (alvo.w * p.base.w), dpr = Math.min(window.devicePixelRatio || 1, 2);
    const vp = page.getViewport({ scale: k * CSS_UNITS, offsetX: -alvo.x * p.base.w * k, offsetY: -alvo.y * p.base.h * k });
    const c = document.createElement('canvas'); c.width = Math.floor(W * dpr); c.height = Math.floor(H * dpr);
    tarefa = page.render({ canvasContext: c.getContext('2d'), viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null,
      annotationMode: p.ownAnnots ? pdfjsLib.AnnotationMode.DISABLE : pdfjsLib.AnnotationMode.ENABLE });
    await tarefa.promise; tarefa = null;
    fundo.width = c.width; fundo.height = c.height;
    fundo.getContext('2d').drawImage(c, 0, 0);
  } catch (e) { if (e?.name !== 'RenderingCancelledException') console.warn('lupa', e); }
}

// folha de anotação: fundo branco com as linhas (ou quadrículas) da folha, no trecho ampliado
function fundoDaFolha(p, W, H){
  const dpr = Math.min(window.devicePixelRatio || 1, 2), k = W / (alvo.w * p.base.w), passo = (p.base.h / 34) * k;
  fundo.width = Math.floor(W * dpr); fundo.height = Math.floor(H * dpr);
  const g = fundo.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  const estilo = p.el.dataset.estilo; if (estilo === 'lisa') return;
  g.strokeStyle = 'rgba(70,110,170,.28)'; g.lineWidth = 1;
  const y0 = -((alvo.y * p.base.h * k) % passo), x0 = -((alvo.x * p.base.w * k) % passo);
  g.beginPath();
  for (let y = y0; y < H; y += passo) { g.moveTo(0, y + passo); g.lineTo(W, y + passo); }
  if (estilo === 'quadriculada') for (let x = x0; x < W; x += passo) { g.moveTo(x + passo, 0); g.lineTo(x + passo, H); }
  g.stroke();
}

// ---------- Escrever na lupa ----------
// posição na lupa → ponto da página → evento "como se" fosse na página (mesmo caminho do desenho normal)
function naPagina(cx, cy){
  const v = vista.getBoundingClientRect();
  return [alvo.x + ((cx - v.left) / v.width) * alvo.w, alvo.y + ((cy - v.top) / v.height) * alvo.h];
}
function comoNaPagina(e, base = e){
  const [nx, ny] = naPagina(base.clientX, base.clientY), r = alvo.p.el.getBoundingClientRect();
  const simples = ev => { const [ax, ay] = naPagina(ev.clientX, ev.clientY); return { clientX: r.left + ax * r.width, clientY: r.top + ay * r.height, pressure: ev.pressure, pointerId: e.pointerId }; };
  return {
    lupa: true, target: alvo.p.draw, clientX: r.left + nx * r.width, clientY: r.top + ny * r.height,
    pointerId: e.pointerId, pointerType: e.pointerType, pressure: base.pressure, button: e.button, buttons: e.buttons, width: e.width, height: e.height,
    preventDefault(){},
    getCoalescedEvents: () => (e.getCoalescedEvents?.() || []).map(simples),
    getPredictedEvents: () => (e.getPredictedEvents?.() || []).map(simples),
  };
}
let gesto = null; // { id, tipo: 'traco' | 'mover', maxX, sx, sy, ax, ay }
vista.addEventListener('pointerdown', e => {
  if (!alvo || gesto) return;
  e.preventDefault();
  try { vista.setPointerCapture(e.pointerId); } catch {}
  // com a S Pen, o dedo arrasta o trecho em vez de escrever
  if (e.pointerType === 'touch' && state.penSeen) { gesto = { id: e.pointerId, tipo: 'mover', sx: e.clientX, sy: e.clientY, ax: alvo.x, ay: alvo.y }; return; }
  gesto = { id: e.pointerId, tipo: 'traco', maxX: 0 };
  App.lupaTraco.inicio(comoNaPagina(e));
  viva.append(vivoPath); vivoLoop();
});
vista.addEventListener('pointermove', e => {
  if (!gesto || e.pointerId !== gesto.id) return;
  if (gesto.tipo === 'mover') {
    alvo.x = gesto.ax - (e.clientX - gesto.sx) / vista.clientWidth * alvo.w;
    alvo.y = gesto.ay - (e.clientY - gesto.sy) / vista.clientHeight * alvo.h;
    ajusta(); return;
  }
  gesto.maxX = Math.max(gesto.maxX, (e.clientX - vista.getBoundingClientRect().left) / vista.clientWidth);
  App.lupaTraco.move(comoNaPagina(e));
});
const solta = (e, cancela) => {
  if (!gesto || e.pointerId !== gesto.id) return;
  const g = gesto; gesto = null;
  if (g.tipo === 'mover') { mostraTrecho(); return; }
  App.lupaTraco.fim(comoNaPagina(e), cancela);
  vivoPath.removeAttribute('d'); vivoPath.remove();
  // escreveu perto da borda direita: a lupa avança sozinha
  if (!cancela && state.tool === 'ink' && g.maxX > 0.82) andar(1);
};
vista.addEventListener('pointerup', e => solta(e, false));
vista.addEventListener('pointercancel', e => solta(e, true));
vista.addEventListener('contextmenu', e => e.preventDefault());
// o traço em andamento aparece na lupa enquanto é desenhado
function vivoLoop(){
  const d = App.lupaTraco.atual();
  if (!gesto || gesto.tipo !== 'traco') return;
  if (d && d.path) {
    for (const a of ['d', 'class', 'style', 'stroke-width', 'stroke-dasharray']) {
      const v = d.path.getAttribute(a); if (v == null) vivoPath.removeAttribute(a); else vivoPath.setAttribute(a, v);
    }
  }
  requestAnimationFrame(vivoLoop);
}

// ---------- Andar pelo trecho ----------
function andar(dir){
  if (!alvo) return;
  if (dir > 0 && alvo.x + alvo.w >= 0.995) { proximaLinha(); return; }
  alvo.x += dir * alvo.w * 0.8;
  ajusta(); mostraTrecho();
}
function proximaLinha(){
  if (!alvo) return;
  alvo.x = alvo.x0;
  if (alvo.y + alvo.h * 2 <= 1.0001) alvo.y += alvo.h;
  else if (!alvo.p.folha && alvo.p.num < state.pages.length) { trocaPagina(state.pages[alvo.p.num]); alvo.y = 0.04; }
  else alvo.y = 1;
  ajusta(); mostraTrecho();
}
function trocaPagina(p){ alvo.p = p; observaTinta(); }

// arrastar o retângulo pela alça (na página)
let arrasta = null;
pega.addEventListener('pointerdown', e => {
  e.preventDefault(); e.stopPropagation();
  try { pega.setPointerCapture(e.pointerId); } catch {}
  const r = alvo.p.el.getBoundingClientRect();
  arrasta = { id: e.pointerId, dx: (e.clientX - r.left) / r.width - alvo.x, dy: (e.clientY - r.top) / r.height - alvo.y };
});
pega.addEventListener('pointermove', e => {
  if (!arrasta || e.pointerId !== arrasta.id) return;
  const r = alvo.p.el.getBoundingClientRect();
  alvo.x = (e.clientX - r.left) / r.width - arrasta.dx; alvo.y = (e.clientY - r.top) / r.height - arrasta.dy; alvo.x0 = Math.max(0, alvo.x);
  ajusta();
});
const fimArrasta = e => { if (arrasta && e.pointerId === arrasta.id) arrasta = null; };
pega.addEventListener('pointerup', fimArrasta); pega.addEventListener('pointercancel', fimArrasta);

// ---------- Abrir e fechar ----------
App.lupa = {
  aberta: () => !!alvo,
  // p e ponto (frações da página) opcionais: sem eles, a página atual, no alto do que está na tela
  abrir(p, ponto){
    if (!state.pdf) return;
    if (state.rotacao) { App.toast('A lupa de escrita funciona com a página na posição original (Exibir → Girar).'); return; }
    p = p || state.pages[(state.currentPage || 1) - 1] || state.pages[0];
    caixa.hidden = false; lugar();
    const r = p.el.getBoundingClientRect(), v = viewer.getBoundingClientRect();
    const yTela = Math.max(0, Math.min(0.95, (v.top + 48 - r.top) / r.height));
    alvo = { p, x: ponto ? ponto[0] - 0.05 : 0.08, y: ponto ? ponto[1] - 0.03 : yTela, w: 0.4, h: 0.1 };
    alvo.x0 = Math.max(0, alvo.x);
    observaTinta(); ajusta(); mostraTrecho();
    if (state.tool !== 'ink' && state.tool !== 'erase' && state.tool !== 'lasso') App.setTool('ink');
    App.toast('Lupa de escrita: escreva na faixa de baixo; ← → e "Próxima linha" andam pelo trecho');
  },
  fechar(){
    if (!alvo) return;
    alvo = null; obs?.disconnect(); obs = null; tarefa?.cancel(); tinta.replaceChildren(); vivoPath.remove();
    caixa.hidden = true; quadro.remove();
  },
  alternar(){ if (alvo) App.lupa.fechar(); else App.lupa.abrir(); },
};
App.on('doc:closed', () => App.lupa.fechar());
App.on('doc:loaded', () => App.lupa.fechar());
// zoom ou tamanho da tela mudou: a página foi redesenhada e a lupa se reposiciona
new ResizeObserver(() => { if (alvo) { lugar(); ajusta(); } }).observe(stage);
App.on('page:annots', () => { if (alvo) copiaTinta(); });
// Esc fecha a lupa (se não houver painel, menu ou janela aberta) e para aí: a ferramenta continua a mesma
// (no documento, na captura: painéis que fecham com Esc antes dela, na janela, interrompem o evento; menus que já
// trataram o Esc marcam defaultPrevented)
document.addEventListener('keydown', e => {
  if (!alvo || e.key !== 'Escape' || e.defaultPrevented || e.target.closest?.('input,textarea,[contenteditable]')) return;
  if (document.querySelector('dialog[open], .penPop, .popMenu') || !$('#popup').hidden) return;
  e.preventDefault(); e.stopPropagation(); App.lupa.fechar();
}, true);
})();
