/* Modo simulado: folha de respostas, cronômetro, correção com gabarito, resultado detalhado e cartões dos erros.
   Também: responder clicando na alternativa da própria prova (botão direito risca), ritmo e tempo por questão,
   certeza x chute, filtros da folha, resultado por área e evolução entre os simulados. */
(() => {
'use strict';
const App = window.App;
const { $, $$, el, btn, state, ls } = App;

const view = $('#examView'), panel = $('#examPanel'), bar = $('#examBar'), pause = $('#examPause'), viewer = $('#viewer');
const LETTERS = 'ABCDE';
let ex = null;            // simulado aberto (em andamento ou em correção)
let curQ = 1, paused = false, tickT = null, lastTick = 0, saveCount = 0, detectCache = null;
let altMap = {};           // posição das alternativas no PDF: { q: { A: {page,x,y,x1,y1}, … } }
let sheetFilter = 'all';   // filtro da folha de respostas

App.examRunning = () => !!(ex && !ex.finished && !paused);
App.examOpen = () => !!ex;
const activeExam = () => state.exams.find(e => !e.finished) || null;
const fmtClock = s => {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(x).padStart(2, '0');
};
const fmtDur = s => s < 60 ? Math.round(s) + ' s' : App.fmtDuration(s);
const letters = e => LETTERS.slice(0, e.alts);
const save = () => App.saveDocSoon();

// ==================== Detecção das questões e do gabarito ====================
async function detectQuestions(){
  if (detectCache && detectCache.fp === state.fp && detectCache.ocrPages === Object.keys(state.ocr).length) return detectCache;
  const last = Math.min(state.pages.length, 400), cands = [];
  for (let p = 1; p <= last; p++) {
    let pt; try { pt = await App.pageText(p); } catch { continue; }
    const items = pt.items;
    for (let i = 0; i < items.length; i++) {
      const it = items[i], s = it.str.trim();
      if (!s || it.y < 0.035 || it.y > 0.95) continue;
      let num = null, m;
      if ((m = s.match(/^(?:quest[aã]o\s*)?0*(\d{1,3})\s*[.)\-–:]?$/i))) num = +m[1];
      else if ((m = s.match(/^0*(\d{1,3})\s*[.)\-–]\s*\S/))) num = +m[1];
      else if (/^quest[aã]o$/i.test(s) && items[i + 1] && (m = items[i + 1].str.trim().match(/^0*(\d{1,3})\b/))) num = +m[1];
      if (!num || num > 300) continue;
      // tem que ser começo de linha: nada colado à esquerda na mesma altura
      const cy = it.y + it.h / 2;
      const glued = items.some(o => o !== it && o.str.trim() && Math.abs((o.y + o.h / 2) - cy) < Math.max(o.h, it.h) * 0.6
        && o.x + o.w <= it.x + 0.003 && o.x + o.w > it.x - 0.025);
      if (!glued) cands.push({ q: num, page: p, x: it.x, y: it.y, col: it.x > 0.42 ? 1 : 0 });
    }
  }
  cands.sort((a, b) => a.page - b.page || a.col - b.col || a.y - b.y);
  // maior sequência crescente (1, 2, 3… aceitando pular até 2 números)
  const N = cands.length, score = new Array(N).fill(0), prev = new Array(N).fill(-1);
  let bestI = -1;
  for (let i = 0; i < N; i++) {
    score[i] = 1 + (cands[i].q === 1 ? 0.5 : 0);
    for (let j = Math.max(0, i - 80); j < i; j++) {
      const d = cands[i].q - cands[j].q;
      if (d >= 1 && d <= 3) { const sc = score[j] + (d === 1 ? 1 : 0.35); if (sc > score[i]) { score[i] = sc; prev[i] = j; } }
    }
    if (bestI < 0 || score[i] > score[bestI]) bestI = i;
  }
  const chain = [];
  for (let i = bestI; i >= 0; i = prev[i]) chain.unshift(cands[i]);
  const anchors = chain.length >= 3 ? chain.map(({ q, page, x, y }) => ({ q, page, x: +x.toFixed(4), y: +y.toFixed(4) })) : [];
  detectCache = { fp: state.fp, ocrPages: Object.keys(state.ocr).length, anchors, max: anchors.length ? anchors[anchors.length - 1].q : 0, key: await detectKey(anchors.length ? anchors[anchors.length - 1].q : 0), areas: await detectAreas(anchors) };
  return detectCache;
}
// gabarito: procura a palavra "gabarito" nas últimas páginas e lê os pares número-letra depois dela
async function detectKey(nq){
  const n = state.pages.length;
  for (let p = n; p >= Math.max(1, n - 10); p--) {
    let pt; try { pt = await App.pageText(p); } catch { continue; }
    const i = pt.text.search(/gabarito/i);
    if (i < 0) continue;
    const r = App.parseKey(pt.text.slice(i) + ' ' + (p < n ? (await App.pageText(p + 1)).text : ''), nq || 300);
    if (r.count >= Math.max(3, (nq || 0) * 0.5)) return { ...r, page: p };
  }
  return null;
}
// aceita "1-A 2-C 3 E 04) B", ou só as letras em ordem "ACEBD…". X ou * = anulada
App.parseKey = (text, nq) => {
  const key = {}; let count = 0, m;
  const re = /(?:^|[^\d])0*(\d{1,3})\s*[-–.):=]?\s*([A-Ea-e*Xx])(?![A-Za-zÀ-ú])/g;
  while ((m = re.exec(text))) {
    const q = +m[1], a = m[2].toUpperCase();
    if (q >= 1 && q <= (nq || 300) && !(q in key)) { key[q] = a === 'X' ? '*' : a; count++; }
  }
  if (count < 2 && !/\d/.test(text)) {
    (text.toUpperCase().match(/[A-E*X]/g) || []).slice(0, nq || 300).forEach((a, i) => { key[i + 1] = a === 'X' ? '*' : a; count++; });
  }
  return { key, count };
};
const keyToText = key => Object.entries(key || {}).sort((a, b) => a[0] - b[0]).map(([q, a]) => `${q}-${a === '*' ? 'X' : a}`).join('  ');
const fmtList = arr => arr.length > 12 ? arr.slice(0, 12).join(', ') + ` e mais ${arr.length - 12}` : arr.join(', ');

// Botão "Ler gabarito de um arquivo": PDF (com ou sem texto) ou foto/print. Chama onResult com respostas e comentários.
function keyReader(getN, onResult){
  const wrap = el('div', 'keyReader');
  const input = el('input'); input.type = 'file'; input.accept = 'application/pdf,.pdf,image/*'; input.hidden = true;
  const status = el('div', 'keyStatus'); status.hidden = true;
  const say = (cls, msg) => { status.hidden = false; status.className = 'keyStatus ' + cls; status.textContent = msg; };
  const run = async file => {
    say('busy', 'Lendo o gabarito…');
    try {
      const r = await App.readKeyFile(file, getN(), t => say('busy', t));
      if (!r.count) { say('bad', `Não encontrei respostas em "${App.baseName(r.name)}". Confira se é o arquivo do gabarito.`); return; }
      let msg = `Li ${r.count} resposta${r.count === 1 ? '' : 's'}${r.commentCount ? ` e ${r.commentCount} comentário${r.commentCount === 1 ? '' : 's'}` : ''} de "${App.baseName(r.name)}".`;
      if (r.missing.length) msg += ` Faltaram: ${fmtList(r.missing)}.`;
      if (r.conflicts.length) msg += ` Confira: ${fmtList(r.conflicts)} (a tabela e o comentário discordam).`;
      if (r.usedOcr) msg += ' Lido por OCR — vale dar uma conferida.';
      say(r.missing.length || r.conflicts.length || r.usedOcr ? 'warn' : 'ok', msg);
      onResult(r);
    } catch (e) {
      console.warn(e);
      say('bad', e.message === 'servico' ? 'Esse arquivo é escaneado (ou foto) e o OCR precisa do serviço local: abra o leitor pelo atalho e tente de novo.'
        : e.message === 'formato' ? 'Escolha um PDF ou uma imagem (JPG, PNG).' : 'Não consegui ler esse arquivo.');
    }
  };
  input.onchange = () => { if (input.files[0]) run(input.files[0]); input.value = ''; };
  const row = el('div', 'keyRow');
  row.append(App.ibtn('file', 'Ler gabarito de um arquivo (PDF ou foto)', () => input.click(), 'outline sm'));
  App.suggestKeyDoc().then(d => {
    if (!d) return;
    row.append(App.ibtn('check', `Usar "${App.baseName(d.name)}"`, async () => {
      const f = await App.safe(() => App.DB.get('files', d.fp), null);
      if (f) run({ name: d.name, data: f.data }); else App.toast('Não encontrei esse arquivo salvo. Escolha pelo botão ao lado.');
    }, 'soft sm', 'Gabarito que você já abriu no leitor'));
  });
  wrap.append(row, input, status);
  wrap.run = run;
  return wrap;
}
// arrastar um arquivo até a janela também lê o gabarito
function acceptDrop(target, reader){
  target.ondragover = e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); e.stopPropagation(); target.classList.add('dropping'); } };
  target.ondragleave = () => target.classList.remove('dropping');
  target.ondrop = e => {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault(); e.stopPropagation(); target.classList.remove('dropping');
    document.body.classList.remove('dragging');
    reader.run(e.dataTransfer.files[0]);
  };
}

// ==================== Telas (configuração, entrega, gabarito, resultado) ====================
function showView(build){ App.closePopup(); view.innerHTML = ''; view.hidden = false; App.examViewOpen = true; build(view); }
function hideView(){ view.hidden = true; view.innerHTML = ''; App.examViewOpen = false; }
App.closeExamView = hideView;
document.addEventListener('keydown', e => {
  if (!App.examViewOpen) return;
  if (e.key === 'Escape' && !e.target.closest('textarea,input')) { e.preventDefault(); e.stopPropagation(); hideView(); }
}, true);
const field = (label, ctrl, hint) => { const f = el('div', 'exField'); f.append(el('label', 'exLabel', label), ctrl); if (hint) f.append(hint); return f; };

