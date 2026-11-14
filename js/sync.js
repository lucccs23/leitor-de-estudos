/* Sincronizar aparelhos: computador, tablet e celular com os mesmos grifos, notas, marcadores, planos e progresso.
   A "nuvem" é um repositório PARTICULAR no GitHub da própria pessoa (cada aparelho usa um token que só
   mexe nesse repositório). Cada PDF vira um arquivo docs/<id>.json; os PDFs podem ir junto (pdf/<id>.pdf).
   Junção em três vias: o que foi apagado num aparelho some no outro; o que mudou nos dois, vale a versão deste. */
(() => {
'use strict';
const App = window.App;
const { $, el, state, ls, DB, safe } = App;
const API = 'https://api.github.com';
const MAX_PDF = 45 * 1024 * 1024;

let cfg = ls.get('le.sync', null); // { repo: 'dono/nome', token, pdfs, last, branch }
const saveCfg = () => ls.set('le.sync', cfg);
const ready = () => !!(cfg && cfg.repo && cfg.token);
App.syncReady = ready;

// ---------- Utilidades ----------
const fnv = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + s.length.toString(36); };
const H = x => fnv(JSON.stringify(x === undefined ? null : x));
function b64FromBytes(u8){
  let s = ''; const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  return btoa(s);
}
function bytesFromB64(b64){
  const bin = atob(b64.replace(/\s/g, '')); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
const enc = new TextEncoder(), dec = new TextDecoder();

async function gh(path, opts = {}){
  const r = await fetch(API + path, { ...opts, cache: 'no-store', headers: { Authorization: 'Bearer ' + cfg.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) } });
  if (!r.ok) { const e = new Error('GitHub ' + r.status); e.status = r.status; try { e.body = await r.json(); } catch {} throw e; }
  return r.status === 204 ? null : r.json();
}
const repoPath = () => '/repos/' + cfg.repo.split('/').map(encodeURIComponent).join('/');
async function listing(){
  const info = await gh(repoPath());
  cfg.branch = info.default_branch || 'main';
  if (!info.private) throw Object.assign(new Error('público'), { code: 'public' });
  try {
    const t = await gh(`${repoPath()}/git/trees/${encodeURIComponent(cfg.branch)}?recursive=1`);
    return new Map((t.tree || []).filter(x => x.type === 'blob').map(x => [x.path, x.sha]));
  } catch (e) { if (e.status === 409 || e.status === 404) return new Map(); throw e; } // repositório vazio
}
const getBlob = async sha => bytesFromB64((await gh(`${repoPath()}/git/blobs/${sha}`)).content);
async function putFile(path, bytes, sha, message){
  const r = await gh(`${repoPath()}/contents/${path}`, { method: 'PUT', body: JSON.stringify({ message, content: b64FromBytes(bytes), branch: cfg.branch, ...(sha ? { sha } : {}) }) });
  return r.content.sha;
}

// ---------- Junção ----------
// listas com id: base = { id: hash } da última sincronização
function merge3(L = [], R = [], B = {}){
  const lm = new Map(L.filter(x => x && x.id).map(x => [x.id, x])), rm = new Map(R.filter(x => x && x.id).map(x => [x.id, x]));
  const out = [];
  for (const id of new Set([...lm.keys(), ...rm.keys()])) {
    const l = lm.get(id), r = rm.get(id), b = B[id];
    if (l && r) out.push(H(r) !== b && H(l) === b ? r : l);      // mudou só lá: vale lá; senão, vale aqui
    else if (l) { if (b === undefined || H(l) !== b) out.push(l); } // lá foi apagado (e aqui não mudou): apaga
    else if (b === undefined || H(r) !== b) out.push(r);           // novo lá (ou apagado aqui mas mudou lá)
  }
  return out;
}
const hashes = list => Object.fromEntries((list || []).filter(x => x && x.id).map(x => [x.id, H(x)]));
// campo simples: mudou só de um lado → vale esse lado
const pick3 = (l, r, b) => (H(r) !== b && H(l) === b ? r : l);
const SHARED = ['name', 'pages', 'subject', 'highlights', 'bookmarks', 'time', 'visited', 'lastPage', 'lastFrac', 'posTs', 'dev', 'plan', 'ocr', 'exams', 'thumb', 'focus'];
const payload = rec => { const o = { v: 1, fp: rec.fp }; for (const k of SHARED) if (rec[k] !== undefined) o[k] = rec[k]; if (o.plan) { o.plan = { ...o.plan }; delete o.plan.day; } return o; };
function mergeDoc(L, R, B){
  if (!R) return L;
  if (!L) return { ...R, hasFile: false };
  const m = { ...L };
  m.highlights = merge3(L.highlights, R.highlights, B.hl || {});
  m.bookmarks = merge3(L.bookmarks, R.bookmarks, B.bm || {});
  m.exams = merge3(L.exams, R.exams, B.ex || {});
  m.time = { ...(R.time || {}) };
  for (const [k, v] of Object.entries(L.time || {})) m.time[k] = Math.max(v, m.time[k] || 0);
  m.visited = [...new Set([...(L.visited || []), ...(R.visited || [])])].sort((a, b) => a - b);
  m.ocr = { ...(R.ocr || {}), ...(L.ocr || {}) };
  const lp = L.plan ? { ...L.plan, day: undefined } : null;
  const rp = R.plan || null;
  const plan = pick3(lp, rp, B.plan);
  m.plan = plan ? { ...plan, day: L.plan && L.plan.day } : null;
  m.subject = pick3(L.subject || '', R.subject || '', B.subject);
  if ((R.posTs || 0) > (L.posTs || 0)) { m.lastPage = R.lastPage; m.lastFrac = R.lastFrac; m.posTs = R.posTs; m.dev = R.dev; }
  if (!m.thumb && R.thumb) m.thumb = R.thumb;
  if (!m.pages) m.pages = R.pages;
  return m;
}
const baseOf = rec => ({ hl: hashes(rec.highlights), bm: hashes(rec.bookmarks), ex: hashes(rec.exams), plan: H(rec.plan ? { ...rec.plan, day: undefined } : null), subject: H(rec.subject || '') });

// documento aberto: recarrega o que veio de outro aparelho
async function reloadCurrent(){
  const rec = await safe(() => DB.get('docs', state.fp), null);
  if (!rec) return;
  state.highlights = (rec.highlights || []).map(App.normHl);
  state.bookmarks = rec.bookmarks || [];
  state.stats.time = rec.time || {}; state.stats.visited = rec.visited || [];
  state.ocr = rec.ocr || {}; state.exams = rec.exams || [];
  for (const n of Object.keys(state.ocr)) App.ocrUpdated(+n);
  if (state.selected && !state.highlights.some(h => h.id === state.selected)) App.closePopup();
  App.renderAllAnnots(); App.renderPanel();
  App.emit('bookmarks:reload'); App.emit('hl:changed'); App.emit('exams:reload'); App.renderStats?.();
}

// ---------- Ajustes que viajam junto (nomes das cores, disciplinas, atalhos da IA, esquemas de foco, meta) ----------
const SETTINGS = ['le.labels', 'le.subjects', 'le.aiPrompts', 'le.pomoCfg', 'le.goal'];
function localSettings(){ const o = {}; for (const k of SETTINGS) { const v = ls.get(k, null); if (v != null) o[k] = v; } return o; }
function applySettings(r){
  let changed = false;
  for (const [k, v] of Object.entries(r || {})) {
    if (!SETTINGS.includes(k)) continue;
    if (k === 'le.labels') { for (const [c, t] of Object.entries(v || {})) if (t && !App.labels[c]) { App.labels[c] = t; changed = true; } continue; }
    if (k === 'le.subjects') { const n = App.subjects ? App.subjects().length : 0; App.mergeSubjects?.(v); if (App.subjects && App.subjects().length !== n) changed = true; continue; }
    if (ls.get(k, null) == null) { ls.set(k, v); changed = true; }
  }
  if (changed) { App.saveLabels(); App.refreshLegendInputs?.(); App.buildPalette(); }
  return changed;
}

// ---------- Sincronizar ----------
let running = null, lastError = null, lastStats = null;
App.syncNow = (opts = {}) => {
  if (!ready()) { if (opts.manual) App.openSync(); return Promise.resolve(false); }
  if (running) return running;
  running = doSync(opts).finally(() => { running = null; renderStatus(); });
  renderStatus();
  return running;
};
async function doSync({ manual } = {}){
  if (!navigator.onLine) { lastError = 'Sem internet agora — sincroniza quando a conexão voltar.'; if (manual) App.toast(lastError); return false; }
  const stats = { down: 0, up: 0, pdfUp: 0, pdfDown: 0, docs: 0 };
  try {
    if (state.fp) await App.saveDoc();
    const tree = await listing();
    const locals = new Map((await safe(() => DB.all('docs'), [])).map(d => [d.fp, d]));
    const remoteFps = [...tree.keys()].filter(p => /^docs\/[^/]+\.json$/.test(p)).map(p => p.slice(5, -5));
    const fps = new Set([...locals.keys(), ...remoteFps]);
    const curSnap = state.fp ? H([state.highlights, state.bookmarks]) : null;
    let curChanged = false, jumpTo = null;
    for (const fp of fps) {
      const L = locals.get(fp);
      if (L && !(L.highlights || []).length && !(L.bookmarks || []).length && !L.plan && !L.hasFile) continue;
      const path = `docs/${fp}.json`, rsha = tree.get(path);
      const B = (await safe(() => DB.get('meta', 'sync:' + fp), null)) || {};
      let R = null;
      if (rsha && rsha !== B.sha) { R = JSON.parse(dec.decode(await getBlob(rsha))); stats.down++; }
      const merged = R ? mergeDoc(L, R, B) : L;
      if (!merged) continue;
      // grava aqui o que veio de lá
      if (R) {
        if (fp === state.fp && H([state.highlights, state.bookmarks]) !== curSnap) continue; // mexeu durante a sincronização: fica para a próxima
        await safe(() => DB.update('docs', fp, cur => ({ ...(cur || {}), ...merged, fp, hasFile: cur ? !!cur.hasFile : false })));
        if (fp === state.fp) {
          curChanged = true;
          // leu mais adiante em outro aparelho e aqui ainda não saiu do lugar: continua de lá
          if ((R.posTs || 0) > (L.posTs || 0) && R.lastPage && R.lastPage !== state.currentPage && state.currentPage === (L.lastPage || 1)) jumpTo = { page: R.lastPage, frac: R.lastFrac || 0, dev: R.dev };
        }
      }
      // manda para lá se mudou
      // "dev" = aparelho onde a posição de leitura mudou por último
      const movedHere = L && merged.posTs && merged.posTs === L.posTs && !(R && R.posTs === L.posTs);
      const body = payload({ ...merged, fp, dev: movedHere ? deviceName() : (merged.dev || deviceName()) });
      const ch = H(body);
      let sha = rsha;
      if (ch !== B.ch || !rsha) {
        sha = await putFile(path, enc.encode(JSON.stringify(body)), rsha, `${App.baseName(merged.name || fp)} (${deviceName()})`);
        stats.up++;
      }
      await safe(() => DB.put('meta', { key: 'sync:' + fp, sha, ch, ...baseOf(merged), pdf: B.pdf }));
      stats.docs++;
    }
    if (curChanged) await reloadCurrent();
    if (jumpTo) { App.goToPage(jumpTo.page, jumpTo.frac); App.toast(`Continuando de onde você parou${jumpTo.dev ? ' no ' + jumpTo.dev : ''}: página ${jumpTo.page}`); }

    // PDFs
    if (cfg.pdfs) {
      const docs = await safe(() => DB.all('docs'), []);
      for (const d of docs) {
        const path = `pdf/${d.fp}.pdf`, rsha = tree.get(path);
        if (d.hasFile && !rsha) {
          const f = await safe(() => DB.get('files', d.fp), null);
          if (!f || f.data.byteLength > MAX_PDF) continue;
          await putFile(path, new Uint8Array(f.data), null, `PDF: ${App.baseName(d.name)}`);
          stats.pdfUp++;
        } else if (!d.hasFile && rsha) {
          const bytes = await getBlob(rsha);
          await safe(() => DB.put('files', { fp: d.fp, data: bytes.buffer }));
          await App.patchDoc(d.fp, { hasFile: true });
          stats.pdfDown++;
        }
      }
    }

    // ajustes
    const sPath = 'settings.json', ssha = tree.get(sPath);
    const sBase = await safe(() => DB.get('meta', 'sync:settings'), null) || {};
    if (ssha && ssha !== sBase.sha) applySettings(JSON.parse(dec.decode(await getBlob(ssha))));
    const mine = localSettings(), sch = H(mine);
    let nsha = ssha;
    if (sch !== sBase.ch || !ssha) nsha = await putFile(sPath, enc.encode(JSON.stringify(mine)), ssha, `ajustes (${deviceName()})`);
    await safe(() => DB.put('meta', { key: 'sync:settings', sha: nsha, ch: sch }));

    cfg.last = Date.now(); saveCfg();
    lastError = null; lastStats = stats;
    if (stats.down || stats.pdfDown) { App.renderHome?.(); App.emit('plan:changed'); }
    if (manual) App.toast(syncSummary(stats));
    return true;
  } catch (e) {
    console.warn('sincronização', e);
    lastError = e.code === 'public' ? 'Esse repositório é PÚBLICO: seus grifos ficariam visíveis. Use um repositório particular (Private).'
      : e.status === 401 ? 'O token foi recusado (vencido ou apagado). Crie outro e cole aqui.'
      : e.status === 403 ? 'O token não tem permissão de escrita nesse repositório (Contents: Read and write).'
      : e.status === 404 ? 'Não achei o repositório. Confira o nome (dono/nome) e se o token tem acesso a ele.'
      : e.status === 409 || e.status === 422 ? 'Outro aparelho sincronizou ao mesmo tempo. Tento de novo em instantes.'
      : 'Não consegui sincronizar agora (' + (e.message || e) + ').';
    if (e.status === 409 || e.status === 422) setTimeout(() => App.syncNow(), 8000);
    if (manual) App.toast(lastError);
    return false;
  }
}
App.syncInfo = () => ({ running: !!running, lastError, lastStats, last: cfg && cfg.last });
const syncSummary = s => {
  const parts = [];
  if (s.down) parts.push(`${App.plural(s.down, 'PDF atualizado', 'PDFs atualizados')} com o que veio de outro aparelho`);
  if (s.pdfDown) parts.push(`${App.plural(s.pdfDown, 'PDF baixado', 'PDFs baixados')}`);
  if (s.up || s.pdfUp) parts.push('alterações deste aparelho enviadas');
  return parts.length ? 'Sincronizado: ' + parts.join('; ') + '.' : 'Tudo sincronizado.';
};
function deviceName(){ return ls.get('le.deviceName', null) || (App.isTouch ? (innerWidth > 700 ? 'tablet' : 'celular') : 'computador'); }

// ---------- Automático ----------
let autoT = null, autoAt = 0;
// agenda uma sincronização; um pedido mais tardio não adia outra já marcada para antes
const soon = (ms = 15000) => {
  if (!ready()) return;
  const at = Date.now() + ms;
  if (autoT && autoAt <= at) return;
  clearTimeout(autoT); autoAt = at;
  autoT = setTimeout(() => { autoT = null; App.syncNow(); }, ms);
};
App.on('doc:saved', () => soon(20000));
App.on('doc:loaded', () => soon(1500));
addEventListener('online', () => soon(2000));
document.addEventListener('visibilitychange', () => { if (document.hidden) { if (ready() && autoT) { clearTimeout(autoT); autoT = null; App.syncNow(); } } else soon(1500); });
setInterval(() => { if (ready() && !document.hidden) App.syncNow(); }, 5 * 60000);
setTimeout(() => soon(0), 3000);

// ---------- Janela ----------
let statusEl = null;
function renderStatus(){
  const b = $('#syncBadge');
  if (b) { b.hidden = !ready(); b.classList.toggle('busy', !!running); b.classList.toggle('err', !running && !!lastError); b.title = running ? 'Sincronizando…' : lastError || (cfg && cfg.last ? 'Sincronizado ' + ago(cfg.last) : 'Sincronizar aparelhos'); }
  if (!statusEl || !statusEl.isConnected) return;
  statusEl.className = 'syncStatus' + (lastError && !running ? ' err' : '');
  statusEl.textContent = running ? 'Sincronizando…' : lastError ? lastError : cfg && cfg.last ? `Última sincronização: ${ago(cfg.last)}.${lastStats ? ' ' + syncSummary(lastStats) : ''}` : 'Ainda não sincronizado.';
}
const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'agora há pouco' : m < 60 ? `há ${m} min` : new Date(t).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); };

