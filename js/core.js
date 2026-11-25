/* Núcleo do Vetra: estado, armazenamento, renderização, grifos e interação. */
(() => {
'use strict';
const App = window.App; // criado em util.js
// Versão do app: mude aqui a cada atualização (aparece na tela inicial e no menu ⋯)
App.VERSION = '1.30.2';
App.VERSION_DATE = '19/11/2026';
const { $, $$, el, btn, ls, DB, safe, uid, SVGNS, CSS_UNITS, clamp01, distSeg } = App;

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

// ---------- Estado ----------
const state = App.state = {
  pdf:null, fp:null, name:'', bytes:null, pages:[], scale:1, currentPage:1,
  highlights:[], bookmarks:[], folhas:[], stats:{ time:{}, visited:[] }, ocr:{}, exams:[],
  color:ls.get('le.color', 'y'), autoHL:false, tool:'text', style:ls.get('le.style', 'fill'), autoFit:true,
  filter:new Set(), selected:null, token:0, textCache:new Map(), lastInk:null,
};
const labels = App.labels = ls.get('le.labels', {});
App.colorOf = id => (typeof id === 'string' && id[0] === '#') ? { id, hex: id, ink: id, name: 'Cor personalizada' } : (App.COLORS.find(c => c.id === id) || App.COLORS[0]);
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
  const penMode = state.tool === 'ink' || state.tool === 'lasso';
  if (penMode && App.penPaletteExtras) { App.penPaletteExtras(pal); return; }
  const cur = state.tool === 'ink' ? App.penColor() : state.tool === 'lasso' ? null : state.color;
  App.COLORS.forEach((c, i) => {
    const b = el('button', 'swatch' + (cur === c.id ? ' current' : ''));
    b.style.setProperty('--c', c.hex);
    b.title = `${App.labelOf(c.id)} (${i + 1})`;
    b.setAttribute('aria-label', `Cor ${App.labelOf(c.id)}`);
    b.onmousedown = e => e.preventDefault(); // não perder a seleção de texto
    b.onclick = () => pickColor(c.id);
    pal.appendChild(b);
  });
};
App.pickColor = id => pickColor(id);
function pickColor(id){
  if (state.tool === 'lasso') { App.lassoRecolor?.(id); return; }
  if (state.tool === 'ink') { App.setPenColor(state.pen, id); return; }
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
  if (changed && t === 'lasso') App.toast('Laço: contorne os traços da caneta para selecionar — depois arraste, mude a cor, duplique ou apague');
  App.updatePenBtn?.();
  App.emit('tool:changed', t);
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

// ---------- PDF com senha ----------
// As senhas digitadas ficam só na memória enquanto o Vetra está aberto (nunca são gravadas), para as outras
// partes (busca em todos os PDFs, lado a lado) conseguirem abrir o mesmo arquivo sem perguntar de novo.
const senhas = [];
App.AVISO_SENHA = 'Este PDF tem senha: os grifos ficam guardados no Vetra, mas não dá para gravá-los dentro do arquivo.';
App.pedirSenha = (nome, errou) => new Promise(ok => {
  const d = App.dialog('senhaDlg', 'pomoDlg senhaDlg'); d.innerHTML = '';
  const f = el('form'); f.method = 'dialog';
  const campo = el('input'); campo.type = 'password'; campo.autocomplete = 'off'; campo.spellcheck = false; campo.setAttribute('aria-label', 'Senha do PDF');
  const erro = el('p', 'senhaErro', errou ? 'Senha incorreta. Tente de novo.' : ''); erro.hidden = !errou;
  const acoes = el('div', 'senhaAcoes');
  const cancelar = App.btn('Cancelar', () => { d.close(); }, 'outline'); cancelar.type = 'button';
  const abrir = el('button', 'btn primary', 'Abrir'); abrir.type = 'submit';
  acoes.append(cancelar, abrir);
  f.append(el('h3', null, 'Este PDF tem senha'), el('p', 'muted', App.baseName(nome || 'PDF')), campo, erro, acoes);
  let valor = null;
  f.onsubmit = e => { e.preventDefault(); valor = campo.value; d.close(); };
  d.onclose = () => { const v = valor; campo.value = ''; ok(v || null); };
  d.append(f); d.showModal(); campo.focus();
});
// Abrir PDF (todas as partes do app passam por aqui). O leitor de PDF (pdf.js) é compartilhado: fechar um PDF o
// desmonta por um instante, e abrir outro nesse meio-tempo falhava ("the worker is being destroyed"), parecendo um
// arquivo corrompido (fechar e reabrir na hora, ou reabrir um PDF com senha). Abrir espera a desmontagem terminar.
let desmontando = Promise.resolve();
App.getDocument = async src => {
  await desmontando;
  const tarefa = pdfjsLib.getDocument(src);
  let doc;
  try { doc = await tarefa.promise; }
  catch (e) { desmontando = tarefa.destroy().catch(() => {}); await desmontando; throw e; }
  const fechar = doc.destroy.bind(doc);
  doc.destroy = () => (desmontando = Promise.resolve(fechar()).catch(() => {}));
  return doc;
};
const tentaAbrir = (data, password) => App.getDocument({ data: new Uint8Array(data.slice(0)), ...(password != null ? { password } : {}) });
// abre tentando as senhas já digitadas (sem perguntar); comSenha diz se precisou de senha
async function abrirComSenhas(data){
  try { return { pdf: await tentaAbrir(data), comSenha: false }; }
  catch (e) {
    if (e?.name !== 'PasswordException') throw e;
    for (const password of senhas) { try { return { pdf: await tentaAbrir(data, password), comSenha: true }; } catch {} }
    throw e;
  }
}
App.abrirPdfjs = async data => (await abrirComSenhas(data)).pdf;

// ---------- Girar a visualização (o arquivo não muda) ----------
// A página inteira gira com CSS: imagem, texto, grifos, traços e notas continuam alinhados entre si. A caixa da
// página fica com as medidas giradas; as camadas dentro dela têm as medidas originais (--pw, --ph) e giram juntas.
// Posições na tela viram posições na página (frações 0–1 da página sem girar) por telaParaPagina.
function tamanhoPagina(p, s){
  const rot = p.folha ? 0 : (state.rotacao || 0), deitada = rot % 180 !== 0, w = p.base.w * s, h = p.base.h * s;
  p.el.style.width = (deitada ? h : w) + 'px'; p.el.style.height = (deitada ? w : h) + 'px';
  if (rot) { p.el.dataset.rot = rot; p.el.style.setProperty('--pw', w + 'px'); p.el.style.setProperty('--ph', h + 'px'); p.el.style.setProperty('--rot', rot + 'deg'); }
  else { delete p.el.dataset.rot; p.el.style.removeProperty('--pw'); p.el.style.removeProperty('--ph'); p.el.style.removeProperty('--rot'); }
}
// tela → página: [x, y] em frações da página sem girar
App.telaParaPagina = (pageEl, cx, cy, caixa = pageEl.getBoundingClientRect()) => {
  const x = (cx - caixa.left) / caixa.width, y = (cy - caixa.top) / caixa.height, rot = +(pageEl.dataset.rot || 0);
  return rot === 90 ? [y, 1 - x] : rot === 180 ? [1 - x, 1 - y] : rot === 270 ? [1 - y, x] : [x, y];
};
// página → tela
App.paginaParaTela = (pageEl, u, v, caixa = pageEl.getBoundingClientRect()) => {
  const rot = +(pageEl.dataset.rot || 0);
  const [x, y] = rot === 90 ? [1 - v, u] : rot === 180 ? [1 - u, 1 - v] : rot === 270 ? [v, 1 - u] : [u, v];
  return [caixa.left + x * caixa.width, caixa.top + y * caixa.height];
};
// retângulo da tela → retângulo na página (frações)
App.retanguloNaPagina = (pageEl, r, caixa = pageEl.getBoundingClientRect()) => {
  const [x1, y1] = App.telaParaPagina(pageEl, r.left, r.top, caixa), [x2, y2] = App.telaParaPagina(pageEl, r.right, r.bottom, caixa);
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
};
// medidas da página para o desenho: largura e altura sem girar (para distâncias), e a conversão certa
App.retPagina = pageEl => {
  const b = pageEl.getBoundingClientRect(), rot = +(pageEl.dataset.rot || 0);
  if (!rot) return b;
  const deitada = rot % 180 !== 0;
  return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: deitada ? b.height : b.width, height: deitada ? b.width : b.height, rot, el: pageEl, caixa: b };
};
App.girar = (graus = 90) => {
  if (!state.pdf) return;
  state.rotacao = (((state.rotacao || 0) + graus) % 360 + 360) % 360;
  App.lupa?.aberta() && App.lupa.fechar();
  closePopup();
  if (state.autoFit) App.setScale(autoScale(), false); else App.setScale(state.scale, true);
  App.saveDocSoon(); App.emit('rotacao:changed', state.rotacao);
  App.toast(state.rotacao ? `Visualização girada ${state.rotacao}° (o arquivo não muda)` : 'Visualização na posição original');
};

let loadSeq = 0;
App.loadDoc = async (buf, name) => {
  // livro EPUB (um ZIP): abre no leitor de livros, sem converter
  if (App.isZipData && App.isZipData(buf)) return App.openEpub(buf, name);
  if (!window.pdfjsLib) { App.showLibError(); return false; }
  const seq = ++loadSeq; // só a abertura mais recente vale
  closePopup();
  App.setLoading(0.08);
  let pdf, protegido = false;
  try {
    ({ pdf, comSenha: protegido } = await abrirComSenhas(buf));
  } catch (e) {
    if (e?.name === 'PasswordException') {
      // pede a senha (de novo, se errou) até abrir ou a pessoa cancelar
      App.setLoading(null);
      let errou = false;
      while (!pdf) {
        const password = await App.pedirSenha(name, errou);
        if (!password) { if (seq === loadSeq) App.toast('Abertura cancelada.'); return false; }
        try { pdf = await tentaAbrir(buf, password); senhas.push(password); protegido = true; }
        catch (e2) { if (e2?.name !== 'PasswordException') { console.error(e2); App.toast('Não consegui abrir este PDF — o arquivo pode estar corrompido.'); return false; } errou = true; }
      }
      App.setLoading(0.08);
    } else {
      console.error(e);
      App.setLoading(null);
      if (seq === loadSeq) App.toast('Não consegui abrir este PDF — o arquivo pode estar corrompido.');
      return false;
    }
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
    ocr: rec.ocr || {}, exams: rec.exams || [], folhas: rec.folhas || [], protegido, rotacao: rec.rotacao || 0,
    textCache: new Map(), currentPage: 1, lastInk: null, thumb: rec.thumb || null,
  });
  App.undoStack.length = 0; App.redoStack.length = 0; updUndo();
  Object.values(legendChips).forEach(c => c.classList.remove('on'));
  const hf = $('#hlFilter'); if (hf) hf.value = '';

  // guarda o arquivo só se ainda não estiver salvo (evita regravar livros grandes a cada abertura)
  if (!(await safe(() => DB.has('files', fp), false))) await safe(() => DB.put('files', { fp, data: buf }));
  await safe(() => DB.update('docs', fp, cur => ({ ...(cur || rec), fp, name, highlights: state.highlights, bookmarks: state.bookmarks, ts: Date.now(), hasFile: true, removidoAqui: false, pages: n })));
  App.pruneFiles();

  pagesEl.innerHTML = '';
  state.pages = sizes.map((s, i) => makePage(i + 1, s));
  App.folhas?.montar(); // folhas de anotação entre as páginas (folhas.js)
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
  Object.assign(state, { pdf:null, fp:null, name:'', bytes:null, pages:[], highlights:[], bookmarks:[], textCache:new Map(), stats:{ time:{}, visited:[] }, thumb:null, ocr:{}, exams:[], folhas:[], protegido:false, rotacao:0 });
  pagesEl.innerHTML = ''; document.body.classList.remove('has-doc');
  document.title = 'Vetra'; viewer.scrollTop = 0;
  App.emit('doc:closed');
  App.emit('home:show');
};

