/* Abas: vários PDFs abertos na mesma janela. Só o ativo fica carregado na memória. */
(() => {
'use strict';
const App = window.App;
const { $, el, state, DB, safe } = App;

let tabs = App.ls.get('le.tabs', []).filter(t => t && t.fp);
const save = () => { App.ls.set('le.tabs', tabs); App.ls.set('le.activeTab', state.fp || null); };
App.tabList = () => tabs;

function render(){
  const bar = $('#tabbar'), box = $('#tabs');
  bar.hidden = !tabs.length; box.innerHTML = '';
  for (const t of tabs) {
    const tab = el('div', 'tab' + (t.fp === state.fp ? ' active' : ''));
    tab.title = t.name;
    tab.append(App.icon('file'), el('span', 'tname', App.baseName(t.name)));
    const x = el('button', 'tclose'); x.title = 'Fechar aba'; x.append(App.icon('x'));
    x.onclick = e => { e.stopPropagation(); closeTab(t.fp); };
    tab.append(x);
    tab.onclick = () => switchTo(t.fp);
    tab.onauxclick = e => { if (e.button === 1) { e.preventDefault(); closeTab(t.fp); } };
    box.append(tab);
  }
  const act = box.querySelector('.tab.active'); if (act) act.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
async function switchTo(fp, fallbackName){
  if (fp === state.fp) return;
  const t = tabs.find(x => x.fp === fp);
  const f = await safe(() => DB.get('files', fp), null);
  if (!f) {
    App.toast('Não encontrei este arquivo salvo. Abra o PDF de novo.');
    tabs = tabs.filter(x => x.fp !== fp); render(); save(); return;
  }
  await App.loadDoc(f.data, t ? t.name : (fallbackName || 'documento.pdf'));
}
async function closeTab(fp){
  const i = tabs.findIndex(t => t.fp === fp);
  if (i < 0) return;
  const closed = App.ls.get('le.closedTabs', []).filter(t => t.fp !== fp);
  closed.push(tabs[i]); App.ls.set('le.closedTabs', closed.slice(-10));
  tabs.splice(i, 1);
  if (fp === state.fp) {
    const next = tabs[i] || tabs[i - 1];
    if (next) await switchTo(next.fp); else await App.closeDoc();
  }
  render(); save();
}
App.switchTab = switchTo;
App.renameTab = (fp, name) => { const t = tabs.find(x => x.fp === fp); if (t) { t.name = name; render(); save(); } };
App.reopenClosedTab = async () => {
  const closed = App.ls.get('le.closedTabs', []);
  while (closed.length) {
    const t = closed.pop(); App.ls.set('le.closedTabs', closed);
    if (await safe(() => DB.has('files', t.fp), false)) { await switchTo(t.fp, t.name); return true; }
  }
  App.toast('Nenhuma aba fechada para reabrir'); return false;
};
App.closeTab = closeTab;
App.cycleTab = dir => {
  if (!tabs.length) return;
  const i = tabs.findIndex(t => t.fp === state.fp);
  const n = tabs[((i < 0 ? 0 : i + dir) + tabs.length) % tabs.length];
  if (n) switchTo(n.fp);
};
// ao abrir o Vetra: começa sempre na página inicial. As abas da última vez vão para "abas fechadas"
// (Ctrl+Shift+T reabre), e os PDFs continuam na lista da página inicial.
App.restoreTabs = async () => {
  if (tabs.length) {
    const closed = App.ls.get('le.closedTabs', []).filter(c => !tabs.some(t => t.fp === c.fp));
    App.ls.set('le.closedTabs', [...closed, ...tabs].slice(-10));
    tabs = [];
  }
  render(); save();
};

App.on('doc:loaded', ({ fp, name }) => {
  const ex = tabs.find(t => t.fp === fp);
  if (ex) ex.name = name; else tabs.push({ fp, name });
  render(); save();
});
App.on('doc:closed', () => { render(); save(); });
$('#btnNewTab').onclick = () => (App.fileOpen ? App.fileOpen() : $('#fileInput').click());
})();
