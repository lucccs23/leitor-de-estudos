/* Núcleo do Vetra: estado, armazenamento, renderização, grifos e interação. */
(() => {
'use strict';
const App = window.App = {};
// Versão do app: mude aqui a cada atualização (aparece na tela inicial e no menu ⋯)
App.VERSION = '1.19.7';
App.VERSION_DATE = '14/11/2026';
const $ = App.$ = s => document.querySelector(s);
// Aberto pelo link publicado (celular, tablet ou navegador): sem o serviço local do Windows.
// (aberto do disco ou num servidor local de testes = versão de computador)
App.isWeb = !/^file:/.test(location.protocol) && !/^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname);
document.documentElement.classList.toggle('web', App.isWeb);
App.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
document.documentElement.classList.toggle('touch', App.isTouch);
const $$ = App.$$ = s => [...document.querySelectorAll(s)];
const SVGNS = 'http://www.w3.org/2000/svg';
const CSS_UNITS = 96 / 72;

App.COLORS = [
  { id:'y', hex:'#ffd84d', ink:'#d99a00', name:'Amarelo' },
  { id:'g', hex:'#7ee081', ink:'#2e9e4c', name:'Verde' },
  { id:'b', hex:'#6cb8ff', ink:'#2a72d6', name:'Azul' },
  { id:'p', hex:'#ff8fc7', ink:'#d63c82', name:'Rosa' },
  { id:'o', hex:'#ffa94d', ink:'#e06c00', name:'Laranja' },
  { id:'v', hex:'#b79cff', ink:'#7350d8', name:'Roxo' },
];
App.EXAMPLES = ['Conceito-chave', 'Definição', 'Exemplo', 'Dúvida', 'Cai na prova', 'Fórmula'];
// Temas da interface. Os escuros compartilham a regra da página: escurecida (invertida) ou original (le.darkPage).
const THEMES = App.THEMES = {
  light:    { ui:'light', name:'Claro', icon:'sun' },
  sepia:    { ui:'sepia', name:'Sépia', icon:'book' },
  dark:     { ui:'dark',  name:'Escuro', icon:'moon' },
  oled:     { ui:'dark',  variant:'oled', name:'Preto (OLED)', icon:'moon' },
  night:    { ui:'dark',  variant:'night', name:'Azul-noite', icon:'moon' },
  graphite: { ui:'dark',  variant:'graphite', name:'Grafite', icon:'moon' },
  contrast: { ui:'dark',  variant:'contrast', name:'Alto contraste', icon:'moon' },
};

// Janelas: ao abrir, o foco fica na própria janela (Tab continua navegando normalmente)
if (window.HTMLDialogElement && !HTMLDialogElement.prototype.__focoJanela) {
  const sm = HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal = function(){
    sm.call(this);
    if (!this.querySelector('[autofocus]')) { if (!this.hasAttribute('tabindex')) this.tabIndex = -1; this.focus({ preventScroll: true }); }
  };
  HTMLDialogElement.prototype.__focoJanela = true;
}

// ---------- Eventos internos ----------
const bus = new EventTarget();
App.on = (t, f) => bus.addEventListener(t, e => f(e.detail || {}));
App.emit = (t, d) => bus.dispatchEvent(new CustomEvent(t, { detail: d }));

// ---------- Armazenamento ----------
const ls = App.ls = {
  get(k, d){ try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const DB = App.DB = (() => {
  let p;
  const open = () => p || (p = new Promise((res, rej) => {
    const r = indexedDB.open('leitor-estudos', 2);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('docs')) d.createObjectStore('docs', { keyPath:'fp' });   // grifos, marcadores, estatísticas
      if (!d.objectStoreNames.contains('files')) d.createObjectStore('files', { keyPath:'fp' }); // bytes do PDF (recentes/abas)
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath:'key' });  // configurações (pasta de backup)
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const tx = async (store, mode, fn) => {
    const d = await open();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => res(req && req.result);
      t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  };
  // update(store, key, fn): fn(atual) devolve o novo registro (ou null para não gravar) — atômico
  const update = async (s, k, fn) => {
    const d = await open();
    return new Promise((res, rej) => {
      const t = d.transaction(s, 'readwrite'), st = t.objectStore(s);
      let out = null;
      const r = st.get(k);
      r.onsuccess = () => { out = fn(r.result); if (out) st.put(out); };
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  };
  return {
    update,
    get:(s, k) => tx(s, 'readonly', st => st.get(k)),
    has:(s, k) => tx(s, 'readonly', st => st.getKey(k)).then(v => v !== undefined),
    put:(s, v) => tx(s, 'readwrite', st => st.put(v)),
    del:(s, k) => tx(s, 'readwrite', st => st.delete(k)),
    all:(s) => tx(s, 'readonly', st => st.getAll()),
    keys:(s) => tx(s, 'readonly', st => st.getAllKeys()),
  };
})();
const safe = App.safe = async (fn, fallback) => { try { return await fn(); } catch (e) { console.warn(e); return fallback; } };
// altera só os campos indicados do registro de um documento (sem sobrescrever o resto)
App.patchDoc = (fp, patch) => safe(() => DB.update('docs', fp, cur => cur ? { ...cur, ...(typeof patch === 'function' ? patch(cur) : patch) } : null), null);

// ---------- Utilidades ----------
const el = App.el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const btn = App.btn = (text, onClick, cls = '') => { const b = el('button', 'btn ' + cls, text); b.onclick = onClick; return b; };
App.icon = (name, cls = 'i') => {
  const s = document.createElementNS(SVGNS, 'svg'); s.setAttribute('class', cls);
  const u = document.createElementNS(SVGNS, 'use'); u.setAttribute('href', '#i-' + name);
  s.appendChild(u); return s;
};
// botão com ícone (e rótulo opcional)
App.ibtn = (icon, label, onClick, cls = '', title) => {
  const b = el('button', 'btn ' + (label ? '' : 'icon ') + cls);
  b.append(App.icon(icon)); if (label) b.append(label);
  if (title || !label) b.title = title || '';
  if (title && !label) b.setAttribute('aria-label', title.replace(/\s*\(.*?\)\s*/g, ' ').trim());
  b.onclick = onClick; return b;
};
// "1 grifo" / "3 grifos"
App.plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
// janela (dialog) criada sob demanda; clicar fora fecha
App.dialog = (id, cls) => {
  let d = document.getElementById(id);
  if (!d) {
    d = el('dialog', cls); d.id = id;
    d.addEventListener('click', e => { if (e.target === d) d.close(); });
    document.body.append(d);
  }
  return d;
};
App.emptyState = (icon, title, text) => {
  const d = el('div', 'emptyState'); d.append(App.icon(icon));
  if (title) d.append(el('strong', null, title));
  if (text) d.append(el('span', null, text));
  return d;
};
let toastT;
App.toast = msg => {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800);
};
App.download = (content, filename, type) => {
  const a = el('a'); a.href = URL.createObjectURL(new Blob([content], { type })); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};
const uid = App.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
App.copyText = async t => { try { await navigator.clipboard.writeText(t); App.toast('Copiado'); } catch { App.toast('Não foi possível copiar'); } };
App.dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
App.fmtDuration = s => {
  const m = Math.round((s || 0) / 60);
  if (m < 60) return m + ' min';
  return `${Math.floor(m / 60)}h${m % 60 ? ' ' + String(m % 60).padStart(2, '0') + 'min' : ''}`;
};
App.fmtShort = s => { const m = Math.round((s || 0) / 60); return m < 60 ? m + 'm' : `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}`; };
App.escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// minúsculas e sem acento, mantendo 1 caractere por caractere (os índices batem com o texto original)
// (rápido: texto sem acento passa direto; os caracteres acentuados são convertidos uma vez e guardados)
const foldMap = new Map();
App.fold = s => {
  if (!/[^\x00-\x7f]/.test(s)) return s.toLowerCase();
  let o = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i], code = c.charCodeAt(0);
    if (code < 128) { o += code >= 65 && code <= 90 ? String.fromCharCode(code + 32) : c; continue; }
    let n = foldMap.get(c);
    if (n === undefined) { n = c.normalize('NFD')[0].toLowerCase(); if (n.length !== 1) n = c; foldMap.set(c, n); }
    o += n;
  }
  return o;
};
App.baseName = n => (n || '').replace(/\.pdf$/i, '');
const clamp01 = v => Math.max(0, Math.min(1, v));

// ---------- Estado ----------
const state = App.state = {
  pdf:null, fp:null, name:'', bytes:null, pages:[], scale:1, currentPage:1,
  highlights:[], bookmarks:[], stats:{ time:{}, visited:[] }, ocr:{}, exams:[],
  color:ls.get('le.color', 'y'), autoHL:false, tool:'text', style:ls.get('le.style', 'fill'), autoFit:true,
  filter:new Set(), selected:null, token:0, textCache:new Map(), lastInk:null,
};
const labels = App.labels = ls.get('le.labels', {});
App.colorOf = id => App.COLORS.find(c => c.id === id) || App.COLORS[0];
App.labelOf = id => (labels[id] || '').trim() || App.colorOf(id).name;
App.saveLabels = () => ls.set('le.labels', labels);
const normHl = App.normHl = h => { h.kind = h.kind || 'text'; h.style = h.style || 'fill'; h.note = h.note || ''; h.text = h.text || ''; return h; };

const viewer = $('#viewer'), pagesEl = $('#pages'), popup = $('#popup');
const pageInput = $('#pageInput'), themeBtn = $('#btnTheme'), hlList = $('#hlList');

// ---------- Tema ----------
let theme = 'light';
const isDark = t => THEMES[t] && THEMES[t].ui === 'dark';
const darkPage = () => ls.get('le.darkPage', 'invert'); // 'invert' (página escurecida) ou 'normal' (original)
function applyTheme(t, announce){
  if (t === 'darkorig') { ls.set('le.darkPage', 'normal'); t = 'dark'; } // tema antigo
  if (!THEMES[t]) t = 'light';
  theme = t;
  const T = THEMES[t], root = document.documentElement;
  root.dataset.theme = T.ui;
  if (T.variant) root.dataset.variant = T.variant; else delete root.dataset.variant;
  root.dataset.page = T.ui === 'dark' ? darkPage() : T.ui === 'sepia' ? 'sepia' : 'normal';
  const next = THEMES[nextTheme()];
  themeBtn.replaceChildren(App.icon(T.ui === 'dark' && darkPage() === 'normal' ? 'moonimg' : T.icon));
  themeBtn.title = `Tema: ${T.name} — clique para ${next.name} (D alterna claro/escuro · mais opções em ⋯ → Aparência)`;
  themeBtn.setAttribute('aria-label', `Tema: ${T.name}. Clique para trocar.`);
  ls.set('le.theme', t);
  if (isDark(t)) ls.set('le.lastDark', t); else ls.set('le.lastLight', t);
  if (announce) App.toast('Tema: ' + T.name + (T.ui === 'dark' && darkPage() === 'normal' ? ' (página original)' : ''));
  App.emit('theme:changed', { theme: t });
}
// botão: claro → sépia → o seu escuro preferido → claro
const nextTheme = () => theme === 'light' ? 'sepia' : theme === 'sepia' ? ls.get('le.lastDark', 'dark') : 'light';
App.applyTheme = applyTheme;
App.currentTheme = () => theme;
App.setDarkPage = mode => { ls.set('le.darkPage', mode === 'normal' ? 'normal' : 'invert'); applyTheme(theme); };
App.toggleDark = () => applyTheme(isDark(theme) ? ls.get('le.lastLight', 'light') : ls.get('le.lastDark', 'dark'), true);
themeBtn.onclick = () => applyTheme(nextTheme(), true);

// ---------- Paleta, ferramentas e estilos ----------
App.buildPalette = () => {
  const pal = $('#palette'); pal.innerHTML = '';
  App.COLORS.forEach((c, i) => {
    const b = el('button', 'swatch' + (state.color === c.id ? ' current' : ''));
    b.style.setProperty('--c', c.hex);
    b.title = `${App.labelOf(c.id)} (${i + 1})`;
    b.setAttribute('aria-label', `Cor ${App.labelOf(c.id)}`);
    b.onmousedown = e => e.preventDefault(); // não perder a seleção de texto
    b.onclick = () => pickColor(c.id);
    pal.appendChild(b);
  });
};
function pickColor(id){
  if (hasSelection()) { createHighlight(id); return; }
  state.color = id; ls.set('le.color', id);
  App.buildPalette();
  if (state.tool === 'text' && state.autoHL) App.toast(`Grifando em ${App.labelOf(id)}`);
  else if (state.tool === 'text' && !ls.get('le.hintColor', false)) {
    ls.set('le.hintColor', true);
    App.toast(`Cor ${App.labelOf(id)} escolhida. Selecione um trecho para grifar — ou ligue "Grifar ao selecionar" (G).`);
  }
}
// "Grifar ao selecionar": o texto selecionado é grifado na hora com a cor atual (Alt ao soltar = não grifar)
App.setAutoHL = (on, announce) => {
  state.autoHL = on; ls.set('le.autoHL', on);
  document.body.classList.toggle('autohl', on);
  $('#btnAuto').classList.toggle('on', on);
  if (announce) App.toast(on
    ? `Grifar ao selecionar: ligado (${App.labelOf(state.color)}). Segure Alt ao soltar para só selecionar.`
    : 'Grifar ao selecionar: desligado');
};
App.setTool = t => {
  const changed = state.tool !== t;
  state.tool = t; document.body.dataset.tool = t;
  $$('button[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  if (t !== 'text') getSelection().removeAllRanges();
  App.buildPalette(); closePopup();
  if (changed && t === 'area') App.toast('Área: arraste sobre a página para marcar uma região (Esc volta ao texto)');
  if (changed && t === 'ink') App.toast(App.isTouch ? 'Caneta: desenhe sobre a página. A borracha e a espessura ficam ao lado.' : 'Caneta: desenhe sobre a página (Ctrl+Z desfaz, Esc volta ao texto)');
  if (changed && t === 'note') App.toast('Nota: clique na página onde quer deixar a nota (Esc volta ao texto)');
  if (changed && t === 'erase') App.toast(App.isTouch ? 'Borracha: passe sobre os traços da caneta para apagá-los' : 'Borracha: passe sobre os traços da caneta para apagá-los (Ctrl+Z desfaz)');
};
// ---------- Caneta: espessura, marca-texto e caneta stylus ----------
const PENS = App.PENS = {
  fine:   { label: 'Fina', w: 1.3 },
  mid:    { label: 'Média', w: 2.4 },
  bold:   { label: 'Grossa', w: 4.5 },
  marker: { label: 'Marca-texto à mão', w: 14, marker: true },
};
state.pen = PENS[ls.get('le.pen', 'mid')] ? ls.get('le.pen', 'mid') : 'mid';
// com caneta stylus (S Pen etc.): só a caneta desenha, o dedo rola a página
state.penSeen = ls.get('le.penSeen', false);
App.setPen = id => {
  if (!PENS[id]) return;
  state.pen = id; ls.set('le.pen', id);
  if (state.tool !== 'ink') App.setTool('ink');
  App.updatePenBtn();
};
App.updatePenBtn = () => {
  const b = $('#btnPenOpts'); if (!b) return;
  const P = PENS[state.pen];
  b.style.setProperty('--pw', Math.max(2, Math.min(10, P.w * 1.5)) + 'px');
  b.classList.toggle('marker', !!P.marker);
  b.title = `Caneta: ${P.label} — escolher a espessura`;
};
App.penMenu = anchor => App.popMenu(anchor, [
  ...Object.entries(PENS).map(([k, P]) => ({ label: P.label, icon: k === 'marker' ? 'highlighter' : 'pen', checked: state.pen === k && state.tool === 'ink', on: () => App.setPen(k) })),
  { sep: true },
  { label: 'Borracha', sub: 'E', icon: 'eraser', checked: state.tool === 'erase', on: () => App.setTool('erase') },
  { label: state.penSeen ? 'Dedo também desenha' : 'Só a caneta desenha', sub: state.penSeen ? 'hoje: dedo rola' : 'dedo rola a página',
    icon: 'pointer', on: () => { state.penSeen = !state.penSeen; ls.set('le.penSeen', state.penSeen);
      App.toast(state.penSeen ? 'Só a caneta desenha; o dedo rola a página.' : 'O dedo também desenha.'); } },
], { title: 'Caneta' });
addEventListener('pointerdown', e => {
  if (e.pointerType !== 'pen' || state.penSeen) return;
  state.penSeen = true; ls.set('le.penSeen', true);
  if (state.pdf) App.toast('Caneta stylus detectada: com a Caneta, só ela desenha e o dedo rola a página.');
}, true);
App.setStyle = s => {
  state.style = s; ls.set('le.style', s);
  $$('[data-style]').forEach(b => b.classList.toggle('on', b.dataset.style === s));
};

// ---------- Abrir / fechar documentos ----------
App.openFiles = async files => {
  const list = [...files].filter(f => /\.(pdf|epub)$/i.test(f.name) || f.type === 'application/pdf' || f.type === 'application/epub+zip');
  if (!list.length) { App.toast('Escolha um arquivo .pdf ou .epub'); return; }
  for (const f of list) {
    if (App.isEpub?.(f)) await App.openEpub(await f.arrayBuffer(), f.name);
    else await App.loadDoc(await f.arrayBuffer(), f.name);
  }
};

// Barra de progresso fininha embaixo da barra superior
let loadingT;
App.setLoading = frac => {
  const bar = $('#loadbar');
  clearTimeout(loadingT);
  if (frac == null) { bar.style.width = '100%'; loadingT = setTimeout(() => { bar.classList.remove('on'); bar.style.width = '0'; }, 250); return; }
  bar.classList.add('on'); bar.style.width = Math.round(Math.max(0.04, Math.min(1, frac)) * 100) + '%';
};

let loadSeq = 0;
App.loadDoc = async (buf, name) => {
  if (!window.pdfjsLib) { App.showLibError(); return false; }
  const seq = ++loadSeq; // só a abertura mais recente vale
  closePopup();
  App.setLoading(0.08);
  let pdf;
  try {
    pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
  } catch (e) {
    console.error(e);
    App.setLoading(null);
    if (seq === loadSeq) App.toast(e && e.name === 'PasswordException' ? 'PDF protegido por senha ainda não é suportado.' : 'Não consegui abrir este PDF — o arquivo pode estar corrompido.');
    return false;
  }
  // tamanhos das páginas, em lotes paralelos (bem mais rápido em livros grandes)
  const n = pdf.numPages, sizes = new Array(n), BATCH = 48;
  try {
    for (let i = 0; i < n; i += BATCH) {
      await Promise.all(Array.from({ length: Math.min(BATCH, n - i) }, (_, k) =>
        pdf.getPage(i + k + 1).then(pg => { const vp = pg.getViewport({ scale: CSS_UNITS }); sizes[i + k] = { w: vp.width, h: vp.height }; })));
      if (seq !== loadSeq) { pdf.destroy(); return false; }
      App.setLoading(0.1 + 0.8 * Math.min(1, (i + BATCH) / n));
    }
  } catch (e) {
    console.error(e); pdf.destroy(); App.setLoading(null);
    if (seq === loadSeq) App.toast('Não consegui ler as páginas deste PDF.');
    return false;
  }
  if (seq !== loadSeq) { pdf.destroy(); return false; }

  // a partir daqui o documento novo substitui o atual
  await App.saveDoc();
  if (seq !== loadSeq) { pdf.destroy(); return false; }
  state.token++;
  if (state.pdf) state.pdf.destroy();
  const fp = pdf.fingerprints[0];
  const rec = await safe(() => DB.get('docs', fp), null) || {};
  let imported = false;
  if (!(rec.highlights || []).length) {
    try {
      const md = await pdf.getMetadata();
      const raw = md && md.info && md.info.Custom && md.info.Custom.LeitorDeEstudos;
      const data = raw ? JSON.parse(raw) : null;
      if (data && data.app === 'leitor-de-estudos' && Array.isArray(data.highlights) && data.highlights.length) {
        rec.highlights = data.highlights; rec.bookmarks = rec.bookmarks && rec.bookmarks.length ? rec.bookmarks : (data.bookmarks || []);
        imported = true;
      }
    } catch (e) { console.warn('dados do leitor no PDF', e); }
  }
  Object.assign(state, {
    pdf, fp, name, bytes: buf, highlights: (rec.highlights || []).map(normHl), bookmarks: rec.bookmarks || [],
    stats: { time: rec.time || {}, visited: rec.visited || [] }, selected: null, filter: new Set(), query: '',
    ocr: rec.ocr || {}, exams: rec.exams || [],
    textCache: new Map(), currentPage: 1, lastInk: null, thumb: rec.thumb || null,
  });
  undoStack.length = 0;
  Object.values(legendChips).forEach(c => c.classList.remove('on'));
  const hf = $('#hlFilter'); if (hf) hf.value = '';

  // guarda o arquivo só se ainda não estiver salvo (evita regravar livros grandes a cada abertura)
  if (!(await safe(() => DB.has('files', fp), false))) await safe(() => DB.put('files', { fp, data: buf }));
  await safe(() => DB.update('docs', fp, cur => ({ ...(cur || rec), fp, name, highlights: state.highlights, bookmarks: state.bookmarks, ts: Date.now(), hasFile: true, pages: n })));
  App.pruneFiles();

  pagesEl.innerHTML = '';
  state.pages = sizes.map((s, i) => makePage(i + 1, s));
  document.body.classList.add('has-doc');
  document.title = name + ' — Vetra';
  $('#pageCount').textContent = '/ ' + pdf.numPages; pageInput.max = pdf.numPages;

  state.autoFit = rec.autoFit !== false || !rec.scale;
  App.setScale(state.autoFit ? autoScale() : rec.scale, false);
  renderAllAnnots(); App.renderPanel();
  App.goToPage(rec.lastPage || 1);
  // volta ao ponto exato da leitura dentro da página
  const lp = state.pages[(rec.lastPage || 1) - 1];
  if (lp && rec.lastFrac > 0) { viewer.scrollTop = lp.el.offsetTop + rec.lastFrac * lp.el.offsetHeight; updateCurrentPage(); }
  App.emit('doc:loaded', { fp, name, rec });
  if (imported) App.toast(`Este PDF trouxe ${state.highlights.length} grifo(s) salvos pelo Vetra`);
  viewer.focus({ preventScroll: true });
  App.setLoading(null);
  return true;
};

function makePage(num, base){
  const pe = el('div', 'page'); pe.dataset.page = num;
  const hl = el('div', 'hlLayer');
  const ink = document.createElementNS(SVGNS, 'svg');
  ink.setAttribute('class', 'inkLayer');
  ink.setAttribute('viewBox', `0 0 ${base.w} ${base.h}`);
  ink.setAttribute('preserveAspectRatio', 'none');
  const search = el('div', 'searchLayer');
  const draw = el('div', 'drawLayer');
  const notes = el('div', 'noteLayer'); // notas soltas: ficam por cima de tudo e são clicáveis
  pe.append(hl, ink, search, draw, notes);
  pagesEl.appendChild(pe);
  return { num, el: pe, hl, ink, search, draw, notes, base, canvas: null, tl: null, renderedScale: null, rendering: false };
}

App.closeDoc = async () => {
  await App.saveDoc();
  loadSeq++; state.token++; closePopup();
  if (state.pdf) state.pdf.destroy();
  Object.assign(state, { pdf:null, fp:null, name:'', bytes:null, pages:[], highlights:[], bookmarks:[], textCache:new Map(), stats:{ time:{}, visited:[] }, thumb:null, ocr:{}, exams:[] });
  pagesEl.innerHTML = ''; document.body.classList.remove('has-doc');
  document.title = 'Vetra'; viewer.scrollTop = 0;
  App.emit('doc:closed');
  App.emit('home:show');
};

App.dropFile = async fp => {
  await safe(() => DB.del('files', fp));
  await safe(() => DB.del('meta', 'tx:' + fp));
  await safe(() => DB.del('meta', 'sg:' + fp));
  await App.patchDoc(fp, { hasFile: false });
};
App.pruneFiles = async () => {
  const keep = new Set((App.tabList ? App.tabList() : []).map(t => t.fp));
  const docs = (await safe(() => DB.all('docs'), [])).filter(d => d.hasFile && !keep.has(d.fp)).sort((a, b) => b.ts - a.ts);
  for (const d of docs.slice(30)) { // guarda os 30 PDFs mais recentes (biblioteca e busca geral)
    await App.dropFile(d.fp);
  }
};

// ---------- Zoom e navegação ----------
// Layout: duas páginas lado a lado (spread) e/ou uma página por vez (paged: rolagem que encaixa na página)
const layout = App.layout = { spread: false, paged: false, ...ls.get('le.layout', {}) };
// ajuste da página: 'width' (à largura) ou 'page' (página inteira na tela)
state.fitMode = ls.get('le.fitMode', 'width') === 'page' ? 'page' : 'width';
function fitScale(){
  const p0 = state.pages[0], w = p0 ? p0.base.w : 612 * CSS_UNITS, h = p0 ? p0.base.h : 792 * CSS_UNITS;
  let s = (viewer.clientWidth - 48 - (layout.spread ? 22 : 0)) / (w * (layout.spread ? 2 : 1));
  if (layout.paged || state.fitMode === 'page') s = Math.min(s, (viewer.clientHeight - 32) / h); // página inteira na tela
  return Math.max(0.3, s);
}
App.setLayout = patch => {
  Object.assign(layout, patch); ls.set('le.layout', { spread: layout.spread, paged: layout.paged });
  pagesEl.classList.toggle('spread', layout.spread);
  viewer.classList.toggle('paged', layout.paged);
  if (!state.pdf) return;
  const cur = state.currentPage;
  if (state.autoFit || patch.paged) { state.autoFit = true; App.setScale(autoScale(), false); } else App.setScale(state.scale, false);
  App.goToPage(cur);
  App.emit('layout:changed');
};
App.fitScale = fitScale;
// "Ajustar": acompanha a largura da área de leitura (abrir painéis, redimensionar a janela)
const autoScale = () => Math.min(fitScale(), layout.paged ? 4 : 2);
App.fitWidth = () => { state.fitMode = 'width'; ls.set('le.fitMode', 'width'); state.autoFit = true; App.setScale(autoScale()); };
App.fitPage = () => { state.fitMode = 'page'; ls.set('le.fitMode', 'page'); state.autoFit = true; App.setScale(autoScale()); };
App.actualSize = () => { if (!state.pdf) return; state.autoFit = false; App.setScale(1); };
// menu do ajuste (barra de página): deixa claro qual está valendo
App.fitMenu = anchor => {
  const fitW = state.autoFit && state.fitMode === 'width', fitP = state.autoFit && state.fitMode === 'page';
  App.popMenu(anchor, [
    { label: 'Ajustar à largura', sub: 'Ctrl+0', icon: 'fit', checked: fitW, on: App.fitWidth },
    { label: 'Página inteira', sub: 'Ctrl+9', icon: 'fitpage', checked: fitP, on: App.fitPage },
    { label: 'Tamanho real (100%)', sub: 'Ctrl+1', icon: 'zoomreal', checked: !state.autoFit && Math.abs(state.scale - 1) < 0.01, on: App.actualSize },
    { sep: true },
    { label: 'Rolagem contínua', icon: 'list', checked: !layout.paged, on: () => App.setLayout({ paged: false }) },
    { label: 'Página por página', icon: 'pages', checked: !!layout.paged, on: () => App.setLayout({ paged: true }) },
    { label: 'Duas páginas lado a lado', icon: 'book', checked: !!layout.spread, on: () => App.setLayout({ spread: !layout.spread }) },
    { sep: true },
    { label: 'Modo de leitura (tela cheia)', sub: 'F', icon: 'focus', checked: document.body.classList.contains('focus'), on: App.toggleFocus },
  ], { title: 'Tamanho da página', alignRight: true });
};
new ResizeObserver(() => {
  if (state.pdf && state.autoFit && Math.abs(autoScale() - state.scale) > 0.005) App.setScale(autoScale());
}).observe($('#stage'));
// at = {x, y} na tela: mantém esse ponto parado durante o zoom (zoom pelo cursor)
App.setScale = (s, keepAnchor = true, at = null) => {
  s = Math.max(0.3, Math.min(5, s));
  let anchor = null;
  if (keepAnchor && state.pages.length) {
    const vr = viewer.getBoundingClientRect();
    const ox = at ? at.x - vr.left : viewer.clientWidth / 2, oy = at ? at.y - vr.top : 0;
    const py = viewer.scrollTop + oy, px = viewer.scrollLeft + ox;
    const p = state.pages[pageIndexAt(py)];
    anchor = { p, oy, ox, ry: (py - p.el.offsetTop) / p.el.offsetHeight, rx: (px - p.el.offsetLeft) / p.el.offsetWidth };
  }
  state.scale = s;
  for (const p of state.pages) { p.el.style.width = p.base.w * s + 'px'; p.el.style.height = p.base.h * s + 'px'; }
  // duas páginas: a largura da área fica exata para caberem 2 por linha
  if (layout.spread && state.pages.length) {
    const mw = Math.max(...state.pages.slice(0, 6).map(p => p.base.w)) * s;
    pagesEl.style.width = Math.ceil(mw * 2 + 16 + 48 + 1) + 'px';
  } else pagesEl.style.width = '';
  $('#zoomLabel').textContent = Math.round(s * 100) + '%';
  $('#btnFit').classList.toggle('on', state.autoFit);
  const fl = $('#fitLabel'); if (fl) fl.textContent = state.autoFit ? (state.fitMode === 'page' ? 'Página' : 'Largura') : Math.round(state.scale * 100) + '%';
  const fu = $('#btnFit use'); if (fu) fu.setAttribute('href', state.autoFit && state.fitMode === 'page' ? '#i-fitpage' : '#i-fit');
  if (anchor) {
    viewer.scrollTop = anchor.p.el.offsetTop + anchor.ry * anchor.p.el.offsetHeight - anchor.oy;
    viewer.scrollLeft = anchor.p.el.offsetLeft + anchor.rx * anchor.p.el.offsetWidth - anchor.ox;
  }
  scheduleRender(); App.saveDocSoon();
};
App.zoomBy = (f, at) => { if (!state.pdf) return; state.autoFit = false; App.setScale(state.scale * f, true, at); };
// índice da página na posição vertical y (busca binária — rápido mesmo com milhares de páginas)
function pageIndexAt(y){
  const pages = state.pages;
  let lo = 0, hi = pages.length - 1, ans = 0;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (pages[m].el.offsetTop <= y) { ans = m; lo = m + 1; } else hi = m - 1;
  }
  return ans;
}
// próxima/anterior: em duas páginas, anda de duas em duas (a página atual é a da direita)
App.pageStep = d => {
  if (!layout.spread) { App.goToPage(state.currentPage + d); return; }
  const left = state.currentPage % 2 === 0 ? state.currentPage - 1 : state.currentPage;
  App.goToPage(left + 2 * d);
};
App.goToPage = (n, frac = 0) => {
  if (!state.pages.length) return;
  n = Math.max(1, Math.min(state.pages.length, n | 0));
  const p = state.pages[n - 1];
  viewer.scrollTop = p.el.offsetTop + frac * p.el.offsetHeight - (frac ? viewer.clientHeight * 0.15 : layout.paged ? 16 : 12);
  updateCurrentPage();
  scheduleRender();
};
function updateCurrentPage(){
  if (!state.pages.length) return;
  const cur = state.pages[pageIndexAt(viewer.scrollTop + viewer.clientHeight * 0.35)].num;
  if (cur !== state.currentPage) {
    const prev = state.currentPage; state.currentPage = cur;
    App.saveDocSoon(); App.emit('page:changed', { page: cur, prev });
  }
  if (document.activeElement !== pageInput) pageInput.value = cur;
}

// ---------- Renderização ----------
let rafPending = false;
function scheduleRender(){
  if (rafPending) return; rafPending = true;
  requestAnimationFrame(() => { rafPending = false; renderVisible(); });
}
App.scheduleRender = scheduleRender;
function renderVisible(){
  if (!state.pdf) return;
  const top = viewer.scrollTop, h = viewer.clientHeight, bottom = top + h;
  for (const p of state.pages) {
    const t = p.el.offsetTop, b = t + p.el.offsetHeight;
    if (b >= top - h && t <= bottom + h) renderPage(p);
    else if ((b < top - h * 5 || t > bottom + h * 5) && p.canvas) unloadPage(p);
  }
}
async function renderPage(p){
  if (p.rendering || p.renderedScale === state.scale) return;
  p.rendering = true;
  const token = state.token, scale = state.scale;
  try {
    const page = await state.pdf.getPage(p.num);
    const vp = page.getViewport({ scale: scale * CSS_UNITS });
    let dpr = Math.min(window.devicePixelRatio || 1, 3);
    // limite de ~16 milhões de pixels por página: acima disso o navegador desenha em branco
    const MAX_PX = 16777216;
    if (vp.width * vp.height * dpr * dpr > MAX_PX) dpr = Math.sqrt(MAX_PX / (vp.width * vp.height));
    const canvas = el('canvas', 'pageCanvas');
    canvas.width = Math.floor(vp.width * dpr); canvas.height = Math.floor(vp.height * dpr);
    // canvas em software: o filtro CSS do modo escuro é aplicado de forma confiável
    if (p.ownAnnots === undefined) p.ownAnnots = await App.hasOwnAnnots(page);
    await page.render({ canvasContext: canvas.getContext('2d', { willReadFrequently: true }), viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null,
      annotationMode: p.ownAnnots ? pdfjsLib.AnnotationMode.DISABLE : pdfjsLib.AnnotationMode.ENABLE }).promise;
    if (token !== state.token) return;
    const tl = el('div', 'textLayer');
    tl.style.setProperty('--scale-factor', vp.scale);
    const tc = await page.getTextContent();
    const ocrWords = state.ocr[p.num];
    if (ocrWords && textLength(tc) < MIN_TEXT) buildOcrLayer(tl, ocrWords, vp); // página escaneada: texto vem do OCR
    else await pdfjsLib.renderTextLayer({ textContentSource: tc, container: tl, viewport: vp, textDivs: [] }).promise;
    tl.appendChild(el('div', 'endOfContent'));
    if (!p.imgRects) p.imgRects = imageRects(page).catch(e => { console.warn('imagens', e); return []; });
    const img = buildImgLayer(canvas, await p.imgRects);
    if (token !== state.token) return;
    if (p.canvas) p.canvas.replaceWith(canvas); else p.el.prepend(canvas);
    if (p.img) { p.img.width = 0; p.img.remove(); }
    if (img) canvas.after(img);
    if (p.tl) p.tl.replaceWith(tl); else p.el.insertBefore(tl, p.draw);
    p.canvas = canvas; p.img = img; p.tl = tl; p.renderedScale = scale;
  } catch (e) {
    if (e?.name !== 'RenderingCancelledException') console.error(e);
  } finally {
    p.rendering = false;
  }
  if (token === state.token && p.renderedScale !== state.scale) scheduleRender();
}
function unloadPage(p){
  if (p.canvas) { p.canvas.width = 0; p.canvas.remove(); }
  if (p.img) { p.img.width = 0; p.img.remove(); }
  if (p.tl) p.tl.remove();
  p.canvas = p.img = p.tl = null; p.renderedScale = null;
}

// página com marcações gravadas pelo leitor (Arquivo → Salvar): elas já aparecem como grifos editáveis,
// então o PDF.js não as desenha de novo
// marcações gravadas por este app (o nome antigo "Leitor de Estudos" continua valendo para PDFs salvos antes)
App.isOwnAuthor = s => s === 'Vetra' || s === 'Leitor de Estudos';
App.hasOwnAnnots = async page => {
  try { return (await page.getAnnotations()).some(a => a.titleObj && App.isOwnAuthor(a.titleObj.str)); } catch { return false; }
};

// ---------- Imagens preservadas no modo escuro ----------
// Lê os comandos de desenho da página para achar onde cada imagem é pintada (em frações da página).
// No modo escuro, essas regiões são redesenhadas por cima com as cores originais (radiografias, fotos, gráficos).
const mulM = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
async function imageRects(page){
  const OPS = pdfjsLib.OPS;
  const { fnArray, argsArray } = await page.getOperatorList();
  const vp = page.getViewport({ scale: 1 });
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [], rects = [];
  const addUnit = m => {
    const full = mulM(vp.transform, m);
    const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => [full[0] * x + full[2] * y + full[4], full[1] * x + full[3] * y + full[5]]);
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
    const x0 = Math.max(0, Math.min(...xs) / vp.width), y0 = Math.max(0, Math.min(...ys) / vp.height);
    const x1 = Math.min(1, Math.max(...xs) / vp.width), y1 = Math.min(1, Math.max(...ys) / vp.height);
    if (x1 - x0 > 0.01 && y1 - y0 > 0.01) rects.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  };
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i], args = argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() || ctm;
    else if (fn === OPS.transform) ctm = mulM(ctm, args);
    else if (fn === OPS.paintFormXObjectBegin) { stack.push(ctm); if (Array.isArray(args[0]) && args[0].length === 6) ctm = mulM(ctm, args[0]); }
    else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() || ctm;
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintJpegXObject) addUnit(ctm);
    else if (fn === OPS.paintImageXObjectRepeat) {
      const [, sx, sy, pos] = args;
      for (let k = 0; k + 1 < (pos || []).length; k += 2) addUnit(mulM(ctm, [sx, 0, 0, sy, pos[k], pos[k + 1]]));
    }
  }
  // Página escaneada (uma imagem cobrindo quase tudo): deixa escurecer normalmente.
  return rects.filter(r => r.w * r.h < 0.8);
}
function buildImgLayer(canvas, rects){
  if (!rects || !rects.length) return null;
  const c = el('canvas', 'imgLayer');
  c.width = canvas.width; c.height = canvas.height;
  const ctx = c.getContext('2d');
  for (const r of rects) {
    // arredonda para dentro: evita um fio branco da página na borda da imagem
    const sx = Math.max(0, Math.ceil(r.x * c.width)), sy = Math.max(0, Math.ceil(r.y * c.height));
    const sw = Math.min(c.width, Math.floor((r.x + r.w) * c.width)) - sx, sh = Math.min(c.height, Math.floor((r.y + r.h) * c.height)) - sy;
    if (sw > 2 && sh > 2) {
      // cobre o pixel de borda (mistura de imagem e página) esticando a imagem 1px para fora
      ctx.drawImage(canvas, sx, sy, sw, sh, sx - 1, sy - 1, sw + 2, sh + 2);
      ctx.drawImage(canvas, sx, sy, sw, sh, sx, sy, sw, sh);
    }
  }
  return c;
}
App.imageRects = imageRects; App.buildImgLayer = buildImgLayer;
App.setKeepImages = on => {
  ls.set('le.keepImages', on);
  document.documentElement.classList.toggle('invert-images', !on);
};

