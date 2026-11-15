// Atualizações do Vetra instalado: baixa do site (o mesmo do celular) os arquivos da versão nova
// e passa a abrir por eles — sem reinstalar. Só quando a "casca" do app (esta pasta electron/) muda
// é preciso o instalador novo; o site diz isso em desktop.json ("cascaMinima").
const { app, net } = require('electron');
const path = require('path'), fs = require('fs');

const SITE = process.env.VETRA_SITE || 'https://lucccs23.github.io/leitor-de-estudos/'; // testes: site falso local
const RAIZ = () => path.join(app.getPath('userData'), 'atualizacoes');
const ATUAL = () => path.join(RAIZ(), 'atual.json');

const num = v => String(v || '0').split('.').map(n => parseInt(n, 10) || 0);
const maior = (a, b) => { const x = num(a), y = num(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };

// pasta de onde o app abre: a atualização baixada (se for mais nova que a que veio no instalador) ou a original
function pastaApp(original){
  try {
    const a = JSON.parse(fs.readFileSync(ATUAL(), 'utf8'));
    const dir = path.join(RAIZ(), a.versao);
    if (maior(a.versao, versaoOriginal(original)) && fs.existsSync(path.join(dir, 'index.html'))) return { dir, versao: a.versao };
  } catch {}
  return { dir: original, versao: versaoOriginal(original) };
}
function versaoOriginal(original){
  try { return (fs.readFileSync(path.join(original, 'js', 'core.js'), 'utf8').match(/App\.VERSION = '([\d.]+)'/) || [])[1] || app.getVersion(); }
  catch { return app.getVersion(); }
}

async function baixarTexto(rel){
  const r = await net.fetch(SITE + rel + '?v=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error(`${rel}: HTTP ${r.status}`);
  return r.text();
}
async function baixar(rel){
  const r = await net.fetch(SITE + rel + '?v=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error(`${rel}: HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

// lista de arquivos do app = a mesma que o celular guarda para funcionar offline (sw.js)
function lerSw(sw){
  const versao = (sw.match(/const VERSION = '([\d.]+)'/) || [])[1];
  const bloco = (sw.match(/const FILES = \[([\s\S]*?)\];/) || [])[1] || '';
  const arquivos = [...bloco.matchAll(/'\.\/([^']+)'/g)].map(m => m[1]).filter(f => f && !f.endsWith('/'));
  return { versao, arquivos };
}

async function procurar(original){
  const atual = pastaApp(original).versao;
  const sw = lerSw(await baixarTexto('sw.js'));
  let desk = {};
  try { desk = JSON.parse(await baixarTexto('desktop.json')); } catch {}
  const casca = app.getVersion();
  const precisaInstalador = !!(desk.cascaMinima && maior(desk.cascaMinima, casca));
  return { ok: true, atual, nova: sw.versao, temNova: !!sw.versao && maior(sw.versao, atual), precisaInstalador, instalador: desk.instalador || SITE };
}

async function aplicar(original){
  const sw = lerSw(await baixarTexto('sw.js'));
  if (!sw.versao || sw.arquivos.length < 10) throw new Error('Lista de arquivos do site incompleta.');
  const tmp = path.join(RAIZ(), '.baixando-' + Date.now());
  fs.mkdirSync(tmp, { recursive: true });
  try {
    for (const rel of sw.arquivos) {
      const dest = path.join(tmp, rel);
      if (!dest.startsWith(tmp)) continue;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, await baixar(rel));
    }
    // o serviço local (backup e OCR) também vem do site
    try { fs.writeFileSync(path.join(tmp, 'servico-backup.ps1'), await baixar('windows/servico-backup.ps1')); } catch {}
    const core = fs.readFileSync(path.join(tmp, 'js', 'core.js'), 'utf8');
    if (!core.includes(`App.VERSION = '${sw.versao}'`)) throw new Error('Os arquivos baixados não batem com a versão do site. Tente de novo em alguns minutos.');
    const dir = path.join(RAIZ(), sw.versao);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.renameSync(tmp, dir);
    fs.writeFileSync(ATUAL(), JSON.stringify({ versao: sw.versao, em: new Date().toISOString() }));
    // guarda só a versão nova
    for (const d of fs.readdirSync(RAIZ())) if (d !== sw.versao && d !== 'atual.json') fs.rmSync(path.join(RAIZ(), d), { recursive: true, force: true });
    return { ok: true, versao: sw.versao, dir };
  } catch (e) { fs.rmSync(tmp, { recursive: true, force: true }); throw e; }
}

module.exports = { pastaApp, procurar, aplicar };
