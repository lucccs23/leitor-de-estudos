/* Leitura em voz alta com as vozes do próprio Windows (funciona offline).
   Lê a partir da página atual (ou só o trecho selecionado), destacando a frase que está sendo lida. */
(() => {
'use strict';
const App = window.App;
const { $, el, state, ls } = App;
const synth = window.speechSynthesis;

const bar = $('#ttsBar');
const T = { on: false, paused: false, page: 1, chunks: [], i: 0, pt: null, token: 0, utter: null, selOnly: false };
App.ttsActive = () => T.on && !T.paused;
App.ttsState = T;

// ---------- Vozes ----------
let voices = [];
function loadVoices(){
  if (!synth) return;
  const all = synth.getVoices();
  const pt = all.filter(v => /^pt/i.test(v.lang));
  // português do Brasil primeiro; vozes instaladas no Windows (offline) antes das online
  const rank = v => (/pt[-_]BR/i.test(v.lang) ? 0 : 2) + (v.localService ? 0 : 1);
  voices = (pt.length ? pt : all).slice().sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  if (!bar.hidden) renderBar();
}
if (synth) { loadVoices(); synth.addEventListener?.('voiceschanged', loadVoices); }
const pickVoice = () => voices.find(v => v.voiceURI === ls.get('le.ttsVoice', '')) || voices[0] || null;
const voiceLabel = v => v.name.replace(/^Microsoft\s+/i, '').replace(/\s+Online.*$/i, ' (online)').replace(/\s*-\s*Portuguese.*$/i, '');

// ---------- Texto em frases ----------
// cada pedaço guarda o início/fim no texto da página para destacar o trecho lido
App.ttsChunks = text => {
  const out = [], re = /[^.!?;:\n]+(?:[.!?;:]+|$)\s*/g;
  let m, cur = null;
  while ((m = re.exec(text))) {
    if (!m[0].length) { re.lastIndex++; continue; }
    const s = m.index, e = m.index + m[0].length;
    if (cur && (e - cur.start <= 120 || m[0].trim().length < 12) && e - cur.start <= 260) cur.end = e;
    else { if (cur) out.push(cur); cur = { start: s, end: e }; }
    // frase muito longa (tabelas, listas sem ponto): corta em ~240 caracteres num espaço
    while (cur.end - cur.start > 300) {
      const cut = text.lastIndexOf(' ', cur.start + 240);
      const at = cut > cur.start + 60 ? cut + 1 : cur.start + 240;
      out.push({ start: cur.start, end: at }); cur = { start: at, end: cur.end };
    }
  }
  if (cur) out.push(cur);
  return out.filter(c => /[\p{L}\p{N}]/u.test(text.slice(c.start, c.end)));
};
// para falar: junta palavras hifenizadas na quebra de linha e lê abreviações comuns
const speakable = s => s.replace(/(\p{L})-\s+(\p{Ll})/gu, '$1$2').replace(/\s+/g, ' ')
  .replace(/\bp\.\s?(\d)/g, 'página $1').replace(/\bex\.:?/gi, 'exemplo').replace(/\bobs\.:?/gi, 'observação').replace(/\bmg\b/g, 'miligramas').replace(/\bmmHg\b/g, 'milímetros de mercúrio').trim();

// ---------- Controle ----------
App.ttsStart = async (fromPage) => {
  if (!synth) { App.toast('Este navegador não tem leitura em voz alta.'); return; }
  if (!state.pdf) return;
  stopSpeech();
  T.on = true; T.paused = false; T.token++;
  const sel = App.hasSelection() ? getSelection().toString().trim() : '';
  if (sel && !fromPage) {
    T.selOnly = true; T.pt = null; T.chunks = App.ttsChunks(sel).map(c => ({ ...c, text: sel.slice(c.start, c.end) })); T.i = 0;
    renderBar(); speakNext(); return;
  }
  T.selOnly = false;
  await loadPage(fromPage || state.currentPage, true);
};
async function loadPage(n, fromView){
  const token = T.token;
  if (n > state.pages.length) { done(); return; }
  T.page = n; T.i = 0; clearMark();
  let pt;
  try { pt = await App.pageText(n); } catch { pt = { text: '' }; }
  if (token !== T.token) return;
  T.pt = pt; T.chunks = App.ttsChunks(pt.text || '');
  // começando da tela: pula as frases que já ficaram para trás (acima do topo visível)
  if (fromView && pt.items && T.chunks.length) {
    const p = state.pages[n - 1], v = $('#viewer');
    const topFrac = (v.scrollTop - p.el.offsetTop) / p.el.offsetHeight;
    if (topFrac > 0.05) {
      const k = T.chunks.findIndex(c => { const r = App.textRects(pt, c.start, c.end)[0]; return r && r.y >= topFrac - 0.01; });
      if (k > 0) T.i = k;
    }
  }
  renderBar();
  if (!T.chunks.length) { loadPage(n + 1); return; } // página sem texto (figura ou escaneada sem OCR)
  speakNext();
}
function speakNext(){
  if (!T.on) return;
  if (T.i >= T.chunks.length) { if (T.selOnly) done(); else loadPage(T.page + 1); return; }
  const c = T.chunks[T.i], token = T.token;
  const raw = T.selOnly ? c.text : T.pt.text.slice(c.start, c.end);
  const u = new SpeechSynthesisUtterance(speakable(raw));
  const v = pickVoice();
  if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'pt-BR';
  u.rate = ls.get('le.ttsRate', 1.1);
  u.onstart = () => { if (token === T.token) mark(c); };
  u.onend = () => { if (token !== T.token || !T.on) return; T.i++; speakNext(); };
  u.onerror = e => { if (token !== T.token || e.error === 'interrupted' || e.error === 'canceled') return; console.warn('voz', e.error); T.i++; speakNext(); };
  T.utter = u; // segura a referência (o Chrome/Edge às vezes perde o evento de fim sem isso)
  synth.speak(u);
  if (!u.voice && !voices.length) setTimeout(loadVoices, 300);
}
function stopSpeech(){ T.token++; try { synth && synth.cancel(); } catch {} }
function done(){ App.ttsStop(); App.toast('Leitura concluída'); }
App.ttsStop = () => { stopSpeech(); T.on = false; T.paused = false; clearMark(); bar.hidden = true; $('#btnTts').classList.remove('on'); };
function pauseResume(){
  if (!T.on) return;
  if (T.paused) {
    // retoma a frase atual do começo (mais confiável que synth.resume nas vozes do Windows)
    T.paused = false; T.token++; synth.cancel(); speakNext();
  } else { T.paused = true; T.token++; synth.cancel(); }
  renderBar();
}
function skip(d){
  if (!T.on) return;
  T.token++; synth.cancel(); T.paused = false;
  if (T.selOnly) { T.i = Math.max(0, T.i + d); speakNext(); renderBar(); return; }
  const ni = T.i + d;
  if (ni < 0 && T.page > 1) { loadPage(T.page - 1).then(() => {}); return; }
  if (ni >= T.chunks.length) { loadPage(T.page + 1); return; }
  T.i = Math.max(0, ni); renderBar(); speakNext();
}
function setRate(r){ ls.set('le.ttsRate', r); if (T.on && !T.paused) { T.token++; synth.cancel(); speakNext(); } renderBar(); }
function setVoice(uri){ ls.set('le.ttsVoice', uri); if (T.on && !T.paused) { T.token++; synth.cancel(); speakNext(); } }

// ---------- Destaque da frase lida ----------
function clearMark(){ document.querySelectorAll('.ttsLayer').forEach(x => x.remove()); }
function mark(c){
  clearMark();
  if (T.selOnly || !T.pt || !T.pt.items) return;
  const p = state.pages[T.page - 1]; if (!p) return;
  const rects = App.textRects(T.pt, c.start, c.end);
  if (!rects.length) return;
  const layer = el('div', 'ttsLayer');
  for (const r of rects) {
    const d = el('div');
    d.style.cssText = `left:${r.x * 100}%;top:${r.y * 100}%;width:${r.w * 100}%;height:${r.h * 100}%`;
    layer.append(d);
  }
  p.el.append(layer);
  // acompanha a leitura: rola quando a frase sai da tela
  const v = $('#viewer'), vr = v.getBoundingClientRect(), fr = layer.firstChild.getBoundingClientRect(), lr = layer.lastChild.getBoundingClientRect();
  if (follow && (fr.top < vr.top + 40 || lr.bottom > vr.bottom - 90)) App.goToPage(T.page, rects[0].y);
  const pg = $('#ttsPage'); if (pg) pg.textContent = `p. ${T.page}`;
}
// se a pessoa rolar para outro lugar, para de seguir até ela voltar a mexer na leitura
let follow = true, followT;
$('#viewer').addEventListener('wheel', () => { if (!T.on) return; follow = false; clearTimeout(followT); followT = setTimeout(() => { follow = true; }, 8000); }, { passive: true });

// ---------- Barra de controle ----------
const RATES = [0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.6, 1.8, 2];
function renderBar(){
  bar.hidden = !T.on;
  $('#btnTts').classList.toggle('on', T.on);
  if (!T.on) return;
  bar.innerHTML = '';
  bar.append(App.icon('speaker', 'i ttsIcon'));
  const pp = App.ibtn(T.paused ? 'play' : 'pause', null, pauseResume, 'sm primary', T.paused ? 'Continuar' : 'Pausar');
  bar.append(App.ibtn('left', null, () => skip(-1), 'sm', 'Frase anterior'), pp, App.ibtn('right', null, () => skip(1), 'sm', 'Próxima frase'));
  bar.append(el('span', 'ttsPage', T.selOnly ? 'trecho' : `p. ${T.page}`));
  const rate = el('select', 'ttsSel'); rate.title = 'Velocidade'; rate.setAttribute('aria-label', 'Velocidade');
  const cur = ls.get('le.ttsRate', 1.1);
  for (const r of RATES) { const o = el('option', null, String(r).replace('.', ',') + '×'); o.value = r; if (Math.abs(r - cur) < 0.01) o.selected = true; rate.append(o); }
  rate.onchange = () => setRate(+rate.value);
  bar.append(rate);
  if (voices.length > 1) {
    const vs = el('select', 'ttsSel voice'); vs.title = 'Voz'; vs.setAttribute('aria-label', 'Voz');
    const pv = pickVoice();
    for (const v of voices) { const o = el('option', null, voiceLabel(v) + (v.localService ? '' : ' · internet')); o.value = v.voiceURI; if (pv && v.voiceURI === pv.voiceURI) o.selected = true; vs.append(o); }
    vs.onchange = () => setVoice(vs.value);
    bar.append(vs);
  }
  bar.append(App.ibtn('x', null, App.ttsStop, 'sm', 'Parar a leitura'));
  bar.querySelectorAll('select').forEach(s => s.addEventListener('keydown', e => e.stopPropagation()));
  const ttsPage = bar.querySelector('.ttsPage'); ttsPage.id = 'ttsPage';
}

$('#btnTts').onmousedown = e => e.preventDefault(); // não desfaz a seleção (para ouvir só o trecho)
$('#btnTts').onclick = () => { if (T.on) App.ttsStop(); else App.ttsStart(); };
App.on('doc:loaded', () => { if (T.on) App.ttsStop(); });
App.on('doc:closed', () => { if (T.on) App.ttsStop(); });
addEventListener('beforeunload', () => { try { synth && synth.cancel(); } catch {} });
})();
