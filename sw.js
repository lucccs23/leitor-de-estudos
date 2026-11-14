/* Vetra — funcionamento offline.
   Guarda todos os arquivos do app no aparelho na instalação; depois tudo abre sem internet.
   Ao publicar uma versão nova, mude VERSION: os aparelhos baixam os arquivos novos e o app avisa. */
const VERSION = '1.18.0';
const CACHE = 'leitor-' + VERSION;
const FILES = [
  './', './index.html', './app.css', './manifest.webmanifest', './icone.png',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-192.png', './icons/icon-maskable-512.png',
  './lib/pdf.min.js', './lib/pdf.worker.embed.js', './lib/pdf-lib.min.js',
  './js/core.js', './js/epub.js', './js/dock.js', './js/sidebar.js', './js/search.js', './js/review.js', './js/export.js', './js/stats.js',
  './js/tabs.js', './js/home.js', './js/ocr.js', './js/tools.js', './js/gabarito.js', './js/exam.js', './js/library.js',
  './js/today.js', './js/summary.js', './js/split.js', './js/tts.js', './js/focus.js', './js/look.js', './js/file.js',
  './js/ai.js', './js/airespostas.js', './js/toolbar.js', './js/palette.js', './js/news.js', './js/estatisticas.js', './js/plan.js', './js/siglas.js', './js/links.js', './js/sync.js', './js/touch.js', './js/main.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))));
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('leitor-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
// a página pede para trocar já para a versão nova (botão "Atualizar")
self.addEventListener('message', e => { if (e.data === 'atualizar') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (url.origin !== location.origin) return; // sites externos (IA etc.) seguem direto
  // "Compartilhar → Vetra" no Android: guarda o PDF e abre o app
  if (req.method === 'POST' && url.pathname.endsWith('/compartilhar')) {
    e.respondWith((async () => {
      const form = await req.formData();
      const box = await caches.open('leitor-compartilhados');
      let i = 0;
      for (const f of form.getAll('pdf')) {
        if (!f || typeof f === 'string') continue;
        await box.put(`./compartilhado/${Date.now()}-${i++}`, new Response(f, { headers: { 'Content-Type': 'application/pdf', 'X-Nome': encodeURIComponent(f.name || 'documento.pdf') } }));
      }
      return Response.redirect('./?compartilhado=1', 303);
    })());
    return;
  }
  if (req.method !== 'GET') return;
  // páginas: sempre o index guardado (funciona offline com qualquer parâmetro na URL)
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('./index.html').then(r => r || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(r => r || fetch(req).then(res => {
    if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  })));
});
