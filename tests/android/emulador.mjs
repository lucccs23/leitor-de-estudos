// O APK do Vetra num Android de verdade (o emulador do GitHub Actions, veja .github/workflows/android.yml).
// Instala o APK, abre o app e manda PDFs pelo "Abrir com" e pelo "Compartilhar", como outro app faria,
// com o Vetra aberto e com ele fechado. O que acontece dentro do app é conferido pelo depurador do WebView (CDP).
// Uso: node tests/android/emulador.mjs <apk>      (precisa do adb e de um aparelho ou emulador ligado)
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { makeFixtures } from '../lib/fixtures.mjs';

const PKG = 'app.vetra.leitor', ACT = `${PKG}/.MainActivity`;
const raiz = fileURLToPath(new URL('../../', import.meta.url));
const out = join(raiz, 'tests', 'out', 'android');
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
const apk = process.argv[2];
if (!apk) { console.error('Uso: node tests/android/emulador.mjs <apk>'); process.exit(2); }
const versao = readFileSync(join(raiz, 'js', 'core.js'), 'utf8').match(/App\.VERSION = '([\d.]+)'/)[1];

const pausa = ms => new Promise(r => setTimeout(r, ms));
const adb = (...a) => execFileSync('adb', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const sh = cmd => adb('shell', cmd);
// espera uma condição (no aparelho tudo demora mais que no PC); devolve o valor ou null no limite
async function ate(f, ms = 30000){ const fim = Date.now() + ms; while (Date.now() < fim) { try { const v = await f(); if (v) return v; } catch {} await pausa(250); } return null; }

const resultados = [];
let passos = [];
function tela(nome){ const f = join(out, `${nome}.png`); writeFileSync(f, execFileSync('adb', ['exec-out', 'screencap', '-p'], { maxBuffer: 64e6 })); return f; }
function check(nome, ok, dados){
  resultados.push({ nome, ok: !!ok });
  console.log(`${ok ? '  ok    ' : '  FALHOU'} [android] ${nome}`);
  if (!ok) {
    console.log(`         passos: ${passos.join(' → ')}`);
    console.log(`         dados:  ${JSON.stringify(dados)?.slice(0, 800)}`);
    try { console.log(`         tela:   ${tela('FALHA-' + nome.replace(/[^\p{L}\d]+/gu, '-').slice(0, 40))}`); } catch {}
  }
  return !!ok;
}
const passo = p => { passos.push(p); if (passos.length > 8) passos.shift(); };

// ---------- depurador do WebView do Vetra ----------
const PRE = `const A=leitor.App,S=leitor.state,$=s=>document.querySelector(s),wait=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(f,ms=8000)=>{const t0=Date.now();while(Date.now()-t0<ms){if(await f())return true;await wait(100);}return false;};`;
let ws = null, porta = 9300;
const erros = [];
async function conectar(){
  if (ws) { try { ws.close(); } catch {} ws = null; }
  const pid = await ate(() => sh(`pidof ${PKG}`).split(/\s+/)[0]);
  if (!pid) throw new Error('o Vetra não está rodando');
  const sock = `webview_devtools_remote_${pid}`;
  if (!await ate(() => sh('cat /proc/net/unix').includes(sock))) throw new Error('o WebView do Vetra não abriu o depurador');
  porta++;
  adb('forward', `tcp:${porta}`, `localabstract:${sock}`);
  const alvo = await ate(async () => (await (await fetch(`http://127.0.0.1:${porta}/json`)).json()).find(t => t.type === 'page' && t.url.startsWith('https://localhost')));
  if (!alvo) throw new Error('não achei a página do Vetra no depurador');
  ws = new WebSocket(alvo.webSocketDebuggerUrl);
  await new Promise((ok, falha) => { ws.addEventListener('open', ok); ws.addEventListener('error', falha); });
  const pend = new Map(); let id = 0;
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') erros.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 400));
  });
  ws.send2 = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await ws.send2('Runtime.enable');
  // guarda os avisos (toasts) que o app mostrar, para a falha dizer o que o app respondeu
  await ev(`window.__avisos = []; new MutationObserver(() => { const t = $('.toast')?.textContent; if (t && __avisos.at(-1) !== t) __avisos.push(t); })
    .observe(document.body, { childList: true, subtree: true, characterData: true }); return 1`);
}
async function ev(code){
  for (let k = 0; k < 150; k++) {
    const r = await ws.send2('Runtime.evaluate', { expression: `(async()=>{${PRE}${code}})()`, awaitPromise: true, returnByValue: true });
    const ex = r.result?.exceptionDetails;
    if (ex) {
      const msg = ex.exception?.description || ex.text;
      if (/leitor is not defined/.test(msg)) { await pausa(200); continue; } // app ainda carregando
      throw new Error(`erro na página: ${msg.slice(0, 500)}`);
    }
    return r.result?.result?.value;
  }
  throw new Error('o app não carregou (leitor não apareceu)');
}
const aberto = nome => ev(`const ok = await until(() => S.pdf && S.name === ${JSON.stringify(nome)} && $('.page .textLayer span'), 30000);
  return { ok, nome: S.name, paginas: S.pdf?.numPages, avisos: window.__avisos };`);

