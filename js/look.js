/* Aparência e leitura: temas, cor de destaque, ajuste da página, cores dos grifos, barra de ferramentas,
   tamanho da interface, régua de leitura e modos de página (contínuo, página por página, duas páginas). */
(() => {
'use strict';
const App = window.App;
const { $, $$, el, state, ls } = App;
const root = document.documentElement;

// ---------- Cor de destaque ----------
const ACCENTS = [
  { id: 'indigo', name: 'Índigo', l: '#5856d6', d: '#9593ff' },
  { id: 'blue', name: 'Azul', l: '#2f6fdb', d: '#7aa9ff' },
  { id: 'teal', name: 'Verde-água', l: '#0f8a83', d: '#4fd1c5' },
  { id: 'green', name: 'Verde', l: '#2e8b57', d: '#6fd39a' },
  { id: 'pink', name: 'Rosa', l: '#c2407c', d: '#ff8ec4' },
  { id: 'orange', name: 'Laranja', l: '#c9631a', d: '#ffad66' },
  { id: 'red', name: 'Vermelho', l: '#c9363e', d: '#ff7a80' },
  { id: 'slate', name: 'Grafite', l: '#4b5563', d: '#c0c7d1' },
];
function applyAccent(id){
  const a = ACCENTS.find(x => x.id === id) || ACCENTS[0];
  if (a.id === 'indigo') { delete root.dataset.accent; root.style.removeProperty('--accent-l'); root.style.removeProperty('--accent-d'); }
  else { root.dataset.accent = a.id; root.style.setProperty('--accent-l', a.l); root.style.setProperty('--accent-d', a.d); }
  ls.set('le.accent', a.id);
}

// ---------- Página: tom no escuro, brilho, contraste, luz quente ----------
const TONES = [
  { id: 'auto', name: 'Automático', sub: 'combina com o tema' },
  { id: 'gray', name: 'Cinza-escuro', inv: 0.9 },
  { id: 'black', name: 'Preto', inv: 1 },
  { id: 'soft', name: 'Cinza suave', inv: 0.8 },
  { id: 'sepiadark', name: 'Sépia escura', inv: 0.88, extra: 'sepia(.45) saturate(.8)' },
  { id: 'navy', name: 'Azul-noite', inv: 0.9, extra: 'sepia(.35) hue-rotate(180deg) saturate(1.3)' },
];
const autoTone = () => ({ oled: 'black', night: 'navy', graphite: 'soft', contrast: 'black' })[root.dataset.variant] || 'gray';
const P = () => ({ tone: 'auto', bri: 1, con: 1, warm: 0, ...ls.get('le.pageLook', {}) });
let bgCtx = null;
function filterBg(filter){
  // cor do fundo da página depois do filtro (para as margens/bordas da página combinarem)
  try {
    bgCtx = bgCtx || Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
    bgCtx.filter = 'none'; bgCtx.clearRect(0, 0, 1, 1);
    const src = document.createElement('canvas'); src.width = src.height = 1;
    const s = src.getContext('2d'); s.fillStyle = '#fff'; s.fillRect(0, 0, 1, 1);
    bgCtx.filter = filter; bgCtx.drawImage(src, 0, 0);
    const [r, g, b] = bgCtx.getImageData(0, 0, 1, 1).data;
    return `rgb(${r},${g},${b})`;
  } catch { return null; }
}
function applyPage(){
  const p = P();
  const tone = TONES.find(t => t.id === (p.tone === 'auto' ? autoTone() : p.tone)) || TONES[1];
  const adj = (p.bri !== 1 ? ` brightness(${p.bri})` : '') + (p.con !== 1 ? ` contrast(${p.con})` : '') + (root.dataset.variant === 'contrast' && p.con === 1 ? ' contrast(1.12)' : '');
  const inv = `invert(${tone.inv}) hue-rotate(180deg)${tone.extra ? ' ' + tone.extra : ''}${adj}`;
  root.style.setProperty('--pg-filter', inv);
  const bgI = filterBg(inv); if (bgI) root.style.setProperty('--pg-bg', bgI);
  if (adj) { root.style.setProperty('--pg-filter-n', adj.trim()); const bgN = filterBg(adj.trim()); if (bgN) root.style.setProperty('--pg-bg-n', bgN); }
  else { root.style.removeProperty('--pg-filter-n'); root.style.removeProperty('--pg-bg-n'); }
  root.style.setProperty('--warm', p.warm);
  root.classList.toggle('warm', p.warm > 0);
}
const setPage = patch => { ls.set('le.pageLook', { ...P(), ...patch }); applyPage(); };
App.on('theme:changed', applyPage);

// ---------- Cores e intensidade dos grifos ----------
const DEFAULT_COLORS = App.COLORS.map(c => ({ ...c }));
const mix = (hex, to, k) => {
  const a = parseInt(hex.slice(1), 16), b = parseInt(to.slice(1), 16);
  const ch = s => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
  return '#' + [16, 8, 0].map(s => ch(s).toString(16).padStart(2, '0')).join('');
};
// nome da cor a partir do tom (para a cor trocada não continuar se chamando "Amarelo")
App.colorName = hex => {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (s < 0.15) return l < 0.2 ? 'Preto' : l > 0.85 ? 'Branco' : 'Cinza';
  let h = d === 0 ? 0 : mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  if (h < 12 || h >= 345) return l > 0.75 ? 'Rosa-claro' : l < 0.3 ? 'Vinho' : 'Vermelho';
  if (h < 38) return l < 0.35 ? 'Marrom' : l > 0.8 ? 'Pêssego' : 'Laranja';
  if (h < 65) return l < 0.32 ? 'Oliva' : 'Amarelo';
  if (h < 90) return 'Verde-limão';
  if (h < 160) return l > 0.75 ? 'Verde-claro' : l < 0.3 ? 'Verde-escuro' : 'Verde';
  if (h < 190) return 'Verde-água';
  if (h < 205) return 'Ciano';
  if (h < 250) return l > 0.72 ? 'Azul-claro' : l < 0.3 ? 'Azul-marinho' : 'Azul';
  if (h < 290) return l > 0.72 ? 'Lilás' : 'Roxo';
  if (h < 320) return l < 0.45 ? 'Magenta' : 'Rosa';
  return l > 0.75 ? 'Rosa-claro' : 'Rosa';
};
function applyHlColors(){
  const custom = ls.get('le.hlColors', {});
  App.COLORS.forEach((c, i) => {
    const hex = /^#[0-9a-f]{6}$/i.test(custom[c.id] || '') ? custom[c.id].toLowerCase() : DEFAULT_COLORS[i].hex;
    const def = hex === DEFAULT_COLORS[i].hex;
    c.hex = hex; c.ink = def ? DEFAULT_COLORS[i].ink : mix(hex, '#000000', 0.3);
    c.name = def ? DEFAULT_COLORS[i].name : App.colorName(hex);
  });
  root.style.setProperty('--hl-op', ls.get('le.hlOpacity', 0.45));
}
function refreshHl(){
  App.buildPalette(); App.buildLegend?.(); App.renderAllAnnots(); App.renderPanel();
  App.emit('hl:colors');
}

// ---------- Barra de ferramentas ----------
function applyToolbar(){
  document.body.classList.toggle('tb-compact', !!ls.get('le.tbCompact', false));
  document.body.classList.toggle('tb-auto', !!ls.get('le.tbAuto', false));
}
// barra que some sozinha: aparece ao levar o mouse ao topo, ao abrir um menu ou quando não há PDF aberto
const bar = $('#toolbar');
let tbHideT = null;
const tbShow = () => { clearTimeout(tbHideT); document.body.classList.add('tb-show'); };
const tbHideSoon = (ms = 900) => {
  clearTimeout(tbHideT);
  tbHideT = setTimeout(() => {
    if (bar.matches(':hover') || bar.contains(document.activeElement) || !$('#menu').hidden || $('.popMenu')) { tbHideSoon(); return; }
    document.body.classList.remove('tb-show');
  }, ms);
};
addEventListener('mousemove', e => {
  if (!document.body.classList.contains('tb-auto')) return;
  if (e.clientY < 10) tbShow();
  else if (document.body.classList.contains('tb-show') && e.clientY > bar.offsetHeight + 40) tbHideSoon();
}, { passive: true });
bar.addEventListener('mouseenter', () => { if (document.body.classList.contains('tb-auto')) tbShow(); });
bar.addEventListener('mouseleave', () => { if (document.body.classList.contains('tb-auto')) tbHideSoon(); });

// ---------- Tamanho da interface ----------
const applyScale = () => root.style.setProperty('--ui-zoom', ls.get('le.uiScale', 1));

// ---------- Régua de leitura ----------
const ruler = $('#ruler');
let rulerY = null;
const rulerOn = () => !!ls.get('le.ruler', false);
function placeRuler(){
  if (!rulerOn() || !state.pdf) { ruler.hidden = true; return; }
  const st = $('#stage').getBoundingClientRect(), h = ls.get('le.rulerH', 72);
  const y = Math.max(h / 2, Math.min(st.height - h / 2, rulerY == null ? st.height * 0.35 : rulerY));
  ruler.hidden = false;
  ruler.style.setProperty('--ry', (y - h / 2) + 'px'); ruler.style.setProperty('--rh', h + 'px');
}
$('#viewer').addEventListener('mousemove', e => { if (!rulerOn()) return; rulerY = e.clientY - $('#stage').getBoundingClientRect().top; placeRuler(); }, { passive: true });
App.toggleRuler = () => { ls.set('le.ruler', !rulerOn()); placeRuler(); App.toast(rulerOn() ? 'Régua de leitura ligada — acompanha o mouse (U desliga)' : 'Régua de leitura desligada'); renderLayoutBtn(); };
App.on('doc:loaded', placeRuler); App.on('doc:closed', placeRuler);
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || !state.pdf || e.target.closest?.('input,textarea,select')) return;
  if (App.reviewOpen || App.sheetOpen || App.examViewOpen || document.querySelector('dialog[open]')) return;
  if (e.key.toLowerCase() === 'u' && !(App.examRunning && App.examRunning())) { e.preventDefault(); App.toggleRuler(); }
});