// botão "Simulado": com um simulado guardado, retoma direto; senão abre a configuração
App.openExam = () => {
  if (!state.pdf) { App.toast('Abra a prova (PDF) primeiro.'); return; }
  if (ex && !ex.finished) { App.toast('O simulado já está em andamento.'); return; }
  const running = activeExam();
  if (running) { resume(running); return; }
  return App.openExamSetup();
};
function resume(e){
  hideView();
  delete e.left; enterMode(e); save();
  App.toast(`Simulado retomado: ${Object.keys(e.answers).length} de ${e.n} respondidas · ${fmtClock(e.elapsed)}${e.timeLimit ? ' de ' + fmtClock(e.timeLimit) : ''}.`);
}
// parar: sair guardando tudo (continua depois) ou cancelar de vez
function stopMenu(anchor){
  if (!ex || ex.finished) return;
  const n = Object.keys(ex.answers).length;
  App.popMenu(anchor, [
    { icon: 'pause', label: 'Sair e continuar depois', sub: 'guarda respostas e tempo', on: leaveExam },
    { icon: 'trash', label: 'Cancelar simulado', sub: n ? `apaga ${n} resposta${n > 1 ? 's' : ''}` : 'apaga este simulado', danger: true, on: cancelExam },
  ], { title: 'Parar o simulado', alignRight: true });
}
function leaveExam(){
  if (!ex || ex.finished) return;
  const e = ex; e.left = true; save();
  exitMode(); App.scheduleRender();
  App.toast(`Simulado guardado (${Object.keys(e.answers).length} de ${e.n}). Para voltar, clique em "Continuar simulado".`);
}
function cancelExam(){
  if (!ex || ex.finished) return;
  const n = Object.keys(ex.answers).length;
  if (n && !confirm(`Cancelar o simulado? As ${n} respostas marcadas serão apagadas.`)) return;
  const e = ex; state.exams = state.exams.filter(x => x !== e);
  exitMode(true); save(); App.scheduleRender();
  App.toast('Simulado cancelado.');
}
App.leaveExam = leaveExam;
function updateExamBtn(){
  const b = $('#btnExam'); if (!b) return;
  const running = state.pdf ? activeExam() : null;
  b.replaceChildren(App.icon('exam'), document.createTextNode(running ? 'Continuar simulado' : 'Simulado'));
  b.title = running ? `Continuar o simulado guardado (${Object.keys(running.answers).length} de ${running.n} respondidas)` : 'Modo simulado: folha de respostas, cronômetro e correção';
  b.classList.toggle('resume', !!running);
  // se o botão Simulado não está na barra, um "Continuar simulado" aparece sozinho enquanto houver simulado guardado
  let chip = $('#btnExamResume');
  const need = !!running && !ex && !b.closest('#tbPins');
  if (need && !chip) {
    chip = el('button', 'btn soft doc-only noExam resume'); chip.id = 'btnExamResume'; chip.type = 'button';
    chip.onclick = () => App.openExam();
    $('#tbPins')?.before(chip);
  }
  if (chip) {
    chip.hidden = !need;
    if (need) { chip.replaceChildren(App.icon('exam'), document.createTextNode('Continuar simulado')); chip.title = b.title; }
  }
}
App.updateExamBtn = updateExamBtn;
App.openExamSetup = async () => {
  if (!state.pdf) { App.toast('Abra a prova (PDF) primeiro.'); return; }
  if (ex && !ex.finished) { App.toast('O simulado já está em andamento.'); return; }
  showView(v => { const c = el('div', 'rvCard exCard'); c.append(el('h2', null, 'Modo simulado'), el('p', 'muted', 'Analisando a prova…')); v.append(c); });
  const det = await detectQuestions();
  showView(v => setupCard(v, det));
};

function setupCard(v, det){
  const c = el('div', 'rvCard exCard');
  c.append(el('h2', null, 'Modo simulado'), el('p', 'muted', App.baseName(state.name)));
  const running = activeExam();
  if (running) {
    const box = el('div', 'exResume');
    const answered = Object.keys(running.answers).length;
    box.append(el('div', null, `Você tem um simulado em andamento: ${answered} de ${running.n} respondidas · ${fmtClock(running.elapsed)}${running.timeLimit ? ' de ' + fmtClock(running.timeLimit) : ''}.`));
    const row = el('div', 'exRow');
    row.append(btn('Continuar', () => resume(running), 'primary'),
      btn('Descartar', () => { if (confirm('Descartar o simulado em andamento? As respostas dele serão apagadas.')) { state.exams = state.exams.filter(e => e !== running); save(); updateExamBtn(); App.openExamSetup(); } }, 'outline danger'));
    box.append(row); c.append(box);
  }
  // questões
  const nIn = el('input', 'numInput'); nIn.type = 'number'; nIn.min = 1; nIn.max = 300; nIn.value = det.max || 60;
  const altSel = el('select', 'exSelect'); [['5', 'A a E (5)'], ['4', 'A a D (4)']].forEach(([v2, t]) => { const o = el('option', null, t); o.value = v2; altSel.append(o); });
  altSel.value = String(App.ls.get('le.examAlts', 5));
  const qHint = el('p', 'exHint', det.anchors.length
    ? `Encontrei ${det.anchors.length} questões numeradas (de ${det.anchors[0].q} a ${det.max}). Clicando no número na folha de respostas, você vai direto até a questão.`
    : 'Não achei a numeração das questões no texto do PDF (comum em PDF escaneado sem OCR). A folha funciona igual, só sem o atalho para pular até a questão.');
  const qRow = el('div', 'exRow'); qRow.append(field('Número de questões', nIn), field('Alternativas', altSel));
  c.append(el('div', 'rvLabel', 'Questões'), qRow, qHint);
  // tempo
  const tSel = el('select', 'exSelect');
  [['0', 'Sem limite (só cronômetro)'], ['3600', '1 hora'], ['7200', '2 horas'], ['10800', '3 horas'], ['14400', '4 horas'], ['18000', '5 horas'], ['custom', 'Personalizado…']]
    .forEach(([v2, t]) => { const o = el('option', null, t); o.value = v2; tSel.append(o); });
  tSel.value = String(App.ls.get('le.examTime', 14400));
  if (![...tSel.options].some(o => o.value === tSel.value)) tSel.value = '14400';
  const tMin = el('input', 'numInput'); tMin.type = 'number'; tMin.min = 1; tMin.value = 90; tMin.hidden = true;
  const perQ = el('span', 'exHint inline');
  const updPerQ = () => {
    tMin.hidden = tSel.value !== 'custom';
    const secs = tSel.value === 'custom' ? +tMin.value * 60 : +tSel.value;
    perQ.textContent = secs && +nIn.value ? `≈ ${fmtDur(secs / +nIn.value)} por questão` : '';
  };
  tSel.onchange = tMin.oninput = nIn.oninput = updPerQ; updPerQ();
  const tRow = el('div', 'exRow'); tRow.append(field('Tempo de prova', tSel), tMin, perQ);
  c.append(el('div', 'rvLabel', 'Tempo'), tRow);
  // gabarito
  const ta = el('textarea', 'exKey'); ta.placeholder = 'Cole aqui o gabarito (opcional): 1-A 2-C 3-E… ou só as letras em ordem: ACEBD…  Use X para anulada.';
  if (det.key) ta.value = keyToText(det.key.key);
  const kHint = el('p', 'exHint', det.key ? `Encontrei um gabarito na página ${det.key.page} com ${det.key.count} respostas — confira abaixo. Ele fica escondido durante a prova.` : 'Não encontrei gabarito no PDF. Sem problema: você pode colar agora ou informar ao entregar.');
  const keyCount = el('span', 'exHint inline');
  ta.oninput = () => { const r = App.parseKey(ta.value, +nIn.value); keyCount.textContent = ta.value.trim() ? `${r.count} respostas reconhecidas` : ''; };
  ta.oninput();
  const keyBox = el('details', 'exKeyBox'); keyBox.open = false;
  const sum = el('summary', null, det.key ? 'Ver / editar gabarito' : 'Ou cole / digite o gabarito'); keyBox.append(sum, ta, keyCount);
  let fromFile = null; // respostas e comentários lidos de um arquivo
  const reader = keyReader(() => +nIn.value, r => {
    fromFile = r; ta.value = keyToText(r.key); ta.oninput(); keyBox.open = true;
    sum.textContent = 'Ver / editar gabarito';
    kHint.textContent = 'O gabarito fica escondido durante a prova e só aparece na correção.';
  });
  acceptDrop(c, reader);
  c.append(el('div', 'rvLabel', 'Gabarito'), kHint, reader, keyBox);
  // opções
  const adv = el('label', 'rvCheck'); const advCb = el('input'); advCb.type = 'checkbox'; advCb.checked = App.ls.get('le.examAdvance', true);
  adv.append(advCb, 'Ir para a próxima questão ao responder');
  c.append(el('div', 'rvLabel', 'Opções'), adv);
  // áreas (para o resultado por área)
  let areas = det.areas && det.areas.length ? det.areas : [];
  const areaBox = el('div', 'exAreas');
  const areaHint = el('p', 'exHint', '');
  const paintAreas = () => {
    areaBox.innerHTML = '';
    areaHint.textContent = det.areas && det.areas.length && areas === det.areas ? `Encontrei ${areas.length} áreas pelos títulos da prova — confira as faixas.` : areas.length ? '' : 'Opcional: diga as faixas de questões de cada área para ver o resultado por área.';
    areas.forEach((ar, i) => areaBox.append(areaRow(ar, () => { areas.splice(i, 1); paintAreas(); })));
    const acts = el('div', 'exRow');
    acts.append(App.ibtn('plus', 'Área', () => { const last = areas[areas.length - 1]; areas.push({ name: '', from: last ? last.to + 1 : 1, to: +nIn.value || 60 }); paintAreas(); }, 'sm outline'),
      App.ibtn('grid', '5 áreas iguais (residência)', () => { areas = splitAreas(+nIn.value || 100); paintAreas(); }, 'sm outline'));
    if (areas.length) acts.append(App.ibtn('x', 'Sem áreas', () => { areas = []; paintAreas(); }, 'sm'));
    areaBox.append(acts);
  };
  paintAreas();
  c.append(el('div', 'rvLabel', 'Áreas'), areaHint, areaBox);
  // histórico
  const done = state.exams.filter(e => e.finished).sort((a, b) => b.finishedAt - a.finishedAt);
  if (done.length) {
    c.append(el('div', 'rvLabel', 'Tentativas anteriores'));
    const hist = el('div', 'exHist');
    for (const e of done.slice(0, 8)) {
      const r = scoreOf(e), row = el('div', 'exHistRow');
      row.append(el('span', null, new Date(e.finishedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })),
        el('strong', null, e.key ? `${r.pct}%` : 'sem gabarito'), el('span', 'muted small', `${r.right}/${r.total} · ${fmtClock(e.elapsed)}`),
        btn('Ver resultado', () => { hideView(); enterMode(e); showResults(); }, 'sm outline'));
      hist.append(row);
    }
    c.append(hist);
  }
  const actions = el('div', 'rvActions');
  const start = btn(running ? 'Começar um novo' : 'Começar simulado', () => {
    const n = Math.max(1, Math.min(300, +nIn.value || 0));
    const timeLimit = tSel.value === 'custom' ? Math.max(1, +tMin.value) * 60 : +tSel.value;
    App.ls.set('le.examAlts', +altSel.value); App.ls.set('le.examTime', tSel.value === 'custom' ? 'custom' : timeLimit); App.ls.set('le.examAdvance', advCb.checked);
    const parsed = ta.value.trim() ? App.parseKey(ta.value, n) : null;
    if (running) state.exams = state.exams.filter(e => e !== running);
    const e = {
      id: App.uid(), name: App.baseName(state.name), created: Date.now(), n, alts: +altSel.value, timeLimit, elapsed: 0,
      finished: false, finishedAt: null, answers: {}, elim: {}, flags: {}, times: {}, key: parsed && parsed.count ? parsed.key : null,
      annulled: [], annulCorrect: true, anchors: det.anchors.filter(a => a.q <= n), autoAdvance: advCb.checked, overtime: false,
      comments: fromFile ? fromFile.comments : {}, keySource: fromFile ? fromFile.name : null,
      guess: {}, areas: cleanAreas(areas, n),
    };
    state.exams.push(e); save();
    hideView(); enterMode(e);
    App.toast('Boa prova! Clique na alternativa (ou A–E) para marcar · clique duplo, botão direito ou Shift+letra risca · X dúvida · Z chute · J/K navegam · F oculta a folha.');
  }, 'primary');
  actions.append(start, btn('Fechar', hideView));
  c.append(actions); v.append(c);
  setTimeout(() => start.focus(), 0);
}

