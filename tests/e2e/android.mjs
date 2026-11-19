// O Vetra dentro do APK de Android (Capacitor), simulado no navegador: o Capacitor e os plugins nativos são falsos
// e só anotam o que o app pediu. Cobre o código do app que só roda no Android (o aparelho de verdade fica com
// tests/android/emulador.mjs, que roda num emulador no GitHub).
import { readFileSync } from 'node:fs';

// o que o Capacitor põe na página antes do app
const CAPACITOR = `window.__nativo = { escritos: [], compartilhados: [], buscas: [], lidos: [], ouvintes: {} };
window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android',
  convertFileSrc: p => 'https://localhost/_capacitor_file_' + p.replace('file://', ''),
  Plugins: {
    Filesystem: { writeFile: async o => { __nativo.escritos.push({ path: o.path, dir: o.directory, n: o.data.length }); return { uri: 'file:///cache/' + o.path }; } },
    Share: { share: async o => { __nativo.compartilhados.push(o); return {}; } },
    VetraArquivos: { addListener: (ev, cb) => { (__nativo.ouvintes[ev] = __nativo.ouvintes[ev] || []).push(cb); return { remove(){} }; } } } };
const f0 = window.fetch;
window.fetch = (u, o) => {
  u = String(u);
  if (u.includes('github.io/leitor-de-estudos/sw.js')) { __nativo.buscas.push(u); return Promise.resolve(new Response("const VERSION = '9.9.9';")); }
  if (u.includes('_capacitor_file_')) { __nativo.lidos.push(u); return Promise.resolve(window.__pdf ? new Response(window.__pdf) : new Response('', { status: 404 })); }
  return f0(u, o);
};`;

export default async ({ launch, fixtures }) => {
  const t = await launch({ width: 820, init: CAPACITOR });

  let r = await t.ev(`const ok = await until(() => (__nativo.ouvintes.arquivo || []).length, 5000);
    return { ok, n: (__nativo.ouvintes.arquivo || []).length, texto: $('.dzText span')?.textContent };`);
  await t.check('ouve o "Abrir com" desde a abertura e explica na tela inicial', r.ok && r.n === 1 && /Abrir com → Vetra/.test(r.texto), r);

  // o plugin nativo copia o arquivo para o cache do app e manda o caminho
  const b64 = readFileSync(fixtures.texto).toString('base64');
  t.step('chega um PDF pelo "Abrir com"');
  r = await t.ev(`const bin = atob(${JSON.stringify(b64)}), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); window.__pdf = u;
    (__nativo.ouvintes.arquivo || []).forEach(f => f({ path: '/data/user/0/app.vetra.leitor/cache/abertos/123-Apostila de bio.pdf', name: 'Apostila de bio.pdf' }));
    const ok = await until(() => S.pdf && $('.page .textLayer span'), 15000); return { ok, nome: S.name, paginas: S.pdf?.numPages, lido: __nativo.lidos[0] };`);
  await t.check('PDF vindo de outro app abre no Vetra com o nome certo', r.ok && /Apostila de bio/.test(r.nome) && r.paginas === 5
    && /_capacitor_file_\/data\/user\/0\/app\.vetra\.leitor\/cache\/abertos\//.test(r.lido), r);

  r = await t.ev(`(__nativo.ouvintes.arquivo || []).forEach(f => f({ erro: 'sem permissão' }));
    const ok = await until(() => /Não consegui abrir o arquivo: sem permissão/.test(document.body.innerText), 3000); return { ok, nome: S.name };`);
  await t.check('erro ao receber o arquivo vira aviso, sem fechar o PDF aberto', r.ok && /Apostila de bio/.test(r.nome), r);

  r = await t.ev(`return { nativo: A.native, web: A.isWeb, classe: document.documentElement.classList.contains('native'), sw: !!(await navigator.serviceWorker.getRegistration()) };`);
  await t.check('modo app: sem ponte do Windows e sem service worker', r.nativo && r.web && r.classe && !r.sw, r);

  t.step('salva um arquivo');
  r = await t.ev(`A.download(new Uint8Array([37, 80, 68, 70, 45]), 'Meu: resumo?.pdf', 'application/pdf');
    await until(() => __nativo.compartilhados.length); return { e: __nativo.escritos, c: __nativo.compartilhados };`);
  await t.check('salvar arquivo vai para o "Compartilhar" do Android', r.e[0]?.path === 'Meu- resumo-.pdf' && r.e[0]?.dir === 'CACHE'
    && r.c[0]?.files?.[0] === 'file:///cache/Meu- resumo-.pdf', r);

  t.step('procura atualização');
  r = await t.ev(`const x = await A.checkUpdates(true); await until(() => $('#updateBar'));
    return { x, barra: $('#updateBar')?.textContent, buscou: __nativo.buscas.length };`);
  await t.check('versão nova no site: aviso com "Baixar o APK novo"', r.x?.temNova && /9\.9\.9/.test(r.barra) && /Baixar o APK novo/.test(r.barra) && r.buscou >= 1, r);

  // EPUB vindo de outro app: abre no leitor de livros (sem converter)
  const livro = readFileSync(fixtures.livro).toString('base64');
  t.step('chega um EPUB pelo "Abrir com"');
  r = await t.ev(`const bin = atob(${JSON.stringify(livro)}), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); window.__pdf = u;
    (__nativo.ouvintes.arquivo || []).forEach(f => f({ path: '/data/user/0/app.vetra.leitor/cache/abertos/9-Livro.epub', name: 'Livro.epub' }));
    const ok = await until(() => A.bookState() && A.bookFrame().contentDocument.querySelector('h1'), 15000);
    return { ok, st: A.bookState(), pdf: !!S.pdf };`);
  await t.check('EPUB vindo de outro app abre no leitor de livros', r.ok && r.st && r.st.name === 'Livro de Teste' && !r.pdf, r);

  await t.close();
};
