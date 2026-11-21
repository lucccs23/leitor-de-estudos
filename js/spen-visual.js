/* S Pen: o que a caneta vai fazer aparece debaixo dela, como nos apps de notas.
   - Pairando com a Caneta: um ponto do tamanho e da cor da ponta.
   - Borracha (ferramenta ou botão apertado em "apagar"): o círculo do tamanho da borracha, também enquanto apaga.
   - Botão apertado em "marca-texto": a ponta do marca-texto.
   - Ação do botão no ar (desfazer, borracha...): um aviso curto perto da ponta, em vez do aviso no topo da tela. */
(() => {
'use strict';
const App = window.App;
const { $, el, state, ls } = App;
const PEN_TOOLS = new Set(['ink', 'erase', 'lasso']);

const anel = el('div', 'penAnel'); anel.hidden = true; document.body.append(anel);
let encostada = false;

function modo(e){
  if (!state.pdf || App.examViewOpen || document.body.classList.contains('lendo')) return null;
  if (!e.target?.closest?.('#pages .page')) return null;
  const botao = App.spenBotao?.(), tela = App.spen().tela, ferramentaCaneta = PEN_TOOLS.has(state.tool);
  if (state.tool === 'erase' || (botao && ferramentaCaneta && tela === 'borracha')) return 'borracha';
  if (botao && ferramentaCaneta && tela === 'marcatexto') return encostada ? null : 'marca';
  if (state.tool === 'ink' && !encostada && !botao) return state.pen === 'marker' ? 'marca' : 'ponta';
  return null;
}
function desenha(e){
  const m = modo(e);
  if (!m) { anel.hidden = true; return; }
  let d, cor = null, traco = false;
  if (m === 'borracha') {
    // apagar o traço inteiro: círculo tracejado do alcance do toque; apagar só um pedaço: o tamanho da borracha
    traco = ls.get('le.eraseMode', 'stroke') !== 'area';
    d = traco ? 18 : ls.get('le.eraseSize', 18);
  } else {
    const k = m === 'marca' ? 'marker' : 'pen';
    d = Math.max(4, App.penWidth(k) * (state.scale || 1));
    cor = App.colorOf(App.penColor(k)).ink;
  }
  anel.className = 'penAnel ' + m + (traco ? ' traco' : '');
  if (cor) anel.style.setProperty('--pc', cor);
  anel.style.width = anel.style.height = d + 'px';
  anel.style.transform = `translate(${e.clientX - d / 2}px, ${e.clientY - d / 2}px)`;
  anel.hidden = false;
}
// O Android nem sempre avisa a página quando a caneta se afasta da tela, e o ponto ficava parado no meio dela.
// Então o ponto só vive enquanto chegam sinais da caneta: pairando, a S Pen manda movimentos o tempo todo;
// sem sinal por um instante, ele some. Também some ao rolar, ao tocar com o dedo e com o aviso do app de Android.
let vidaT = null;
const esconde = () => { clearTimeout(vidaT); anel.hidden = true; };
const vive = () => { clearTimeout(vidaT); if (!anel.hidden) vidaT = setTimeout(esconde, encostada ? 1500 : 350); };
addEventListener('pointerdown', e => { if (e.pointerType !== 'pen') { esconde(); return; } encostada = true; desenha(e); vive(); }, { capture: true, passive: true });
addEventListener('pointermove', e => { if (e.pointerType !== 'pen') return; encostada = !!(e.buttons & 1); desenha(e); vive(); }, { capture: true, passive: true });
addEventListener('pointerup', e => { if (e.pointerType !== 'pen') return; encostada = false; desenha(e); vive(); }, { capture: true, passive: true });
// a caneta saiu de perto da tela (ou de cima da página)
const some = e => { if (e.pointerType === 'pen' && (!e.relatedTarget || !e.relatedTarget.closest?.('#pages .page'))) esconde(); };
addEventListener('pointerout', some, true);
addEventListener('pointercancel', e => { if (e.pointerType === 'pen') { encostada = false; esconde(); } }, true);
$('#viewer')?.addEventListener('scroll', () => { if (!encostada) esconde(); }, { passive: true });
App.on('tool:changed', esconde);
addEventListener('blur', esconde);
document.addEventListener('visibilitychange', esconde);
// app de Android: a caneta saiu do alcance da tela
window.vetraSpenLonge = () => { encostada = false; esconde(); };

// ---------- aviso perto da ponta ----------
const aviso = el('div', 'spenAviso'); aviso.setAttribute('role', 'status'); document.body.append(aviso);
let avisoT = null;
App.spenAviso = (icone, texto) => {
  const p = App.penPos;
  if (!p || performance.now() - p.t > 4000) return false; // a caneta não está por perto: fica o aviso normal
  aviso.replaceChildren(App.icon(icone), document.createTextNode(texto));
  const w = aviso.offsetWidth || 140;
  const x = Math.max(8, Math.min(innerWidth - w - 8, p.x + 16)), y = Math.max(8, p.y - 48);
  aviso.style.left = x + 'px'; aviso.style.top = y + 'px';
  aviso.classList.add('show');
  clearTimeout(avisoT); avisoT = setTimeout(() => aviso.classList.remove('show'), 900);
  return true;
};
})();
