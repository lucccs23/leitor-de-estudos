/* Novidades: ao abrir uma versão nova, mostra o que mudou (uma vez). Também em Configurações → Novidades. */
(() => {
'use strict';
const App = window.App;
const { el, ls } = App;

const NEWS = [
  { v: '1.15.1', title: 'Novo nome: Vetra', items: ['O Leitor de Estudos agora se chama Vetra. Seus PDFs, grifos e backups continuam todos aqui'] },
  { v: '1.15', title: 'Sincronizar, caneta melhor, plano de leitura e mais', items: [
    'Sincronizar aparelhos: computador, tablet e celular com os mesmos grifos, notas e PDFs (Configurações → Sincronizar aparelhos)',
    'Caneta: espessuras, marca-texto à mão e borracha (E). Com caneta stylus, só ela desenha e o dedo rola a página',
    'Plano de leitura (Estudar): "estas páginas até tal dia" vira páginas por dia no cartão Hoje',
    'Siglas: selecione uma sigla para ver o significado; a lista fica em Estudar → Siglas deste PDF',
    'Ligar trechos: no balão do grifo, ligue a outra página ou outro PDF e volte com um toque',
    'Atalhos da IA editáveis, com novos: explicar simples, traduzir e comparar em tabela',
    'Figuras recortadas com a ferramenta Área em resolução maior, com botão para copiar',
    'Resumo em Markdown por capítulo, de um PDF ou de uma disciplina inteira (Obsidian, Notion)',
  ] },
  { v: '1.13', title: 'Barra nova e personalizável', items: [
    'Menus Arquivo, Exibir e Estudar no canto de cima, como nos leitores de PDF',
    'A barra mostra só o que você escolher: Configurações → Personalizar a barra (ou botão direito na barra). Arraste funções para a barra, reordene e tire',
    'Ctrl+K abre a paleta de comandos: digite o nome de qualquer função, um número de página, um PDF ou o que quer buscar',
    '"Marcar página" foi para a barra de página, ao lado do número',
  ] },
  { v: '1.12', title: 'Modos do Focus pelo leitor', items: ['Escolha Pomodoro, pausas, Cronômetro ou seus timers do Focus pelo relógio ou pelo timer flutuante'] },
  { v: '1.11', title: 'Perguntar à IA', items: ['Claude, ChatGPT ou Gemini: explicar, resumir, criar questões e flashcards a partir do trecho, do grifo ou da página'] },
  { v: '1.10', title: 'Arquivo, Salvar e esquemas de foco', items: ['Salvar grava os grifos no próprio PDF; Salvar como, imprimir e propriedades', 'Esquemas de foco configuráveis e nomes próprios para as cores dos grifos'] },
  { v: '1.9', title: 'Aparência e leitura', items: ['Temas, cor de destaque, ajuste da página, duas páginas, página por página e régua de leitura'] },
];

App.openNews = () => {
  const d = App.dialog('newsDlg', 'propsDlg newsDlg');
  d.innerHTML = '';
  const head = el('div', 'helpHead');
  head.append(el('h2', null, `Novidades · v${App.VERSION}`), App.ibtn('x', null, () => d.close(), 'sm', 'Fechar (Esc)'));
  const body = el('div', 'newsBody');
  for (const n of NEWS) {
    const sec = el('section', 'newsSec');
    sec.append(el('h3', null, `${n.title}`), el('span', 'newsV', 'v' + n.v));
    const ul = el('ul'); for (const it of n.items) ul.append(el('li', null, it));
    sec.append(ul); body.append(sec);
  }
  const foot = el('div', 'lookFoot');
  foot.append(App.btn('Personalizar a barra agora', () => { d.close(); App.customizeToolbar(); }, 'sm outline'), App.btn('Entendi', () => d.close(), 'primary'));
  d.append(head, body, foot);
  if (!d.open) d.showModal();
  ls.set('le.seenVersion', App.VERSION);
};

// mostra sozinho uma vez por versão nova (não na primeira vez que o app é aberto)
const seen = ls.get('le.seenVersion', null);
const used = !!localStorage.getItem('le.theme');
if (!seen && !used) ls.set('le.seenVersion', App.VERSION);
else if (seen !== App.VERSION && !new URLSearchParams(location.search).has('semnovidades')) setTimeout(() => { if (!document.querySelector('dialog[open]')) App.openNews(); else ls.set('le.seenVersion', App.VERSION); }, 1200);
})();
