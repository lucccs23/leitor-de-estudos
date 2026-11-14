/* Perguntar à IA (Claude, ChatGPT ou Gemini) sobre um trecho, um grifo, a página, o capítulo ou um conjunto de grifos.
   O Vetra monta o pedido (com o PDF, a página, o capítulo e um pouco de contexto), copia e abre o site escolhido.
   Depois, a resposta pode ser colada de volta: vira nota do grifo ou da página e fica no histórico.
   Só vai o que você escolher mandar; nada é enviado sem você clicar. */
(() => {
'use strict';
const App = window.App;
const { $, el, state, ls } = App;

const PROVIDERS = {
  claude:  { name: 'Claude',  url: q => 'https://claude.ai/new' + (q ? '?q=' + encodeURIComponent(q) : ''), prefill: true },
  chatgpt: { name: 'ChatGPT', url: q => 'https://chatgpt.com/' + (q ? '?q=' + encodeURIComponent(q) : ''), prefill: true },
  gemini:  { name: 'Gemini',  url: () => 'https://gemini.google.com/app', prefill: false }, // não aceita a pergunta pelo link: vai copiada
};
const MAX_URL = 6000;   // pedidos maiores vão só copiados (links muito longos são recusados pelos sites)
const MAX_TEXT = 12000; // limite de texto enviado de uma vez
const provider = () => PROVIDERS[ls.get('le.aiProvider', 'claude')] ? ls.get('le.aiProvider', 'claude') : 'claude';
App.aiProvider = provider;

// ---------- Pedidos ----------
const clean = s => String(s || '').replace(/(\p{L})-\s+(\p{Ll})/gu, '$1$2').replace(/\s+/g, ' ').trim();
function cut(s, max = MAX_TEXT){ s = clean(s); return s.length > max ? s.slice(0, max) + ' […] (trecho cortado)' : s; }
// Começo do pedido: a apresentação que a pessoa escrever (opcional) + o nome do PDF e a página (dá para desligar)
const intro = () => String(ls.get('le.aiIntro', '') || '').trim();
const docInfoOn = () => ls.get('le.aiDocInfo', true);
function header(ctx){
  const parts = [];
  if (intro()) parts.push(/[.!?]$/.test(intro()) ? intro() : intro() + '.');
  if (docInfoOn() && state.name) {
    const where = ctx.pages ? `, páginas ${ctx.pages}` : ctx.page ? `, página ${ctx.page}` : '';
    parts.push(`Material: "${App.baseName(state.name)}"${ctx.chapter ? `, capítulo "${ctx.chapter}"` : ''}${where}.`);
  }
  return parts.join(' ');
}
const withHeader = (ctx, body) => { const h = header(ctx); return h ? `${h}\n\n${body}` : body; };
// ---------- Contexto extra (capítulo, texto em volta, minhas notas da página, siglas) ----------
const ctxOn = () => ls.get('le.aiContext', true);
async function enrich(ctx){
  if (!state.pdf || !ctx.page) return ctx;
  try { const ch = App.chapterOf(await App.chapters(), ctx.page); if (ch && !ctx.chapter) ctx.chapter = ch.title; } catch {}
  if (!ctxOn() || ctx.big) return ctx;
  const extra = [];
  // texto em volta do trecho (o que vem antes e depois na página)
  if (ctx.text && (ctx.src === 'trecho' || ctx.src === 'grifo')) {
    try {
      const pt = clean((await App.pageText(ctx.page)).text), probe = clean(ctx.text).slice(0, 60);
      const i = probe ? pt.indexOf(probe) : -1;
      if (i >= 0) {
        const before = pt.slice(Math.max(0, i - 500), i).replace(/^\S*\s/, ''), after = pt.slice(i + clean(ctx.text).length, i + clean(ctx.text).length + 500).replace(/\s\S*$/, '');
        if ((before + after).trim().length > 40) extra.push(block('Texto em volta, na mesma página (só para contexto)', `${before ? '… ' + before : ''} [TRECHO] ${after ? after + ' …' : ''}`));
      }
    } catch {}
  }
  // minhas anotações nesta página
  const mine = state.highlights.filter(h => h.id !== ctx.hid && !h.q && h.kind !== 'ink' && App.anchorOf(h).page === ctx.page && (h.note || h.text))
    .slice(0, 8).map(h => `- ${h.text ? clean(h.text).slice(0, 160) : '(nota solta)'}${h.note ? ' — minha nota: ' + clean(h.note).slice(0, 200) : ''}`);
  if (mine.length) extra.push('Meus grifos e notas nesta página:\n' + mine.join('\n'));
  // siglas que aparecem no texto
  if (ctx.text && App.lookupSigla) {
    const found = new Map();
    for (const m of ctx.text.matchAll(/\b[A-Z][A-Za-z0-9]{1,8}\b/g)) {
      const a = m[0]; if (found.has(a) || !/[A-Z].*[A-Z]/.test(a) || found.size >= 12) continue;
      const x = await App.lookupSigla(a); if (x) found.set(a, x.l);
    }
    if (found.size) extra.push('Siglas usadas: ' + [...found].map(([a, l]) => `${a} = ${l}`).join('; ') + '.');
  }
  ctx.extra = extra.join('\n\n');
  return ctx;
}
const block = (label, text) => `${label}:\n"""\n${text}\n"""`;
// Atalhos (editáveis em "Atalhos da IA…"): cada um é uma instrução; {fonte} vira "trecho", "grifo", "figura"…
const DEFAULT_PROMPTS = [
  { id: 'explain', label: 'Explicar', icon: 'sparkle', text: 'Explique de forma clara e didática o {fonte} abaixo: o que significa, por que é importante e um exemplo prático. Defina os termos técnicos.' },
  { id: 'simple', label: 'Explicar de um jeito simples', icon: 'sparkle', text: 'Explique o {fonte} abaixo de um jeito bem simples, como para alguém que está começando no assunto, com uma analogia do dia a dia. Depois diga em uma frase o que é preciso lembrar.' },
  { id: 'summary', label: 'Resumir', icon: 'list', text: 'Faça um resumo em tópicos curtos do {fonte} abaixo, destacando o mais importante para revisar.' },
  { id: 'questions', label: 'Criar questões', icon: 'exam', text: 'Crie 3 questões de múltipla escolha (A a E) sobre o {fonte} abaixo, no estilo de prova. Coloque o gabarito comentado só no final, depois de todas as questões.' },
  { id: 'translate', label: 'Traduzir para o português', icon: 'swap', text: 'Traduza o {fonte} abaixo para o português do Brasil, mantendo os termos técnicos corretos (com o termo original entre parênteses na primeira vez).' },
  { id: 'compare', label: 'Comparar em tabela', icon: 'columns', text: 'Monte uma tabela comparando os conceitos do {fonte} abaixo, com as diferenças-chave entre eles. Se houver um só tema, compare com os temas parecidos com que ele costuma ser confundido.' },
  { id: 'cards', label: 'Criar flashcards', icon: 'cards', text: 'Crie de 5 a 8 flashcards sobre o {fonte} abaixo, no formato "Pergunta :: Resposta", um por linha, com respostas curtas e objetivas.' },
];
const prompts = () => { const p = ls.get('le.aiPrompts', null); return Array.isArray(p) && p.length ? p : DEFAULT_PROMPTS; };
const savePrompts = p => ls.set('le.aiPrompts', p);
App.aiPrompts = prompts;
const buildPrompt = (p, c, src) => withHeader(c, p.text.replace(/\{fonte\}/g, src));

// envia: copia o pedido (ou a imagem) e abre o site; guarda no histórico para colar a resposta depois
async function send(prompt, opts = {}){
  App.closePopup?.(); getSelection().removeAllRanges();
  if (opts.ctx) App.aiRemember?.(prompt, opts.ctx, opts.label);
  const id = provider(), P = PROVIDERS[id];
  let copied = false;
  try {
    if (opts.image) await navigator.clipboard.write([new ClipboardItem({ 'image/png': await toPng(opts.image) })]);
    else await navigator.clipboard.writeText(prompt);
    copied = true;
  } catch (e) { console.warn('área de transferência', e); }
  const viaLink = P.prefill && encodeURIComponent(prompt).length <= MAX_URL;
  App.openExternal(P.url(viaLink ? prompt : ''));
  let msg;
  if (opts.image) msg = viaLink ? `Abrindo o ${P.name}: cole a imagem da questão (Ctrl+V) junto com o pedido.` : `Imagem copiada. No ${P.name}, cole (Ctrl+V) e escreva o que quer saber.`;
  else if (viaLink) msg = `Abrindo o ${P.name} com o pedido pronto.`;
  else msg = copied ? `Pedido copiado. No ${P.name}, cole com Ctrl+V e envie.` : `Não consegui copiar o pedido. Selecione o texto e copie manualmente.`;
  App.toast(msg);
  App.lastAi = { provider: id, prompt, viaLink, copied, image: !!opts.image };
}
async function toPng(dataUrl){
  const img = new Image(); img.src = dataUrl; await img.decode();
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  c.getContext('2d').drawImage(img, 0, 0);
  return new Promise(r => c.toBlob(r, 'image/png'));
}

// ---------- Contextos ----------
// ctx = { text, page, src ('trecho' | 'grifo' | 'conteúdo da página'), image?, note?, q? }
async function run(p, ctx){
  if (!ctx.text && !ctx.image) { App.toast('Não há texto aqui para mandar (página escaneada? use o OCR em Ferramentas).'); return; }
  ctx = await enrich({ ...ctx });
  let prompt = buildPrompt(p, ctx, ctx.src);
  if (ctx.text) prompt += '\n\n' + block(cap(ctx.src), cut(ctx.text, ctx.max));
  else prompt += `\n\n(O ${ctx.src} é uma figura: vou colar a imagem.)`;
  if (ctx.note) prompt += `\n\nMinha anotação sobre ele: ${clean(ctx.note)}`;
  if (ctx.extra) prompt += '\n\n' + ctx.extra;
  send(prompt, { image: !ctx.text ? ctx.image : null, ctx, label: p.label });
}
async function ask(question, ctx){
  ctx = await enrich({ ...ctx });
  let prompt = withHeader(ctx, `${question.trim()}\n\nResponda com base no ${ctx.src} abaixo, deixando claro o que vier de fora do texto.`);
  if (ctx.text) prompt += '\n\n' + block(cap(ctx.src), cut(ctx.text, ctx.max));
  else if (ctx.image) prompt += `\n\n(O ${ctx.src} é uma figura: vou colar a imagem.)`;
  if (ctx.extra) prompt += '\n\n' + ctx.extra;
  send(prompt, { image: !ctx.text ? ctx.image : null, ctx, label: question.trim() });
}
App.aiRun = run; App.aiAskWith = ask;
// só o texto selecionado, sem pedido, apresentação nem contexto
function sendRaw(ctx){
  if (!ctx.text) { App.toast(ctx.image ? 'É uma figura: use um dos pedidos (a imagem vai copiada).' : 'Não há texto aqui para mandar.'); return; }
  send(clean(ctx.text), { ctx, label: 'Só o texto' });
}
App.aiSendRaw = sendRaw;

// ---------- Capítulo inteiro e conjunto de grifos ----------
const BIG = 45000; // capítulos e listas grandes vão copiados (não cabem no link)
async function pagesText(a, b){
  const idx = App.getTextIndex ? await App.getTextIndex(state.fp) : null;
  let out = '';
  for (let n = a; n <= b && out.length < BIG; n++) {
    let t = idx && idx.pages[n - 1];
    if (t == null) { try { t = (await App.pageText(n)).text; } catch { t = ''; } }
    t = clean(t); if (t) out += `[p. ${n}] ${t}\n`;
  }
  return out;
}
async function chapterRange(){
  const chaps = await App.chapters(), n = state.pages.length;
  const c = App.chapterOf(chaps, state.currentPage);
  if (!c) return null;
  const next = chaps.find(x => x.page > c.page);
  return { title: c.title, from: c.page, to: next ? Math.max(c.page, next.page - 1) : n };
}
function promptsMenu(anchor, getCtx, title){
  App.popMenu(anchor, [
    ...prompts().map(p => ({ label: p.label, icon: p.icon || 'sparkle', on: async () => run(p, await getCtx()) })),
    { input: true, placeholder: 'Ou escreva sua pergunta…', onEnter: async v => ask(v, await getCtx()) },
  ], { title, alignRight: true });
}
App.aiChapterMenu = async anchor => {
  if (!state.pdf) return;
  const r = await chapterRange();
  const items = [];
  if (r) items.push({ label: r.title, sub: `p. ${r.from}–${r.to}`, icon: 'book',
    on: () => promptsMenu(anchor, async () => ({ text: await pagesText(r.from, r.to), page: r.from, pages: `${r.from} a ${r.to}`, chapter: r.title, src: 'capítulo', big: true, max: BIG }), `Capítulo: ${r.title}`) });
  items.push({ input: true, placeholder: r ? 'Ou outras páginas (ex.: 10-25)' : 'Páginas (ex.: 10-25)', onEnter: v => {
    const idx = App.parseRange(v, state.pages.length);
    if (!idx || !idx.length) { App.toast('Não entendi as páginas. Escreva como 10-25.'); return; }
    const a = idx[0] + 1, b = idx[idx.length - 1] + 1;
    promptsMenu(anchor, async () => ({ text: await pagesText(a, b), page: a, pages: `${a} a ${b}`, src: 'trecho do material', big: true, max: BIG }), `Páginas ${a} a ${b}`);
  } });
  App.popMenu(anchor, items, { title: 'Capítulo inteiro', alignRight: true });
};
const listHl = list => App.sortedHighlights(list).map(h => `- (p. ${App.anchorOf(h).page}) ${h.text ? clean(h.text) : '(figura)'}${h.note ? ' — minha nota: ' + clean(h.note) : ''}`).join('\n');
App.aiHighlightsMenu = async anchor => {
  if (!state.pdf) return;
  const usable = state.highlights.filter(h => !h.q && h.kind !== 'ink' && (h.text || h.note));
  if (!usable.length) { App.toast('Ainda não há grifos com texto neste PDF.'); return; }
  const go = (list, title) => promptsMenu(anchor, async () => ({ text: listHl(list), page: App.anchorOf(App.sortedHighlights(list)[0]).page, pages: pagesOf(list), src: 'conjunto dos meus grifos', big: true, max: BIG }), title);
  const pagesOf = list => { const ps = list.map(h => App.anchorOf(h).page); return `${Math.min(...ps)} a ${Math.max(...ps)}`; };
  const items = [{ label: 'Todos os grifos', sub: String(usable.length), icon: 'highlighter', on: () => go(usable, 'Todos os grifos') }];
  const r = await chapterRange();
  if (r) { const inC = usable.filter(h => { const p = App.anchorOf(h).page; return p >= r.from && p <= r.to; }); if (inC.length) items.push({ label: 'Deste capítulo', sub: String(inC.length), icon: 'book', on: () => go(inC, `Grifos: ${r.title}`) }); }
  items.push({ sep: true });
  for (const c of App.COLORS) { const l = usable.filter(h => h.color === c.id); if (l.length) items.push({ label: App.labelOf(c.id), sub: String(l.length), dot: c.hex, on: () => go(l, `Grifos: ${App.labelOf(c.id)}`) }); }
  const withNote = usable.filter(h => h.note); if (withNote.length) items.push({ label: 'Só os que têm nota', sub: String(withNote.length), icon: 'note', on: () => go(withNote, 'Grifos com nota') });
  App.popMenu(anchor, items, { title: 'Meus grifos', alignRight: true });
};
// questão errada do simulado (cartão de revisão)
function explainQuestion(h){
  const q = h.q;
  let prompt = withHeader({ page: App.anchorOf(h).page }, '') + `Explique a resolução desta questão. O gabarito é ${q.key}; ${q.ans ? `eu marquei ${q.ans}` : 'deixei em branco'}. Mostre o raciocínio, por que cada alternativa está certa ou errada e qual é a pista principal do enunciado.`;
  if (q.comment) prompt += `\n\nComentário do gabarito oficial: ${clean(q.comment)}`;
  if (h.text) prompt += '\n\n' + block('Questão', cut(h.text));
  else prompt += '\n\n(A questão está numa imagem: vou colar a imagem.)';
  send(prompt, { image: !h.text ? h.img : null });
}
App.aiExplainQuestion = explainQuestion;
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- Menu ----------
// ctx pode ser um objeto ou uma função que devolve o contexto (calculado na hora do clique)
App.aiMenu = (anchor, ctx, opts = {}) => {
  const cur = provider();
  const getCtx = async () => typeof ctx === 'function' ? await ctx() : ctx;
  const items = [];
  if (opts.question) items.push({ label: 'Explicar a questão', sub: 'gabarito e alternativas', icon: 'exam', on: () => explainQuestion(opts.question) });
  for (const p of prompts()) items.push({ label: p.label, icon: p.icon || 'sparkle', on: async () => run(p, await getCtx()) });
  items.push({ input: true, placeholder: 'Ou escreva sua pergunta…', onEnter: async v => ask(v, await getCtx()) });
  items.push({ label: 'Mandar só o texto', sub: 'sem pedido nem contexto', icon: 'copy', on: async () => sendRaw(await getCtx()) });
  if (state.pdf && !opts.question) items.push({ sep: true },
    { label: 'Capítulo inteiro…', icon: 'book', on: () => App.aiChapterMenu(anchor) },
    { label: 'Meus grifos…', sub: 'todos, por cor ou do capítulo', icon: 'highlighter', on: () => App.aiHighlightsMenu(anchor) });
  items.push({ sep: true });
  items.push({ label: 'Mandar contexto junto', sub: 'capítulo, texto em volta, notas, siglas', icon: 'list', checked: ctxOn(), on: () => { ls.set('le.aiContext', !ctxOn()); App.aiMenu(anchor, ctx, opts); } });
  items.push({ label: 'Respostas guardadas', icon: 'news', on: () => App.openAiHistory?.() });
  items.push({ label: 'Pedidos e atalhos…', sub: 'como o pedido começa', icon: 'edit', on: () => App.openAiPrompts() });
  for (const [k, P] of Object.entries(PROVIDERS)) items.push({ label: `Usar o ${P.name}`, dot: k === cur ? 'var(--accent)' : 'var(--border-strong)', checked: k === cur,
    sub: P.prefill ? undefined : 'pergunta vai copiada',
    on: () => { ls.set('le.aiProvider', k); App.aiMenu(anchor, ctx, opts); } });
  App.popMenu(anchor, items, { title: `${opts.title || 'Perguntar à IA'} · ${PROVIDERS[cur].name}`, alignRight: !!opts.alignRight });
};

// página atual (ou a seleção, se houver) — botão da barra de cima
async function pageCtx(){
  let pt = null;
  try { pt = await App.pageText(state.currentPage); } catch {}
  return { text: pt && pt.text, page: state.currentPage, src: 'conteúdo da página' };
}
// abre o menu da IA ancorado em qualquer botão (barra, menu Estudar ou paleta)
App.aiOpen = anchor => {
  const sel = App.hasSelection() ? getSelection().toString() : '';
  const ctx = sel.trim() ? { text: sel, page: state.currentPage, src: 'trecho' } : pageCtx;
  App.aiMenu(anchor || $('#btnAi'), ctx, { title: sel.trim() ? 'Trecho selecionado' : `Página ${state.currentPage}`, alignRight: true });
};
// pergunta direta (paleta Ctrl+K): usa a seleção ou a página atual
App.aiAsk = async q => { const sel = App.hasSelection() ? getSelection().toString() : ''; ask(q, sel.trim() ? { text: sel, page: state.currentPage, src: 'trecho' } : await pageCtx()); };
// ---------- Editor dos atalhos ----------
App.openAiPrompts = () => {
  const dlg = App.dialog('aiPromptsDlg', 'pomoDlg aiPromptsDlg'); dlg.setAttribute('aria-label', 'Atalhos da IA');
  let list = prompts().map(p => ({ ...p }));
  const save = () => savePrompts(list);
  const build = () => {
    dlg.innerHTML = '';
    const head = el('div', 'helpHead');
    head.append(el('h2', null, 'IA: pedidos e atalhos'), App.ibtn('x', null, () => dlg.close(), 'sm', 'Fechar (Esc)'));
    const body = el('div', 'pomoBody');
    // como o pedido começa
    const start = el('div', 'aiStart');
    start.append(el('h3', 'statH', 'Como o pedido começa'));
    const it = el('textarea', 'aiPromptText aiIntro'); it.rows = 2; it.value = intro(); it.maxLength = 400;
    it.placeholder = 'Opcional. Ex.: "Sou estudante de medicina." ou "Sou professora de história e preparo aulas para o ensino médio."';
    it.oninput = () => ls.set('le.aiIntro', it.value); it.onkeydown = e => e.stopPropagation();
    const chk = (label, sub, get, set) => { const w = el('label', 'mdOpt'); const c = el('input'); c.type = 'checkbox'; c.checked = get(); c.onchange = () => set(c.checked); w.append(c, el('span', null, label)); if (sub) w.append(el('small', 'muted', sub)); return w; };
    start.append(it,
      chk('Dizer o nome do PDF e a página', 'ex.: Material: "Harrison", capítulo 12, página 40', docInfoOn, v => ls.set('le.aiDocInfo', v)),
      chk('Mandar contexto junto', 'texto em volta do trecho, suas notas da página e o significado das siglas', ctxOn, v => ls.set('le.aiContext', v)));
    body.append(start, el('h3', 'statH', 'Atalhos'));
    body.append(el('p', 'muted small', 'Cada atalho aparece no menu da IA. Escreva o pedido do seu jeito; {fonte} vira "trecho", "grifo", "capítulo"… O texto escolhido vai junto, no fim. Para mandar só o texto, use "Mandar só o texto" no menu da IA.'));
    list.forEach((p, i) => {
      const card = el('div', 'aiPromptCard');
      const top = el('div', 'aiPromptTop');
      const name = el('input', 'pomoName'); name.value = p.label; name.maxLength = 40; name.placeholder = 'Nome do atalho';
      name.oninput = () => { p.label = name.value; save(); };
      const up = App.ibtn('up', null, () => { if (i) { [list[i - 1], list[i]] = [list[i], list[i - 1]]; save(); build(); } }, 'sm', 'Subir');
      up.disabled = !i;
      const del = App.ibtn('trash', null, () => { list.splice(i, 1); save(); build(); }, 'sm', 'Apagar atalho');
      del.disabled = list.length === 1;
      top.append(name, up, del);
      const ta = el('textarea', 'aiPromptText'); ta.value = p.text; ta.rows = 3;
      ta.oninput = () => { p.text = ta.value; save(); };
      [name, ta].forEach(x => { x.onkeydown = e => e.stopPropagation(); });
      card.append(top, ta);
      body.append(card);
    });
    body.append(App.ibtn('plus', 'Novo atalho', () => {
      list.push({ id: App.uid(), label: 'Meu atalho', icon: 'sparkle', text: 'Sobre o {fonte} abaixo, ' });
      save(); build();
      const t = dlg.querySelectorAll('.aiPromptText'); const last = t[t.length - 1]; last.focus(); last.setSelectionRange(last.value.length, last.value.length);
    }, 'outline sm'));
    const foot = el('div', 'lookFoot');
    foot.append(App.btn('Restaurar padrão', () => { list = DEFAULT_PROMPTS.map(p => ({ ...p })); ls.set('le.aiPrompts', null); ls.set('le.aiIntro', ''); ls.set('le.aiDocInfo', true); ls.set('le.aiContext', true); build(); }, 'sm outline'), App.btn('Pronto', () => dlg.close(), 'primary'));
    dlg.append(head, body, foot);
  };
  // ao fechar, atalhos sem nome ou sem texto saem da lista
  dlg.onclose = () => { const ok = list.filter(p => p.label.trim() && p.text.trim()); if (ok.length !== list.length) savePrompts(ok.length ? ok : DEFAULT_PROMPTS); };
  build();
  if (!dlg.open) dlg.showModal();
};
const btn = $('#btnAi');
btn.onmousedown = e => e.preventDefault(); // não desfaz a seleção
btn.onclick = () => {
  const sel = App.hasSelection() ? getSelection().toString() : '';
  const ctx = sel.trim() ? { text: sel, page: state.currentPage, src: 'trecho' } : pageCtx;
  App.aiMenu(btn, ctx, { title: sel.trim() ? 'Trecho selecionado' : `Página ${state.currentPage}`, alignRight: true });
};
})();
