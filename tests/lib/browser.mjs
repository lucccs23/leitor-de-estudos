// Abre Edge/Chrome sem janela, com um perfil novo a cada vez (nada de estado de um teste vazando para outro),
// e conversa com ele pelo protocolo de depuração (CDP). Cada falha sai com o passo a passo e uma captura de tela.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export function findBrowser(){
  if (process.env.VETRA_BROWSER) return process.env.VETRA_BROWSER;
  const win = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'];
  const mac = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'];
  for (const p of process.platform === 'win32' ? win : mac) if (existsSync(p)) return p;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) {
    try { return execFileSync('which', [name], { encoding: 'utf8' }).trim(); } catch {}
  }
  throw new Error('Não achei Edge nem Chrome. Defina VETRA_BROWSER com o caminho do navegador.');
}

// prelúdio de cada trecho executado na página
const PRE = `const A=leitor.App,S=leitor.state,$=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],wait=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(f,ms=8000)=>{const t0=Date.now();while(Date.now()-t0<ms){if(await f())return true;await wait(50);}return false;};
const btnT=(root,t)=>[...(root||document).querySelectorAll('button')].find(b=>b.textContent.trim().startsWith(t));`;

export async function launch(ctx, { width = 1300, height = 900, init = '' } = {}){
  const mobile = width < 700, tag = `${ctx.suite}@${width}`;
  const profile = mkdtempSync(join(tmpdir(), 'vetra-teste-'));
  const args = ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--disable-extensions', 'about:blank'];
  if (process.platform === 'linux') args.unshift('--no-sandbox');
  const proc = spawn(findBrowser(), args, { stdio: ['ignore', 'ignore', 'pipe'] });
  // a primeira abertura numa máquina fria ou ocupada pode demorar: espera a porta aparecer,
  // e só desiste se o navegador morrer ou se passar do limite (com o motivo na mensagem)
  let morreu = '', stderr = '';
  proc.stderr.on('data', d => { stderr = (stderr + d).slice(-500); });
  proc.on('exit', (code, sinal) => { morreu = `o navegador saiu (${code ?? sinal})`; });
  proc.on('error', e => { morreu = e.message; });
  const limite = Date.now() + 60000;
  const falhou = o => { try { proc.kill('SIGKILL'); } catch {} return new Error(`${o} (${morreu || 'sem resposta em 60 s'}). ${stderr.trim()}`); };
  let port = 0;
  while (!port && !morreu && Date.now() < limite) { try { port = +readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch {} if (!port) await sleep(50); }
  if (!port) throw falhou('O navegador não abriu a porta de depuração');
  let target;
  while (!target && !morreu && Date.now() < limite) { try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch {} if (!target) await sleep(50); }
  if (!target) throw falhou('O navegador não mostrou a página inicial');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, bad) => { ws.addEventListener('open', ok); ws.addEventListener('error', bad); });
  let id = 0; const pend = new Map(), errors = [], steps = [];
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 400));
  });
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

  const page = {
    width, errors,
    send,
    step(label){ steps.push(label); if (steps.length > 8) steps.shift(); },
    // roda código na página (async; use "return" para devolver um valor)
    async ev(code){
      for (let k = 0; k < 100; k++) {
        const r = await send('Runtime.evaluate', { expression: `(async()=>{${PRE}${code}})()`, awaitPromise: true, returnByValue: true, userGesture: true });
        const ex = r.result?.exceptionDetails;
        if (ex) {
          const msg = ex.exception?.description || ex.text;
          if (/leitor is not defined/.test(msg)) { await sleep(100); continue; } // app ainda carregando
          throw new Error(`erro na página: ${msg.slice(0, 500)}`);
        }
        return r.result?.result?.value;
      }
      throw new Error('o app não carregou (leitor não apareceu)');
    },
    async goto(){ page.step('abre o app'); await send('Page.navigate', { url: ctx.url }); await page.ev(`await until(() => window.pdfjsLib && A && A.VERSION, 15000); return 1`); },
    async reload(){ page.step('recarrega'); await send('Page.reload', { ignoreCache: true }); await sleep(300); await page.ev(`await until(() => window.pdfjsLib && A && A.VERSION, 15000); return 1`); },
    async open(file, name){
      page.step(`abre ${name}`);
      const b64 = readFileSync(file).toString('base64');
      return page.ev(`const bin=atob(${JSON.stringify(b64)});const u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
        await leitor.openData(u.buffer, ${JSON.stringify(name)}); await until(() => S.pdf && $('.page .textLayer span'), 15000); return true;`);
    },
    async shot(name){
      const s = await send('Page.captureScreenshot', { format: 'png' });
      const f = join(ctx.outDir, `${ctx.suite}-${width}-${name}.png`);
      writeFileSync(f, Buffer.from(s.result.data, 'base64'));
      return f;
    },
    async mouse(type, x, y, { button = 'left', buttons, clickCount = 1 } = {}){
      return send('Input.dispatchMouseEvent', { type, x, y, button, buttons: buttons ?? (type === 'mouseReleased' || type === 'mouseMoved' ? 0 : button === 'right' ? 2 : 1), clickCount, pointerType: 'mouse' });
    },
    async click(x, y, button = 'left'){
      await page.mouse('mouseMoved', x, y); await page.mouse('mousePressed', x, y, { button }); await page.mouse('mouseReleased', x, y, { button });
    },
    // arraste com o botão apertado (traço de caneta, laço, arrastar barra)
    async stroke(pts){
      await page.mouse('mouseMoved', ...pts[0]); await page.mouse('mousePressed', ...pts[0]);
      for (const p of pts.slice(1)) await page.mouse('mouseMoved', p[0], p[1], { buttons: 1 });
      await page.mouse('mouseReleased', ...pts[pts.length - 1]);
    },
    async check(name, ok, info){
      const res = { suite: ctx.suite, width, name, ok: !!ok, info, steps: steps.slice() };
      if (!ok) { try { res.shot = await page.shot('FALHA-' + name.replace(/[^\p{L}\d]+/gu, '-').slice(0, 40)); } catch {} }
      ctx.results.push(res);
      console.log(`${ok ? '  ok    ' : '  FALHOU'} [${tag}] ${name}`);
      if (!ok) {
        console.log(`         passos: ${res.steps.join(' → ')}`);
        console.log(`         dados:  ${JSON.stringify(info)?.slice(0, 600)}`);
        if (res.shot) console.log(`         tela:   ${res.shot}`);
      }
      return !!ok;
    },
    async close(){
      if (errors.length) await page.check('sem erros de JavaScript', false, errors);
      try { ws.close(); } catch {}
      if (process.platform === 'win32') { try { execFileSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {} }
      else proc.kill('SIGKILL');
      for (let i = 0; i < 20; i++) { try { rmSync(profile, { recursive: true, force: true }); break; } catch { await sleep(100); } }
    },
  };
  // init: código que roda antes do app em toda carga (ex.: simular a ponte do app de Windows)
  if (init) await send('Page.addScriptToEvaluateOnNewDocument', { source: init });
  await page.goto();
  return page;
}

export const line = (x0, y0, x1, y1, n = 20) => Array.from({ length: n + 1 }, (_, i) => [x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n]);
export const circle = (cx, cy, r, n = 30) => Array.from({ length: n + 1 }, (_, i) => [cx + r * Math.cos(i / n * 2 * Math.PI), cy + r * Math.sin(i / n * 2 * Math.PI)]);
