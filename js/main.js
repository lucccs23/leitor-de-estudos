/* Inicialização: tema, painéis, worker do PDF.js e abertura inicial (arquivo vindo do Explorer ou abas salvas). */
(async () => {
'use strict';
const App = window.App;
const { ls, state } = App;

App.setKeepImages(ls.get('le.keepImages', true));
App.applyTheme(ls.get('le.theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
// em telas estreitas os painéis ficam por cima da página: começam fechados
// o painel de grifos começa fechado: abre só quando você pede (botão do painel ou H)
App.initSidebar();
App.buildPalette(); App.buildLegend();
App.setTool('text'); App.setStyle(state.style);
App.setAutoHL(ls.get('le.autoHL', false));
App.initDock();

if (window.pdfjsLib) {
  // Tudo local: o worker vem embutido e roda a partir de um Blob (funciona abrindo o arquivo direto do disco).
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
  try {
    const url = URL.createObjectURL(new Blob([window.__PDF_WORKER_CODE], { type: 'text/javascript' }));
    pdfjsLib.GlobalWorkerOptions.workerPort = new Worker(url);
  } catch (e) { console.warn('Worker indisponível, usando modo sem worker', e); }
} else App.showLibError();

// botões só com ícone: nome legível para leitores de tela (a partir da dica, sem o atalho entre parênteses)
document.querySelectorAll('button[title]:not([aria-label])').forEach(b => {
  if (!b.textContent.trim()) b.setAttribute('aria-label', b.title.split(' — ')[0].replace(/\s*\(.*?\)\s*/g, ' ').trim());
});

// Senha interna do serviço local de backup: vem do lançador na URL e fica guardada
// (assim funciona também ao abrir por um ícone fixado na barra de tarefas).
const params = new URLSearchParams(location.search);
const bk = params.get('bk');
if (bk && /^[a-f0-9]{32,128}$/i.test(bk)) ls.set('le.bkToken', bk);
// porta do serviço local (o app instalado usa a sua, separada da versão de testes)
const svc = +params.get('svc');
if (svc >= 1024 && svc < 65536) ls.set('le.svcPort', svc);
if (bk && !params.get('abrir')) history.replaceState(null, '', location.pathname);

// versão (canto inferior direito da tela inicial e rodapé do menu ⋯)
document.getElementById('appVersion').textContent = `Vetra v${App.VERSION}`;
document.getElementById('menuVersion').textContent = `Vetra v${App.VERSION} · atualizado em ${App.VERSION_DATE}`;

App.initBackup();
App.renderHome();

// Arquivo aberto pelo Explorer ("Abrir com" → Leitor de Estudos): o lançador grava inbox/<id>.js
const inbox = params.get('abrir');
if (inbox && /^[\w-]{6,64}$/.test(inbox)) {
  history.replaceState(null, '', location.pathname);
  const s = document.createElement('script');
  s.src = 'inbox/' + inbox + '.js';
  s.onload = async () => {
    const items = window.__LEITOR_INBOX || [];
    window.__LEITOR_INBOX = [];
    for (const it of items) {
      const bin = atob(it.b64), u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      await App.loadDoc(u.buffer, it.name || 'documento.pdf');
    }
    if (!items.length) App.restoreTabs();
  };
  s.onerror = () => { App.toast('Não consegui abrir o arquivo enviado.'); App.restoreTabs(); };
  document.body.append(s);
} else {
  App.restoreTabs();
}

// App instalado (Windows): PDFs abertos pelo "Abrir com" / arrastados para o ícone chegam por aqui
if (window.vetraDesktop) {
  document.documentElement.classList.add('desktop-app');
  window.vetraDesktop.onOpenFile(async f => {
    try {
      const buf = f.data.buffer.slice(f.data.byteOffset, f.data.byteOffset + f.data.byteLength);
      if (App.isEpub(f.name || '')) await App.openEpub(buf, f.name); else await App.loadDoc(buf, f.name || 'documento.pdf');
    }
    catch (e) { console.warn(e); App.toast('Não consegui abrir o arquivo.'); }
  });
  window.vetraDesktop.ready();
}

// gancho para testes automatizados
window.leitor = { App, state, openData: (buf, name) => App.loadDoc(buf, name) };
})();