// ==================== Modo prova (folha de respostas, cronômetro) ====================
function enterMode(e){
  exitMode(true);
  ex = e; paused = false;
  curQ = Math.max(1, Math.min(e.n, firstOpenQuestion(e)));
  document.body.classList.add('exam');
  document.body.classList.toggle('exam-nosheet', !!ls.get('le.examSheetHidden', false));
  document.body.classList.toggle('exam-review', !!e.finished);
  App.closePopup();
  e.guess = e.guess || {}; e.areas = e.areas || [];
  renderPanel(); renderBar(); renderBadges();
  if (!e.finished) { lastTick = Date.now(); tickT = setInterval(tick, 1000); goToQuestion(curQ, true); }
  App.scheduleRender();
  buildAlts(e).then(m => { if (ex === e) { altMap = m; renderAlts(); } });
  updateExamBtn();
}
function exitMode(silent){
  clearInterval(tickT); tickT = null;
  if (ex && !silent) save();
  ex = null; paused = false;
  document.body.classList.remove('exam', 'exam-review', 'exam-paused', 'exam-sheet', 'exam-nosheet', 'panel-open');
  pause.hidden = true; bar.innerHTML = ''; panel.innerHTML = '';
  $$('.qLayer').forEach(l => l.remove());
  altMap = {}; sheetFilter = 'all';
  updateExamBtn();
}
App.exitExam = () => exitMode();
const firstOpenQuestion = e => { for (let q = 1; q <= e.n; q++) if (!e.answers[q]) return q; return 1; };

function tick(){
  const now = Date.now(), dt = Math.min(5, (now - lastTick) / 1000); lastTick = now;
  if (!ex || ex.finished || paused) return;
  ex.elapsed += dt; ex.times[curQ] = (ex.times[curQ] || 0) + dt;
  updateClock(); updatePace();
  if (ex.timeLimit && !ex.overtime) {
    const left = ex.timeLimit - ex.elapsed;
    if (left <= 0) { timeUp(); return; }
    if (Math.abs(left - 1800) < 1) App.toast('Faltam 30 minutos.');
    if (Math.abs(left - 300) < 1) App.toast('Faltam 5 minutos!');
  }
  if (++saveCount % 10 === 0) save();
}
function timeUp(){
  setPaused(true, true);
  showView(v => {
    const c = el('div', 'rvCard exCard center');
    c.append(el('h2', null, 'Tempo esgotado'), el('p', 'muted', `${Object.keys(ex.answers).length} de ${ex.n} questões respondidas.`));
    const a = el('div', 'rvActions');
    a.append(btn('Entregar agora', () => { hideView(); deliver(true); }, 'primary'),
      btn('Continuar fora do tempo', () => { ex.overtime = true; save(); hideView(); setPaused(false); renderBar(); }, 'outline'));
    c.append(a); v.append(c);
  });
}
function setPaused(on, silent){
  if (!ex || ex.finished) return;
  paused = on; lastTick = Date.now();
  document.body.classList.toggle('exam-paused', on);
  pause.hidden = !on;
  if (on) { pause.innerHTML = ''; const b = el('div', 'pauseCard'); b.append(App.icon('pause'), el('h2', null, 'Simulado pausado'), el('p', 'muted', `${fmtClock(ex.elapsed)} até agora · a prova fica escondida enquanto estiver pausado`), btn('Continuar (P)', () => setPaused(false), 'primary lg'), btn('Sair e continuar depois', leaveExam, 'outline')); pause.append(b); }
  renderBar(); save();
  if (!on && !silent) viewer.focus({ preventScroll: true });
}

const sheetBtn = () => {
  const b = el('button', 'btn sm exSheetBtn'); b.id = 'exSheetBtn';
  b.append(App.icon('list'), el('span', null, ex ? `${Object.keys(ex.answers).length}/${ex.n}` : ''));
  b.title = 'Mostrar ou ocultar a folha de respostas (F)'; b.onclick = toggleSheet;
  b.setAttribute('aria-pressed', String(sheetShown()));
  return b;
};
// folha de respostas: no celular abre por cima quando você pede; no computador fica ao lado e dá para ocultar (lembra a escolha)
const isPhone = () => innerWidth <= 700;
const sheetShown = () => isPhone() ? document.body.classList.contains('exam-sheet') : !document.body.classList.contains('exam-nosheet');
function toggleSheet(){
  if (isPhone()) document.body.classList.toggle('exam-sheet');
  else {
    const hide = !document.body.classList.contains('exam-nosheet');
    document.body.classList.toggle('exam-nosheet', hide);
    ls.set('le.examSheetHidden', hide);
    App.toast(hide ? 'Folha de respostas oculta: F ou o botão da barra mostra de novo.' : 'Folha de respostas à vista.');
    App.scheduleRender?.();
  }
  $('#exSheetBtn')?.setAttribute('aria-pressed', String(sheetShown()));
}
function renderBar(){
  bar.innerHTML = '';
  if (!ex) return;
  bar.append(sheetBtn());
  if (ex.finished) {
    const r = scoreOf(ex);
    bar.append(el('span', 'examChip review', ex.key ? `Correção: ${r.pct}% (${r.right}/${r.total})` : 'Simulado entregue'),
      App.ibtn('chart', 'Resultado', showResults, 'sm soft'), App.ibtn('x', 'Sair da correção', () => exitMode(), 'sm'));
    return;
  }
  const clock = el('span', 'examChip'); clock.id = 'examClock'; clock.title = 'Tempo de prova';
  const pb = App.ibtn(paused ? 'play' : 'pause', null, () => setPaused(!paused), 'sm', paused ? 'Continuar (P)' : 'Pausar (P)');
  const stop = App.ibtn('stop', null, e2 => stopMenu(e2.currentTarget), 'sm exStop', 'Parar: sair e continuar depois, ou cancelar o simulado');
  const deliverBtn = App.ibtn('check', 'Entregar', () => deliver(false), 'sm primary');
  bar.append(clock, pb, stop, deliverBtn);
  updateClock();
}
function updateClock(){
  const c = $('#examClock'); if (!c || !ex) return;
  c.innerHTML = ''; c.append(App.icon('clock'));
  if (ex.timeLimit) {
    const left = ex.timeLimit - ex.elapsed;
    c.append(el('span', null, left >= 0 ? fmtClock(left) : '+' + fmtClock(-left)), el('small', null, left >= 0 ? ' restantes' : ' fora do tempo'));
    c.classList.toggle('warn', left < 900 && left >= 0); c.classList.toggle('over', left < 0);
  } else c.append(el('span', null, fmtClock(ex.elapsed)));
  const prog = $('#exProg'); if (prog) prog.textContent = progressText();
}
const progressText = () => {
  const a = Object.keys(ex.answers).length, f = Object.keys(ex.flags).filter(q => ex.flags[q]).length, g = Object.keys(ex.guess || {}).length;
  return `${a} de ${ex.n} respondidas${f ? ` · ${f} com dúvida` : ''}${g ? ` · ${g} no chute` : ''}`;
};
// ritmo: compara o tempo usado com o tempo "certo" para as questões já respondidas
const perQuestion = () => ex.timeLimit ? ex.timeLimit / ex.n : 0;
function updatePace(){
  const box = $('#exPace'); if (!box || !ex || ex.finished) return;
  const tq = ex.times[curQ] || 0, pq = perQuestion();
  box.innerHTML = '';
  const cur = el('span', 'paceQ' + (pq && tq > pq * 1.5 ? ' slow' : ''), `Questão ${curQ}: ${fmtClock(tq)}`);
  if (pq) {
    const done = Object.keys(ex.answers).length, diff = done * pq - ex.elapsed;
    const st = Math.abs(diff) < 60 ? 'ok' : diff > 0 ? 'ahead' : 'behind';
    const pace = el('span', 'pace ' + st, st === 'ok' ? 'no ritmo' : `${diff > 0 ? 'adiantado' : 'atrasado'} ${fmtDur(Math.abs(diff))}`);
    pace.title = `Meta: ${fmtDur(pq)} por questão (tempo de prova ÷ questões)`;
    box.append(pace, el('span', 'muted', ' · '), cur);
  } else box.append(cur);
}