// ---------- Texto vindo do OCR (PDFs escaneados) ----------
// Palavras guardadas como [texto, x, y, largura, altura] em frações da página.
const MIN_TEXT = 25; // menos que isso de texto real = página escaneada
const textLength = tc => tc.items.reduce((n, it) => n + (typeof it.str === 'string' ? it.str.trim().length : 0), 0);
App.textLength = textLength; App.MIN_TEXT = MIN_TEXT;
let measureCtx = null;
function buildOcrLayer(tl, words, vp){
  tl.style.width = vp.width + 'px'; tl.style.height = vp.height + 'px';
  tl.classList.add('ocr');
  measureCtx = measureCtx || document.createElement('canvas').getContext('2d');
  for (const [t, x, y, w, h] of words) {
    const fs = Math.max(4, h * vp.height * 0.92);
    measureCtx.font = `${fs}px sans-serif`;
    const span = el('span', null, t + ' ');
    const mw = measureCtx.measureText(t).width || 1;
    span.style.cssText = `left:${x * 100}%;top:${y * 100}%;font-size:${fs}px;font-family:sans-serif;transform:scaleX(${(w * vp.width) / mw})`;
    tl.appendChild(span);
  }
}
// chamado pelo OCR quando uma página ganha texto novo
App.ocrUpdated = num => {
  state.textCache.delete(num);
  const p = state.pages[num - 1];
  if (p) { p.renderedScale = null; scheduleRender(); }
};

