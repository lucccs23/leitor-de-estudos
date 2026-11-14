/* OCR: reconhece o texto de páginas escaneadas com o motor nativo do Windows (via serviço local, offline).
   O texto reconhecido fica salvo com o documento e passa a valer para seleção, grifos, busca e exportação. */
(() => {
'use strict';
const App = window.App;
const { $, el, btn, state } = App;

let job = null;
App.ocrRunning = () => !!job;

// ---------- Cartão de progresso (canto inferior esquerdo) ----------
const card = $('#jobCard');
function showCard(title, frac, actions){
  card.hidden = false; card.innerHTML = '';
  const head = el('div', 'jobHead');
  head.append(App.icon('scan'), el('strong', null, title));
  card.append(head);
  if (frac != null) { const bar = el('div', 'progress'); const f = el('div'); f.style.width = Math.round(frac * 100) + '%'; bar.append(f); card.append(bar); }
  if (actions) { const row = el('div', 'jobActions'); row.append(...actions); card.append(row); }
}
const hideCard = () => { card.hidden = true; card.innerHTML = ''; };
App.hideJobCard = hideCard;

async function renderForOcr(num){
  const page = await state.pdf.getPage(num);
  const vp1 = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: Math.min(3.2, 2600 / Math.max(vp1.width, vp1.height)) }); // ~250 dpi numa folha A4
  const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const blob = await new Promise(res => c.toBlob(res, 'image/png'));
  c.width = 0;
  return blob;
}

// descobre as páginas sem texto (escaneadas)
async function scannedPages(list, isCancelled){
  const out = [];
  for (const num of list) {
    if (isCancelled()) break;
    if (state.ocr[num]) continue;
    const tc = await (await state.pdf.getPage(num)).getTextContent();
    if (App.textLength(tc) < App.MIN_TEXT) out.push(num);
  }
  return out;
}

App.runOcr = async (opts = {}) => {
  if (!state.pdf) return;
  if (job) { App.toast('O reconhecimento de texto já está em andamento.'); return; }
  if (App.isWeb) {
    showCard('Reconhecer texto (OCR) funciona no computador', null, [
      el('span', 'muted small', 'Ele usa o reconhecimento de texto do Windows. Faça o OCR no computador e salve o PDF (Arquivo → Salvar): o texto vai junto para o celular.'),
      btn('Ok', hideCard, 'sm outline'),
    ]);
    return;
  }
  if (!App.localService.ok() && !(await App.localService.check())) {
    showCard('Reconhecer texto precisa do serviço local', null, [
      el('span', 'muted small', 'Abra o leitor pelo atalho "Leitor de Estudos" (ou rode "Instalar atalho" de novo) e tente outra vez.'),
      btn('Ok', hideCard, 'sm outline'),
    ]);
    return;
  }
  const token = state.token;
  job = { cancel: false, done: 0, total: 0, words: 0, errors: 0 };
  const cancelled = () => job.cancel || token !== state.token;
  const cancelBtn = () => btn('Cancelar', () => { job.cancel = true; }, 'sm outline');
  showCard('Procurando páginas escaneadas…', 0, [cancelBtn()]);
  const all = opts.pages || Array.from({ length: state.pages.length }, (_, i) => i + 1);
  const todo = await scannedPages(all, cancelled);
  if (!todo.length) {
    job = null;
    showCard(cancelled() ? 'Reconhecimento cancelado' : 'Todas as páginas já têm texto', null, [btn('Ok', hideCard, 'sm outline')]);
    setTimeout(hideCard, 4000); return;
  }
  job.total = todo.length;
  const t0 = Date.now();
  for (const num of todo) {
    if (cancelled()) break;
    const eta = job.done ? Math.round((Date.now() - t0) / job.done * (job.total - job.done) / 1000) : null;
    showCard(`Reconhecendo texto… ${job.done + 1} de ${job.total}`, job.done / job.total, [
      el('span', 'muted small', `Página ${num}${eta != null ? ` · falta${eta > 1 ? 'm' : ''} ~${eta < 60 ? eta + ' s' : Math.round(eta / 60) + ' min'}` : ''}`), cancelBtn()]);
    try {
      const r = await App.localService.post('/ocr', await renderForOcr(num), 120000);
      if (cancelled()) break;
      const words = [];
      for (const line of r.lines || []) for (const [t, x, y, w, h] of line) {
        if (t && t.trim()) words.push([t, +(x / r.w).toFixed(4), +(y / r.h).toFixed(4), +(w / r.w).toFixed(4), +(h / r.h).toFixed(4)]);
      }
      state.ocr[num] = words; job.words += words.length;
      App.ocrUpdated(num);
      job.done++;
      if (job.done % 3 === 0) App.saveDocSoon();
    } catch (e) {
      console.warn('OCR', num, e);
      if (++job.errors >= 3) {
        const msg = String(e.message || e);
        job = null; App.saveDocSoon();
        showCard('O reconhecimento parou', null, [el('span', 'muted small', /idioma/.test(msg) ? msg : 'O serviço local não respondeu. Feche e abra o leitor pelo atalho e tente de novo.'), btn('Ok', hideCard, 'sm outline')]);
        return;
      }
    }
  }
  const done = job.done, wasCancelled = job.cancel;
  job = null;
  App.saveDocSoon(); App.emit('ocr:done');
  showCard(wasCancelled ? `Reconhecimento pausado (${done} de ${todo.length} páginas)` : `Pronto! Texto reconhecido em ${done} página${done === 1 ? '' : 's'}`, null, [
    el('span', 'muted small', wasCancelled ? 'Você pode continuar depois pelo menu Ferramentas.' : 'Agora dá para selecionar, grifar e buscar nessas páginas.'),
    btn('Ok', hideCard, 'sm outline'),
  ]);
  if (!wasCancelled) setTimeout(() => { if (!job) hideCard(); }, 8000);
};

// Ao abrir um PDF escaneado, oferece reconhecer o texto (uma vez por documento)
App.on('doc:loaded', async ({ fp }) => {
  if (job) return;
  hideCard();
  if (App.isWeb || App.ls.get('le.ocrAsked.' + fp, false) || Object.keys(state.ocr).length) return;
  const sample = Array.from({ length: Math.min(3, state.pages.length) }, (_, i) => i + 1);
  const scanned = await scannedPages(sample, () => fp !== state.fp);
  if (fp !== state.fp || scanned.length < sample.length) return;
  showCard('Este PDF parece escaneado', null, [
    el('span', 'muted small', 'Reconhecer o texto deixa você selecionar, grifar e buscar nas páginas. Tudo offline.'),
    btn('Reconhecer texto', () => { App.ls.set('le.ocrAsked.' + fp, true); App.runOcr(); }, 'sm primary'),
    btn('Agora não', () => { App.ls.set('le.ocrAsked.' + fp, true); hideCard(); }, 'sm outline'),
  ]);
});
App.on('doc:closed', () => { if (job) job.cancel = true; });
})();