// ---------- Folha de respostas ----------
function renderPanel(){
  panel.innerHTML = '';
  if (!ex) return;
  const head = el('div', 'exPanelHead');
  head.append(el('h2', null, ex.finished ? 'Correção' : 'Folha de respostas'));
  const sub = el('div', 'muted small'); sub.id = 'exProg'; sub.textContent = ex.finished ? resultLine() : progressText();
  head.append(sub);
  if (!ex.finished) {
    const bar2 = el('div', 'progress'); const f = el('div'); f.id = 'exBar'; bar2.append(f); head.append(bar2);
    const pace = el('div', 'exPace'); pace.id = 'exPace'; head.append(pace);
  }
  panel.append(head);
  const legend = el('div', 'exLegend');
  legend.textContent = ex.finished ? 'Verde: acerto · vermelho: erro · contorno: gabarito' : 'Clique na alternativa (na prova ou aqui) · clique duplo ou botão direito risca · ⚑ dúvida · ~ chute';
  panel.append(legend);
  // filtros: revisar só o que falta antes de entregar
  const fl = el('div', 'exFilters'); fl.id = 'exFilters';
  panel.append(fl);
  const list = el('div', 'qList'); list.id = 'qList';
  for (let q = 1; q <= ex.n; q++) list.append(qRow(q));
  panel.append(list);
  renderFilters();
  // na correção: comentário da questão atual (quando o gabarito tinha comentários)
  if (ex.finished && ex.comments && Object.keys(ex.comments).length) { const cb = el('div', 'exComment'); cb.id = 'exComment'; panel.append(cb); }
  updateProgressBar();
  markCurrent(false);
}
function renderComment(){
  const box = $('#exComment'); if (!box || !ex) return;
  const c = ex.comments[curQ], k = ex.key ? ex.key[curQ] : null, a = ex.answers[curQ];
  box.innerHTML = '';
  const head = el('div', 'exCommentHead');
  head.append(el('strong', null, `Questão ${curQ}`));
  if (k) head.append(el('span', 'resSt ' + (k === '*' ? '' : a === k ? 'right' : a ? 'wrong' : 'blank'), k === '*' ? 'anulada' : `Resposta ${k}`));
  box.append(head);
  if (c && c.src) box.append(el('div', 'resSrc', c.src));
  box.append(el('div', 'exCommentText', c ? c.text : 'Sem comentário para esta questão.'));
}
const resultLine = () => { const r = scoreOf(ex); return ex.key ? `${r.right} acertos de ${r.total} (${r.pct}%) · ${fmtClock(ex.elapsed)}` : 'Sem gabarito: informe para corrigir'; };
function updateProgressBar(){
  const f = $('#exBar'); if (f && ex) f.style.width = (Object.keys(ex.answers).length / ex.n * 100) + '%';
  const sb = $('#exSheetBtn span'); if (sb && ex) sb.textContent = `${Object.keys(ex.answers).length}/${ex.n}`;
  renderFilters(); updatePace();
}
const FILTERS = ex2 => [
  ['all', 'Todas', ex2.n, () => true],
  ['blank', 'Em branco', null, q => !ex2.answers[q]],
  ['flag', 'Dúvida', null, q => !!ex2.flags[q]],
  ['guess', 'Chute', null, q => !!(ex2.guess && ex2.guess[q])],
];
function renderFilters(){
  const box = $('#exFilters'); if (!box || !ex) return;
  box.innerHTML = '';
  for (const [id, label, , test] of FILTERS(ex)) {
    let n = 0; for (let q = 1; q <= ex.n; q++) if (test(q)) n++;
    if (id !== 'all' && !n && sheetFilter !== id) continue;
    const b = el('button', 'exFilter' + (sheetFilter === id ? ' on' : ''), `${label} ${n}`);
    b.onclick = () => { sheetFilter = sheetFilter === id ? 'all' : id; applyFilter(); renderFilters(); };
    box.append(b);
  }
  box.hidden = box.children.length < 2;
  applyFilter();
}
function applyFilter(){
  if (!ex) return;
  const f = FILTERS(ex).find(x => x[0] === sheetFilter) || FILTERS(ex)[0];
  panel.querySelectorAll('.qRow').forEach(r => { r.hidden = !f[3](+r.dataset.q); });
}
function qRow(q){
  const row = el('div', 'qRow'); row.dataset.q = q;
  const num = el('button', 'qNum', String(q)); num.title = anchorOf(q) ? 'Ir até a questão' : 'Selecionar';
  num.onclick = () => goToQuestion(q);
  row.append(num);
  const bub = el('div', 'bubbles');
  for (const L of letters(ex)) {
    const b = el('button', 'bubble', L); b.dataset.l = L;
    b.onclick = e2 => { if (e2.altKey) toggleElim(q, L); else setAnswer(q, L); };
    // clique duplo na bolinha risca, sem perder a resposta que já estava marcada
    let antes = null;
    b.onmousedown = e2 => { if (e2.detail === 1 && ex) antes = ex.answers[q] || null; };
    b.ondblclick = e2 => {
      e2.preventDefault(); if (!ex || ex.finished) return;
      if (antes && antes !== L) ex.answers[q] = antes; else delete ex.answers[q];
      toggleElim(q, L); paintRow(null, q);
    };
    b.oncontextmenu = e2 => { e2.preventDefault(); toggleElim(q, L); };
    bub.append(b);
  }
  row.append(bub);
  if (!ex.finished) {
    const gs = el('button', 'qGuess', '~'); gs.title = 'Respondi no chute (Z)'; gs.onclick = () => toggleGuess(q);
    const fl = App.ibtn('flag', null, () => toggleFlag(q), 'sm qFlag', 'Marcar dúvida (X)');
    row.append(gs, fl);
  } else row.append(el('span', 'qStatus'));
  paintRow(row, q);
  return row;
}
function paintRow(row, q){
  row = row || panel.querySelector(`.qRow[data-q="${q}"]`); if (!row || !ex) return;
  const a = ex.answers[q], elim = ex.elim[q] || [];
  row.classList.toggle('answered', !!a);
  row.classList.toggle('flagged', !!ex.flags[q]);
  const k = ex.finished && ex.key ? ex.key[q] : null;
  const ann = ex.finished && (ex.annulled.includes(q) || k === '*');
  row.querySelectorAll('.bubble').forEach(b => {
    const L = b.dataset.l;
    b.classList.toggle('sel', a === L);
    b.classList.toggle('elim', elim.includes(L));
    b.classList.toggle('key', !!k && k === L);
    b.classList.toggle('right', !!k && a === L && k === L);
    b.classList.toggle('wrong', !!k && k !== '*' && a === L && k !== L);
    b.disabled = !!ex.finished;
  });
  const fl = row.querySelector('.qFlag'); if (fl) fl.classList.toggle('on', !!ex.flags[q]);
  const gs = row.querySelector('.qGuess'); if (gs) gs.classList.toggle('on', !!(ex.guess && ex.guess[q]));
  row.classList.toggle('guess', !!(ex.guess && ex.guess[q]));
  const st = row.querySelector('.qStatus');
  if (st) {
    st.className = 'qStatus'; st.textContent = '';
    if (!k) st.textContent = '';
    else if (ann) { st.classList.add('ann'); st.textContent = 'anulada'; }
    else if (!a) { st.classList.add('blank'); st.textContent = 'branco'; }
    else if (a === k) { st.classList.add('right'); st.append(App.icon('check')); }
    else { st.classList.add('wrong'); st.append(App.icon('x')); }
  }
  updateBadge(q); paintAlts(q);
}
function setAnswer(q, L){
  if (!ex || ex.finished) return;
  if (paused) setPaused(false);
  const was = ex.answers[q];
  if (was === L) delete ex.answers[q];
  else { ex.answers[q] = L; if (ex.elim[q]) ex.elim[q] = ex.elim[q].filter(x => x !== L); }
  paintRow(null, q); updateProgressBar(); updateClock(); save();
  if (ex.autoAdvance && ex.answers[q] && !was && q < ex.n) goToQuestion(q + 1, true);
}
function toggleElim(q, L){
  if (!ex || ex.finished) return;
  const list = ex.elim[q] || (ex.elim[q] = []);
  const i = list.indexOf(L);
  if (i >= 0) list.splice(i, 1); else { list.push(L); if (ex.answers[q] === L) delete ex.answers[q]; }
  paintRow(null, q); updateProgressBar(); save();
}
function toggleFlag(q){
  if (!ex || ex.finished) return;
  if (ex.flags[q]) delete ex.flags[q]; else ex.flags[q] = true;
  paintRow(null, q); updateClock(); renderFilters(); save();
}
function toggleGuess(q){
  if (!ex || ex.finished) return;
  ex.guess = ex.guess || {};
  if (ex.guess[q]) delete ex.guess[q]; else ex.guess[q] = true;
  paintRow(null, q); updateClock(); renderFilters(); save();
}

// ---------- Questão atual e navegação ----------
const anchorOf = q => ex && ex.anchors.find(a => a.q === q);
function anchorTop(a){ const p = state.pages[a.page - 1]; return p ? p.el.offsetTop + a.y * p.el.offsetHeight : 0; }
function goToQuestion(q, fromAnswer){
  if (!ex) return;
  q = Math.max(1, Math.min(ex.n, q));
  curQ = q; markCurrent(true); updatePace();
  if (!fromAnswer && innerWidth <= 700) document.body.classList.remove('exam-sheet'); // celular: mostra a questão
  const a = anchorOf(q);
  if (a) { holdScrollUntil = Date.now() + 700; viewer.scrollTop = anchorTop(a) - 28; App.scheduleRender(); }
  else if (!fromAnswer) App.toast(`Questão ${q} selecionada (não achei onde ela começa no PDF).`);
}
function markCurrent(scrollSheet){
  panel.querySelectorAll('.qRow.cur').forEach(r => r.classList.remove('cur'));
  const row = panel.querySelector(`.qRow[data-q="${curQ}"]`);
  if (row) { row.classList.add('cur'); if (scrollSheet) row.scrollIntoView({ block: 'nearest' }); }
  $$('.qBadge.cur').forEach(b => b.classList.remove('cur'));
  const bd = $(`.qBadge[data-q="${curQ}"]`); if (bd) bd.classList.add('cur');
  renderComment();
}
// a questão atual acompanha a rolagem feita por você (a que começa perto do topo da tela);
// logo depois de um pulo feito pelo app (ao responder, J/K, clique na folha) a rolagem não muda a questão
let scrollT, holdScrollUntil = 0;
viewer.addEventListener('scroll', () => {
  if (!ex || !ex.anchors.length) return;
  clearTimeout(scrollT);
  scrollT = setTimeout(() => {
    if (Date.now() < holdScrollUntil) return;
    const y = viewer.scrollTop + Math.min(140, viewer.clientHeight * 0.2);
    let q = null;
    for (const a of ex.anchors) { if (anchorTop(a) <= y) q = a.q; else break; }
    if (q && q !== curQ) { curQ = q; markCurrent(true); updatePace(); }
  }, 80);
}, { passive: true });