// ---------- Texto da página (busca e grifo por área) ----------
App.pageText = num => {
  const cache = state.textCache;
  if (cache.has(num)) return cache.get(num);
  const pdf = state.pdf;
  const pr = (async () => {
    const page = await pdf.getPage(num);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    let text = ''; const map = []; const items = [];
    const ocrWords = state.ocr[num];
    if (ocrWords && textLength(tc) < MIN_TEXT) {
      for (const [t, x, y, w, h] of ocrWords) {
        const idx = items.length, str = t + ' ';
        items.push({ str, start: text.length, x, y, w: w + (w / Math.max(1, t.length)), h });
        text += str;
        for (let k = 0; k < str.length; k++) map.push(idx);
      }
      return { text, map, items, ocr: true };
    }
    for (const it of tc.items) {
      if (typeof it.str !== 'string') continue;
      const t = it.transform;
      const fh = Math.hypot(t[2], t[3]) || Math.abs(t[3]) || 10;
      const [a, b, c, d] = vp.convertToViewportRectangle([t[4], t[5] - fh * 0.2, t[4] + it.width, t[5] + fh * 0.85]);
      const idx = items.length;
      items.push({ str: it.str, start: text.length, x: Math.min(a, c) / vp.width, y: Math.min(b, d) / vp.height, w: Math.abs(c - a) / vp.width, h: Math.abs(d - b) / vp.height });
      text += it.str;
      for (let k = 0; k < it.str.length; k++) map.push(idx);
      if (it.hasEOL) { text += ' '; map.push(-1); }
    }
    return { text, map, items };
  })();
  cache.set(num, pr);
  pr.catch(() => cache.delete(num));
  return pr;
};
App.textRects = (pt, start, end) => {
  const groups = new Map();
  for (let i = start; i < end; i++) {
    const idx = pt.map[i];
    if (idx == null || idx < 0) continue;
    const off = i - pt.items[idx].start;
    const g = groups.get(idx);
    if (g) { g.a = Math.min(g.a, off); g.b = Math.max(g.b, off); } else groups.set(idx, { a: off, b: off });
  }
  const out = [];
  for (const [idx, g] of groups) {
    const it = pt.items[idx], L = Math.max(1, it.str.length);
    out.push({ x: it.x + it.w * g.a / L, y: it.y, w: it.w * (g.b - g.a + 1) / L, h: it.h });
  }
  return out;
};

