/* Ajuda → Procurar atualizações e Sobre o Vetra.
   - Vetra instalado (Windows): compara com a versão do site; se houver nova, baixa os arquivos e reabre (sem reinstalar).
     Confere sozinho uma vez por dia.
   - Site / celular / tablet: pede ao navegador a versão nova do app (o aviso "Há uma versão nova" faz o resto). */
(() => {
'use strict';
const App = window.App;
const { $, el, ls } = App;
const D = window.vetraDesktop && window.vetraDesktop.checkUpdate ? window.vetraDesktop : null;
const RELEASES = 'https://github.com/lucccs23/leitor-de-estudos/releases/latest';
const SITE = 'https://lucccs23.github.io/leitor-de-estudos/';
// app de Android: o APK novo fica sempre com o mesmo nome na versão mais recente
const APK = 'https://github.com/lucccs23/leitor-de-estudos/releases/latest/download/Vetra-Android.apk';
const maior = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };

let bar = null;
function aviso(msg, acoes){
  bar?.remove();
  bar = el('div', 'pomoAlert updAlert'); bar.id = 'updateBar'; bar.setAttribute('role', 'status');
  bar.append(App.icon('download'), el('span', null, msg));
  const box = el('div', 'pomoAlertActs');
  acoes.forEach(([t, fn, cls]) => box.append(App.btn(t, () => { fn ? fn() : bar.remove(); }, cls || 'sm')));
  bar.append(box); document.body.append(bar);
}
// o menu Ajuda ganha um pontinho quando há versão nova
function marcar(r){
  App.updateInfo = r;
  $('#btnHelpMenu')?.classList.toggle('has-update', !!(r && (r.temNova || r.precisaInstalador)));
}

async function atualizar(r){
  aviso(`Baixando o Vetra ${r.nova}…`, []);
  await App.saveDoc?.();
  const res = await D.applyUpdate();
  if (!res || !res.ok) aviso('Não consegui atualizar agora' + (res && res.error ? ': ' + res.error : '.'), [['Tentar de novo', () => atualizar(r), 'primary sm'], ['Fechar']]);
  // deu certo: o app reabre sozinho na versão nova
}

App.checkUpdates = async manual => {
  if (manual) App.toast('Procurando atualizações…');
  // ---- app de Android: compara com a versão do site e oferece o APK novo ----
  if (App.native) {
    try {
      const txt = await (await fetch(SITE + 'sw.js?v=' + Date.now(), { cache: 'no-store' })).text();
      const nova = (txt.match(/VERSION = '([\d.]+)'/) || [])[1];
      ls.set('le.updChecked', App.dayKey());
      if (!nova) throw new Error('versão não encontrada');
      const temNova = maior(nova, App.VERSION);
      marcar({ temNova });
      if (temNova) aviso(`Vetra ${nova} disponível (você tem a ${App.VERSION}).`, [['Depois'], ['Baixar o APK novo', () => { location.href = APK; bar.remove(); }, 'primary sm']]);
      else if (manual) App.toast(`Você já tem a versão mais nova (${App.VERSION}).`);
      return { temNova, nova };
    } catch { if (manual) App.toast('Não consegui verificar agora. Confira a internet e tente de novo.'); return null; }
  }
  // ---- site / celular: atualização pelo navegador ----
  if (!D) {
    try {
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (!reg) { if (manual) App.toast('Este navegador atualiza o Vetra sozinho ao abrir o site.'); return null; }
      await reg.update();
      await new Promise(r => setTimeout(r, 1500));
      if (reg.waiting || reg.installing) { if (manual) App.toast('Versão nova encontrada: toque em "Atualizar" no aviso.'); return { temNova: true }; }
      if (manual) App.toast(`Você já tem a versão mais nova (${App.VERSION}).`);
      return { temNova: false };
    } catch { if (manual) App.toast('Não consegui verificar agora. Confira a internet e tente de novo.'); return null; }
  }
  // ---- Vetra instalado ----
  let r;
  try { r = await D.checkUpdate(); } catch (e) { r = { ok: false, error: String(e) }; }
  ls.set('le.updChecked', App.dayKey());
  if (!r || !r.ok) { if (manual) App.toast('Não consegui verificar agora. Confira a internet e tente de novo.'); return r; }
  marcar(r);
  if (r.precisaInstalador) {
    aviso(`O Vetra ${r.nova} precisa do instalador novo para funcionar neste computador.`, [['Depois'], ['Baixar o instalador', () => { App.openExternal(r.instalador || RELEASES); bar.remove(); }, 'primary sm']]);
  } else if (r.temNova) {
    aviso(`Vetra ${r.nova} disponível (você tem a ${r.atual}).`, [['Depois'], ['Atualizar agora', () => atualizar(r), 'primary sm']]);
  } else if (manual) App.toast(`Você já tem a versão mais nova (${r.atual}).`);
  return r;
};

// ---------- Sobre o Vetra ----------
App.openAbout = () => {
  const dlg = App.dialog('aboutDlg', 'propsDlg aboutDlg'); dlg.setAttribute('aria-label', 'Sobre o Vetra');
  dlg.innerHTML = '';
  const head = el('div', 'aboutHead');
  const logo = el('img'); logo.src = 'icons/icon-192.png'; logo.alt = '';
  const t = el('div');
  t.append(el('h2', null, 'Vetra'), el('div', 'muted', `Versão ${App.VERSION}${D ? ' · Windows' : App.isWeb ? ' · app do navegador' : ' · versão de testes'}`));
  head.append(logo, t, App.ibtn('x', null, () => dlg.close(), 'sm aboutClose', 'Fechar (Esc)'));
  const body = el('div', 'aboutBody');
  body.append(el('p', null, 'Leitor de PDF e EPUB para estudar: grifos, caneta, notas, revisão, simulados, IA, timer, estatísticas e sincronização entre aparelhos.'));
  const info = el('ul', 'aboutList');
  const li = (k, v) => { const l = el('li'); l.append(el('span', 'muted', k), el('span', null, v)); info.append(l); };
  li('Seus dados', D || !App.isWeb ? 'ficam neste computador' : 'ficam neste aparelho');
  if (D) li('Backups automáticos', 'Documentos\\Vetra\\Backups');
  li('Atualizações', D ? (ls.get('le.updOnOpen', false) ? 'procura sempre que o Vetra abre' : 'Ajuda → Procurar atualizações (ou sozinho, uma vez por dia)') : 'automáticas ao abrir o app');
  body.append(info);
  const acts = el('div', 'aboutActs');
  acts.append(App.ibtn('download', 'Procurar atualizações', () => { dlg.close(); App.checkUpdates(true); }, 'primary sm'),
    App.ibtn('news', 'Novidades', () => { dlg.close(); App.openNews?.(); }, 'sm outline'),
    App.ibtn('link', D ? 'Baixar o instalador' : 'Abrir o site', () => App.openExternal(D ? RELEASES : SITE), 'sm outline'));
  body.append(acts);
  dlg.append(head, body);
  if (!dlg.open) dlg.showModal();
};

// Ajuda → "Procurar sempre ao abrir o Vetra": confere toda vez que o programa abre (senão, uma vez por dia)
App.toggleUpdOnOpen = () => {
  const on = !ls.get('le.updOnOpen', false);
  ls.set('le.updOnOpen', on);
  App.toast(on ? 'O Vetra vai procurar atualizações sempre que for aberto.' : (D ? 'O Vetra volta a procurar atualizações uma vez por dia.' : 'Pronto: o navegador continua atualizando o Vetra sozinho.'));
  if (on && navigator.onLine) App.checkUpdates(false);
};
// ao abrir: alguns segundos depois (para não atrasar a abertura)
{
  const sempre = !!ls.get('le.updOnOpen', false);
  if (D || sempre || App.native) setTimeout(() => {
    if (!navigator.onLine) return;
    if (sempre || ls.get('le.updChecked', '') !== App.dayKey()) App.checkUpdates(false);
  }, sempre ? 3000 : 8000);
}
})();
