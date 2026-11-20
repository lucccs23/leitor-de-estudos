/* Celular e tablet: app instalável e offline, PDFs recebidos pelo "Compartilhar" do Android,
   pinça para zoom e grifo com o dedo. */
(() => {
'use strict';
const App = window.App;
const { $, el, state, ls } = App;

// ---------- App offline (service worker) ----------
// no app de Android os arquivos já estão no aparelho: versões novas chegam por um APK novo (veja atualizar.js)
const canSW = 'serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !App.native;
if (canSW) {
  navigator.serviceWorker.register('sw.js').then(reg => {
    // versão nova baixada em segundo plano: oferece atualizar
    const offer = w => {
      if (!w) return;
      const show = () => { if (w.state === 'installed' && navigator.serviceWorker.controller) updateBar(w); };
      w.addEventListener('statechange', show); show();
    };
    offer(reg.waiting);
    reg.addEventListener('updatefound', () => offer(reg.installing));
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  }).catch(e => console.warn('modo offline', e));
  // só recarrega ao trocar de versão (na 1ª visita o app passa a funcionar offline sem recarregar a página)
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading || !hadController) return; reloading = true; location.reload(); });
}
function updateBar(worker){
  if ($('#updateBar')) return;
  const b = el('div', 'pomoAlert'); b.id = 'updateBar'; b.setAttribute('role', 'status');
  b.append(App.icon('download'), el('span', null, 'Há uma versão nova do Vetra.'));
  const acts = el('div', 'pomoAlertActs');
  acts.append(App.btn('Depois', () => b.remove(), 'sm'), App.btn('Atualizar', async () => { await App.saveDoc(); worker.postMessage('atualizar'); }, 'primary sm'));
  b.append(acts); document.body.append(b);
}
// pede ao navegador para não apagar os dados do app quando faltar espaço
if (App.isWeb && navigator.storage && navigator.storage.persist) navigator.storage.persisted().then(p => { if (!p) navigator.storage.persist(); }).catch(() => {});

// instalar o app (Chrome no Android mostra o pedido; aqui fica um botão também)
let installEvt = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; document.documentElement.classList.add('can-install'); });
addEventListener('appinstalled', () => { installEvt = null; document.documentElement.classList.remove('can-install'); App.toast('Vetra instalado'); });
App.installApp = async () => {
  if (!installEvt) { App.toast('No Chrome: menu ⋮ → "Instalar app" (ou "Adicionar à tela inicial").'); return; }
  installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null;
  document.documentElement.classList.remove('can-install');
};
App.canInstall = () => !!installEvt;

// ---------- Textos da tela inicial no aparelho ----------
if (App.isWeb || App.isTouch) {
  const lead = document.querySelector('.hero .lead'), dz = document.querySelector('.dzText span');
  if (lead) lead.textContent = 'Leia, grife e revise seus PDFs e livros (EPUB). Tudo fica salvo neste aparelho, mesmo sem internet.';
  if (dz) dz.textContent = App.native ? 'Escolha um PDF ou EPUB do aparelho ou use "Abrir com → Vetra" em outro app' : 'Escolha um PDF ou EPUB do aparelho ou use "Compartilhar → Vetra" em outro app';
}

// ---------- PDFs recebidos pelo "Compartilhar" (WhatsApp, Drive, Arquivos…) ----------
App.openShared = async () => {
  if (!('caches' in window)) return 0;
  const box = await caches.open('leitor-compartilhados');
  let n = 0;
  for (const req of await box.keys()) {
    const res = await box.match(req);
    const name = decodeURIComponent(res.headers.get('X-Nome') || 'documento.pdf');
    await App.loadDoc(await res.arrayBuffer(), name);
    await box.delete(req); n++;
  }
  return n;
};
if (new URLSearchParams(location.search).has('compartilhado')) {
  history.replaceState(null, '', location.pathname);
  setTimeout(() => App.openShared().then(n => { if (!n) App.toast('Não recebi nenhum PDF.'); }), 400);
}
// app de Android: "Abrir com → Vetra" e "Compartilhar → Vetra" (o arquivo chega copiado no cache do app)
const nativeFiles = App.native && window.Capacitor.Plugins.VetraArquivos;
if (nativeFiles) nativeFiles.addListener('arquivo', async a => {
  if (!a || a.erro || !a.path) { App.toast('Não consegui abrir o arquivo' + (a && a.erro ? ': ' + a.erro : '.')); return; }
  try {
    const res = await fetch(window.Capacitor.convertFileSrc('file://' + a.path));
    if (!res.ok) throw new Error('não consegui ler o arquivo');
    await App.loadDoc(await res.arrayBuffer(), a.name || 'documento.pdf');
  } catch (e) { App.toast('Não consegui abrir o arquivo: ' + (e.message || e)); }
});