// ---------- Grifos ----------
const undoStack = [];
function snapshot(){ undoStack.push(JSON.stringify(state.highlights)); if (undoStack.length > 50) undoStack.shift(); }
App.snapshot = snapshot;
App.undo = () => {
  if (!undoStack.length) { App.toast('Nada para desfazer'); return; }
  state.highlights = JSON.parse(undoStack.pop()).map(normHl);
  state.lastInk = null; closePopup();
  renderAllAnnots(); App.renderPanel(); App.saveDocSoon(); App.emit('hl:changed');
  App.toast('Desfeito');
};

function hasSelection(){
  const s = getSelection();
  return !!(state.pdf && state.tool === 'text' && s && s.rangeCount && !s.isCollapsed && pagesEl.contains(s.anchorNode) && s.toString().trim());
}
App.hasSelection = hasSelection;
function mergeRects(rects){
  rects.sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2) || a.x - b.x);
  const out = [];
  for (const r of rects) {
    const last = out[out.length - 1];
    if (last) {
      const overlapY = Math.min(last.y + last.h, r.y + r.h) - Math.max(last.y, r.y);
      const gap = r.x - (last.x + last.w);
      if (overlapY > 0.5 * Math.min(last.h, r.h) && gap < 0.015 && r.x + r.w > last.x - 0.015) {
        const x = Math.min(last.x, r.x), y = Math.min(last.y, r.y);
        const x2 = Math.max(last.x + last.w, r.x + r.w), y2 = Math.max(last.y + last.h, r.y + r.h);
        Object.assign(last, { x, y, w: x2 - x, h: y2 - y }); continue;
      }
    }
    out.push({ ...r });
  }
  return out.map(roundRect);
}
const roundRect = r => ({ x: +r.x.toFixed(5), y: +r.y.toFixed(5), w: +r.w.toFixed(5), h: +r.h.toFixed(5) });