// ---------- Etiquetas na margem das questões ----------
function renderBadges(){
  $$('.qLayer').forEach(l => l.remove());
  if (!ex) return;
  for (const a of ex.anchors) {
    const p = state.pages[a.page - 1]; if (!p) continue;
    let layer = p.el.querySelector('.qLayer');
    if (!layer) { layer = el('div', 'qLayer'); p.el.append(layer); }
    const b = el('button', 'qBadge'); b.dataset.q = a.q;
    b.style.left = `calc(${a.x * 100}% - 34px)`; b.style.top = a.y * 100 + '%';
    b.onclick = () => { curQ = a.q; markCurrent(true); };
    layer.append(b); updateBadge(a.q);
  }
  markCurrent(false);
  renderAlts();
}
function updateBadge(q){
  const b = $(`.qBadge[data-q="${q}"]`); if (!b || !ex) return;
  const a = ex.answers[q], k = ex.finished && ex.key ? ex.key[q] : null;
  b.textContent = a ? a + (ex.guess && ex.guess[q] ? '~' : '') : (ex.flags[q] ? '?' : '');
  b.title = `Questão ${q}${a ? ' — você marcou ' + a : ''}${k && k !== '*' ? ' · gabarito ' + k : ''}`;
  b.className = 'qBadge' + (a ? ' answered' : '') + (ex.flags[q] ? ' flagged' : '') + (q === curQ ? ' cur' : '')
    + (k && k !== '*' ? (a === k ? ' right' : ' wrong') : '');
}

// ---------- Responder na própria prova ----------
// Acha "A)", "B)"… no começo das linhas de cada questão; o bloco de cada alternativa vai até a seguinte.
async function buildAlts(e){
  const out = {};
  if (!e.anchors || !e.anchors.length) return out;
  const L = letters(e);
  for (const a of e.anchors) {
    if (a.q > e.n) continue;
    const reg = questionRegion(e, a.q); if (!reg) continue;
    let pt; try { pt = await App.pageText(reg.page); } catch { continue; }
    if (ex !== e) return out;
    const Rr = reg.rect;
    const inReg = pt.items.filter(it => it.str.trim() && it.y >= Rr.y - 0.003 && it.y <= Rr.y + Rr.h && it.x >= Rr.x - 0.01 && it.x <= Rr.x + Rr.w);
    const lineStart = Math.min(...inReg.map(it => it.x));
    const found = [];
    let want = 0;
    for (const it of inReg.slice().sort((p, o) => p.y - o.y || p.x - o.x)) {
      const m = it.str.trim().match(/^\(?([A-Ea-e])\s*[).\-–]/) || (/^[A-Ea-e]$/.test(it.str.trim()) ? [0, it.str.trim()] : null);
      if (!m || m[1].toUpperCase() !== L[want] || it.x > lineStart + 0.07) continue;
      if (found.length && it.y <= found[found.length - 1].y + 0.002) continue;
      found.push({ L: L[want], page: reg.page, x: it.x, y: it.y, h: it.h, w: it.w, s: it.str.trim() }); want++;
      if (want >= L.length) break;
    }
    if (found.length < 2) continue;
    const bottom = Math.max(...inReg.filter(it => it.y >= found[found.length - 1].y).map(it => it.y + it.h));
    const m = {};
    found.forEach((f, i) => {
      const nx = found[i + 1];
      const yEnd = nx ? nx.y - 0.002 : bottom + 0.004;
      // linhas de texto da alternativa: agrupa os pedaços pela altura
      const lines = [];
      for (const it of inReg) {
        if (it.y < f.y - 0.002 || it.y >= yEnd - 0.001) continue;
        const ln = lines.find(l => Math.abs(l.y - it.y) < f.h * 0.5);
        if (ln) { ln.x0 = Math.min(ln.x0, it.x); ln.x1 = Math.max(ln.x1, it.x + it.w); }
        else lines.push({ y: it.y, h: it.h, x0: it.x, x1: it.x + it.w });
      }
      // largura só da letra ("C)"): quando o pedaço traz a alternativa inteira, estima pela proporção
      const lw = f.s.length <= 3 ? f.w : f.w * (2.2 / Math.max(3, f.s.length));
      m[f.L] = { page: f.page, x: +(f.x - 0.006).toFixed(4), y: +(f.y - 0.003).toFixed(4), x1: +Math.min(Rr.x + Rr.w, 0.99).toFixed(4), y1: +yEnd.toFixed(4), lh: f.h,
        lx: f.x, ly: f.y, lw, lines: lines.sort((p2, o) => p2.y - o.y).map(l => ({ y: +l.y.toFixed(4), h: +l.h.toFixed(4), x0: +l.x0.toFixed(4), x1: +l.x1.toFixed(4) })) };
    });
    out[a.q] = m;
  }
  return out;
}
function renderAlts(){
  $$('.altBox,.altMark,.altStrike').forEach(b => b.remove());
  if (!ex) return;
  for (const [q, m] of Object.entries(altMap)) for (const [Lt, r] of Object.entries(m)) {
    const p = state.pages[r.page - 1]; if (!p) continue;
    let layer = p.el.querySelector('.qLayer');
    if (!layer) { layer = el('div', 'qLayer'); p.el.append(layer); }
    const tag = e2 => { e2.dataset.q = q; e2.dataset.l = Lt; return e2; };
    // área de clique (invisível)
    const b = tag(el('div', 'altBox'));
    b.style.cssText = `left:${r.x * 100}%;top:${r.y * 100}%;width:${(r.x1 - r.x) * 100}%;height:${(r.y1 - r.y) * 100}%`;
    // quadradinho com a letra (cobre o "C)" do PDF quando marcada; contorno leve ao passar o mouse)
    const asp = p.base.w / p.base.h, lx = r.lx ?? r.x + 0.006, ly = r.ly ?? r.y + 0.003, lw = Math.max(r.lw ?? 0, r.lh * 0.85 / asp);
    const hH = r.lh * 1.5, wW = Math.max(lw + r.lh * 0.5 / asp, hH / asp);
    const cx = lx + lw / 2, cy = ly + r.lh * 0.5;
    const mk = tag(el('div', 'altMark'));
    mk.style.cssText = `left:${(cx - wW / 2) * 100}%;top:${(cy - hH / 2) * 100}%;width:${wW * 100}%;height:${hH * 100}%`;
    mk.append(el('span', null, Lt));
    // linhas do texto: esmaecem e ganham o traço quando a alternativa é riscada
    const st = tag(el('div', 'altStrike'));
    const textStart = lx + lw + 0.006; // a letra ("A)") fica de fora: só o texto esmaece e é riscado
    for (const ln0 of r.lines || [{ y: ly, h: r.lh, x0: lx, x1: r.x1 }]) {
      const ln = { ...ln0 };
      if (Math.abs(ln.y - ly) < r.lh * 0.5) ln.x0 = Math.max(ln.x0, textStart);
      if (ln.x1 - ln.x0 < 0.01) continue;
      const i = el('i'); i.style.cssText = `left:${(ln.x0 - 0.002) * 100}%;width:${(ln.x1 - ln.x0 + 0.005) * 100}%;top:${(ln.y - ln.h * 0.12) * 100}%;height:${ln.h * 1.24 * 100}%`;
      st.append(i);
    }
    layer.prepend(b, mk, st);
  }
  for (const q of Object.keys(altMap)) paintAlts(+q);
}
function paintAlts(q){
  if (!ex || !altMap[q]) return;
  const a = ex.answers[q], elim = ex.elim[q] || [], k = ex.finished && ex.key ? ex.key[q] : null;
  $$(`.altBox[data-q="${q}"],.altMark[data-q="${q}"],.altStrike[data-q="${q}"]`).forEach(b => {
    const L = b.dataset.l;
    b.classList.toggle('sel', a === L);
    b.classList.toggle('elim', elim.includes(L));
    b.classList.toggle('key', !!k && k !== '*' && k === L);
    b.classList.toggle('wrong', !!k && k !== '*' && a === L && k !== L);
  });
}
function altAt(e2){
  const pageEl = e2.target.closest && e2.target.closest('.page'); if (!pageEl) return null;
  const r = pageEl.getBoundingClientRect(), num = +pageEl.dataset.page;
  const x = (e2.clientX - r.left) / r.width, y = (e2.clientY - r.top) / r.height;
  for (const [q, m] of Object.entries(altMap)) for (const [Lt, b] of Object.entries(m))
    if (b.page === num && x >= b.x && x <= b.x1 && y >= b.y && y <= b.y1) return { q: +q, L: Lt };
  return null;
}
// clique simples (sem arrastar para selecionar texto) marca; o botão direito risca
let downAt = null;
viewer.addEventListener('pointerdown', e2 => { downAt = { x: e2.clientX, y: e2.clientY }; }, true);
// um clique marca na hora; se vier um 2º clique (ou toque) rápido na mesma alternativa, desfaz a marcação e risca.
const DOUBLE_MS = 350;
let lastTap = null;
const sameAlt = (a, b) => a && b && a.q === b.q && a.L === b.L;
// o 2º clique rápido não seleciona a palavra (o navegador faria isso no clique duplo)
viewer.addEventListener('mousedown', e2 => {
  if (!ex || ex.finished || paused || e2.button !== 0 || state.tool !== 'text') return;
  if (e2.detail >= 2 || (lastTap && Date.now() - lastTap.t < DOUBLE_MS)) { const hit = altAt(e2); if (hit) e2.preventDefault(); }
}, true);
viewer.addEventListener('click', e2 => {
  if (!ex || ex.finished || paused || e2.button !== 0 || App.examViewOpen || state.tool !== 'text') return;
  if (downAt && Math.hypot(e2.clientX - downAt.x, e2.clientY - downAt.y) > 5) return;
  const hit = altAt(e2); if (!hit) { lastTap = null; return; }
  const now = Date.now();
  if (lastTap && sameAlt(lastTap, hit) && now - lastTap.t < DOUBLE_MS) {
    // clique duplo: volta ao que era antes do 1º clique e risca
    const prev = lastTap.prev; lastTap = null;
    getSelection().removeAllRanges();
    if (prev.a) ex.answers[hit.q] = prev.a; else delete ex.answers[hit.q];
    ex.elim[hit.q] = prev.elim.slice();
    // a marca do 1º clique some sem animação (não "pisca")
    $$(`.altMark[data-q="${hit.q}"]`).forEach(m => { m.style.transition = 'none'; });
    toggleElim(hit.q, hit.L);
    requestAnimationFrame(() => requestAnimationFrame(() => $$(`.altMark[data-q="${hit.q}"]`).forEach(m => { m.style.transition = ''; })));
    setTimeout(() => App.closePopup(), 30);
    return;
  }
  if (App.hasSelection()) return;
  // marca já no 1º clique (guardando o estado anterior, caso seja um clique duplo)
  lastTap = { ...hit, t: now, prev: { a: ex.answers[hit.q], elim: (ex.elim[hit.q] || []).slice() } };
  if (curQ !== hit.q) { curQ = hit.q; markCurrent(true); }
  holdScrollUntil = Date.now() + 700;
  const adv = ex.autoAdvance; ex.autoAdvance = false; // na própria prova não pula de lugar
  setAnswer(hit.q, hit.L); ex.autoAdvance = adv;
  setTimeout(() => App.closePopup(), 30);
});
// passar o mouse: destaca só a alternativa embaixo do cursor
let hovT = 0, hovEl = null;
viewer.addEventListener('mousemove', e2 => {
  if (!ex || ex.finished || paused || state.tool !== 'text' || e2.buttons) { if (hovEl) { hovEl.classList.remove('hov'); hovEl = null; document.body.classList.remove('alt-hover'); } return; }
  hovEv = e2; if (hovT) return;
  hovT = requestAnimationFrame(() => { hovT = 0; hoverAt(hovEv); });
}, { passive: true });
let hovEv = null;
function hoverAt(e2){
  if (!ex || ex.finished || paused) return;
  const hit = altAt(e2);
  const b = hit ? $(`.altMark[data-q="${hit.q}"][data-l="${hit.L}"]`) : null;
  if (b === hovEl) return;
  if (hovEl) hovEl.classList.remove('hov');
  hovEl = b; if (b) b.classList.add('hov');
  document.body.classList.toggle('alt-hover', !!b);
}
viewer.addEventListener('contextmenu', e2 => {
  if (!ex || ex.finished || paused) return;
  const hit = altAt(e2); if (!hit) return;
  e2.preventDefault();
  toggleElim(hit.q, hit.L);
});

