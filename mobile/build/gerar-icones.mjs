// Gera os ícones do Vetra a partir do logo (icons/logo.svg): site, app instalado pelo navegador e Windows (windows/vetra.ico).
// Depois rode mobile/build/icones.ps1, que faz os do Android a partir dos icons/*.png gerados aqui.
// Uso: node mobile/build/gerar-icones.mjs   (precisa do Edge ou do Chrome instalado)
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FUNDO = '#1E1D2B'; // tinta escura atrás do V creme
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const svg = readFileSync(join(RAIZ, 'icons', 'logo.svg'), 'utf8');

// tamanho, raio dos cantos (fração do lado), escala do desenho (o "recortável" do Android pede o desenho mais ao centro)
const PEDIDOS = [
  { arq: 'icone.png', lado: 256, raio: 0.22, escala: 1 },
  { arq: 'icons/icon-192.png', lado: 192, raio: 0.22, escala: 1 },
  { arq: 'icons/icon-512.png', lado: 512, raio: 0.22, escala: 1 },
  { arq: 'icons/icon-maskable-192.png', lado: 192, raio: 0, escala: 0.82 },
  { arq: 'icons/icon-maskable-512.png', lado: 512, raio: 0, escala: 0.82 },
];
const ICO = [16, 24, 32, 48, 64, 128, 256]; // tamanhos dentro do windows/vetra.ico (o instalador copia de lá)

function navegador(){
  const ops = [process.env.VETRA_BROWSER, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
  const b = ops.find(p => existsSync(p)); if (!b) throw new Error('Não achei Edge nem Chrome (defina VETRA_BROWSER).'); return b;
}
const pausa = ms => new Promise(r => setTimeout(r, ms));

const perfil = mkdtempSync(join(tmpdir(), 'vetra-icones-'));
const proc = spawn(navegador(), ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${perfil}`, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
try {
  let porta = 0;
  for (let i = 0; i < 600 && !porta; i++) { try { porta = +readFileSync(join(perfil, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch {} if (!porta) await pausa(50); }
  if (!porta) throw new Error('o navegador não abriu');
  let alvo; for (let i = 0; i < 200 && !alvo; i++) { try { alvo = (await (await fetch(`http://127.0.0.1:${porta}/json`)).json()).find(t => t.type === 'page'); } catch {} if (!alvo) await pausa(50); }
  const ws = new WebSocket(alvo.webSocketDebuggerUrl);
  await new Promise((ok, erro) => { ws.onopen = ok; ws.onerror = erro; });
  let id = 0; const pend = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const ev = expr => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } })); });

  // desenha no navegador: fundo arredondado + o SVG em cima, direto no tamanho final (vetor, sem borrar)
  const desenhar = async (lado, raio, escala) => {
    const r = await ev(`(async () => {
      const svg = ${JSON.stringify(svg)};
      const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      await img.decode();
      const c = document.createElement('canvas'); c.width = c.height = ${lado}; const g = c.getContext('2d');
      const L = ${lado}, R = L * ${raio};
      g.fillStyle = '${FUNDO}'; g.beginPath(); g.roundRect(0, 0, L, L, R); g.fill();
      const s = L * ${escala}; g.drawImage(img, (L - s) / 2, (L - s) / 2, s, s);
      return c.toDataURL('image/png').split(',')[1];
    })()`);
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'falhou');
    return Buffer.from(r.result.result.value, 'base64');
  };

  for (const p of PEDIDOS) { writeFileSync(join(RAIZ, p.arq), await desenhar(p.lado, p.raio, p.escala)); console.log('  ' + p.arq); }
  // .ico do Windows: vários PNGs num arquivo só
  const pngs = [];
  for (const t of ICO) pngs.push(await desenhar(t, t <= 32 ? 0.18 : 0.22, 1));
  const cab = Buffer.alloc(6 + 16 * pngs.length); cab.writeUInt16LE(0, 0); cab.writeUInt16LE(1, 2); cab.writeUInt16LE(pngs.length, 4);
  let off = cab.length;
  pngs.forEach((b, i) => { const t = ICO[i], o = 6 + 16 * i; cab[o] = t >= 256 ? 0 : t; cab[o + 1] = t >= 256 ? 0 : t; cab.writeUInt16LE(1, o + 4); cab.writeUInt16LE(32, o + 6); cab.writeUInt32LE(b.length, o + 8); cab.writeUInt32LE(off, o + 12); off += b.length; });
  writeFileSync(join(RAIZ, 'windows/vetra.ico'), Buffer.concat([cab, ...pngs]));
  console.log('  windows/vetra.ico (' + ICO.join(', ') + ' px)');
  ws.close();
} finally {
  try { proc.kill(); } catch {}
  await pausa(300);
  try { rmSync(perfil, { recursive: true, force: true }); } catch {}
}
