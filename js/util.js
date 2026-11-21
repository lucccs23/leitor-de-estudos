/* Utilidades do Vetra: plataforma, eventos internos, armazenamento (localStorage e IndexedDB),
   elementos e botões, avisos, downloads e formatação. Carrega antes de todos os outros scripts. */
(() => {
'use strict';
const App = window.App = {};
const $ = App.$ = s => document.querySelector(s);
// Aberto pelo link publicado (celular, tablet ou navegador): sem o serviço local do Windows.
// (aberto do disco ou num servidor local de testes = versão de computador)
// App de Android (APK com Capacitor): os arquivos estão no aparelho, mas funciona como o site (sem serviço do Windows)
App.native = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
document.documentElement.classList.toggle('native', App.native);
App.isWeb = App.native || !/^file:/.test(location.protocol) && !/^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname);
document.documentElement.classList.toggle('web', App.isWeb);
App.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
document.documentElement.classList.toggle('touch', App.isTouch);
const $$ = App.$$ = s => [...document.querySelectorAll(s)];
const SVGNS = 'http://www.w3.org/2000/svg';
const CSS_UNITS = 96 / 72;

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
let avisosCalados = false;
App.toast = msg => {
  if (avisosCalados) return;
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800);
};
App.download = (content, filename, type) => {
  if (App.native) return nativeSave(content, filename, type);
  const a = el('a'); a.href = URL.createObjectURL(new Blob([content], { type })); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};
// no app de Android não há "baixar": o arquivo vai para o "Compartilhar" (salvar no Drive, em Arquivos, mandar no WhatsApp…)
async function nativeSave(content, filename, type){
  const { Filesystem, Share } = window.Capacitor.Plugins;
  const nome = String(filename).replace(/[\\/:*?"<>|]/g, '-');
  try {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const data = await new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = () => bad(r.error); r.readAsDataURL(blob); });
    const { uri } = await Filesystem.writeFile({ path: nome, data, directory: 'CACHE' });
    await Share.share({ title: nome, files: [uri], dialogTitle: 'Salvar ou enviar' });
  } catch (e) {
    if (!/cancel/i.test(String(e && e.message))) App.toast('Não consegui salvar o arquivo: ' + ((e && e.message) || e));
  }
}
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

// distância do ponto (px, py) ao segmento a–b
function distSeg(px, py, ax, ay, bx, by){
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
App.distSeg = distSeg;
// para os outros arquivos
Object.assign(App, { SVGNS, CSS_UNITS, clamp01, bus });
// a S Pen mostra o próprio aviso ao lado da ponta: cala os avisos do topo enquanto ela age
App.calarAvisos = on => { avisosCalados = !!on; };
})();
