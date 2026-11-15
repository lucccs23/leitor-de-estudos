/* Vetra instalado (Windows): "Procurar atualizações". Compara com a versão do site; se houver uma nova,
   baixa os arquivos e reabre já atualizado (sem reinstalar). Confere sozinho uma vez por dia. */
(() => {
'use strict';
const App = window.App;
const { el, ls } = App;
const D = window.vetraDesktop;
if (!D || !D.checkUpdate) return; // só no app instalado

let bar = null;
function aviso(msg, acoes){
  bar?.remove();
  bar = el('div', 'pomoAlert'); bar.id = 'updateBar'; bar.setAttribute('role', 'status');
  bar.append(App.icon('download'), el('span', null, msg));
  const box = el('div', 'pomoAlertActs');
  acoes.forEach(([t, fn, cls]) => box.append(App.btn(t, () => { fn ? fn() : bar.remove(); }, cls || 'sm')));
  bar.append(box); document.body.append(bar);
}

async function atualizar(r){
  aviso(`Baixando o Vetra ${r.nova}…`, []);
  await App.saveDoc?.();
  const res = await D.applyUpdate();
  if (!res || !res.ok) aviso('Não consegui atualizar agora' + (res && res.error ? ': ' + res.error : '.'), [['Tentar de novo', () => atualizar(r), 'primary sm'], ['Fechar']]);
  // deu certo: o app reabre sozinho na versão nova
}

App.checkUpdates = async (manual) => {
  if (manual) App.toast('Procurando atualizações…');
  let r;
  try { r = await D.checkUpdate(); } catch (e) { r = { ok: false, error: String(e) }; }
  ls.set('le.updChecked', App.dayKey());
  if (!r || !r.ok) { if (manual) App.toast('Não consegui verificar agora. Confira a internet e tente de novo.'); return r; }
  if (r.precisaInstalador) {
    aviso(`O Vetra ${r.nova} precisa do instalador novo para funcionar neste computador.`, [['Depois'], ['Baixar o instalador', () => { App.openExternal(r.instalador); bar.remove(); }, 'primary sm']]);
  } else if (r.temNova) {
    aviso(`Vetra ${r.nova} disponível (você tem a ${r.atual}).`, [['Depois'], ['Atualizar agora', () => atualizar(r), 'primary sm']]);
  } else if (manual) App.toast(`Você já tem a versão mais nova (${r.atual}).`);
  return r;
};

// uma vez por dia, alguns segundos depois de abrir
setTimeout(() => { if (ls.get('le.updChecked', '') !== App.dayKey() && navigator.onLine) App.checkUpdates(false); }, 8000);
})();