// ---------- PDFs no aparelho, como se tivessem vindo do WhatsApp ou do Drive ----------
// cada um ganha um endereço content:// do Android (o mesmo tipo que os outros apps mandam)
async function pdfNoAparelho(local, nome){
  adb('push', local, `/sdcard/Download/${nome}`);
  const q = `content query --uri content://media/external/file --projection _id --where "_display_name='${nome}'"`;
  let id = await ate(() => (sh(q).match(/_id=(\d+)/) || [])[1], 10000);
  if (!id) { sh(`am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Download/${nome}`); id = await ate(() => (sh(q).match(/_id=(\d+)/) || [])[1]); }
  if (!id) throw new Error(`o Android não registrou ${nome}`);
  return `content://media/external/file/${id}`;
}
const abrirCom = uri => sh(`am start -W -a android.intent.action.VIEW -d '${uri}' -t application/pdf --grant-read-uri-permission -n ${ACT}`);
// "Compartilhar": o anexo vai em EXTRA_STREAM. Um app de verdade (WhatsApp, Drive) dá a permissão de leitura dele
// junto; o "am start" do terminal só dá permissão ao endereço principal. Por isso o arquivo compartilhado vem pelo
// FileProvider do próprio Vetra (o app lê sem precisar de permissão), copiado para o cache dele com run-as.
function pdfNoCacheDoVetra(local, nome){
  adb('push', local, `/data/local/tmp/${nome}`); sh(`chmod 644 /data/local/tmp/${nome}`);
  sh(`run-as ${PKG} sh -c 'mkdir -p cache/compartilhar && cp /data/local/tmp/${nome} cache/compartilhar/${nome}'`);
  return `content://${PKG}.fileprovider/my_cache_images/compartilhar/${nome}`;
}
const compartilhar = uri => sh(`am start -W -a android.intent.action.SEND -t application/pdf --eu android.intent.extra.STREAM '${uri}' --grant-read-uri-permission -n ${ACT}`);
// quem aparece na lista do "Abrir com" / "Compartilhar" para um PDF
const quemAbre = (acao, uri) => sh(acao === 'VIEW'
  ? `cmd package query-activities --brief -a android.intent.action.VIEW -d '${uri}' -t application/pdf`
  : `cmd package query-activities --brief -a android.intent.action.SEND -t application/pdf`);