// ---------- Modos de página (botão na barra de página) ----------
const layoutBtn = $('#btnLayout');
function renderLayoutBtn(){
  const L = App.layout;
  layoutBtn.replaceChildren(App.icon(L.spread ? 'book' : L.paged ? 'pages' : 'list'));
  layoutBtn.classList.toggle('on', L.spread || L.paged || rulerOn());
  layoutBtn.title = `Modo de leitura: ${L.paged ? 'página por página' : 'rolagem contínua'}${L.spread ? ', duas páginas' : ''}${rulerOn() ? ', régua' : ''}`;
}
layoutBtn.onclick = () => {
  const L = App.layout;
  App.popMenu(layoutBtn, [
    { label: 'Rolagem contínua', icon: 'list', checked: !L.paged, on: () => { App.setLayout({ paged: false }); renderLayoutBtn(); } },
    { label: 'Página por página', sub: 'como slides', icon: 'pages', checked: L.paged, on: () => { App.setLayout({ paged: true }); renderLayoutBtn(); } },
    { sep: true },
    { label: 'Duas páginas lado a lado', icon: 'book', checked: L.spread, on: () => { App.setLayout({ spread: !L.spread }); renderLayoutBtn(); } },
    { label: 'Régua de leitura', sub: 'U', icon: 'minus', checked: rulerOn(), on: App.toggleRuler },
    { sep: true },
    { label: 'Mais opções de aparência…', icon: 'sparkle', on: () => App.openLook('leitura') },
  ], { title: 'Leitura', alignRight: true });
};

