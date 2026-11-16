/* Barra de cima personalizável + menus Exibir e Estudar.
   Todas as funções ficam num cadastro único (App.commands), usado pela barra, pelos menus e pela paleta (Ctrl+K).
   A barra mostra só a lista que você escolher; no modo "Personalizar a barra" dá para arrastar funções
   para a barra, reordenar arrastando e tirar o que não usa. */
(() => {
'use strict';
const App = window.App;
const { $, $$, el, state, ls } = App;

// ---------- Cadastro de funções ----------
const doc = () => !!state.pdf;
const toolOpen = k => () => document.querySelector(`#toolsDlg [data-tool-open="${k}"]`)?.click();
const L = () => App.layout || {};
const ttsOn = () => !!(App.ttsState && App.ttsState.on);
// el: botão que já existe (com estado próprio: badge, tempo, "ligado"); sem el, um botão é criado com o ícone
const C = [
  // Arquivo
  { id: 'open', group: 'Arquivo', label: 'Abrir PDF', icon: 'folder', key: 'Ctrl+O', run: () => App.fileOpen() },
  { id: 'save', group: 'Arquivo', label: 'Salvar', icon: 'download', key: 'Ctrl+S', doc: true, run: () => App.fileSave() },
  { id: 'saveAs', group: 'Arquivo', label: 'Salvar como…', icon: 'download', key: 'Ctrl+Shift+S', doc: true, run: () => App.fileSaveAs() },
  { id: 'print', group: 'Arquivo', label: 'Imprimir', icon: 'printer', key: 'Ctrl+P', doc: true, run: () => App.filePrint() },
  { id: 'props', group: 'Arquivo', label: 'Propriedades do PDF', icon: 'list', key: 'Ctrl+D', doc: true, run: () => App.fileProps() },
  { id: 'closeDoc', group: 'Arquivo', label: 'Fechar arquivo', icon: 'x', key: 'Ctrl+W', doc: true, run: () => App.closeTab(state.fp) },
  { id: 'home', group: 'Arquivo', label: 'Início (documentos recentes)', icon: 'book', run: () => App.closeDoc() },
  // Exibir
  { id: 'sidebar', group: 'Exibir', label: 'Barra lateral', keywords: 'sumário páginas marcadores', short: 'Barra lateral', icon: 'sidebar', key: 'S', doc: true, el: '#btnSidebar', run: () => App.toggleSide(), on: () => document.body.classList.contains('side-open') },
  { id: 'panel', group: 'Exibir', label: 'Painel de grifos', icon: 'panel', key: 'H', doc: true, el: '#btnPanel', run: () => App.togglePanel(), on: () => document.body.classList.contains('panel-open') },
  { id: 'continuous', group: 'Exibir', label: 'Rolagem contínua', icon: 'list', doc: true, run: () => App.setLayout({ paged: false }), on: () => !L().paged, radio: true },
  { id: 'paged', group: 'Exibir', label: 'Página por página', icon: 'pages', doc: true, run: () => App.setLayout({ paged: true }), on: () => !!L().paged, radio: true },
  { id: 'spread', group: 'Exibir', label: 'Duas páginas lado a lado', icon: 'book', doc: true, run: () => App.setLayout({ spread: !L().spread }), on: () => !!L().spread },
  { id: 'dockTop', group: 'Exibir', label: 'Barra de marcação presa no topo', keywords: 'barra ferramentas topo fixar prender posição', icon: 'pin', doc: true, run: () => App.toggleBarTop('dock'), on: () => !!App.barTop?.('dock') },
  { id: 'pagerTop', group: 'Exibir', label: 'Controle de página preso no topo', keywords: 'página zoom topo fixar prender posição', icon: 'pin', doc: true, run: () => App.toggleBarTop('pager'), on: () => !!App.barTop?.('pager') },
  { id: 'ruler', group: 'Exibir', label: 'Régua de leitura', icon: 'ruler', key: 'U', doc: true, run: () => App.toggleRuler(), on: () => !!ls.get('le.ruler', false) },
  { id: 'split', group: 'Exibir', label: 'Lado a lado com outro PDF', short: 'Lado a lado', icon: 'columns', key: 'L', doc: true, el: '#btnSplit', run: a => App.toggleSplit(a), on: () => document.body.classList.contains('split-on') },
  { id: 'tts', group: 'Exibir', label: 'Ouvir em voz alta', short: 'Ouvir', icon: 'speaker', doc: true, el: '#btnTts', run: () => (ttsOn() ? App.ttsStop() : App.ttsStart()), on: ttsOn },
  { id: 'fullscreen', group: 'Exibir', label: 'Tela cheia (modo foco)', short: 'Tela cheia', icon: 'focus', key: 'F', doc: true, el: '#btnFocus', run: () => App.toggleFocus(), on: () => document.body.classList.contains('focus') },
  { id: 'theme', group: 'Exibir', label: 'Alternar claro e escuro', short: 'Tema', icon: 'moon', key: 'D', el: '#btnTheme', run: () => App.toggleDark() },
  { id: 'zoomIn', group: 'Exibir', label: 'Aumentar o zoom', icon: 'plus', key: 'Ctrl+=', doc: true, run: () => App.zoomBy(1.15) },
  { id: 'zoomOut', group: 'Exibir', label: 'Diminuir o zoom', icon: 'minus', key: 'Ctrl+−', doc: true, run: () => App.zoomBy(1 / 1.15) },
  { id: 'fit', group: 'Exibir', label: 'Ajustar à largura', icon: 'fit', key: 'Ctrl+0', doc: true, run: () => App.fitWidth() },
  { id: 'fitPage', group: 'Exibir', label: 'Página inteira na tela', icon: 'fitpage', key: 'Ctrl+9', doc: true, run: () => App.fitPage(), on: () => !!(App.state.autoFit && App.state.fitMode === 'page') },
  { id: 'actualSize', group: 'Exibir', label: 'Tamanho real (100%)', icon: 'zoomreal', key: 'Ctrl+1', doc: true, run: () => App.actualSize() },
  { id: 'dock', group: 'Exibir', label: 'Mostrar ou recolher as ferramentas de grifo', short: 'Ferramentas de grifo', icon: 'highlighter', key: 'T', doc: true, run: () => App.toggleDock?.() },
  { id: 'look', group: 'Exibir', label: 'Aparência e leitura…', short: 'Aparência', icon: 'palette', run: () => App.openLook() },
  // Estudar
  { id: 'review', group: 'Estudar', label: 'Revisar grifos', short: 'Revisar', icon: 'cards', key: 'R', doc: true, el: '#btnReview', run: () => App.openReview() },
  { id: 'exam', group: 'Estudar', label: 'Modo simulado', short: 'Simulado', icon: 'exam', doc: true, el: '#btnExam', run: () => App.openExam() },
  { id: 'examNew', group: 'Estudar', label: 'Novo simulado / configurar…', keywords: 'prova gabarito tempo', icon: 'exam', doc: true, run: () => App.openExamSetup() },
  { id: 'summary', group: 'Estudar', label: 'Caderno de resumo (PDF)', short: 'Caderno de resumo', icon: 'book', run: () => App.openSummary() },
  { id: 'ai', group: 'Estudar', label: 'Perguntar à IA', icon: 'ai', doc: true, el: '#btnAi', run: a => App.aiOpen ? App.aiOpen(a) : $('#btnAi').click() },
  { id: 'search', group: 'Estudar', label: 'Buscar neste PDF', icon: 'search', key: 'Ctrl+F', doc: true, el: '#btnSearch', run: () => App.openSearch() },
  { id: 'plan', group: 'Estudar', label: 'Plano de leitura…', short: 'Plano', keywords: 'meta prazo páginas por dia', icon: 'target', doc: true, run: () => App.openPlan() },
  { id: 'siglas', group: 'Estudar', label: 'Siglas deste PDF', short: 'Siglas', keywords: 'abreviações glossário', icon: 'list', doc: true, run: () => App.openSiglas() },
  { id: 'aiHistory', group: 'Estudar', label: 'Respostas da IA guardadas', keywords: 'histórico ia claude chatgpt', icon: 'news', run: () => App.openAiHistory() },
  { id: 'aiChapter', group: 'Estudar', label: 'Perguntar à IA sobre o capítulo', keywords: 'resumo capítulo questões', icon: 'book', doc: true, run: a => App.aiChapterMenu(a || $('#btnAi')) },
  { id: 'aiHighlights', group: 'Estudar', label: 'Perguntar à IA sobre meus grifos', keywords: 'grifos resumo questões', icon: 'highlighter', doc: true, run: a => App.aiHighlightsMenu(a || $('#btnAi')) },
  { id: 'aiPrompts', group: 'Estudar', label: 'IA: pedidos e atalhos…', keywords: 'prompts pedidos', icon: 'ai', run: () => App.openAiPrompts() },
  { id: 'markdown', group: 'Arquivo', label: 'Exportar resumo em texto (.md)', short: 'Markdown', keywords: 'obsidian notion', icon: 'markdown', run: () => App.exportMd() },
  { id: 'pen', group: 'Estudar', label: 'Caneta', keywords: 'desenhar escrever stylus', icon: 'pen', key: 'P', doc: true, run: () => App.setTool('ink') },
  { id: 'eraser', group: 'Estudar', label: 'Borracha', icon: 'eraser', key: 'E', doc: true, run: () => App.setTool('erase') },
  { id: 'searchAll', group: 'Estudar', label: 'Buscar em todos os PDFs', icon: 'search', key: 'Ctrl+Shift+F', run: () => App.searchAll('') },
  { id: 'bookmark', group: 'Estudar', label: 'Marcar esta página', icon: 'bookmark', key: 'B', doc: true, run: () => App.toggleBookmark() },
  { id: 'pomo', group: 'Estudar', label: 'Timer (pomodoro e cronômetro)', keywords: 'pomodoro cronômetro focus relógio', short: 'Timer', icon: 'clock', el: '#btnPomo', run: () => $('#btnPomo').click() },
  { id: 'stats', group: 'Estudar', label: 'Estatísticas', keywords: 'tempo estudo sessões gráfico', icon: 'chart', run: () => App.openStats() },
  { id: 'pomoSettings', group: 'Estudar', label: 'Esquemas de foco…', icon: 'clock', run: () => App.openPomoSettings() },
  { id: 'tools', group: 'Ferramentas', label: 'Ferramentas (todas)', short: 'Ferramentas', icon: 'tools', key: 'O', el: '#btnTools', run: () => App.openTools() },
  { id: 'organize', group: 'Ferramentas', label: 'Organizar páginas', icon: 'pages', doc: true, run: toolOpen('organize') },
  { id: 'combine', group: 'Ferramentas', label: 'Combinar PDFs', icon: 'merge', run: toolOpen('combine') },
  { id: 'photos', group: 'Ferramentas', label: 'Criar PDF de fotos', icon: 'camera', run: toolOpen('photos') },
  { id: 'ocr', group: 'Ferramentas', label: 'Reconhecer texto (OCR)', icon: 'scan', doc: true, run: () => App.runOcr() },
  // Configurações
  { id: 'customize', group: 'Configurações', label: 'Personalizar a barra…', icon: 'pin', run: () => App.customizeToolbar() },
  { id: 'about', group: 'Ajuda', label: 'Sobre o Vetra', icon: 'info', run: () => App.openAbout() },
  { id: 'shortcuts', group: 'Ajuda', label: 'Atalhos do teclado', icon: 'keyboard', key: 'F1', run: () => App.openHelp() },
  { id: 'backupNow', group: 'Configurações', label: 'Fazer backup agora', icon: 'cloud', run: () => App.backupNow?.() },
  { id: 'sync', group: 'Configurações', label: 'Sincronizar aparelhos…', short: 'Sincronizar', keywords: 'nuvem celular tablet github', icon: 'restore', run: () => App.openSync() },
  { id: 'updOnOpen', group: 'Ajuda', label: 'Procurar sempre ao abrir o Vetra', keywords: 'atualização automática iniciar', icon: 'clock', run: () => App.toggleUpdOnOpen?.(), on: () => !!ls.get('le.updOnOpen', false) },
  { id: 'updates', group: 'Ajuda', label: 'Procurar atualizações…', badge: () => App.updateInfo && App.updateInfo.temNova ? 'nova' : '', label2: 'Procurar atualizações', keywords: 'versão nova atualizar', icon: 'download', run: () => (App.checkUpdates ? App.checkUpdates(true) : App.toast('No celular e no site, o Vetra se atualiza sozinho.')) },
  { id: 'news', group: 'Ajuda', label: 'Novidades', icon: 'news', run: () => App.openNews?.() },
];
App.commands = C;
const byId = id => C.find(c => c.id === id);
App.command = byId;
App.runCommand = (id, anchor) => {
  const c = byId(id); if (!c) return;
  if (c.doc && !state.pdf) { App.toast('Abra um PDF primeiro.'); return; }
  closeMenus(); c.run(anchor);
  setTimeout(refreshPins, 50);
};
App.commandAvailable = c => !c.doc || doc();

// ---------- Menus Exibir e Estudar ----------
const MENUS = {
  view: { btn: '#btnView', box: '#viewMenu', items: ['sidebar', 'panel', '-', 'continuous', 'paged', 'spread', 'ruler', '-', 'split', 'tts', 'fullscreen', '-', 'themes', 'zoomIn', 'zoomOut', 'fit', 'fitPage', 'actualSize', '-', 'dockTop', 'pagerTop', '-', 'look'] },
  help: { btn: '#btnHelpMenu', box: '#helpMenu', items: ['updates', 'updOnOpen', '-', 'news', 'shortcuts', '-', 'about'] },
  study: { btn: '#btnStudy', box: '#studyMenu', items: ['review', 'exam', 'examNew', 'summary', 'siglas', '-', 'ai', 'aiChapter', 'aiHighlights', 'aiHistory', 'aiPrompts', '-', 'plan', 'stats', 'pomoSettings', '-', 'searchAll', 'bookmark', '-', 'organize', 'combine', 'photos', 'ocr'] },
};
let openMenu = null;
function menuItem(c){
  const b = el('button', 'fmItem'); b.type = 'button'; b.dataset.cmd = c.id;
  const isOn = c.on ? c.on() : false;
  b.append(App.icon(c.icon), el('span', 'fmLabel', c.label));
  if (c.on) b.append(App.icon(isOn ? 'check' : 'x', 'i fmCheck' + (isOn ? ' on' : '')));
  if (c.key) b.append(el('kbd', null, c.key));
  const badge = c.badge && c.badge(); if (badge) b.append(el('span', 'fmBadge', badge));
  b.disabled = !App.commandAvailable(c);
  b.onclick = e => { e.stopPropagation(); App.runCommand(c.id, $(MENUS[openMenu]?.btn)); };
  return b;
}
function themesItem(){
  const wrap = el('div', 'fmSubWrap');
  const b = el('button', 'fmItem fmHasSub'); b.type = 'button';
  b.append(App.icon('moon'), el('span', 'fmLabel', 'Tema'), App.icon('right', 'i fmChev'));
  b.onclick = e => { e.stopPropagation(); wrap.classList.toggle('open'); };
  const sub = el('div', 'fileMenu fmSub');
  for (const [id, T] of Object.entries(App.THEMES)) {
    const t = el('button', 'fmItem'); t.type = 'button';
    const on = App.currentTheme() === id;
    t.append(el('span', 'fmNoIcon'), el('span', 'fmLabel', T.name));
    if (on) t.append(App.icon('check', 'i fmCheck on'));
    t.onclick = e => { e.stopPropagation(); App.applyTheme(id, true); closeMenus(); };
    sub.append(t);
  }
  if (document.documentElement.dataset.theme === 'dark') {
    const orig = ls.get('le.darkPage', 'invert') === 'normal';
    const t = el('button', 'fmItem'); t.type = 'button';
    t.append(el('span', 'fmNoIcon'), el('span', 'fmLabel', 'Página original (clara) no escuro'), App.icon(orig ? 'check' : 'x', 'i fmCheck' + (orig ? ' on' : '')));
    t.onclick = e => { e.stopPropagation(); App.setDarkPage(orig ? 'invert' : 'normal'); closeMenus(); };
    sub.append(el('div', 'fmSep'), t);
  }
  wrap.append(b, sub);
  return wrap;
}
function buildMenu(name){
  const M = MENUS[name], box = $(M.box);
  box.innerHTML = '';
  for (const id of M.items) {
    if (id === '-') { box.append(el('div', 'fmSep')); continue; }
    if (id === 'themes') { box.append(themesItem()); continue; }
    const c = byId(id); if (c) box.append(menuItem(c));
  }
}
function showMenu(name){
  closeMenus(name);
  const M = MENUS[name];
  buildMenu(name);
  $(M.box).hidden = false; $(M.btn).classList.add('on'); openMenu = name;
}
function closeMenus(except){
  for (const [n, M] of Object.entries(MENUS)) if (n !== except) { $(M.box).hidden = true; $(M.btn).classList.remove('on'); }
  if (!except) openMenu = null;
  if (except !== 'file' && !$('#fileMenu').hidden) { $('#fileMenu').hidden = true; $('#btnFile').classList.remove('on'); }
}
App.closeBarMenus = () => closeMenus();
for (const [name, M] of Object.entries(MENUS)) {
  $(M.btn).onclick = e => { e.stopPropagation(); if (openMenu === name) closeMenus(); else showMenu(name); };
  // com um menu aberto, passar o mouse em outro troca (como numa barra de menus comum)
  $(M.btn).onmouseenter = () => { if (openMenu && openMenu !== name) showMenu(name); };
}
$('#btnFile').addEventListener('mouseenter', () => { if (openMenu) { closeMenus(); $('#btnFile').click(); } });
$('#btnFile').addEventListener('click', () => { for (const M of Object.values(MENUS)) { $(M.box).hidden = true; $(M.btn).classList.remove('on'); } openMenu = null; }, true);
document.addEventListener('mousedown', e => { if (openMenu && !e.target.closest?.('.barMenu')) closeMenus(); });
document.addEventListener('keydown', e => { if (openMenu && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); const b = $(MENUS[openMenu].btn); closeMenus(); b.focus(); } }, true);

// ---------- Barra personalizável ----------
const DEFAULT_PINS = ['cmdk', 'ai', 'exam', 'pomo', 'panel'];
const pins = () => { const p = ls.get('le.tbPins', null); return Array.isArray(p) ? p.filter(id => id === 'cmdk' || byId(id)) : DEFAULT_PINS.slice(); };
const savePins = p => { ls.set('le.tbPins', p); renderPins(); };
const zone = $('#tbPins'), stash = $('#tbStash');
const made = new Map(); // botões criados para funções sem botão próprio
function pinEl(id){
  if (id === 'cmdk') {
    if (!made.has(id)) {
      const b = el('button', 'btn cmdkPill'); b.type = 'button';
      b.append(App.icon('search'), el('span', 'cmdkText', 'Buscar ou comando'), el('kbd', null, 'Ctrl K'));
      b.title = 'Buscar ou comando (Ctrl+K): digite o nome de qualquer função ou o que quer buscar'; b.setAttribute('aria-label', 'Buscar ou comando');
      b.onclick = () => App.openPalette?.();
      made.set(id, b);
    }
    return made.get(id);
  }
  const c = byId(id); if (!c) return null;
  if (c.el) return $(c.el);
  if (!made.has(id)) {
    const b = el('button', 'btn icon' + (c.doc ? ' doc-only' : '')); b.type = 'button';
    b.append(App.icon(c.icon));
    b.title = c.label + (c.key ? ` (${c.key})` : ''); b.setAttribute('aria-label', c.label);
    b.onclick = () => App.runCommand(id, b);
    made.set(id, b);
  }
  return made.get(id);
}
function renderPins(){
  const list = pins();
  // tudo o que não está na barra volta para o guarda-volumes (os botões próprios continuam funcionando)
  for (const c of C) if (c.el && !list.includes(c.id)) { const e = $(c.el); if (e && e.parentElement !== stash) stash.append(e); }
  zone.querySelectorAll(':scope > *').forEach(e => { if (!list.some(id => pinEl(id) === e)) { if (e.id) stash.append(e); else e.remove(); } });
  for (const id of list) {
    const e = pinEl(id); if (!e) continue;
    e.dataset.pin = id; zone.append(e);
  }
  refreshPins();
  App.updateExamBtn?.();
  reqFit();
}

// ---------- A barra sempre cabe na tela (celular): primeiro encolhe, depois manda o que sobrar para "⋯" ----------
const toolbar = $('#toolbar'), tbRight = $('.tbRight');
const more = el('button', 'btn icon tbMore'); more.type = 'button'; more.id = 'btnTbMore'; more.hidden = true;
more.append(App.icon('more')); more.title = 'Mais botões da barra'; more.setAttribute('aria-label', 'Mais botões da barra');
zone.after(more);
let fitRaf = 0;
const reqFit = () => { if (!fitRaf) fitRaf = requestAnimationFrame(fitBar); };
const visible = e => e.offsetWidth > 0 && getComputedStyle(e).display !== 'none';
// no celular a página pode "esticar" para caber a barra; por isso compara também com a largura real da tela
const tooWide = () => toolbar.scrollWidth > Math.min(toolbar.clientWidth, Math.floor(window.visualViewport?.width || innerWidth), (matchMedia('(pointer:coarse)').matches && screen.width) || Infinity);
function fitBar(){
  fitRaf = 0;
  const kids = [...zone.children];
  kids.forEach(e => e.classList.remove('tbFitHide'));
  more.hidden = true; document.body.classList.remove('tb-fit');
  if (!tooWide()) return;
  document.body.classList.add('tb-fit');           // 1º: botões com texto viram só ícone
  if (!tooWide()) return;
  more.hidden = false;                             // 2º: os últimos botões vão para o menu "⋯"
  // nunca esconde o que está em andamento (timer rodando, simulado para continuar)
  // o que sai primeiro: painel, timer parado, IA e busca; o simulado fica por último (é o mais usado)
  const FIRST = ['panel', 'pomo', 'ai', 'cmdk'], rank = e => { const i = FIRST.indexOf(e.dataset.pin); return i < 0 ? 100 - kids.indexOf(e) : i; };
  const cands = kids.filter(e => visible(e) && !e.matches('.running, .resume')).sort((x, y) => rank(x) - rank(y));
  for (const e of cands) { e.classList.add('tbFitHide'); if (!tooWide()) break; }
}
more.onclick = () => {
  const hidden = [...zone.children].filter(e => e.classList.contains('tbFitHide'));
  App.popMenu(more, hidden.map(e => ({
    icon: (e.querySelector('use')?.getAttribute('href') || '').replace('#i-', '') || 'more',
    label: (e.dataset.pin === 'cmdk' ? 'Buscar ou comando' : (byId(e.dataset.pin)?.short || byId(e.dataset.pin)?.label)) || e.getAttribute('aria-label') || e.textContent.trim(),
    on: () => e.click(),
  })), { alignRight: true });
};
new ResizeObserver(reqFit).observe(toolbar);
new MutationObserver(reqFit).observe(zone, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'hidden'] });
['doc:loaded', 'doc:closed', 'layout:changed'].forEach(ev => App.on(ev, reqFit));
window.visualViewport?.addEventListener('resize', reqFit);
App.fitBar = reqFit;
// estado "ligado" dos botões criados (ex.: régua, duas páginas)
function refreshPins(){
  for (const [id, b] of made) { const c = byId(id); if (c && c.on) b.classList.toggle('on', !!c.on()); }
}
App.refreshPins = refreshPins;
['layout:changed', 'theme:changed', 'doc:loaded', 'doc:closed'].forEach(ev => App.on(ev, refreshPins));
App.toolbarPins = pins;