function createHighlight(color){
  if (!hasSelection()) return;
  const sel = getSelection(), range = sel.getRangeAt(0);
  const rects = [...range.getClientRects()];
  const bound = range.getBoundingClientRect();
  const parts = [];
  for (const p of state.pages) {
    const pr = p.el.getBoundingClientRect();
    if (pr.bottom < bound.top || pr.top > bound.bottom) continue;
    const list = [];
    for (const r of rects) {
      if (r.width < 1 || r.height < 1) continue;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (cx < pr.left || cx > pr.right || cy < pr.top || cy > pr.bottom) continue;
      if (r.height > pr.height * 0.2) continue; // ignora caixas de contêiner
      list.push({ x: (r.left - pr.left) / pr.width, y: (r.top - pr.top) / pr.height, w: r.width / pr.width, h: r.height / pr.height });
    }
    if (list.length) parts.push({ page: p.num, rects: mergeRects(list) });
  }
  if (!parts.length) return;
  const text = sel.toString().replace(/\s+/g, ' ').trim();
  // clique duplo seguido de triplo (palavra → linha): substitui o grifo de agora há pouco em vez de empilhar
  const prev = state.highlights[state.highlights.length - 1];
  const now = Date.now();
  if (prev && prev.kind === 'text' && now - prev.created < 900 && !prev.note && prev.parts[0].page === parts[0].page && text.includes(prev.text)) {
    state.highlights.pop();
  } else snapshot();
  const h = { id: uid(), kind: 'text', style: state.style, color, text, note: '', parts, created: now };
  state.highlights.push(h); state.color = color;
  sel.removeAllRanges(); closePopup();
  refreshHighlight(h);
}

function cropImage(p, r){
  if (!p.canvas) return null;
  const c = p.canvas;
  const sx = r.x * c.width, sy = r.y * c.height, sw = r.w * c.width, sh = r.h * c.height;
  if (sw < 2 || sh < 2) return null;
  const k = Math.min(1, 1100 / sw, 1100 / sh); // figuras e tabelas legíveis no resumo
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(sw * k)); out.height = Math.max(1, Math.round(sh * k));
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(c, sx, sy, sw, sh, 0, 0, out.width, out.height);
  return out.toDataURL('image/jpeg', 0.82);
}
// copia uma figura (data URL) para colar no Word, Notion, IA…
App.copyImage = async dataUrl => {
  try {
    const img = new Image(); img.src = dataUrl; await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    App.toast('Figura copiada — cole onde quiser');
  } catch (e) { console.warn(e); App.toast('Não consegui copiar a figura neste aparelho'); }
};
function createAreaHighlight(p, r){
  snapshot();
  const h = { id: uid(), kind: 'area', style: 'fill', color: state.color, text: '', note: '', parts: [{ page: p.num, rects: [roundRect(r)] }], created: Date.now(), img: cropImage(p, r) };
  state.highlights.push(h);
  refreshHighlight(h);
  App.pageText(p.num).then(pt => {
    const t = pt.items.filter(it => {
      const cx = it.x + it.w / 2, cy = it.y + it.h / 2;
      return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h;
    }).map(it => it.str).join(' ').replace(/\s+/g, ' ').trim();
    if (t && state.highlights.includes(h)) { h.text = t; App.renderPanel(); App.saveDocSoon(); }
  }).catch(() => {});
}
function commitInk(p, pts){
  const now = Date.now();
  const rounded = pts.map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)]);
  const li = state.lastInk;
  const P = PENS[state.pen] || PENS.mid;
  let h = li && state.highlights.includes(li.h) && li.page === p.num && li.h.color === state.color && (li.h.width || 2.4) === P.w && !!li.h.marker === !!P.marker && now - li.t < 2500 ? li.h : null;
  snapshot();
  if (h) h.parts[0].paths.push(rounded);
  else {
    h = { id: uid(), kind: 'ink', style: 'fill', color: state.color, text: '', note: '', width: P.w, parts: [{ page: p.num, paths: [rounded] }], created: now };
    if (P.marker) h.marker = true;
    state.highlights.push(h);
  }
  state.lastInk = { h, page: p.num, t: now };
  refreshHighlight(h);
}
// ---------- Notas soltas (post-it na página) ----------
const NOTE_W = 0.03, NOTE_H = 0.022;
function createNote(p, [x, y]){
  snapshot();
  const r = { x: +clamp01(x - NOTE_W / 2).toFixed(4), y: +clamp01(y - NOTE_H / 2).toFixed(4), w: NOTE_W, h: NOTE_H };
  const h = { id: uid(), kind: 'note', style: 'fill', color: state.color, text: '', note: '', parts: [{ page: p.num, rects: [r] }], created: Date.now() };
  state.highlights.push(h);
  refreshHighlight(h);
  App.setTool('text');
  const m = p.notes.querySelector(`[data-id="${h.id}"]`).getBoundingClientRect();
  showEditPopup(h, m.left + m.width / 2, m.bottom, true);
}
// clicar abre a nota; arrastar muda de lugar
pagesEl.addEventListener('pointerdown', e => {
  const m = e.target.closest('.noteMark');
  if (!m || e.button !== 0) return;
  e.preventDefault(); e.stopPropagation();
  const h = state.highlights.find(x => x.id === m.dataset.id); if (!h) return;
  const p = state.pages[h.parts[0].page - 1], pr = p.el.getBoundingClientRect();
  const start = { x: e.clientX, y: e.clientY }, r0 = { ...h.parts[0].rects[0] };
  let moved = false;
  m.setPointerCapture(e.pointerId);
  const move = ev => {
    if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4) return;
    if (!moved) { moved = true; snapshot(); closePopup(); }
    const r = h.parts[0].rects[0];
    r.x = +clamp01(r0.x + (ev.clientX - start.x) / pr.width).toFixed(4);
    r.y = +clamp01(r0.y + (ev.clientY - start.y) / pr.height).toFixed(4);
    m.style.left = r.x * 100 + '%'; m.style.top = r.y * 100 + '%';
  };
  const up = () => {
    m.removeEventListener('pointermove', move); m.removeEventListener('pointerup', up);
    if (moved) { refreshHighlight(h); return; }
    const b = m.getBoundingClientRect();
    showEditPopup(h, b.left + b.width / 2, b.bottom, true);
  };
  m.addEventListener('pointermove', move); m.addEventListener('pointerup', up);
}, true);

function deleteHighlight(h){
  snapshot();
  state.highlights = state.highlights.filter(x => x.id !== h.id);
  closePopup(); refreshHighlight(h);
  App.toast('Apagado — Ctrl+Z desfaz');
}

function pathD(pts, b){
  if (!pts.length) return '';
  const P = pts.map(([x, y]) => [x * b.w, y * b.h]);
  const f = v => v.toFixed(1);
  if (P.length === 1) return `M${f(P[0][0])} ${f(P[0][1])} l0.1 0`;
  let d = `M${f(P[0][0])} ${f(P[0][1])}`;
  for (let i = 1; i < P.length - 1; i++) {
    const mx = (P[i][0] + P[i + 1][0]) / 2, my = (P[i][1] + P[i + 1][1]) / 2;
    d += ` Q${f(P[i][0])} ${f(P[i][1])} ${f(mx)} ${f(my)}`;
  }
  const L = P[P.length - 1];
  return d + ` L${f(L[0])} ${f(L[1])}`;
}
App.pathD = pathD;