// botão voltar do Android (MainActivity pergunta aqui antes de sair do app): fecha o que estiver aberto
if (App.native) window.vetraVoltar = () => {
  const dlg = document.querySelector('dialog[open]');
  if (dlg) { dlg.close(); return true; }
  const esc = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  if (App.reviewOpen) { esc(); return true; }
  if (document.querySelector('.popMenu') && App.closePop) { App.closePop(); return true; }
  if (App.leitorVoltar && App.leitorVoltar()) return true;
  if (App.examViewOpen || App.sheetOpen) { esc(); return true; }
  if (document.body.classList.contains('focus')) { App.toggleFocus(); return true; }
  if (state.pdf) { App.closeDoc(); return true; }
  return false;
};

// ---------- Telas estreitas: painéis por cima da página fecham ao tocar fora ----------
const narrow = () => innerWidth <= 900;
$('#stage').addEventListener('pointerdown', e => {
  if (!narrow() || e.target.closest('.dock, #pager, #focusFloat, #ttsBar, #popup')) return;
  const b = document.body;
  if (b.classList.contains('panel-open')) { b.classList.remove('panel-open'); App.scheduleRender(); }
  if (b.classList.contains('side-open')) App.toggleSide();
}, true);

// ---------- Toque: pinça para zoom ----------
const viewer = $('#viewer'), pagesEl = $('#pages');
let pinch = null;
const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
viewer.addEventListener('touchstart', e => {
  if (e.touches.length !== 2 || !state.pdf) return;
  if (state.penSeen && App.penRecente?.(700)) return; // mão apoiada enquanto escreve, não pinça
  const [a, b] = e.touches;
  const mid = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
  const pr = pagesEl.getBoundingClientRect();
  pinch = { d0: dist(a, b), mid, ratio: 1 };
  pagesEl.style.transformOrigin = `${mid.x - pr.left}px ${mid.y - pr.top}px`;
  getSelection().removeAllRanges();
}, { passive: true });
viewer.addEventListener('touchmove', e => {
  if (!pinch || e.touches.length !== 2) return;
  e.preventDefault();
  const [a, b] = e.touches;
  pinch.ratio = Math.max(0.4, Math.min(4, dist(a, b) / pinch.d0));
  pagesEl.style.transform = `scale(${pinch.ratio})`; // prévia rápida; o zoom de verdade é aplicado ao soltar
}, { passive: false });
const endPinch = () => {
  if (!pinch) return;
  const { ratio, mid } = pinch; pinch = null;
  pagesEl.style.transform = ''; pagesEl.style.transformOrigin = '';
  if (Math.abs(ratio - 1) > 0.03) App.zoomBy(ratio, mid);
};
viewer.addEventListener('touchend', e => { if (e.touches.length < 2) endPinch(); });
viewer.addEventListener('touchcancel', endPinch);

// ---------- Toque e S Pen: selecionar texto (segurar e arrastar as alças, ou arrastar a caneta) ----------
// No celular e no tablet a seleção termina sem o "soltou" do mouse (que o computador usa), então ela é tratada aqui.
let lastPointer = 'mouse', selT = null, penDown = false;
addEventListener('pointerdown', e => { lastPointer = e.pointerType; penDown = e.pointerType === 'pen'; }, true);
const finish = ms => {
  clearTimeout(selT);
  selT = setTimeout(() => {
    if (penDown || !App.hasSelection()) return; // caneta ainda arrastando: espera ela sair da tela
    if (state.autoHL) App.highlightSelection(); else App.selectionPopup();
  }, ms);
};
// a caneta saiu da tela: termina logo (sem esperar as alças)
addEventListener('pointerup', e => { if (e.pointerType === 'pen' && penDown) { penDown = false; finish(200); } }, true);
// o navegador assumiu o arraste para selecionar: a caneta pode continuar na tela, então espera como no dedo
addEventListener('pointercancel', e => { if (e.pointerType === 'pen') penDown = false; }, true);
document.addEventListener('selectionchange', () => {
  if (lastPointer === 'mouse' || !state.pdf) return;
  // espera a pessoa terminar de ajustar a seleção
  finish(650);
});
})();