// ---------- Modo "Personalizar a barra" ----------
let custom = null, dragId = null, dragFrom = null;
App.customizeToolbar = () => {
  if (custom) { endCustomize(); return; }
  closeMenus(); App.closePop?.();
  document.body.classList.add('tb-customizing', 'tb-show');
  custom = el('div', 'tbCustom'); custom.setAttribute('role', 'dialog'); custom.setAttribute('aria-label', 'Personalizar a barra');
  document.body.append(custom);
  buildCustom();
  custom.addEventListener('dragover', e => { if (dragFrom === 'bar') { e.preventDefault(); custom.classList.add('dropOut'); } });
  custom.addEventListener('dragleave', () => custom.classList.remove('dropOut'));
  custom.addEventListener('drop', e => { e.preventDefault(); custom.classList.remove('dropOut'); if (dragFrom === 'bar') removePin(dragId); });
};
function endCustomize(){
  document.body.classList.remove('tb-customizing', 'tb-show');
  custom?.remove(); custom = null;
  zone.querySelectorAll('.pinX').forEach(x => x.remove());
  zone.querySelectorAll('[draggable]').forEach(b => b.removeAttribute('draggable'));
}
function removePin(id){ savePins(pins().filter(x => x !== id)); buildCustom(); }
function addPin(id, at){
  const p = pins().filter(x => x !== id);
  p.splice(at == null ? p.length : at, 0, id);
  savePins(p); buildCustom();
}
function buildCustom(){
  if (!custom) return;
  custom.innerHTML = '';
  const head = el('div', 'tbcHead');
  const t = el('div', 'tbcTitle'); t.append(el('strong', null, 'Personalizar a barra'), el('span', 'muted small', 'Arraste uma função para a barra lá em cima. Na barra, arraste para mudar a ordem (isso funciona a qualquer hora, mesmo fora daqui), ou arraste de volta para cá (ou clique no ×) para tirar.'));
  head.append(t,
    App.btn('Restaurar padrão', () => { savePins(DEFAULT_PINS.slice()); buildCustom(); }, 'sm outline'),
    App.btn('Pronto', endCustomize, 'primary sm'));
  custom.append(head);
  const list = pins();
  const groups = [['', [{ id: 'cmdk', label: 'Buscar ou comando (Ctrl+K)', icon: 'search' }]], ...['Arquivo', 'Exibir', 'Estudar', 'Ferramentas', 'Configurações'].map(g => [g, C.filter(c => c.group === g)])];
  const body = el('div', 'tbcBody');
  for (const [g, items] of groups) {
    const sec = el('div', 'tbcGroup');
    sec.append(el('div', 'tbcLabel', g || 'Busca'));
    const row = el('div', 'tbcItems');
    for (const c of items) {
      const on = list.includes(c.id);
      const chip = el('button', 'tbcChip' + (on ? ' on' : '')); chip.type = 'button'; chip.draggable = true;
      chip.append(App.icon(c.icon), el('span', null, c.short || c.label));
      if (on) chip.append(App.icon('check', 'i tbcOn'));
      chip.title = on ? 'Já está na barra — clique para tirar' : 'Arraste para a barra (ou clique para pôr no fim)';
      chip.onclick = () => (on ? removePin(c.id) : addPin(c.id));
      chip.addEventListener('dragstart', e => { dragId = c.id; dragFrom = 'panel'; e.dataTransfer.setData('text/plain', c.id); e.dataTransfer.effectAllowed = 'move'; document.body.classList.add('tb-dragging'); });
      chip.addEventListener('dragend', () => { dragId = dragFrom = null; document.body.classList.remove('tb-dragging'); clearMarks(); });
      row.append(chip);
    }
    sec.append(row); body.append(sec);
  }
  custom.append(body);
  // botões na barra: arrastáveis, com × para tirar
  zone.querySelectorAll(':scope > [data-pin]').forEach(b => {
    b.draggable = true;
    if (!b.querySelector(':scope > .pinX')) {
      const x = el('span', 'pinX'); x.textContent = '×'; x.title = 'Tirar da barra';
      x.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); removePin(b.dataset.pin); });
      b.append(x);
    }
    b.ondragstart = e => { dragId = b.dataset.pin; dragFrom = 'bar'; e.dataTransfer.setData('text/plain', dragId); e.dataTransfer.effectAllowed = 'move'; document.body.classList.add('tb-dragging'); };
    b.ondragend = () => { dragId = dragFrom = null; document.body.classList.remove('tb-dragging'); clearMarks(); };
  });
}
// soltar na barra: posição pela metade de cada botão
function dropIndex(x){
  const items = [...zone.querySelectorAll(':scope > [data-pin]')];
  for (let i = 0; i < items.length; i++) { const r = items[i].getBoundingClientRect(); if (x < r.left + r.width / 2) return { i, el: items[i] }; }
  return { i: items.length, el: null };
}
function clearMarks(){ zone.querySelectorAll('.dropBefore').forEach(e => e.classList.remove('dropBefore')); zone.classList.remove('dropEnd', 'dropHover'); }
zone.addEventListener('dragover', e => {
  if (!custom || !dragId) return;
  e.preventDefault(); clearMarks(); zone.classList.add('dropHover');
  const { el: target } = dropIndex(e.clientX);
  if (target) target.classList.add('dropBefore'); else zone.classList.add('dropEnd');
});
zone.addEventListener('dragleave', e => { if (!zone.contains(e.relatedTarget)) clearMarks(); });
zone.addEventListener('drop', e => {
  if (!custom || !dragId) return;
  e.preventDefault();
  let { i } = dropIndex(e.clientX);
  const p = pins(), from = p.indexOf(dragId);
  if (from >= 0 && from < i) i--; // reordenando para a direita
  clearMarks();
  addPin(dragId, i);
});
// no modo personalizar, clicar num botão da barra não executa a função
zone.addEventListener('click', e => { if (custom && e.target.closest('[data-pin]') && !e.target.closest('.pinX')) { e.stopPropagation(); e.preventDefault(); } }, true);
document.addEventListener('keydown', e => { if (custom && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endCustomize(); } }, true);
// ---------- Arrastar direto na barra (sem entrar no modo personalizar) ----------
// segure um botão e arraste para o lado: os outros abrem espaço e a nova ordem fica salva
let rd = null, eatClick = false;
const visPins = () => [...zone.querySelectorAll(':scope > [data-pin]')].filter(b => b.offsetWidth > 0);
zone.addEventListener('pointerdown', e => {
  if (custom || e.button !== 0 || e.pointerType === 'touch') return;
  const b = e.target.closest('[data-pin]'); if (!b || b.parentElement !== zone) return;
  rd = { b, x0: e.clientX, y0: e.clientY, on: false, pid: e.pointerId };
});
addEventListener('pointermove', e => {
  if (!rd || e.pointerId !== rd.pid) return;
  const dx = e.clientX - rd.x0;
  if (!rd.on) {
    if (Math.abs(dx) < 7 || Math.abs(e.clientY - rd.y0) > 30) return;
    const vis = visPins(); if (vis.length < 2) { rd = null; return; }
    rd.on = true; rd.vis = vis.filter(x => x !== rd.b); rd.from = vis.indexOf(rd.b);
    const r = rd.b.getBoundingClientRect(); rd.c0 = r.left + r.width / 2; rd.w = r.width + 2;
    rd.centers = rd.vis.map(x => { const q = x.getBoundingClientRect(); return q.left + q.width / 2; });
    rd.b.classList.add('tbDrag'); document.body.classList.add('tb-reordering');
    App.closePop?.(); closeMenus();
  }
  e.preventDefault();
  rd.b.style.transform = `translateX(${dx}px)`;
  const c = rd.c0 + dx;
  rd.to = rd.centers.filter(x => x < c).length;
  rd.vis.forEach((x, k) => {
    let s = 0;
    if (rd.to > rd.from && k >= rd.from && k < rd.to) s = -rd.w;
    else if (rd.to < rd.from && k >= rd.to && k < rd.from) s = rd.w;
    x.style.transform = s ? `translateX(${s}px)` : '';
  });
}, { passive: false });
const endReorder = () => {
  if (!rd) return;
  const d = rd; rd = null;
  if (!d.on) return;
  eatClick = true; setTimeout(() => { eatClick = false; }, 0);
  document.body.classList.remove('tb-reordering');
  d.b.classList.remove('tbDrag');
  zone.querySelectorAll(':scope > [data-pin]').forEach(x => { x.style.transform = ''; });
  if (d.to === d.from) return;
  // nova ordem: tira o botão e põe antes do vizinho visível da posição escolhida
  const all = [...zone.querySelectorAll(':scope > [data-pin]')].map(x => x.dataset.pin).filter(id => id !== d.b.dataset.pin);
  const ref = d.vis[d.to];
  let at = ref ? all.indexOf(ref.dataset.pin) : all.indexOf(d.vis[d.vis.length - 1].dataset.pin) + 1;
  all.splice(at, 0, d.b.dataset.pin);
  const rest = pins().filter(id => !all.includes(id));
  savePins([...all, ...rest]);
};
addEventListener('pointerup', endReorder);
addEventListener('pointercancel', endReorder);
// soltar depois de arrastar não "clica" no botão
zone.addEventListener('click', e => { if (eatClick) { eatClick = false; e.stopPropagation(); e.preventDefault(); } }, true);

// botão direito na barra: atalho para personalizar
$('#toolbar').addEventListener('contextmenu', e => {
  if (e.target.closest('input, .tab, #tabs')) return;
  e.preventDefault();
  App.popMenu(e.target.closest('button') || $('#btnMenu'), [{ label: 'Personalizar a barra…', icon: 'pin', on: App.customizeToolbar }], { alignRight: true });
});

renderPins();
})();