function renderPageAnnots(p){
  if (!p) return;
  p.hl.innerHTML = ''; p.ink.innerHTML = ''; p.notes.innerHTML = '';
  for (const h of state.highlights) for (const part of h.parts) {
    if (part.page !== p.num) continue;
    const col = App.colorOf(h.color);
    if (h.kind === 'note') {
      const r = part.rects[0];
      const m = el('button', 'noteMark' + (state.selected === h.id ? ' selected' : '') + (h.note ? '' : ' empty'));
      m.dataset.id = h.id; m.style.left = r.x * 100 + '%'; m.style.top = r.y * 100 + '%';
      m.style.setProperty('--c', col.hex); m.style.setProperty('--ci', col.ink);
      m.title = h.note || 'Nota vazia'; m.setAttribute('aria-label', 'Nota: ' + (h.note || 'vazia'));
      m.append(App.icon('note'));
      p.notes.appendChild(m);
      continue;
    }
    if (h.kind === 'ink') {
      for (const pts of part.paths) {
        const path = document.createElementNS(SVGNS, 'path');
        path.setAttribute('d', pathD(pts, p.base));
        path.setAttribute('stroke-width', h.width || 2.4);
        if (h.marker) path.classList.add('marker');
        if (state.selected === h.id) path.classList.add('selected');
        path.dataset.id = h.id;
        path.style.setProperty('--c', col.hex); path.style.setProperty('--ci', col.ink);
        p.ink.appendChild(path);
      }
      continue;
    }
    const style = h.kind === 'area' ? 'fill' : h.style;
    const g = el('div', `hl k-${h.kind} s-${style}` + (h.q ? ' q' : '') + (h.note && !h.q ? ' has-note' : '') + (h.link ? ' has-link' : '') + (state.selected === h.id ? ' selected' : ''));
    g.dataset.id = h.id;
    g.style.setProperty('--c', col.hex); g.style.setProperty('--ci', col.ink);
    for (const r of part.rects) {
      const d = el('div');
      d.style.cssText = `left:${r.x * 100}%;top:${r.y * 100}%;width:${r.w * 100}%;height:${r.h * 100}%`;
      g.appendChild(d);
    }
    p.hl.appendChild(g);
  }
}
const renderAllAnnots = App.renderAllAnnots = () => state.pages.forEach(renderPageAnnots);
function refreshHighlight(h){
  new Set(h.parts.map(x => x.page)).forEach(n => renderPageAnnots(state.pages[n - 1]));
  App.renderPanel(); App.saveDocSoon(); App.emit('hl:changed');
}
App.refreshHighlight = refreshHighlight;
function markSelected(){
  $$('.hl.selected, .inkLayer path.selected').forEach(x => x.classList.remove('selected'));
  if (state.selected) $$(`[data-id="${state.selected}"]`).forEach(x => { if (x.closest('.page')) x.classList.add('selected'); });
}
function distSeg(px, py, ax, ay, bx, by){
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function hitTest(pageEl, cx, cy){
  const r = pageEl.getBoundingClientRect();
  const x = (cx - r.left) / r.width, y = (cy - r.top) / r.height, num = +pageEl.dataset.page;
  const b = state.pages[num - 1].base;
  for (let i = state.highlights.length - 1; i >= 0; i--) {
    const h = state.highlights[i];
    if (h.kind === 'note') continue; // notas têm o próprio botão
    for (const part of h.parts) {
      if (part.page !== num) continue;
      if (h.kind === 'ink') {
        const tol = Math.max(5, (h.width || 2.4) + 3) / Math.max(0.5, state.scale);
        for (const pts of part.paths) for (let k = 0; k < pts.length; k++) {
          const a = pts[k], c = pts[Math.min(k + 1, pts.length - 1)];
          if (distSeg(x * b.w, y * b.h, a[0] * b.w, a[1] * b.h, c[0] * b.w, c[1] * b.h) <= tol) return h;
        }
      } else {
        for (const q of part.rects) if (x >= q.x - .002 && x <= q.x + q.w + .002 && y >= q.y - .002 && y <= q.y + q.h + .002) return h;
      }
    }
  }
  return null;
}
App.anchorOf = h => {
  const part = h.parts[0];
  if (h.kind === 'ink') {
    let y = 1, x = 1;
    for (const pts of part.paths) for (const [px, py] of pts) { if (py < y) y = py; if (px < x) x = px; }
    return { page: part.page, y, x };
  }
  return { page: part.page, y: part.rects[0].y, x: part.rects[0].x };
};
App.sortedHighlights = list => [...list].sort((a, b) => {
  const A = App.anchorOf(a), B = App.anchorOf(b);
  return A.page - B.page || A.y - B.y || A.x - B.x;
});
App.jumpTo = h => {
  const a = App.anchorOf(h), p = state.pages[a.page - 1];
  if (!p) return;
  viewer.scrollTop = p.el.offsetTop + a.y * p.el.offsetHeight - viewer.clientHeight * 0.3;
  updateCurrentPage(); scheduleRender();
  state.selected = h.id; markSelected();
  $$(`.page [data-id="${h.id}"]`).forEach(g => { g.classList.remove('flash'); void g.getBoundingClientRect(); g.classList.add('flash'); });
};

// ---------- Popup ----------
function colorRow(onPick, current){
  const row = el('div', 'colorRow');
  App.COLORS.forEach((c, i) => {
    const b = el('button', 'swatch' + (c.id === current ? ' current' : ''));
    b.style.setProperty('--c', c.hex); b.title = `${App.labelOf(c.id)} (${i + 1})`;
    b.onclick = () => onPick(c.id); row.appendChild(b);
  });
  return row;
}
function placePopup(x, y){
  popup.hidden = false;
  const pw = popup.offsetWidth, ph = popup.offsetHeight;
  const left = Math.min(Math.max(8, x - pw / 2), innerWidth - pw - 8);
  let top = y + 12;
  if (top + ph > innerHeight - 8) top = y - ph - 14;
  // nunca acima da barra de cima nem fora da tela (seleção perto do topo, comum no celular)
  const minTop = ($('#toolbar').getBoundingClientRect().bottom || 0) + 6;
  top = Math.max(minTop, Math.min(top, innerHeight - ph - 8));
  popup.style.left = left + 'px'; popup.style.top = top + 'px';
}
function showSelectionPopup(){
  const range = getSelection().getRangeAt(0);
  const rs = range.getClientRects(), last = rs[rs.length - 1] || range.getBoundingClientRect();
  popup.innerHTML = '';
  popup.append(colorRow(id => createHighlight(id)));
  const row = el('div', 'popRow');
  const auto = App.ibtn('highlighter', null, () => { App.setAutoHL(true, true); createHighlight(state.color); }, 'sm', 'Grifar ao selecionar (G) — os próximos trechos são grifados na hora');
  auto.style.marginLeft = 'auto';
  const selText = getSelection().toString();
  // página e altura do trecho (para a resposta da IA poder virar uma nota ali)
  const selPageEl = (range.startContainer.parentElement || range.startContainer).closest?.('.page');
  const selPage = selPageEl ? +selPageEl.dataset.page : state.currentPage;
  let selY = null; if (selPageEl) { const pr = selPageEl.getBoundingClientRect(); selY = Math.max(0, Math.min(1, (rs[0] ? rs[0].top : last.top) - pr.top) / pr.height); }
  const ai = App.ibtn('sparkle', 'IA', () => App.aiMenu?.(ai, { text: selText, page: selPage, y: selY, src: 'trecho' }, { title: 'Trecho selecionado' }), 'sm', 'Perguntar ao Claude, ChatGPT ou Gemini sobre o trecho');
  row.append(
    App.ibtn('copy', 'Copiar', () => { App.copyText(getSelection().toString()); closePopup(); }, 'sm'),
    App.ibtn('search', 'Buscar', () => { closePopup(); App.openSearch?.(); }, 'sm'),
    ai,
    auto,
  );
  popup.append(row);
  placePopup(last.right, last.bottom);
  App.selectionExtras?.(popup, selText).then(() => { if (!popup.hidden) placePopup(last.right, last.bottom); }).catch(() => {});
}
function showEditPopup(h, x, y, focusNote){
  state.selected = h.id; markSelected();
  popup.innerHTML = '';
  popup.append(colorRow(id => { snapshot(); h.color = id; state.color = id; refreshHighlight(h); markSelected(); showEditPopup(h, x, y); }, h.color));
  const actions = el('div', 'popRow');
  if (h.kind === 'text') {
    const seg = el('div', 'seg');
    [['fill', 'Marca-texto', 'st-fill'], ['underline', 'Sublinhado', 'st-u'], ['strike', 'Tachado', 'st-s']].forEach(([s, label, cls]) => {
      const b = el('button', 'btn icon' + (h.style === s ? ' on' : '')); b.title = label;
      b.append(el('span', 'st ' + cls, 'ab'));
      b.onclick = () => { snapshot(); h.style = s; refreshHighlight(h); markSelected(); showEditPopup(h, x, y); };
      seg.append(b);
    });
    actions.append(seg);
  } else actions.append(el('span', 'spacerAuto'));
  let ta = null;
  if (h.kind !== 'ink') {
    ta = el('textarea'); ta.placeholder = 'Escreva uma nota ou uma pergunta — ela vira o enunciado do cartão de revisão';
    ta.value = h.note || ''; ta.hidden = !h.note && !focusNote;
    let noteT;
    ta.oninput = () => { h.note = ta.value; clearTimeout(noteT); noteT = setTimeout(() => { refreshHighlight(h); markSelected(); }, 300); };
    const nb = App.ibtn('note', null, () => { ta.hidden = false; ta.focus(); }, 'sm' + (h.note ? ' on' : ''), h.note ? 'Editar nota (N)' : 'Adicionar nota (N)');
    actions.append(nb);
    if (h.text) actions.append(App.ibtn('copy', null, () => App.copyText(h.text), 'sm', 'Copiar texto'));
    if (h.img) actions.append(App.ibtn('camera', null, () => App.copyImage(h.img), 'sm', 'Copiar a figura'));
    if (h.text || h.img) {
      const ai = App.ibtn('sparkle', null, () => App.aiMenu?.(ai, { text: h.text, image: h.img, note: h.note, page: App.anchorOf(h).page, hid: h.id, y: App.anchorOf(h).y, src: h.kind === 'area' && !h.text ? 'figura' : h.kind === 'note' ? 'nota' : 'grifo' }, { title: 'Este grifo', question: h.q ? h : null }), 'sm', 'Perguntar à IA sobre este grifo');
      actions.append(ai);
    }
  }
  App.popupExtras?.(h, actions, () => showEditPopup(h, x, y));
  actions.append(App.ibtn('trash', null, () => deleteHighlight(h), 'sm danger', 'Apagar (Del)'));
  popup.append(actions);
  if (ta) popup.append(ta);
  placePopup(x, y);
  if (focusNote && ta) ta.focus();
}
function closePopup(){
  if (popup.hidden && !state.selected) return;
  const sel = state.highlights.find(h => h.id === state.selected);
  popup.hidden = true; state.selected = null; markSelected();
  // nota que ficou vazia some sozinha
  if (sel && sel.kind === 'note' && !sel.note.trim()) {
    state.highlights = state.highlights.filter(h => h !== sel);
    undoStack.pop(); refreshHighlight(sel);
  }
}
App.closePopup = closePopup;
App.selectionPopup = () => { if (hasSelection()) showSelectionPopup(); };
App.highlightSelection = color => createHighlight(color || state.color);
popup.addEventListener('mousedown', e => { if (!e.target.closest('textarea')) e.preventDefault(); });

// ---------- Painel de grifos ----------
const legendChips = {};
App.buildLegend = () => {
  const lg = $('#legend'); lg.innerHTML = ''; // refeita ao trocar as cores dos grifos
  const row = el('div', 'chipRow');
  const edit = el('div', 'legendEdit');
  edit.append(el('div', 'hint', 'Dê um significado a cada cor — ele aparece nos grifos, na revisão e nas exportações.'));
  App.COLORS.forEach((c, i) => {
    const chip = el('button', 'chip'); chip.style.setProperty('--c', c.hex);
    chip.onclick = () => {
      state.filter.has(c.id) ? state.filter.delete(c.id) : state.filter.add(c.id);
      chip.classList.toggle('on', state.filter.has(c.id)); App.renderPanel();
    };
    chip.classList.toggle('on', state.filter.has(c.id));
    legendChips[c.id] = chip; row.append(chip);
    const dot = el('span', 'dot'); dot.style.setProperty('--c', c.hex);
    const inp = el('input'); inp.value = labels[c.id] || ''; inp.placeholder = `${c.name} — ex.: ${App.EXAMPLES[i]}`;
    inp.oninput = () => { labels[c.id] = inp.value; App.saveLabels(); App.buildPalette(); updateChipTitles(); renderPanelSoon(); };
    inp.dataset.color = c.id;
    edit.append(dot, inp);
  });
  row.append(el('span', 'spacer'));
  const open = () => ls.get('le.legendOpen', false);
  const tg = App.ibtn('edit', null, () => { const o = !open(); ls.set('le.legendOpen', o); edit.hidden = !o; tg.classList.toggle('on', o); }, 'sm', 'Dar nome às cores');
  row.append(tg);
  edit.hidden = !open(); tg.classList.toggle('on', open());
  lg.append(row, edit);
  updateChipTitles();
};
function updateChipTitles(){
  for (const c of App.COLORS) if (legendChips[c.id]) legendChips[c.id].title = `${App.labelOf(c.id)} — clique para mostrar só esta cor`;
}
App.refreshLegendInputs = () => $$('#legend input[data-color]').forEach(i => { i.value = labels[i.dataset.color] || ''; });
let panelT; const renderPanelSoon = () => { clearTimeout(panelT); panelT = setTimeout(App.renderPanel, 250); };
App.renderPanel = () => {
  $('#hlCount').textContent = state.highlights.length || '';
  for (const c of App.COLORS) if (legendChips[c.id]) legendChips[c.id].textContent = state.highlights.filter(h => h.color === c.id).length;
  $('#hlSearchBox').hidden = state.highlights.length < 4 && !state.query;
  const q = App.fold((state.query || '').trim());
  const matches = h => !q || App.fold(`${h.text} ${h.note} ${App.labelOf(h.color)}`).includes(q);
  const list = App.sortedHighlights(state.highlights.filter(h => (!state.filter.size || state.filter.has(h.color)) && matches(h)));
  hlList.innerHTML = '';
  if (!list.length) {
    hlList.append(q
      ? App.emptyState('search', 'Nada encontrado', 'Nenhum grifo ou nota tem esse texto.')
      : state.highlights.length
        ? App.emptyState('highlighter', 'Nenhum grifo com essa cor', 'Clique de novo na cor para limpar o filtro.')
        : App.emptyState('highlighter', 'Nenhum grifo ainda', 'Selecione um trecho e escolha uma cor. Em PDFs escaneados, use a ferramenta Área (A).'));
    return;
  }
  let last = null;
  for (const h of list) {
    const pg = App.anchorOf(h).page;
    if (pg !== last) { hlList.append(el('div', 'pgHead', 'Página ' + pg)); last = pg; }
    const item = el('button', 'hlItem'); item.style.setProperty('--c', App.colorOf(h.color).hex);
    if (h.img) { const im = el('img', 'hlImg'); im.src = h.img; im.alt = ''; item.append(im); }
    if (h.kind === 'note') item.append(el('div', 'hlText noteText', h.note || '(nota vazia)'));
    else if (h.text) item.append(el('div', 'hlText', h.text));
    else if (!h.img) item.append(el('div', 'hlText muted', h.kind === 'ink' ? 'Desenho à mão' : '(sem texto)'));
    if (h.note && h.kind !== 'note') { const n = el('div', 'hlNote'); n.append(App.icon('note'), el('span', null, h.note)); item.append(n); }
    const meta = el('div', 'hlMeta');
    meta.append(el('span', 'dot'), el('span', 'lab', App.labelOf(h.color)));
    const kind = { area: h.q ? 'Questão errada' : 'Área', ink: 'Desenho', note: 'Nota' }[h.kind] || { underline: 'Sublinhado', strike: 'Tachado' }[h.style];
    if (kind) meta.append(el('span', 'tag', kind));
    if (h.srs) meta.append(h.srs.due <= Date.now() ? el('span', 'tag due', 'Revisar hoje') : el('span', 'tag', 'Revisado'));
    item.append(meta);
    item.onclick = () => App.jumpTo(h);
    hlList.append(item);
  }
};
$('#hlFilter').addEventListener('input', e => { state.query = e.target.value; renderPanelSoon(); });
App.togglePanel = () => { document.body.classList.toggle('panel-open'); scheduleRender(); };

// ---------- Salvar ----------
let saveT = null;
App.saveDocSoon = () => { clearTimeout(saveT); saveT = setTimeout(App.saveDoc, 400); };
App.saveDoc = async () => {
  clearTimeout(saveT); saveT = null;
  if (!state.fp) return;
  const fp = state.fp;
  const cp = state.pages[state.currentPage - 1];
  const lastFrac = cp ? Math.max(0, Math.min(1, +((viewer.scrollTop - cp.el.offsetTop) / cp.el.offsetHeight).toFixed(4))) : 0;
  await safe(() => DB.update('docs', fp, (rec = {}) => ({
    ...rec, fp, name: state.name, highlights: state.highlights, bookmarks: state.bookmarks,
    time: state.stats.time, visited: state.stats.visited, lastPage: state.currentPage, lastFrac, scale: state.scale,
    // quando a posição de leitura mudou de verdade (para a sincronização saber qual aparelho leu por último)
    posTs: rec.lastPage !== state.currentPage || Math.abs((rec.lastFrac || 0) - lastFrac) > 0.05 ? Date.now() : (rec.posTs || 0),
    ocr: state.ocr, exams: state.exams,
    pages: state.pages.length || rec.pages, ts: Date.now(), autoFit: state.autoFit, thumb: state.thumb || rec.thumb || null,
  })));
  chan?.postMessage({ type: 'saved', fp, from: INSTANCE });
  App.emit('doc:saved');
};

// ---------- Várias janelas com o mesmo PDF ----------
// Cada janela avisa as outras quando salva; quem está com o mesmo documento aberto recarrega os grifos,
// para uma janela não sobrescrever o que foi feito na outra.
const INSTANCE = uid();
const chan = 'BroadcastChannel' in window ? new BroadcastChannel('leitor-estudos') : null;
const mergeById = (mine, theirs) => {
  const map = new Map(theirs.map(x => [x.id, x]));
  for (const x of mine) map.set(x.id, x); // as minhas versões prevalecem
  return [...map.values()];
};
if (chan) chan.onmessage = async ({ data }) => {
  if (!data || data.type !== 'saved' || data.from === INSTANCE || data.fp !== state.fp) return;
  const rec = await safe(() => DB.get('docs', data.fp), null);
  if (!rec || data.fp !== state.fp) return;
  const pending = saveT !== null; // tenho alterações ainda não salvas: junta em vez de substituir
  const theirs = (rec.highlights || []).map(normHl);
  state.highlights = pending ? mergeById(state.highlights, theirs) : theirs;
  state.bookmarks = pending ? mergeById(state.bookmarks, rec.bookmarks || []) : (rec.bookmarks || []);
  for (const [k, v] of Object.entries(rec.time || {})) state.stats.time[k] = Math.max(v, state.stats.time[k] || 0);
  state.stats.visited = [...new Set([...state.stats.visited, ...(rec.visited || [])])];
  state.ocr = { ...(rec.ocr || {}), ...state.ocr };
  // simulados: a versão desta janela prevalece (o cronômetro do simulado em andamento roda aqui)
  state.exams = mergeById(state.exams, rec.exams || []);
  App.emit('exams:reload');
  if (state.selected && !state.highlights.some(h => h.id === state.selected)) closePopup();
  renderAllAnnots(); App.renderPanel(); markSelected();
  App.emit('bookmarks:reload'); App.emit('hl:changed'); App.renderStats?.();
};

// ---------- Interação com o texto ----------
let downPos = null;
viewer.addEventListener('mousedown', e => {
  if (e.button !== 0 || state.tool !== 'text') return;
  downPos = { x: e.clientX, y: e.clientY };
  const tl = e.target.closest('.textLayer');
  if (tl) tl.querySelector('.endOfContent')?.classList.add('active');
});
document.addEventListener('mousedown', e => { if (!popup.hidden && !popup.contains(e.target)) closePopup(); }, true);
document.addEventListener('mouseup', e => {
  $$('.endOfContent.active').forEach(x => x.classList.remove('active'));
  if (!downPos) return;
  const dp = downPos; downPos = null;
  setTimeout(() => {
    if (hasSelection()) {
      if (state.autoHL && !e.altKey) createHighlight(state.color); else showSelectionPopup();
      return;
    }
    if (Math.hypot(e.clientX - dp.x, e.clientY - dp.y) > 4) return;
    const pageEl = e.target.closest && e.target.closest('.page');
    if (!pageEl) return;
    const h = hitTest(pageEl, e.clientX, e.clientY);
    if (h) showEditPopup(h, e.clientX, e.clientY);
  }, 0);
});

// ---------- Área e caneta ----------
let drawing = null;
const normPt = (e, r) => [clamp01((e.clientX - r.left) / r.width), clamp01((e.clientY - r.top) / r.height)];
pagesEl.addEventListener('pointerdown', e => {
  const dl = e.target.closest('.drawLayer');
  if (!dl || e.button !== 0 || state.tool === 'text') return;
  const p = state.pages[+dl.parentElement.dataset.page - 1];
  const rect = p.el.getBoundingClientRect();
  const start = normPt(e, rect);
  if (drawing && drawing.type === 'pan') return; // segundo dedo (pinça)
  e.preventDefault(); closePopup();
  if (state.tool === 'note') { createNote(p, start); return; }
  dl.setPointerCapture(e.pointerId);
  // com caneta stylus, o dedo só rola a página
  if (e.pointerType === 'touch' && state.penSeen && (state.tool === 'ink' || state.tool === 'erase')) {
    drawing = { type: 'pan', sx: e.clientX, sy: e.clientY, st: viewer.scrollTop, sl: viewer.scrollLeft, cx: e.clientX, cy: e.clientY };
    return;
  }
  if (state.tool === 'erase') {
    drawing = { type: 'erase', p, rect, erased: false, cx: e.clientX, cy: e.clientY, last: start };
    eraseAt(drawing, start);
    return;
  }
  const col = App.colorOf(state.color);
  if (state.tool === 'area') {
    const box = el('div', 'areaPreview');
    box.style.setProperty('--c', col.hex); box.style.setProperty('--ci', col.ink);
    dl.appendChild(box);
    drawing = { type: 'area', p, rect, start, end: start, box, cx: e.clientX, cy: e.clientY };
  } else {
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${p.base.w} ${p.base.h}`); svg.setAttribute('preserveAspectRatio', 'none');
    const path = document.createElementNS(SVGNS, 'path');
    const P = PENS[state.pen] || PENS.mid;
    path.setAttribute('stroke-width', P.w);
    if (P.marker) path.classList.add('marker');
    path.style.setProperty('--c', col.hex); path.style.setProperty('--ci', col.ink);
    svg.appendChild(path); dl.appendChild(svg);
    drawing = { type: 'ink', p, rect, pts: [start], svg, path, cx: e.clientX, cy: e.clientY };
    path.setAttribute('d', pathD(drawing.pts, p.base));
  }
});
pagesEl.addEventListener('pointermove', e => {
  if (!drawing) return;
  const d = drawing;
  if (d.type === 'pan') { viewer.scrollTop = d.st - (e.clientY - d.sy); viewer.scrollLeft = d.sl - (e.clientX - d.sx); return; }
  const pt = normPt(e, d.rect);
  if (d.type === 'erase') {
    // passa também pelos pontos entre um movimento e outro (gesto rápido)
    const [lx, ly] = d.last, dx = (pt[0] - lx) * d.rect.width, dy = (pt[1] - ly) * d.rect.height;
    const steps = Math.min(40, Math.ceil(Math.hypot(dx, dy) / 6));
    for (let k = 1; k <= steps; k++) eraseAt(d, [lx + (pt[0] - lx) * k / steps, ly + (pt[1] - ly) * k / steps]);
    d.last = pt; return;
  }
  if (d.type === 'area') {
    d.end = pt;
    const r = rectFrom(d.start, pt);
    d.box.style.cssText = `left:${r.x * 100}%;top:${r.y * 100}%;width:${r.w * 100}%;height:${r.h * 100}%`;
  } else {
    const last = d.pts[d.pts.length - 1];
    if (Math.hypot((pt[0] - last[0]) * d.rect.width, (pt[1] - last[1]) * d.rect.height) >= 2) {
      d.pts.push(pt); d.path.setAttribute('d', pathD(d.pts, d.p.base));
    }
  }
});
// borracha: apaga o traço inteiro da caneta que estiver sob o dedo/caneta
function eraseAt(d, [x, y]){
  const p = d.p, b = p.base, tol = 9 / Math.max(0.5, state.scale);
  let changed = false;
  for (const h of [...state.highlights]) {
    if (h.kind !== 'ink') continue;
    let hit = false;
    for (const part of h.parts) {
      if (part.page !== p.num) continue;
      const w = (h.width || 2.4) / 2 + tol;
      const keep = part.paths.filter(pts => {
        for (let k = 0; k < pts.length; k++) {
          const a = pts[k], c = pts[Math.min(k + 1, pts.length - 1)];
          if (distSeg(x * b.w, y * b.h, a[0] * b.w, a[1] * b.h, c[0] * b.w, c[1] * b.h) <= w) return false;
        }
        return true;
      });
      if (keep.length === part.paths.length) continue;
      if (!d.erased && !changed) snapshot();
      part.paths = keep; changed = hit = true;
    }
    if (hit && h.parts.every(pt => !pt.paths || !pt.paths.length)) state.highlights = state.highlights.filter(x => x !== h);
  }
  if (changed) { d.erased = true; renderPageAnnots(p); }
}
const rectFrom = (a, b) => ({ x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]) });
function finishDrawing(e, cancel){
  if (!drawing) return;
  const d = drawing; drawing = null;
  if (d.type === 'pan') return;
  if (d.type === 'erase') { if (d.erased) { App.renderPanel(); App.saveDocSoon(); App.emit('hl:changed'); } return; }
  (d.box || d.svg).remove();
  if (cancel) return;
  if (Math.hypot(e.clientX - d.cx, e.clientY - d.cy) < 4) {
    const h = hitTest(d.p.el, e.clientX, e.clientY);
    if (h) showEditPopup(h, e.clientX, e.clientY);
    return;
  }
  if (d.type === 'area') {
    const r = rectFrom(d.start, d.end);
    if (r.w * d.rect.width < 6 || r.h * d.rect.height < 6) return;
    createAreaHighlight(d.p, r);
  } else commitInk(d.p, d.pts);
}
pagesEl.addEventListener('pointerup', e => finishDrawing(e));
pagesEl.addEventListener('pointercancel', e => finishDrawing(e, true));

// ---------- Modo foco ----------
App.toggleFocus = () => {
  const on = !document.body.classList.contains('focus');
  document.body.classList.toggle('focus', on);
  $('#focusExit').hidden = !on;
  if (on) document.documentElement.requestFullscreen?.().catch(() => {});
  else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  setTimeout(scheduleRender, 120);
};
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && document.body.classList.contains('focus')) {
    document.body.classList.remove('focus'); $('#focusExit').hidden = true; scheduleRender();
  }
});
$('#focusExit').onclick = App.toggleFocus;

// ---------- Janela de atalhos ----------
const help = $('#help');
App.openHelp = () => {
  if (!$('#helpBody').childElementCount) $('#helpBody').append($('.shortcuts dl').cloneNode(true));
  if (!help.open) help.showModal();
};
$('#helpClose').onclick = () => help.close();
help.addEventListener('click', e => { if (e.target === help) help.close(); }); // clique fora fecha

// ---------- Atalhos de teclado ----------
document.addEventListener('keydown', e => {
  if (App.reviewOpen || help.open || App.sheetOpen || App.popOpen?.() || App.cmdkOpen?.() || $('#lookDlg').open || App.examViewOpen || $('#toolsDlg').open || $('#picker').open) return;
  const mod = e.ctrlKey || e.metaKey, k = e.key;
  if (k === 'F1') { e.preventDefault(); App.openHelp(); return; }
  if (mod && k.toLowerCase() === 'o') { e.preventDefault(); App.fileOpen ? App.fileOpen() : $('#fileInput').click(); return; }
  if (mod && e.shiftKey && k.toLowerCase() === 'f') { e.preventDefault(); App.searchAll?.(App.hasSelection() ? getSelection().toString().trim().slice(0, 80) : ''); return; }
  if (mod && k.toLowerCase() === 'f' && !state.pdf) { e.preventDefault(); $('#libQuery').focus(); return; }
  if (mod && k.toLowerCase() === 'f' && state.pdf) { e.preventDefault(); App.openSearch?.(); return; }
  if (mod && (k === 'Tab' || k === 'PageDown' || k === 'PageUp') && App.cycleTab) { e.preventDefault(); App.cycleTab(k === 'PageUp' || (k === 'Tab' && e.shiftKey) ? -1 : 1); return; }
  if (k === 'F3' && state.pdf) { e.preventDefault(); App.searchStep?.(e.shiftKey ? -1 : 1); return; }
  if (mod && state.pdf && (k === '=' || k === '+')) { e.preventDefault(); App.zoomBy(1.15); return; }
  if (mod && state.pdf && k === '-') { e.preventDefault(); App.zoomBy(1 / 1.15); return; }
  if (mod && state.pdf && k === '0') { e.preventDefault(); App.fitWidth(); return; }
  if (mod && state.pdf && k === '9') { e.preventDefault(); App.fitPage(); return; }
  if (mod && state.pdf && k === '1') { e.preventDefault(); App.actualSize(); return; }
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') { if (k === 'Escape') e.target.blur(); return; }
  if (mod && k.toLowerCase() === 'z' && state.pdf) { e.preventDefault(); App.undo(); return; }
  if (mod || e.altKey) return;
  const K = k.toLowerCase();
  if (k === '?') { e.preventDefault(); App.openHelp(); return; }
  if (state.pdf && App.examKey && App.examKey(e)) return; // simulado em andamento: A–E respondem, etc.
  if (K === 'd') { App.toggleDark(); return; }
  if (!state.pdf) return;
  const sel = state.highlights.find(h => h.id === state.selected);
  if (k === 'Escape') {
    if (!$('#menu').hidden) { $('#menu').hidden = true; return; }
    closePopup(); getSelection().removeAllRanges(); App.setTool('text'); return;
  }
  const n = parseInt(k, 10);
  if (n >= 1 && n <= App.COLORS.length) {
    e.preventDefault();
    const id = App.COLORS[n - 1].id;
    if (hasSelection()) createHighlight(id);
    else if (sel) { snapshot(); sel.color = id; refreshHighlight(sel); markSelected(); if (!popup.hidden) showEditPopup(sel, parseFloat(popup.style.left) + popup.offsetWidth / 2, parseFloat(popup.style.top) - 12); }
    else pickColor(id);
    return;
  }
  if ((k === 'Delete' || k === 'Backspace') && sel) { e.preventDefault(); deleteHighlight(sel); return; }
  if (K === 'n' && sel && sel.kind !== 'ink') {
    e.preventDefault();
    const g = document.querySelector(`.page [data-id="${sel.id}"]`);
    const r = g ? (g.firstElementChild || g).getBoundingClientRect() : { left: innerWidth / 2, bottom: innerHeight / 2, width: 0 };
    showEditPopup(sel, r.left + r.width / 2, r.bottom, true);
    return;
  }
  const noHScroll = viewer.scrollWidth <= viewer.clientWidth + 2;
  if (k === 'ArrowRight' && noHScroll) { e.preventDefault(); App.pageStep(1); return; }
  if (k === 'ArrowLeft' && noHScroll) { e.preventDefault(); App.pageStep(-1); return; }
  const actions = {
    h: App.togglePanel, s: () => App.toggleSide?.(), f: App.toggleFocus, r: () => App.openReview?.(),
    b: () => App.toggleBookmark?.(), t: () => App.toggleDock?.(), g: () => { App.setTool('text'); App.setAutoHL(!state.autoHL, true); }, v: () => App.setTool('text'), a: () => App.setTool('area'), p: () => App.setTool('ink'), c: () => App.setTool('note'), e: () => App.setTool('erase'),
    o: () => App.openTools?.(), l: () => App.toggleSplit?.(),
  };
  if (actions[K]) { e.preventDefault(); actions[K](); }
});

// ---------- Botões e eventos gerais ----------
$('#btnOpen').onclick = $('#btnOpen2').onclick = () => (App.fileOpen ? App.fileOpen() : $('#fileInput').click());
$('#fileInput').onchange = () => { const f = $('#fileInput').files; App.openFiles(f); $('#fileInput').value = ''; };
$('#btnHome').onclick = () => App.closeDoc();
$('#btnPrev').onclick = () => App.pageStep(-1);
$('#btnNext').onclick = () => App.pageStep(1);
pageInput.onchange = () => { App.goToPage(+pageInput.value); pageInput.blur(); };
$('#btnZoomIn').onclick = () => App.zoomBy(1.15);
$('#btnZoomOut').onclick = () => App.zoomBy(1 / 1.15);
$('#btnFit').onclick = e => App.fitMenu(e.currentTarget);
$('#btnAuto').onmousedown = e => e.preventDefault();
$('#btnAuto').onclick = () => { App.setTool('text'); App.setAutoHL(!state.autoHL, true); };
$('#btnPanel').onclick = App.togglePanel;
$('#btnFocus').onclick = App.toggleFocus;
$$('button[data-tool]').forEach(b => { b.onclick = () => App.setTool(b.dataset.tool); });
$('#btnPenOpts').onclick = e => App.penMenu(e.currentTarget);
App.updatePenBtn();
$$('[data-style]').forEach(b => { b.onmousedown = e => e.preventDefault(); b.onclick = () => App.setStyle(b.dataset.style); });

viewer.addEventListener('scroll', () => {
  if (!state.pdf) return;
  updateCurrentPage(); scheduleRender();
  if (!popup.hidden && !popup.contains(document.activeElement)) closePopup();
}, { passive: true });
// Ctrl + roda / pinça no touchpad: zoom suave, proporcional ao movimento, centrado no cursor
viewer.addEventListener('wheel', e => {
  if (!e.ctrlKey || !state.pdf) return;
  e.preventDefault();
  const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
  const f = Math.max(0.8, Math.min(1.25, Math.exp(-dy * 0.0022)));
  App.zoomBy(f, { x: e.clientX, y: e.clientY });
}, { passive: false });
addEventListener('resize', scheduleRender);

let dragDepth = 0;
addEventListener('dragenter', e => { if ([...e.dataTransfer.types].includes('Files')) { dragDepth++; document.body.classList.add('dragging'); } });
addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => {
  e.preventDefault(); dragDepth = 0; document.body.classList.remove('dragging');
  if (![...(e.dataTransfer?.types || [])].includes('Files')) return; // arrastar botões da barra não é abrir arquivo
  if (App.openDrop) App.openDrop(e.dataTransfer); else App.openFiles(e.dataTransfer.files);
});
addEventListener('visibilitychange', () => { if (document.hidden) App.saveDoc(); });
addEventListener('beforeunload', () => { App.saveDoc(); });

App.showLibError = () => {
  const e = $('#libError'); e.hidden = false;
  e.textContent = 'Não consegui carregar o motor de PDF. Confira se a pasta "lib" está ao lado do index.html.';
};
})();