// ---------- Áreas da prova ----------
const AREAS5 = ['Clínica Médica', 'Cirurgia', 'Pediatria', 'Ginecologia e Obstetrícia', 'Medicina Preventiva'];
function splitAreas(n){
  const k = AREAS5.length, size = Math.floor(n / k);
  return AREAS5.map((name, i) => ({ name, from: i * size + 1, to: i === k - 1 ? n : (i + 1) * size }));
}
function cleanAreas(list, n){
  return (list || []).map(a => ({ name: String(a.name || '').trim() || 'Área', from: Math.max(1, Math.min(n, Math.round(+a.from || 1))), to: Math.max(1, Math.min(n, Math.round(+a.to || n))) }))
    .map(a => a.from > a.to ? { ...a, from: a.to, to: a.from } : a).filter(a => a.to >= a.from);
}
function areaRow(ar, onDel){
  const r = el('div', 'exAreaRow');
  const nm = el('input', 'pomoName'); nm.value = ar.name; nm.placeholder = 'Nome da área'; nm.oninput = () => { ar.name = nm.value; };
  const a1 = el('input', 'numInput'); a1.type = 'number'; a1.min = 1; a1.value = ar.from; a1.oninput = () => { ar.from = +a1.value; };
  const a2 = el('input', 'numInput'); a2.type = 'number'; a2.min = 1; a2.value = ar.to; a2.oninput = () => { ar.to = +a2.value; };
  [nm, a1, a2].forEach(i => { i.onkeydown = e2 => e2.stopPropagation(); });
  r.append(nm, el('span', 'muted small', 'questões'), a1, el('span', 'muted small', 'a'), a2, App.ibtn('x', null, onDel, 'sm', 'Tirar esta área'));
  return r;
}
// procura títulos de área no texto da prova ("CLÍNICA MÉDICA", "CIRURGIA"…) e liga cada um à 1ª questão depois dele
const AREA_RE = [['Clínica Médica', /cl[ií]nica\s+m[eé]dica/i], ['Cirurgia', /cirurgia/i], ['Pediatria', /pediatria/i],
  ['Ginecologia e Obstetrícia', /ginecologia|obstetr[ií]cia/i], ['Medicina Preventiva', /preventiva|sa[uú]de\s+coletiva|sa[uú]de\s+p[uú]blica|medicina\s+de\s+fam[ií]lia/i]];
async function detectAreas(anchors){
  if (!anchors.length) return [];
  const marks = [];
  const last = Math.min(state.pages.length, 400);
  for (let p = 1; p <= last; p++) {
    let pt; try { pt = await App.pageText(p); } catch { continue; }
    for (const it of pt.items) {
      const s = it.str.trim();
      if (s.length < 6 || s.length > 60 || s !== s.toUpperCase()) continue;
      const hit = AREA_RE.find(([, re]) => re.test(s)); if (!hit) continue;
      if (marks.some(m => m.name === hit[0])) continue;
      marks.push({ name: hit[0], page: p, col: it.x > 0.42 ? 1 : 0, y: it.y });
    }
  }
  if (marks.length < 2) return [];
  const order = o => o.page * 10 + o.col * 2 + o.y;
  const sortedA = anchors.slice().sort((a, b) => order({ page: a.page, col: a.x > 0.42 ? 1 : 0, y: a.y }) - order({ page: b.page, col: b.x > 0.42 ? 1 : 0, y: b.y }));
  const starts = marks.map(m => { const a = sortedA.find(x => order({ page: x.page, col: x.x > 0.42 ? 1 : 0, y: x.y }) > order(m)); return a ? { name: m.name, from: a.q } : null; })
    .filter(Boolean).sort((a, b) => a.from - b.from);
  const max = anchors[anchors.length - 1].q;
  return starts.map((s, i) => ({ name: s.name, from: s.from, to: starts[i + 1] ? starts[i + 1].from - 1 : max })).filter(a => a.to >= a.from);
}

// ---------- Teclado no modo prova ----------
App.examKey = e => {
  if (!ex || App.examViewOpen) return false;
  const K = e.key.toLowerCase();
  if (K === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); toggleSheet(); return true; }
  if (K === 'j') { e.preventDefault(); goToQuestion(curQ + 1); return true; }
  if (K === 'k') { e.preventDefault(); goToQuestion(curQ - 1); return true; }
  if (ex.finished) return false;
  if (K === 'p') { e.preventDefault(); setPaused(!paused); return true; }
  if (paused) return false;
  const i = letters(ex).toLowerCase().indexOf(K);
  if (K.length === 1 && i >= 0) { e.preventDefault(); const L = LETTERS[i]; e.shiftKey ? toggleElim(curQ, L) : setAnswer(curQ, L); return true; }
  if (K === 'x') { e.preventDefault(); toggleFlag(curQ); return true; }
  if (K === 'z') { e.preventDefault(); toggleGuess(curQ); return true; }
  return false;
};

// ==================== Entrega, gabarito e resultado ====================
function deliver(force){
  if (!ex || ex.finished) return;
  const blanks = ex.n - Object.keys(ex.answers).length;
  const flags = Object.keys(ex.flags).length;
  const finish = () => {
    clearInterval(tickT); tickT = null;
    ex.finished = true; ex.finishedAt = Date.now(); paused = false; pause.hidden = true;
    document.body.classList.remove('exam-paused'); document.body.classList.add('exam-review');
    save(); renderBar(); renderPanel(); renderBadges();
    if (!ex.key) keyEntry(); else showResults();
  };
  if (force) { finish(); return; }
  showView(v => {
    const c = el('div', 'rvCard exCard center');
    c.append(el('h2', null, 'Entregar o simulado?'));
    const facts = [];
    if (blanks) facts.push(`${blanks} em branco`);
    if (flags) facts.push(`${flags} marcada${flags === 1 ? '' : 's'} com dúvida`);
    c.append(el('p', 'muted', facts.length ? `Atenção: ${facts.join(' e ')}.` : 'Todas as questões estão respondidas.'));
    c.append(el('p', 'muted small', `Tempo: ${fmtClock(ex.elapsed)}${ex.timeLimit ? ' de ' + fmtClock(ex.timeLimit) : ''}`));
    const a = el('div', 'rvActions');
    a.append(btn('Entregar', () => { hideView(); finish(); }, 'primary'), btn('Voltar para a prova', hideView, 'outline'));
    c.append(a); v.append(c);
  });
}
function keyEntry(){
  showView(v => {
    const c = el('div', 'rvCard exCard');
    c.append(el('h2', null, 'Gabarito'), el('p', 'muted', 'Leia de um arquivo, cole o gabarito oficial ou preencha questão por questão. Use X para anulada.'));
    const reader = keyReader(() => ex.n, r => {
      for (let q = 1; q <= ex.n; q++) inputs[q - 1].value = r.key[q] === '*' ? 'X' : (r.key[q] || inputs[q - 1].value);
      if (r.commentCount) { ex.comments = r.comments; ex.keySource = r.name; }
      ta.value = keyToText(r.key);
    });
    acceptDrop(c, reader);
    c.append(reader);
    const ta = el('textarea', 'exKey'); ta.placeholder = 'Ou cole aqui: 1-A 2-C 3-E…  ou  ACEBD…'; ta.value = ex.key ? keyToText(ex.key) : '';
    const grid = el('div', 'keyGrid');
    const inputs = [];
    for (let q = 1; q <= ex.n; q++) {
      const cell = el('label', 'keyCell'); const inp = el('input'); inp.maxLength = 1; inp.value = ex.key?.[q] === '*' ? 'X' : (ex.key?.[q] || '');
      inp.oninput = () => { inp.value = inp.value.toUpperCase().replace(/[^A-EX*]/g, ''); if (inp.value && inputs[q]) inputs[q].focus(); };
      inp.onkeydown = e2 => { if (e2.key === 'Backspace' && !inp.value && inputs[q - 2]) inputs[q - 2].focus(); };
      cell.append(el('span', null, q), inp); grid.append(cell); inputs.push(inp);
    }
    ta.oninput = () => { const r = App.parseKey(ta.value, ex.n); for (let q = 1; q <= ex.n; q++) inputs[q - 1].value = r.key[q] === '*' ? 'X' : (r.key[q] || ''); };
    const a = el('div', 'rvActions');
    a.append(btn('Corrigir', () => {
      const key = {}; let n = 0;
      inputs.forEach((inp, i) => { const v2 = inp.value.toUpperCase(); if (v2) { key[i + 1] = v2 === 'X' ? '*' : v2; n++; } });
      if (!n) { App.toast('Preencha ao menos uma resposta do gabarito.'); return; }
      ex.key = key; save(); hideView(); renderBar(); renderPanel(); renderBadges(); showResults();
    }, 'primary'), btn('Corrigir depois', () => { hideView(); renderBar(); renderPanel(); }, 'outline'));
    c.append(ta, grid, a); v.append(c);
    setTimeout(() => ta.focus(), 0);
  });
}

