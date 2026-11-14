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
const ACTIONS = {
  explain: {
    label: 'Explicar', icon: 'sparkle',
    build: (c, src) => `${header(c)} Explique de forma clara e didática o ${src} abaixo: o que significa, por que é importante e como aparece na prática clínica. Defina os termos técnicos e dê um exemplo.`,
  },
  summary: {
    label: 'Resumir para revisão', icon: 'list',
    build: (c, src) => `${header(c)} Faça um resumo em tópicos curtos do ${src} abaixo, para revisão rápida, destacando o que mais costuma cair em prova.`,
  },
  questions: {
    label: 'Criar questões de prova', icon: 'exam',
    build: (c, src) => `${header(c)} Crie 3 questões de múltipla escolha (A a E), no estilo de prova de residência médica, sobre o ${src} abaixo. Coloque o gabarito comentado só no final, depois de todas as questões.`,
  },
  cards: {
    label: 'Criar flashcards', icon: 'cards',
    build: (c, src) => `${header(c)} Crie de 5 a 8 flashcards sobre o ${src} abaixo, no formato "Pergunta :: Resposta", um por linha, com respostas curtas e objetivas.`,
  },
};

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
function run(action, ctx){
  if (!ctx.text && !ctx.image) { App.toast('Não há texto aqui para mandar (página escaneada? use o OCR em Ferramentas).'); return; }
  const a = ACTIONS[action];
  let prompt = a.build(ctx, ctx.src);
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
  for (const [k, a] of Object.entries(ACTIONS)) items.push({ label: a.label, icon: a.icon, on: async () => run(k, await getCtx()) });
  items.push({ input: true, placeholder: 'Ou escreva sua pergunta…', onEnter: async v => ask(v, await getCtx()) });
  items.push({ sep: true });
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
const btn = $('#btnAi');
btn.onmousedown = e => e.preventDefault(); // não desfaz a seleção
btn.onclick = () => {
  const sel = App.hasSelection() ? getSelection().toString() : '';
  const ctx = sel.trim() ? { text: sel, page: state.currentPage, src: 'trecho' } : pageCtx;
  App.aiMenu(btn, ctx, { title: sel.trim() ? 'Trecho selecionado' : `Página ${state.currentPage}`, alignRight: true });
};
})();
