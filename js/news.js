/* Novidades: ao abrir uma versão nova, mostra o que mudou (uma vez). Também em Configurações → Novidades. */
(() => {
'use strict';
const App = window.App;
const { el, ls } = App;

const NEWS = [
  { v: '1.20.3', title: 'Grifo por cima de grifo vira um só', items: ['Grifar de novo um trecho que já tinha grifo (ou um pedaço dele) junta tudo num grifo só, com a cor nova — a parte antiga não fica mais forte', 'No simulado, a alternativa marcada agora deixa a própria letra da prova em azul forte, sem quadrado por cima (nada fica desalinhado)'] },
  { v: '1.20.1', title: 'Trocar a cor da caneta na hora', items: ['Toque de novo na cor escolhida (ou segure) para trocá-la ali mesmo: amostras, espectro, código hex, cores recentes e conta-gotas', 'A caneta tem suas 6 cores próprias, separadas das cores de grifo'] },
  { v: '1.20.0', title: 'Caneta de caderno digital', items: ['Caneta e marca-texto viraram botões próprios, cada um com sua cor e espessura (P e M)', 'Espessura numa barrinha com prévia do traço', 'Borracha: apagar o traço inteiro ou só onde passar (com tamanho ajustável) e "apagar tudo desta página"', 'Laço: contorne traços para arrastar, mudar a cor, duplicar ou apagar', 'Botões de desfazer e refazer (Ctrl+Z e Ctrl+Y)', 'Cores personalizadas: o + na paleta da caneta abre qualquer cor'] },
  { v: '1.19.7', title: 'Começa na página inicial', items: ['O Vetra abre sempre na página inicial, em vez de reabrir o último PDF. Quer voltar ao que estava lendo? Clique nele na lista ou use Ctrl+Shift+T'] },
  { v: '1.19.6', title: 'Painel de grifos só quando você pede', items: ['O painel de grifos não abre mais sozinho nos PDFs: use o botão do painel na barra ou a tecla H', 'Arraste os botões da barra de cima para o lado e solte onde quiser: a nova ordem fica salva'] },
  { v: '1.19.5', title: 'Atualizações ao abrir', items: ['Nova opção em Ajuda → "Procurar sempre ao abrir o Vetra": confere se há versão nova toda vez que o programa abre (sem ela, confere uma vez por dia)', 'Simulado: botão Parar ao lado do pausar — sair e continuar depois, ou cancelar', 'Ao sair, o PDF abre normal para leitura; o botão vira "Continuar simulado" e retoma direto de onde parou'] },
  { v: '1.19.4', title: 'Simulado mais fluido', items: ['Clicar na alternativa marca na hora (antes havia uma pequena espera); o clique duplo continua riscando', 'Dá para ocultar a folha de respostas durante a prova: botão da barra ou tecla F (o Vetra lembra a escolha)', 'A busca na barra ficou só com a lupa: clique nela (ou Ctrl+K) para buscar ou achar qualquer função'] },
  { v: '1.19.3', title: 'Menu Ajuda', items: ['Novo menu Ajuda na barra de cima (como nos programas de PDF): Procurar atualizações, Novidades, Atalhos do teclado e Sobre o Vetra. Quando há versão nova, ele ganha um pontinho', 'No lugar do logo, um botão de Início (casinha) aparece quando um PDF está aberto', 'O cartão de Backup não mostra mais "parado" enquanto o backup ainda está ligando'] },
  { v: '1.19.2', title: 'Marcação como no papel', items: ['No simulado, a alternativa marcada ganha um círculo azul-caneta em volta da letra e a riscada um traço de lápis — sem cores de certo/errado até você corrigir', 'Clique duplo (ou dois toques) na alternativa risca; o botão direito continua riscando também'] },
  { v: '1.19.1', title: 'Atualizações no Vetra para Windows', items: ['Configurações → Procurar atualizações: o Vetra instalado baixa a versão nova e reabre, sem reinstalar. Ele também confere sozinho uma vez por dia', 'Simulado no celular: a folha de respostas abre pelo placar na barra (ex.: 12/100), e a prova fica livre para tocar nas alternativas'] },
  { v: '1.19', title: 'Simulado melhor', items: [
    'Responda clicando na alternativa da própria prova; o botão direito risca a alternativa, como no papel',
    'Ritmo na folha: adiantado ou atrasado em relação à meta por questão, e o tempo da questão atual',
    'Marque "~" quando responder no chute (tecla Z) e filtre a folha por em branco, dúvida ou chute antes de entregar',
    'No resultado: acertos por área (o Vetra acha as áreas pelos títulos da prova ou divide em 5), tempo de cada questão, certeza x chute e sua evolução entre os simulados',
  ] },
  { v: '1.18', title: 'Livros EPUB', items: ['No Vetra para Windows, abra livros .epub: o livro vira um PDF de tamanho de livro (A5), com capítulos, imagens e sumário, e todas as funções valem nele', 'Abrir o mesmo EPUB de novo reaproveita a conversão: os grifos continuam no lugar. Com a sincronização, o livro chega ao celular e ao tablet'] },
  { v: '1.17.1', title: 'Tamanho da página à mão', items: ['Na barra de página, o botão de tamanho mostra o ajuste atual e abre o menu: à largura (Ctrl+0), página inteira (Ctrl+9), tamanho real 100% (Ctrl+1), modos de leitura e tela cheia', 'Vetra para Windows: instalador próprio, com atalho, ícone e "Abrir com" para PDFs'] },
  { v: '1.17', title: 'IA mais esperta', items: [
    'O pedido leva contexto: o capítulo, o texto em volta do trecho, suas notas da página e o significado das siglas (dá para desligar no menu da IA)',
    'Pergunte sobre o capítulo inteiro ou sobre um conjunto dos seus grifos (todos, por cor, do capítulo ou só os com nota)',
    'Guarde a resposta: copie no Claude/ChatGPT/Gemini e toque em "Guardar resposta". Ela vira nota do grifo ou da página e fica em "Respostas guardadas"',
    'Pedidos do seu jeito: em "IA: pedidos e atalhos" você escreve como o pedido começa (ou deixa em branco) e escolhe o que vai junto. "Mandar só o texto" envia só o que está selecionado',
  ] },
  { v: '1.16', title: 'Timer próprio, em qualquer aparelho', items: [
    'O Vetra tem o próprio timer: seus esquemas de pomodoro e um cronômetro, também no celular e no tablet',
    'Timer flutuante na página sempre que o timer estiver ligado (arraste para onde quiser)',
    'Estatísticas (Estudar → Estatísticas, ou em "Sua semana"): tempo lendo e de foco por dia, por disciplina e por PDF, seu melhor horário e as sessões do timer de todos os aparelhos',
    'O Focus agora é independente. Quando quiser, ligue "Mandar o tempo para o Focus" nas Estatísticas, no computador: vai tudo, inclusive o que você fez no celular',
  ] },
  { v: '1.15.2', title: 'IA no seu navegador', items: ['No computador, "Perguntar à IA" abre o Claude, o ChatGPT ou o Gemini no Google Chrome (onde você já está logado), e não mais na janela do app', 'Ícone novo do Vetra, em alta resolução'] },
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