function scoreOf(e){
  const r = { right: 0, wrong: 0, blank: 0, annulled: 0, total: 0, pct: 0, rows: [] };
  for (let q = 1; q <= e.n; q++) {
    const k = e.key ? e.key[q] : null, a = e.answers[q] || null;
    const ann = e.annulled.includes(q) || k === '*';
    let st = 'nokey';
    if (k) st = ann ? 'annulled' : !a ? 'blank' : a === k ? 'right' : 'wrong';
    r.rows.push({ q, a, k, st, t: e.times[q] || 0, flag: !!e.flags[q], guess: !!(e.guess && e.guess[q]) });
    if (st === 'right') r.right++; else if (st === 'wrong') r.wrong++; else if (st === 'blank') r.blank++; else if (st === 'annulled') r.annulled++;
  }
  const keyed = r.rows.filter(x => x.k).length;
  r.total = e.annulCorrect ? keyed : keyed - r.annulled;
  if (e.annulCorrect) r.right += r.annulled;
  r.pct = r.total ? Math.round(100 * r.right / r.total) : 0;
  return r;
}
App.examScore = scoreOf;

function ring(pct){
  const R = 52, C = 2 * Math.PI * R, NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 120 120'); svg.setAttribute('class', 'ring');
  const bg = document.createElementNS(NS, 'circle'); Object.entries({ cx: 60, cy: 60, r: R, class: 'ringBg' }).forEach(([k, v]) => bg.setAttribute(k, v));
  const fg = document.createElementNS(NS, 'circle'); Object.entries({ cx: 60, cy: 60, r: R, class: 'ringFg', 'stroke-dasharray': `${C * pct / 100} ${C}`, transform: 'rotate(-90 60 60)' }).forEach(([k, v]) => fg.setAttribute(k, v));
  const tx = document.createElementNS(NS, 'text'); Object.entries({ x: 60, y: 67, 'text-anchor': 'middle', class: 'ringText' }).forEach(([k, v]) => tx.setAttribute(k, v)); tx.textContent = pct + '%';
  svg.append(bg, fg, tx); return svg;
}
let resFilter = 'all';
function showResults(){
  if (!ex) return;
  const e = ex;
  if (!e.key) { keyEntry(); return; }
  showView(v => {
    const r = scoreOf(e);
    const c = el('div', 'rvCard exCard wide');
    const top = el('div', 'resTop');
    const info = el('div', 'resInfo');
    info.append(el('h2', null, `${r.right} de ${r.total} acertos`),
      el('p', 'muted', `${e.name} · ${new Date(e.finishedAt || Date.now()).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`),
      el('p', 'muted small', `Tempo: ${fmtClock(e.elapsed)}${e.timeLimit ? ' de ' + fmtClock(e.timeLimit) : ''} · média de ${fmtDur(e.elapsed / Math.max(1, e.n))} por questão`));
    top.append(ring(r.pct), info);
    c.append(top);
    const stats = el('div', 'resStats');
    const stat = (n, label, cls) => { const s = el('div', 'resStat ' + cls); s.append(el('strong', null, n), el('span', null, label)); return s; };
    const flagged = r.rows.filter(x => x.flag && x.k), flaggedRight = flagged.filter(x => x.st === 'right').length;
    const pl = (n, um, varios) => n === 1 ? um : varios;
    const acertos = r.right - (e.annulCorrect ? r.annulled : 0);
    const guessed = r.rows.filter(x => x.guess && x.k && x.a), guessRight = guessed.filter(x => x.st === 'right').length;
    const sure = r.rows.filter(x => !x.guess && x.k && x.a && x.st !== 'annulled'), sureRight = sure.filter(x => x.st === 'right').length;
    stats.append(stat(acertos, pl(acertos, 'acerto', 'acertos'), 'ok'), stat(r.wrong, pl(r.wrong, 'erro', 'erros'), 'bad'), stat(r.blank, 'em branco', 'mid'), stat(r.annulled, pl(r.annulled, 'anulada', 'anuladas'), ''),
      stat(flagged.length ? `${flaggedRight}/${flagged.length}` : '—', 'dúvidas que acertou', ''));
    c.append(stats);
    // certeza x chute
    if (guessed.length) {
      const cg = el('div', 'resConf');
      const pc = (a, b) => b ? Math.round(100 * a / b) : 0;
      cg.append(el('span', 'rvLabel', 'Certeza x chute'),
        el('div', null, `Com certeza: ${sureRight} de ${sure.length} (${pc(sureRight, sure.length)}%) · No chute: ${guessRight} de ${guessed.length} (${pc(guessRight, guessed.length)}%)`));
      c.append(cg);
    }
    // por área
    if (e.areas && e.areas.length) c.append(areaResults(e, r));
    // tempo por questão
    c.append(timeChart(e, r));
    const slow = r.rows.filter(x => x.t > 0).sort((a, b) => b.t - a.t).slice(0, 5);
    if (slow.length) {
      const s = el('div', 'resSlow'); s.append(el('span', 'rvLabel', 'Onde você mais demorou'));
      const chips = el('div', 'rvChips');
      slow.forEach(x => { const b2 = btn(`Q${x.q} · ${fmtDur(x.t)}`, () => { hideView(); goToQuestion(x.q); }, 'sm outline ' + (x.st === 'wrong' ? 'danger' : '')); chips.append(b2); });
      s.append(chips); c.append(s);
    }
    // tabela
    const filters = el('div', 'rvChips resFilters');
    const defs = [['all', 'Todas', r.rows.length], ['wrong', 'Erradas', r.wrong], ['blank', 'Em branco', r.blank], ['flag', 'Com dúvida', r.rows.filter(x => x.flag).length], ['guess', 'Chutes', r.rows.filter(x => x.guess).length], ['right', 'Acertadas', r.rows.filter(x => x.st === 'right').length]];
    const table = el('div', 'resTable');
    const paintTable = () => {
      table.innerHTML = '';
      const head = el('div', 'resRow head'); ['Questão', 'Você', 'Gabarito', 'Tempo', ''].forEach(t => head.append(el('span', null, t))); table.append(head);
      const rows = r.rows.filter(x => resFilter === 'all' || (resFilter === 'flag' ? x.flag : resFilter === 'guess' ? x.guess : x.st === resFilter));
      if (!rows.length) table.append(el('p', 'muted small pad', 'Nenhuma questão nesse filtro.'));
      for (const x of rows) {
        const row = el('div', 'resRow ' + x.st);
        const go = el('button', 'resQ', `Questão ${x.q}`); go.onclick = () => { hideView(); goToQuestion(x.q); };
        const st = el('span', 'resSt ' + x.st, { right: 'acerto', wrong: 'erro', blank: 'branco', annulled: 'anulada', nokey: '—' }[x.st]);
        const annBtn = btn(e.annulled.includes(x.q) ? 'Desanular' : 'Anular', () => {
          const i = e.annulled.indexOf(x.q); if (i >= 0) e.annulled.splice(i, 1); else e.annulled.push(x.q);
          save(); renderBar(); renderPanel(); renderBadges(); showResults();
        }, 'sm link');
        row.append(go, el('span', 'resA', (x.a || '—') + (x.guess ? ' ~' : '') + (x.flag ? ' ⚑' : '')), el('span', 'resK', x.k === '*' ? 'X' : (x.k || '—')), el('span', 'muted', x.t ? fmtDur(x.t) : '—'), el('span', 'resEnd'));
        const com = e.comments && e.comments[x.q];
        if (com) {
          const box = el('div', 'resComment'); box.hidden = true;
          if (com.src) box.append(el('div', 'resSrc', com.src));
          box.append(el('div', null, com.text));
          const cb = App.ibtn('note', null, () => { box.hidden = !box.hidden; cb.classList.toggle('on', !box.hidden); }, 'sm', 'Ver o comentário da questão');
          row.lastChild.append(cb, st, annBtn);
          table.append(row, box);
        } else { row.lastChild.append(st, annBtn); table.append(row); }
      }
    };
    defs.forEach(([id, label, n]) => {
      const b2 = el('button', 'rvChip' + (resFilter === id ? ' on' : ''), `${label} (${n})`); b2.style.setProperty('--c', '#9593ff');
      b2.onclick = () => { resFilter = id; filters.querySelectorAll('.rvChip').forEach(x => x.classList.remove('on')); b2.classList.add('on'); paintTable(); };
      filters.append(b2);
    });
    c.append(el('div', 'rvLabel', 'Questão por questão'), filters, table);
    paintTable();
    // opções
    const annOpt = el('label', 'rvCheck'); const annCb = el('input'); annCb.type = 'checkbox'; annCb.checked = e.annulCorrect;
    annCb.onchange = () => { e.annulCorrect = annCb.checked; save(); renderBar(); showResults(); };
    annOpt.append(annCb, 'Questões anuladas contam como acerto');
    c.append(annOpt);
    // evolução entre os simulados
    const evo = el('div', 'resEvo'); c.append(evo); App.examEvolution(evo, e);
    // ações
    const a = el('div', 'rvActions');
    const errs = r.rows.filter(x => x.st === 'wrong' || x.st === 'blank').length;
    const cards = App.ibtn('cards', `Criar cartões dos erros (${errs})`, () => makeErrorCards(e), 'primary');
    cards.disabled = !errs;
    a.append(cards, App.ibtn('edit', 'Editar gabarito', keyEntry, 'outline'), App.ibtn('grid', e.areas && e.areas.length ? 'Editar áreas' : 'Dividir por área', () => editAreas(e), 'outline'),
      App.ibtn('restore', 'Refazer simulado', () => retake(e), 'outline'), btn('Ver na prova', hideView, 'outline'));
    c.append(a); v.append(c);
  });
}
// ---------- Resultado por área, tempo por questão e evolução ----------
function areaResults(e, r){
  const box = el('div', 'resAreas');
  box.append(el('span', 'rvLabel', 'Por área'));
  for (const ar of e.areas) {
    const rows = r.rows.filter(x => x.q >= ar.from && x.q <= ar.to && x.k);
    const right = rows.filter(x => x.st === 'right' || (x.st === 'annulled' && e.annulCorrect)).length;
    const tot = e.annulCorrect ? rows.length : rows.filter(x => x.st !== 'annulled').length;
    const pct = tot ? Math.round(100 * right / tot) : 0;
    const row = el('div', 'resAreaRow');
    const barEl = el('span', 'statBar'); const fl = el('i'); fl.style.width = pct + '%'; fl.className = pct >= 70 ? 'ok' : pct >= 50 ? 'mid' : 'bad'; barEl.append(fl);
    row.append(el('span', 'statName', ar.name), el('span', 'muted small', `${ar.from}–${ar.to}`), barEl, el('strong', null, `${pct}%`), el('span', 'muted small', `${right}/${tot}`));
    box.append(row);
  }
  return box;
}
function timeChart(e, r){
  const box = el('div', 'resTime');
  const pq = e.timeLimit ? e.timeLimit / e.n : 0;
  const withT = r.rows.filter(x => x.t > 0);
  const avg = list => list.length ? list.reduce((s2, x) => s2 + x.t, 0) / list.length : 0;
  const rightA = avg(withT.filter(x => x.st === 'right')), wrongA = avg(withT.filter(x => x.st === 'wrong'));
  box.append(el('span', 'rvLabel', 'Tempo por questão'));
  const info = [];
  if (pq) info.push(`meta ${fmtDur(pq)}`);
  if (rightA) info.push(`nos acertos ${fmtDur(rightA)}`);
  if (wrongA) info.push(`nos erros ${fmtDur(wrongA)}`);
  if (info.length) box.append(el('div', 'muted small', 'Média: ' + info.join(' · ')));
  const max = Math.max(pq * 1.5, ...r.rows.map(x => x.t), 30);
  const ch = el('div', 'tChart');
  for (const x of r.rows) {
    const b = el('button', 'tBar ' + x.st); b.style.height = Math.max(2, x.t / max * 100) + '%';
    b.title = `Questão ${x.q}: ${x.t ? fmtDur(x.t) : 'sem tempo'} · ${{ right: 'acerto', wrong: 'erro', blank: 'branco', annulled: 'anulada', nokey: '' }[x.st]}`;
    b.onclick = () => { hideView(); goToQuestion(x.q); };
    ch.append(b);
  }
  if (pq) { const ln = el('div', 'tMeta'); ln.style.bottom = (pq / max * 100) + '%'; ln.title = 'Meta por questão'; ch.append(ln); }
  box.append(ch);
  return box;
}
function editAreas(e){
  showView(v => {
    const c = el('div', 'rvCard exCard');
    c.append(el('h2', null, 'Áreas da prova'), el('p', 'muted', 'Diga as faixas de questões de cada área para ver o resultado por área.'));
    let areas = (e.areas || []).map(a => ({ ...a }));
    const box = el('div', 'exAreas');
    const paint = () => {
      box.innerHTML = '';
      areas.forEach((ar, i) => box.append(areaRow(ar, () => { areas.splice(i, 1); paint(); })));
      const acts = el('div', 'exRow');
      acts.append(App.ibtn('plus', 'Área', () => { const last = areas[areas.length - 1]; areas.push({ name: '', from: last ? last.to + 1 : 1, to: e.n }); paint(); }, 'sm outline'),
        App.ibtn('grid', '5 áreas iguais (residência)', () => { areas = splitAreas(e.n); paint(); }, 'sm outline'));
      box.append(acts);
    };
    paint();
    const a = el('div', 'rvActions');
    a.append(btn('Salvar', () => { e.areas = cleanAreas(areas, e.n); save(); showResults(); }, 'primary'), btn('Voltar', showResults, 'outline'));
    c.append(box, a); v.append(c);
  });
}
// evolução: todos os simulados corrigidos (de todos os PDFs), do mais antigo ao mais novo
App.examEvolution = async (box, cur) => {
  const docs = await App.safe(() => App.DB.all('docs'), []);
  const all = new Map();
  for (const d of docs) for (const e of d.exams || []) if (e.finished && e.key) all.set(e.id, { e, doc: d.name });
  for (const e of state.exams) if (e.finished && e.key) all.set(e.id, { e, doc: state.name });
  const list = [...all.values()].sort((a, b) => a.e.finishedAt - b.e.finishedAt).slice(-14);
  box.innerHTML = '';
  if (list.length < 2) return;
  box.append(el('span', 'rvLabel', 'Sua evolução nos simulados'));
  const ch = el('div', 'evoChart');
  for (const { e, doc } of list) {
    const r = scoreOf(e);
    const col = el('div', 'evoCol' + (cur && e.id === cur.id ? ' cur' : ''));
    const b = el('i'); b.style.height = Math.max(3, r.pct) + '%';
    col.title = `${App.baseName(doc)} · ${new Date(e.finishedAt).toLocaleDateString('pt-BR')} · ${r.right}/${r.total}`;
    col.append(el('span', 'evoPct', r.pct + '%'), el('span', 'evoBar'), el('span', 'evoDate', new Date(e.finishedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })));
    col.querySelector('.evoBar').append(b);
    ch.append(col);
  }
  box.append(ch);
  const first = scoreOf(list[0].e).pct, lastP = scoreOf(list[list.length - 1].e).pct;
  box.append(el('div', 'muted small', `De ${first}% para ${lastP}% em ${list.length} simulados${lastP > first ? ' — subindo!' : '.'}`));
};
function retake(e){
  const n = { ...e, id: App.uid(), created: Date.now(), elapsed: 0, finished: false, finishedAt: null, answers: {}, elim: {}, flags: {}, times: {}, guess: {}, annulled: [], overtime: false };
  state.exams.push(n); save(); hideView(); enterMode(n);
  App.toast('Nova tentativa começou. Boa prova!');
}