App.openSync = () => {
  const dlg = App.dialog('syncDlg', 'pomoDlg syncDlg'); dlg.setAttribute('aria-label', 'Sincronizar aparelhos');
  dlg.innerHTML = '';
  const head = el('div', 'helpHead');
  head.append(el('h2', null, 'Sincronizar aparelhos'), App.ibtn('x', null, () => dlg.close(), 'sm', 'Fechar (Esc)'));
  const body = el('div', 'pomoBody');
  body.append(el('p', 'muted small', 'Computador, tablet e celular ficam com os mesmos grifos, notas, marcadores, planos e progresso. A "nuvem" é um repositório particular no seu GitHub; ninguém mais vê.'));
  if (!ready()) {
    const steps = el('ol', 'syncSteps');
    const li = (html, link, label) => { const l = el('li'); l.append(el('span', null, html)); if (link) { const a = el('a', null, label); a.href = link; a.target = '_blank'; a.rel = 'noopener'; l.append(' ', a); } steps.append(l); };
    li('Crie um repositório PARTICULAR (Private), por exemplo "leitor-dados".', 'https://github.com/new', 'Criar repositório');
    li('Crie um token "fine-grained": em Repository access escolha "Only select repositories" → esse repositório; em Permissions → Repository permissions → Contents: "Read and write". Validade: a maior que quiser.', 'https://github.com/settings/personal-access-tokens/new', 'Criar token');
    li('Cole abaixo o nome do repositório e o token. Faça isso em cada aparelho (pode usar o mesmo token).');
    body.append(steps);
  }
  const f = (label, input) => { const w = el('label', 'planField syncField'); w.append(el('span', null, label), input); return w; };
  const repo = el('input', 'pomoName'); repo.placeholder = 'seu-usuario/leitor-dados'; repo.value = cfg ? cfg.repo : '';
  const tok = el('input', 'pomoName'); tok.type = 'password'; tok.placeholder = ready() ? '•••••••• (guardado neste aparelho)' : 'github_pat_…'; tok.autocomplete = 'off';
  [repo, tok].forEach(i => { i.onkeydown = e => e.stopPropagation(); });
  const pdfs = el('input'); pdfs.type = 'checkbox'; pdfs.checked = cfg ? cfg.pdfs !== false : true;
  const pw = el('label', 'mdOpt'); pw.append(pdfs, el('span', null, 'Levar os PDFs também'), el('small', 'muted', 'o PDF aberto num aparelho aparece nos outros (até 45 MB cada)'));
  const dev = el('input', 'pomoName'); dev.placeholder = deviceName(); dev.value = ls.get('le.deviceName', '') || ''; dev.maxLength = 30;
  dev.onkeydown = e => e.stopPropagation(); dev.oninput = () => ls.set('le.deviceName', dev.value.trim() || null);
  body.append(f('Repositório', repo), f('Token', tok), pw, f('Nome deste aparelho', dev));
  statusEl = el('p', 'syncStatus'); body.append(statusEl);
  pdfs.onchange = () => { if (cfg) { cfg.pdfs = pdfs.checked; saveCfg(); } };
  const foot = el('div', 'lookFoot');
  const left = el('div');
  if (ready()) left.append(App.btn('Desconectar', () => {
    if (!confirm('Parar de sincronizar este aparelho? Nada é apagado aqui nem no GitHub.')) return;
    cfg = null; saveCfg(); lastError = null; renderStatus(); App.openSync();
  }, 'sm outline danger'));
  foot.append(left, App.btn(ready() ? 'Sincronizar agora' : 'Conectar e sincronizar', async () => {
    const r = repo.value.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/+$/, '');
    if (!/^[\w.-]+\/[\w.-]+$/.test(r)) { App.toast('Escreva o repositório como usuario/nome.'); repo.focus(); return; }
    const t = tok.value.trim();
    if (!ready() && !t) { App.toast('Cole o token.'); tok.focus(); return; }
    const prev = cfg;
    cfg = { ...(cfg || {}), repo: r, token: t || (cfg && cfg.token), pdfs: pdfs.checked };
    saveCfg();
    const ok = await App.syncNow({ manual: true });
    if (!ok && !prev && lastError && /token|repositório|PÚBLICO/.test(lastError)) { cfg = null; saveCfg(); }
    else if (ok && !prev) App.openSync();
    renderStatus();
  }, 'primary'));
  dlg.append(head, body, foot);
  renderStatus();
  if (!dlg.open) dlg.showModal();
};

// ícone na barra (só aparece com a sincronização ligada)
const badge = el('button', 'btn icon syncBadge'); badge.id = 'syncBadge'; badge.append(App.icon('restore'));
badge.setAttribute('aria-label', 'Sincronização'); badge.onclick = () => App.openSync();
const tbRight = $('#tbPins');
if (tbRight && tbRight.parentElement) tbRight.parentElement.insertBefore(badge, tbRight);
renderStatus();
setInterval(renderStatus, 60000);
})();
