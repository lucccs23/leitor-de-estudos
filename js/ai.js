/* Perguntar à IA (Claude, ChatGPT ou Gemini) sobre um trecho, um grifo, uma questão ou a página.
   O leitor monta o pedido (com o nome do PDF e a página), copia e abre o site escolhido no navegador.
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
function cut(s){ s = clean(s); return s.length > MAX_TEXT ? s.slice(0, MAX_TEXT) + ' […] (trecho cortado)' : s; }
function header(ctx){
  const doc = state.name ? `"${App.baseName(state.name)}"` : 'um PDF';
  return `Sou estudante de medicina e estou estudando pelo material ${doc}${ctx.page ? `, página ${ctx.page}` : ''}.`;
}
const block = (label, text) => `${label}:\n"""\n${text}\n"""`;
// Atalhos (editáveis em "Atalhos da IA…"): cada um é uma instrução; {fonte} vira "trecho", "grifo", "figura"…
const DEFAULT_PROMPTS = [
  { id: 'explain', label: 'Explicar', icon: 'sparkle', text: 'Explique de forma clara e didática o {fonte} abaixo: o que significa, por que é importante e como aparece na prática clínica. Defina os termos técnicos e dê um exemplo.' },
  { id: 'simple', label: 'Explicar de um jeito simples', icon: 'sparkle', text: 'Explique o {fonte} abaixo de um jeito bem simples, como para alguém do primeiro ano, com uma analogia do dia a dia. Depois diga em uma frase o que eu preciso lembrar.' },
  { id: 'summary', label: 'Resumir para revisão', icon: 'list', text: 'Faça um resumo em tópicos curtos do {fonte} abaixo, para revisão rápida, destacando o que mais costuma cair em prova.' },
  { id: 'questions', label: 'Criar questões de prova', icon: 'exam', text: 'Crie 3 questões de múltipla escolha (A a E), no estilo de prova de residência médica, sobre o {fonte} abaixo. Coloque o gabarito comentado só no final, depois de todas as questões.' },
  { id: 'translate', label: 'Traduzir para o português', icon: 'swap', text: 'Traduza o {fonte} abaixo para o português do Brasil, mantendo os termos médicos corretos (com o termo em inglês entre parênteses na primeira vez).' },
  { id: 'compare', label: 'Comparar em tabela', icon: 'columns', text: 'Monte uma tabela comparando as doenças, drogas ou conceitos do {fonte} abaixo (quadro clínico, diagnóstico, tratamento e diferenças-chave). Se houver um só tema, compare com os principais diagnósticos diferenciais.' },
  { id: 'cards', label: 'Criar flashcards', icon: 'cards', text: 'Crie de 5 a 8 flashcards sobre o {fonte} abaixo, no formato "Pergunta :: Resposta", um por linha, com respostas curtas e objetivas.' },
];
const prompts = () => { const p = ls.get('le.aiPrompts', null); return Array.isArray(p) && p.length ? p : DEFAULT_PROMPTS; };
const savePrompts = p => ls.set('le.aiPrompts', p);
App.aiPrompts = prompts;
const buildPrompt = (p, c, src) => `${header(c)} ${p.text.replace(/\{fonte\}/g, src)}`;

// envia: copia o pedido (ou a imagem) e abre o site
async function send(prompt, opts = {}){
  const id = provider(), P = PROVIDERS[id];
  let copied = false;
  try {
    if (opts.image) await navigator.clipboard.write([new ClipboardItem({ 'image/png': await toPng(opts.image) })]);
    else await navigator.clipboard.writeText(prompt);
    copied = true;
  } catch (e) { console.warn('área de transferência', e); }
  const viaLink = P.prefill && encodeURIComponent(prompt).length <= MAX_URL;
  window.open(P.url(viaLink ? prompt : ''), '_blank', 'noopener');
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
function run(p, ctx){
  if (!ctx.text && !ctx.image) { App.toast('Não há texto aqui para mandar (página escaneada? use o OCR em Ferramentas).'); return; }
  let prompt = buildPrompt(p, ctx, ctx.src);
  if (ctx.text) prompt += '\n\n' + block(cap(ctx.src), cut(ctx.text));
  else prompt += `\n\n(O ${ctx.src} é uma figura: vou colar a imagem.)`;
  if (ctx.note) prompt += `\n\nMinha anotação sobre ele: ${clean(ctx.note)}`;
  send(prompt, { image: !ctx.text ? ctx.image : null });
}
function ask(question, ctx){
  let prompt = `${header(ctx)} Minha dúvida: ${question.trim()}\n\nResponda com base no ${ctx.src} abaixo e no conhecimento médico atual, deixando claro o que vem de fora do texto.`;
  if (ctx.text) prompt += '\n\n' + block(cap(ctx.src), cut(ctx.text));
  else if (ctx.image) prompt += `\n\n(O ${ctx.src} é uma figura: vou colar a imagem.)`;
  send(prompt, { image: !ctx.text ? ctx.image : null });
}
// questão errada do simulado (cartão de revisão)
function explainQuestion(h){
  const q = h.q;
  let prompt = `${header({ page: App.anchorOf(h).page })} Explique a resolução desta questão. O gabarito é ${q.key}; ${q.ans ? `eu marquei ${q.ans}` : 'deixei em branco'}. Mostre o raciocínio, por que cada alternativa está certa ou errada e qual é a pista principal do enunciado.`;
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
  items.push({ sep: true });
  items.push({ label: 'Editar atalhos…', icon: 'edit', on: () => App.openAiPrompts() });
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
    head.append(el('h2', null, 'Atalhos da IA'), App.ibtn('x', null, () => dlg.close(), 'sm', 'Fechar (Esc)'));
    const body = el('div', 'pomoBody');
    body.append(el('p', 'muted small', 'Cada atalho aparece no menu da IA. Escreva o pedido do seu jeito; {fonte} vira "trecho", "grifo" ou "conteúdo da página". O texto escolhido vai junto, no fim.'));
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
    foot.append(App.btn('Restaurar padrão', () => { list = DEFAULT_PROMPTS.map(p => ({ ...p })); ls.set('le.aiPrompts', null); build(); }, 'sm outline'), App.btn('Pronto', () => dlg.close(), 'primary'));
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