// ---------- Janela "Aparência e leitura" ----------
const dlg = $('#lookDlg');
App.openLook = section => {
  App.closePopup?.(); build();
  if (!dlg.open) dlg.showModal();
  if (section) dlg.querySelector(`[data-sec="${section}"]`)?.scrollIntoView({ block: 'start' });
};
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
$('#btnTheme').addEventListener('contextmenu', e => { e.preventDefault(); App.openLook(); });

function section(id, title, hint){
  const s = el('section', 'lookSec'); s.dataset.sec = id;
  s.append(el('h3', null, title)); if (hint) s.append(el('p', 'muted small', hint));
  return s;
}
function seg(options, value, onPick){
  const g = el('div', 'lookSeg');
  for (const [v, label] of options) {
    const b = el('button', value === v ? 'on' : '', label); b.type = 'button';
    b.onclick = () => { onPick(v); build(); };
    g.append(b);
  }
  return g;
}
function slider(label, min, max, step, value, fmt, onInput){
  const w = el('label', 'lookRange');
  const out = el('span', 'lookVal', fmt(value));
  const r = el('input'); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = value;
  r.oninput = () => { out.textContent = fmt(+r.value); onInput(+r.value); };
  w.append(el('span', null, label), r, out);
  return w;
}
function check(label, on, onChange, sub){
  const l = el('label', 'lookCheck');
  const c = el('input'); c.type = 'checkbox'; c.checked = on; c.onchange = () => onChange(c.checked);
  const t = el('span'); t.append(label); if (sub) t.append(el('small', null, sub));
  l.append(c, t); return l;
}