App.dropFile = async fp => {
  await safe(() => DB.del('files', fp));
  await safe(() => DB.del('meta', 'tx:' + fp));
  await safe(() => DB.del('meta', 'sg:' + fp));
  await App.patchDoc(fp, { hasFile: false, removidoAqui: true });
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
  const p0 = state.pages[0], deitada = (state.rotacao || 0) % 180 !== 0;
  let w = p0 ? p0.base.w : 612 * CSS_UNITS, h = p0 ? p0.base.h : 792 * CSS_UNITS;
  if (deitada) [w, h] = [h, w];
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
    { label: 'Texto corrido (como um livro)', icon: 'book', on: () => App.openReflow?.() },
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
  for (const p of state.pages) tamanhoPagina(p, s);
  App.folhas?.escala();
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

// grifos (grifos.js) e aparência do traço (traco.js): carregam depois do núcleo, então são chamados na hora do uso
function commitInk(...a){ return App.commitInk(...a); }
function createAreaHighlight(...a){ return App.createAreaHighlight(...a); }
function createHighlight(...a){ return App.createHighlight(...a); }
function createNote(...a){ return App.createNote(...a); }
function deleteHighlight(...a){ return App.deleteHighlight(...a); }
function hitTest(...a){ return App.hitTest(...a); }
function markSelected(...a){ return App.markSelected(...a); }
function refreshHighlight(...a){ return App.refreshHighlight(...a); }
function renderAllAnnots(...a){ return App.renderAllAnnots(...a); }
function snapshot(...a){ return App.snapshot(...a); }
function hasSelection(...a){ return App.hasSelection(...a); }
function detectShape(...a){ return App.detectShape(...a); }
function inkNow(...a){ return App.inkNow(...a); }
function paintInk(...a){ return App.paintInk(...a); }
function simplify(...a){ return App.simplify(...a); }
function renderPageAnnots(...a){ return App.drawPageAnnots(...a); }
function updUndo(...a){ return App.updateUndoBtns(...a); }

App.updateCurrentPage = updateCurrentPage;
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
  const minTop = Math.max($('#toolbar').getBoundingClientRect().bottom || 0, $('#topStrip')?.getBoundingClientRect().bottom || 0) + 6;
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
    App.undoStack.pop(); updUndo(); refreshHighlight(sel);
  }
}
App.closePopup = closePopup;
// para o menu do botão direito (menupagina.js)
App.createNoteAt = (p, pt) => createNote(p, pt);
App.hlAt = (pageEl, x, y) => hitTest(pageEl, x, y);
App.editHl = (h, x, y) => showEditPopup(h, x, y);
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
    if (pg !== last) { hlList.append(el('div', 'pgHead', App.rotuloPagina ? App.rotuloPagina(pg) : 'Página ' + pg)); last = pg; }
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
let salvarDesde = 0;
App.saveDocSoon = () => { clearTimeout(saveT); if (!salvarDesde) salvarDesde = Date.now(); saveT = setTimeout(salvarLivre, 400); };
// escrevendo com a caneta: espera ela parar um instante (no máximo 10 s; ao fechar o app salva na hora)
function salvarLivre(){
  if (App.penOcupada() && Date.now() - salvarDesde < 10000) { saveT = setTimeout(salvarLivre, 600); return; }
  App.saveDoc();
}
App.saveDoc = async () => {
  clearTimeout(saveT); saveT = null; salvarDesde = 0;
  if (!state.fp) return;
  const fp = state.fp;
  const cp = state.pages[state.currentPage - 1];
  const lastFrac = cp ? Math.max(0, Math.min(1, +((viewer.scrollTop - cp.el.offsetTop) / cp.el.offsetHeight).toFixed(4))) : 0;
  await safe(() => DB.update('docs', fp, (rec = {}) => ({
    ...rec, fp, name: state.name, highlights: state.highlights, bookmarks: state.bookmarks, folhas: state.folhas, rotacao: state.rotacao || 0,
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
  state.folhas = pending ? mergeById(state.folhas, rec.folhas || []) : (rec.folhas || []); App.folhas?.montar();
  if (state.selected && !state.highlights.some(h => h.id === state.selected)) closePopup();
  renderAllAnnots(); App.renderPanel(); markSelected();
  App.emit('bookmarks:reload'); App.emit('hl:changed'); App.renderStats?.();
};

// ---------- Interação com o texto ----------
let downPos = null;
// Seleção precisa: enquanto arrasta, um fundo invisível (endOfContent) cobre a camada de texto e fica logo depois do
// ponto onde a seleção termina. Assim, passar por um espaço vazio (margem, vão entre linhas) segura a seleção onde
// está, em vez de o navegador esticá-la até o fim da página (ou pegar a tela inteira do app).
let selecionando = false, rangeAnterior = null;
const fimDaCamada = tl => tl.querySelector('.endOfContent');
const soltaFins = () => {
  for (const fim of $$('.textLayer .endOfContent')) {
    const tl = fim.closest('.textLayer');
    fim.classList.remove('active'); fim.style.width = fim.style.height = '';
    if (fim.parentElement !== tl || tl.lastElementChild !== fim) tl.append(fim);
  }
  rangeAnterior = null;
};
viewer.addEventListener('pointerdown', e => {
  if (e.button !== 0 || state.tool !== 'text') return;
  soltaFins();
  const tl = e.target.closest('.textLayer');
  if (!tl) return;
  selecionando = true;
  fimDaCamada(tl)?.classList.add('active');
});
document.addEventListener('selectionchange', () => {
  if (!selecionando) return;
  const sel = getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  // toda camada de texto que a seleção atravessa fica coberta pelo fundo (vãos de outras páginas também seguram)
  for (const tl of $$('.textLayer')) if (range.intersectsNode(tl)) fimDaCamada(tl)?.classList.add('active');
  // qual ponta está mexendo: a do começo (arrastando para cima) ou a do fim
  const mexeInicio = rangeAnterior && (range.compareBoundaryPoints(Range.END_TO_END, rangeAnterior) === 0 || range.compareBoundaryPoints(Range.START_TO_END, rangeAnterior) === 0);
  rangeAnterior = range.cloneRange();
  let ponta = mexeInicio ? range.startContainer : range.endContainer;
  if (ponta.nodeType === Node.TEXT_NODE) ponta = ponta.parentNode;
  if (!ponta?.closest || ponta.classList?.contains('endOfContent') || ponta.classList?.contains('textLayer')) return;
  const tl = ponta.closest('.textLayer'), fim = tl && fimDaCamada(tl);
  if (!fim) return;
  fim.style.width = tl.clientWidth + 'px'; fim.style.height = tl.clientHeight + 'px';
  ponta.parentElement.insertBefore(fim, mexeInicio ? ponta : ponta.nextSibling);
});
// ponteiro na margem ao lado de uma linha (fora das letras): a seleção vai até o fim (ou começo) dessa linha,
// sem perder a última letra
viewer.addEventListener('pointermove', e => {
  if (!selecionando || !(e.buttons & 1) || !e.target.classList?.contains('endOfContent')) return;
  const tl = e.target.closest('.textLayer'), sel = getSelection();
  if (!tl || !sel.rangeCount || sel.isCollapsed || tl.closest('.page[data-rot]')) return;
  let perto = null, dist = Infinity;
  for (const sp of tl.querySelectorAll('span:not(.markedContent)')) {
    const r = sp.getBoundingClientRect();
    if (!r.height || e.clientY < r.top || e.clientY > r.bottom) continue;
    const d = e.clientX < r.left ? r.left - e.clientX : e.clientX > r.right ? e.clientX - r.right : 0;
    if (d < dist) { dist = d; perto = { sp, r }; }
  }
  const t = perto?.sp.firstChild;
  if (!t || t.nodeType !== Node.TEXT_NODE || !dist) return;
  sel.extend(t, e.clientX > perto.r.right ? t.length : 0);
});
const terminaSelecao = () => { if (!selecionando) return; selecionando = false; soltaFins(); };
document.addEventListener('pointerup', terminaSelecao, true);
viewer.addEventListener('mousedown', e => {
  if (e.button !== 0 || state.tool !== 'text') return;
  downPos = { x: e.clientX, y: e.clientY };
});
document.addEventListener('mousedown', e => { if (!popup.hidden && !popup.contains(e.target)) closePopup(); }, true);
document.addEventListener('mouseup', e => {
  terminaSelecao();
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
  if (mod && k.toLowerCase() === 'z' && state.pdf) { e.preventDefault(); e.shiftKey ? App.redo() : App.undo(); return; }
  if (mod && k.toLowerCase() === 'y' && state.pdf) { e.preventDefault(); App.redo(); return; }
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
  if (n >= 1 && n <= 6 && (state.tool === 'ink' || state.tool === 'lasso') && App.penSlot) { e.preventDefault(); App.penSlot(n - 1); return; }
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
    b: () => App.toggleBookmark?.(), t: () => App.toggleDock?.(), g: () => { App.setTool('text'); App.setAutoHL(!state.autoHL, true); }, v: () => App.setTool('text'), a: () => App.setTool('area'), p: () => App.setPen('pen'), m: () => App.setPen('marker'), c: () => App.setTool('note'), e: () => App.setTool('erase'),
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
$('#btnUndo').onclick = () => App.undo();
$('#btnRedo').onclick = () => App.redo();
// tocar de novo na ferramenta já escolhida abre as opções dela
$$('[data-penkind]').forEach(b => { b.onclick = () => { if (state.tool === 'ink' && state.pen === b.dataset.penkind) App.penMenu(b); else App.setPen(b.dataset.penkind); }; });
$('#penSeg [data-tool=erase]').addEventListener('click', e => { if (state.tool === 'erase') { e.stopImmediatePropagation(); App.penMenu(e.currentTarget); } }, true);
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