// ---------- Cartões de revisão a partir dos erros ----------
function questionRegion(e, q){
  const sorted = e.anchors.slice().sort((a, b) => a.page - b.page || (a.x > 0.42) - (b.x > 0.42) || a.y - b.y);
  const i = sorted.findIndex(a => a.q === q); if (i < 0) return null;
  const a = sorted[i], next = sorted[i + 1];
  const twoCol = sorted.some(o => o.page === a.page && o.x > 0.42) && sorted.some(o => o.page === a.page && o.x <= 0.42);
  const right = a.x > 0.42;
  const x0 = twoCol ? (right ? 0.49 : 0.02) : 0.03, x1 = twoCol ? (right ? 0.98 : 0.51) : 0.97;
  const sameCol = next && next.page === a.page && (next.x > 0.42) === right && next.y > a.y;
  const y0 = Math.max(0, a.y - 0.012), y1 = sameCol ? next.y - 0.006 : 0.95;
  return { page: a.page, rect: { x: x0, y: y0, w: x1 - x0, h: Math.max(0.03, y1 - y0) } };
}
async function cropRegion(pageNum, r){
  const page = await state.pdf.getPage(pageNum);
  const vp1 = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: Math.min(3, 1100 / (vp1.width * r.w)) });
  const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const o = document.createElement('canvas'); o.width = Math.round(r.w * c.width); o.height = Math.round(r.h * c.height);
  o.getContext('2d').drawImage(c, r.x * c.width, r.y * c.height, o.width, o.height, 0, 0, o.width, o.height);
  const url = o.toDataURL('image/jpeg', 0.8); c.width = o.width = 0;
  return url;
}
async function makeErrorCards(e){
  const r = scoreOf(e);
  const list = r.rows.filter(x => x.st === 'wrong' || x.st === 'blank');
  let made = 0, skipped = 0, noAnchor = 0;
  App.toast('Criando os cartões…');
  for (const x of list) {
    if (state.highlights.some(h => h.q && h.q.exam === e.id && h.q.n === x.q)) { skipped++; continue; }
    const reg = questionRegion(e, x.q);
    if (!reg) { noAnchor++; continue; }
    let img = null, text = '';
    try { img = await cropRegion(reg.page, reg.rect); } catch (err) { console.warn(err); }
    try {
      const pt = await App.pageText(reg.page), R = reg.rect;
      text = pt.items.filter(it => { const cx = it.x + it.w / 2, cy = it.y + it.h / 2; return cx >= R.x && cx <= R.x + R.w && cy >= R.y && cy <= R.y + R.h; })
        .map(it => it.str).join(' ').replace(/\s+/g, ' ').trim();
    } catch {}
    state.highlights.push(App.normHl({
      id: App.uid(), kind: 'area', style: 'fill', color: 'p', text, img,
      note: `Questão ${x.q} — gabarito ${x.k}${x.a ? `, você marcou ${x.a}` : ', você deixou em branco'}`,
      parts: [{ page: reg.page, rects: [{ x: +reg.rect.x.toFixed(4), y: +reg.rect.y.toFixed(4), w: +reg.rect.w.toFixed(4), h: +reg.rect.h.toFixed(4) }] }],
      created: Date.now(), q: { exam: e.id, n: x.q, key: x.k, ans: x.a, src: e.comments?.[x.q]?.src || '', comment: (e.comments?.[x.q]?.text || '').slice(0, 2500) },
    }));
    made++;
  }
  App.renderAllAnnots(); App.renderPanel(); App.emit('hl:changed'); await App.saveDoc();
  App.toast(made
    ? `${made} cartão(ões) criado(s) — revise com R. Eles também aparecem marcados em rosa na prova.${noAnchor ? ` (${noAnchor} sem posição no PDF ficaram de fora)` : ''}`
    : skipped ? 'Os cartões desses erros já existem.' : 'Não consegui localizar essas questões no PDF para criar os cartões.');
}

// ==================== Ciclo de vida ====================
App.on('doc:loaded', () => {
  exitMode(true); detectCache = null;
  const running = activeExam();
  if (running && !running.left) { enterMode(running); setPaused(true, true); }
  updateExamBtn();
});
App.on('doc:closed', () => exitMode(true));
App.on('exams:reload', () => {
  if (!ex) return;
  const fresh = state.exams.find(e => e.id === ex.id);
  if (fresh && fresh !== ex) { ex = fresh; renderPanel(); renderBar(); renderBadges(); }
});
// quando a página é redesenhada em outro tamanho, as etiquetas acompanham (são em %), nada a fazer
$('#btnExam').onclick = () => App.openExam();
})();