function build(){
  const scrollTop = dlg.querySelector('.lookBody')?.scrollTop || 0;
  dlg.innerHTML = '';
  const head = el('div', 'helpHead');
  head.append(el('h2', null, 'Aparência e leitura'), App.ibtn('x', null, () => dlg.close(), 'sm', 'Fechar (Esc)'));
  const body = el('div', 'lookBody');
  dlg.append(head, body);

  // Tema
  const sT = section('tema', 'Tema');
  const grid = el('div', 'themeGrid');
  const cur = App.currentTheme();
  for (const [id, T] of Object.entries(App.THEMES)) {
    const b = el('button', 'themeCard' + (id === cur ? ' on' : '')); b.type = 'button'; b.dataset.t = id;
    const sw = el('span', 'themeSw'); sw.append(el('i'), el('i'), el('i'));
    b.append(sw, el('span', null, T.name));
    b.onclick = () => { App.applyTheme(id); build(); };
    grid.append(b);
  }
  sT.append(grid);
  sT.append(el('div', 'lookLabel', 'Cor de destaque'));
  const acc = el('div', 'accentRow'), ca = ls.get('le.accent', 'indigo');
  for (const a of ACCENTS) {
    const b = el('button', 'accentDot' + (a.id === ca ? ' on' : '')); b.type = 'button';
    b.style.setProperty('--a', root.dataset.theme === 'dark' ? a.d : a.l); b.title = a.name; b.setAttribute('aria-label', 'Destaque ' + a.name);
    b.onclick = () => { applyAccent(a.id); build(); };
    acc.append(b);
  }
  sT.append(acc);
  sT.append(el('div', 'lookLabel', 'Tamanho da interface'));
  sT.append(seg([[0.9, '90%'], [1, '100%'], [1.1, '110%'], [1.25, '125%']], ls.get('le.uiScale', 1), v => { ls.set('le.uiScale', v); applyScale(); }));
  body.append(sT);

  // Página
  const p = P();
  const sP = section('pagina', 'Página', 'Como o PDF aparece. No tema escuro, a página é escurecida; as imagens podem ficar com as cores originais.');
  if (root.dataset.theme === 'dark') {
    sP.append(seg([['invert', 'Escurecer a página'], ['normal', 'Página original (clara)']], ls.get('le.darkPage', 'invert'), v => App.setDarkPage(v)));
    if (ls.get('le.darkPage', 'invert') === 'invert') {
      sP.append(el('div', 'lookLabel', 'Tom da página no escuro'));
      const tg = el('div', 'toneGrid');
      for (const t of TONES) {
        const b = el('button', 'toneCard' + (p.tone === t.id ? ' on' : '')); b.type = 'button';
        const real = TONES.find(x => x.id === (t.id === 'auto' ? autoTone() : t.id));
        const sw = el('span', 'toneSw'); sw.style.background = filterBg(`invert(${real.inv}) hue-rotate(180deg)${real.extra ? ' ' + real.extra : ''}`) || '#1a1a1a';
        sw.append(el('b', null, 'Aa'));
        b.append(sw, el('span', null, t.name)); if (t.sub) b.title = t.sub;
        b.onclick = () => { setPage({ tone: t.id }); build(); };
        tg.append(b);
      }
      sP.append(tg);
      sP.append(check('Manter imagens com as cores originais', App.ls.get('le.keepImages', true), on => { App.setKeepImages(on); }, 'radiografias, fotos e gráficos não ficam invertidos'));
    }
  }
  sP.append(slider('Brilho', 0.6, 1.3, 0.05, p.bri, v => Math.round(v * 100) + '%', v => setPage({ bri: v })));
  sP.append(slider('Contraste', 0.7, 1.4, 0.05, p.con, v => Math.round(v * 100) + '%', v => setPage({ con: v })));
  sP.append(slider('Luz quente', 0, 0.6, 0.05, p.warm, v => v ? Math.round(v / 0.6 * 100) + '%' : 'desligada', v => setPage({ warm: v })));
  const rp = App.btn('Restaurar a página', () => { ls.set('le.pageLook', {}); applyPage(); build(); }, 'sm outline'); sP.append(rp);
  body.append(sP);

  // Grifos
  const sG = section('grifos', 'Grifos', 'Troque as cores e dê um nome a cada uma (ex.: "Cai na prova"). Sem nome, vale o nome da própria cor.');
  const cg = el('div', 'hlColorGrid');
  App.COLORS.forEach((c, i) => {
    const w = el('div', 'hlColor');
    const inp = el('input'); inp.type = 'color'; inp.value = c.hex; inp.setAttribute('aria-label', 'Cor ' + (i + 1));
    const name = el('input', 'hlName'); name.type = 'text'; name.maxLength = 40;
    name.value = (App.labels[c.id] || '').trim(); name.placeholder = c.name;
    name.title = 'Nome desta cor (ex.: Cai na prova). Vazio = o nome da própria cor.';
    name.setAttribute('aria-label', `Nome da cor ${i + 1}`);
    inp.oninput = () => { const m = ls.get('le.hlColors', {}); m[c.id] = inp.value; ls.set('le.hlColors', m); applyHlColors(); refreshHl(); name.placeholder = c.name; };
    name.oninput = () => { App.labels[c.id] = name.value; App.saveLabels(); App.refreshLegendInputs(); App.buildPalette(); App.renderPanel(); };
    name.onkeydown = e => e.stopPropagation();
    w.append(el('span', 'hlNum', String(i + 1)), inp, name);
    cg.append(w);
  });
  sG.append(cg);
  const presets = el('div', 'hlPresets');
  presets.append(el('span', 'muted small', 'Sugestões:'));
  const PRE = {
    'Padrão': {},
    'Pastel': { y: '#fff1a8', g: '#c4f0c5', b: '#bfe0ff', p: '#ffd1e8', o: '#ffd8b0', v: '#ddd0ff' },
    'Fortes': { y: '#ffd000', g: '#22c55e', b: '#3b82f6', p: '#ec4899', o: '#f97316', v: '#8b5cf6' },
  };
  for (const [name, m] of Object.entries(PRE)) presets.append(App.btn(name, () => { ls.set('le.hlColors', m); applyHlColors(); refreshHl(); build(); }, 'sm outline'));
  sG.append(presets);
  sG.append(slider('Intensidade', 0.25, 0.75, 0.05, ls.get('le.hlOpacity', 0.45), v => v < 0.38 ? 'suave' : v > 0.55 ? 'forte' : 'média', v => { ls.set('le.hlOpacity', v); root.style.setProperty('--hl-op', v); }));
  body.append(sG);

  // Leitura
  const L = App.layout;
  const sL = section('leitura', 'Leitura');
  sL.append(seg([[false, 'Rolagem contínua'], [true, 'Página por página']], L.paged, v => { App.setLayout({ paged: v }); renderLayoutBtn(); }));
  sL.append(check('Duas páginas lado a lado', L.spread, on => { App.setLayout({ spread: on }); renderLayoutBtn(); }, 'modo livro, bom em telas largas'));
  sL.append(check('Régua de leitura', rulerOn(), on => { ls.set('le.ruler', on); placeRuler(); renderLayoutBtn(); }, 'destaca a faixa que você está lendo e escurece o resto (tecla U)'));
  sL.append(slider('Altura da régua', 40, 180, 4, ls.get('le.rulerH', 72), v => v + ' px', v => { ls.set('le.rulerH', v); placeRuler(); }));
  sL.append(slider('Escurecer fora da régua', 0.2, 0.8, 0.05, ls.get('le.rulerDim', 0.5), v => Math.round(v * 100) + '%', v => { ls.set('le.rulerDim', v); root.style.setProperty('--ruler-dim', v); }));
  body.append(sL);

  // Barra de ferramentas
  const sB = section('barra', 'Barra de ferramentas', 'Escolha quais funções ficam na barra e em que ordem. Os menus Arquivo, Exibir e Estudar e a engrenagem ficam sempre.');
  sB.append(App.ibtn('pin', 'Personalizar a barra…', () => { dlg.close(); App.customizeToolbar(); }, 'outline sm'));
  sB.append(check('Barra compacta', !!ls.get('le.tbCompact', false), on => { ls.set('le.tbCompact', on); applyToolbar(); }, 'mais baixa, só com ícones'));
  sB.append(check('Esconder a barra enquanto leio', !!ls.get('le.tbAuto', false), on => { ls.set('le.tbAuto', on); applyToolbar(); if (on) App.toast('Leve o mouse ao topo da janela para a barra aparecer'); }, 'aparece ao levar o mouse ao topo da janela'));
  body.append(sB);

  const foot = el('div', 'lookFoot');
  foot.append(App.btn('Restaurar tudo', resetAll, 'sm outline'), App.btn('Pronto', () => dlg.close(), 'primary'));
  dlg.append(foot);
  body.scrollTop = scrollTop;
}
function resetAll(){
  ['le.accent', 'le.pageLook', 'le.hlColors', 'le.hlOpacity', 'le.tbHidden', 'le.tbCompact', 'le.tbAuto', 'le.uiScale', 'le.ruler', 'le.rulerH', 'le.rulerDim'].forEach(k => { try { localStorage.removeItem(k); } catch {} });
  ls.set('le.darkPage', 'invert');
  App.setLayout({ spread: false, paged: false });
  init(); refreshHl(); App.applyTheme(App.currentTheme()); build();
  App.toast('Aparência restaurada');
}

function init(){
  applyAccent(ls.get('le.accent', 'indigo'));
  applyHlColors(); applyToolbar(); applyScale(); applyPage();
  root.style.setProperty('--ruler-dim', ls.get('le.rulerDim', 0.5));
  $('#pages').classList.toggle('spread', App.layout.spread);
  $('#viewer').classList.toggle('paged', App.layout.paged);
  renderLayoutBtn();
}
init();
})();