try {
  const fx = await makeFixtures(join(out, 'fixtures'));
  console.log(`\n▶ android (aparelho: ${sh('getprop ro.product.model')}, Android ${sh('getprop ro.build.version.release')})`);

  passo('instala o APK');
  adb('install', '-r', apk);
  check('o APK instala', sh(`pm list packages ${PKG}`).includes(`package:${PKG}`));
  const info = sh(`dumpsys package ${PKG}`);
  check(`o APK instalado é a versão ${versao}`, info.includes(`versionName=${versao}`), info.match(/versionName=\S+/)?.[0]);

  passo('abre o Vetra pelo ícone');
  sh(`am start -W -n ${ACT}`);
  await conectar();
  let r = await ev(`await until(() => window.pdfjsLib && A.VERSION, 30000);
    return { versao: A.VERSION, nativo: A.native, ouve: !!Capacitor.Plugins.VetraArquivos, dz: $('.dzText span')?.textContent };`);
  tela('1-inicio');
  check('o app abre no modo Android, com o "Abrir com" ligado', r.versao === versao && r.nativo && r.ouve && /Abrir com → Vetra/.test(r.dz), r);

  const uri1 = await pdfNoAparelho(fx.texto, 'Apostila-de-bio.pdf');
  const lista = quemAbre('VIEW', uri1), listaSend = quemAbre('SEND');
  check('o Vetra aparece no "Abrir com" de PDFs', lista.includes(PKG), lista);
  check('o Vetra aparece no "Compartilhar" de PDFs', listaSend.includes(PKG), listaSend);

  passo('"Abrir com" com o Vetra aberto');
  abrirCom(uri1);
  r = await aberto('Apostila-de-bio.pdf');
  tela('2-abrir-com');
  check('"Abrir com → Vetra" abre o PDF (app já aberto)', r.ok && r.paginas === 5, r);

  passo('"Compartilhar" com o Vetra aberto');
  const uri2 = pdfNoCacheDoVetra(fx.texto, 'Resumo-compartilhado.pdf');
  compartilhar(uri2);
  r = await aberto('Resumo-compartilhado.pdf');
  tela('3-compartilhar');
  check('"Compartilhar → Vetra" abre o PDF', r.ok && r.paginas === 5, r);

  passo('"Abrir com" com o Vetra fechado');
  sh(`am force-stop ${PKG}`);
  await ate(() => !sh(`pidof ${PKG} || true`), 10000);
  const uri3 = await pdfNoAparelho(fx.texto, 'Prova-de-quimica.pdf');
  abrirCom(uri3);
  await conectar();
  r = await aberto('Prova-de-quimica.pdf');
  tela('4-abrir-com-fechado');
  check('"Abrir com → Vetra" abre o PDF mesmo com o app fechado', r.ok && r.paginas === 5, r);

  passo('gira a tela');
  await ev(`window.__semRecarregar = 1; return 1`);
  sh('settings put system accelerometer_rotation 0'); sh('settings put system user_rotation 1');
  r = await ev(`const deitou = await until(() => innerWidth > innerHeight, 15000);
    return { deitou, mesmaPagina: window.__semRecarregar === 1, nome: S.name, largura: innerWidth, altura: innerHeight };`);
  tela('5-deitado');
  sh('settings put system user_rotation 0');
  check('girar a tela não recarrega o app nem troca o PDF', r.deitou && r.mesmaPagina && r.nome === 'Prova-de-quimica.pdf', r);

  // ---------- EPUB direto no leitor ----------
  passo('"Abrir com" de um EPUB');
  const uriLivro = await pdfNoAparelho(fx.livro, 'Livro-de-teste.epub');
  const listaE = sh(`cmd package query-activities --brief -a android.intent.action.VIEW -d '${uriLivro}' -t application/epub+zip`);
  check('o Vetra aparece no "Abrir com" de EPUB', listaE.includes(PKG), listaE);
  sh(`am start -W -a android.intent.action.VIEW -d '${uriLivro}' -t application/epub+zip --grant-read-uri-permission -n ${ACT}`);
  r = await ev(`const ok = await until(() => A.bookState() && !A.bookState().carregando && A.bookFrame().contentDocument.querySelector('h1'), 30000); return { ok, st: A.bookState(), pdf: !!S.pdf };`);
  tela('6-livro');
  check('"Abrir com → Vetra" abre o EPUB no leitor de livros (sem converter)', r.ok && r.st.name === 'Livro de Teste' && !r.pdf, r);

  // tela em pé, como no celular
  const [lw, lh] = (sh('wm size').match(/(\d+)x(\d+)/) || []).slice(1).map(Number);
  passo('toca na borda direita');
  await ev(`await until(() => !document.querySelector('#leitor').classList.contains('ui'), 6000); return 1`);
  const antes = await ev('return A.bookState()');
  sh(`input tap ${Math.round(lw * 0.93)} ${Math.round(lh * 0.5)}`);
  r = await ev(`await until(() => { const s = A.bookState(); return !s.carregando && (s.ch > ${antes.ch} || s.pag > ${antes.pag}); }, 8000); return A.bookState();`);
  check('tocar na borda direita vira a página do livro', r.ch > antes.ch || r.pag > antes.pag, { antes, depois: r });
  passo('desliza para a esquerda');
  const meio = await ev('return A.bookState()');
  sh(`input swipe ${Math.round(lw * 0.8)} ${Math.round(lh * 0.5)} ${Math.round(lw * 0.2)} ${Math.round(lh * 0.5)} 200`);
  r = await ev(`await until(() => { const s = A.bookState(); return !s.carregando && (s.ch > ${meio.ch} || s.pag > ${meio.pag}); }, 8000); return A.bookState();`);
  tela('7-livro-virou');
  check('deslizar o dedo vira a página do livro', r.ch > meio.ch || r.pag > meio.pag, { meio, depois: r });

  passo('botão voltar do Android');
  sh('input keyevent 4');
  r = await ev(`const ok = await until(() => !A.bookState(), 6000); return { ok, inicio: !!document.querySelector('#recentList .recent') };`);
  check('o botão voltar do Android fecha o livro e fica no Vetra', r.ok && !!sh(`pidof ${PKG} || true`), r);
  tela('8-voltou');

  check('sem erros de JavaScript no app', !erros.length, erros);
} catch (e) {
  check('o teste no Android rodou até o fim', false, String(e.stack || e));
} finally {
  if (ws) try { ws.close(); } catch {}
}

const ruins = resultados.filter(x => !x.ok);
console.log(`\n${resultados.length - ruins.length} de ${resultados.length} verificações no Android passaram. Telas em ${out}`);
process.exit(ruins.length ? 1 : 0);
