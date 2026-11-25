// Vetra para Windows: abre o app numa janela própria, liga o serviço local (backup diário e OCR do Windows)
// e recebe os PDFs abertos pelo "Abrir com" ou por duplo clique.
const { app, BrowserWindow, shell, ipcMain, Menu, dialog } = require('electron');
const path = require('path'), fs = require('fs'), cp = require('child_process'), crypto = require('crypto');
const { epubParaPdf } = require('./epub');
const atualizacao = require('./atualizar');

const PORTA = 47623; // serviço local do app instalado (a versão de testes usa outra)
app.setAppUserModelId('app.vetra.leitor');
if (process.env.VETRA_DADOS) app.setPath('userData', process.env.VETRA_DADOS); // testes: dados separados
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

const APP_DIR = path.join(__dirname, '..', 'app');
const unpacked = p => p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);

// ---------- Senha interna do serviço local (a mesma que o Focus usa para conversar com o Vetra) ----------
function token(){
  const dir = path.join(process.env.LOCALAPPDATA || app.getPath('userData'), 'LeitorDeEstudos');
  const f = path.join(dir, 'backup-token.txt');
  try { const t = fs.readFileSync(f, 'utf8').trim(); if (/^[a-f0-9]{32,128}$/i.test(t)) return t; } catch {}
  fs.mkdirSync(dir, { recursive: true });
  const t = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(f, t);
  return t;
}

// ---------- Serviço local (PowerShell, sem janela): backup diário em Documentos\Vetra\Backups e OCR ----------
let servico = null;
// o app abre pela versão baixada do site (se houver uma mais nova) ou pela que veio no instalador
const pasta = () => atualizacao.pastaApp(APP_DIR).dir;
function iniciarServico(){
  // o PowerShell não lê dentro do app.asar: usa a cópia "unpacked" (ou a da atualização baixada)
  let script = unpacked(path.join(pasta(), 'servico-backup.ps1'));
  if (!fs.existsSync(script)) script = unpacked(path.join(APP_DIR, 'servico-backup.ps1'));
  if (!fs.existsSync(script)) return;
  const destino = path.join(app.getPath('documents'), 'Vetra', 'Backups');
  try {
    servico = cp.spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', script, '-Porta', String(PORTA), '-Destino', destino],
      { windowsHide: true, stdio: 'ignore' });
    servico.on('error', () => { servico = null; });
  } catch { servico = null; }
}

// ---------- Janela ----------
const carregar = () => win && win.loadFile(path.join(pasta(), 'index.html'), { query: { bk: token(), svc: String(PORTA) } });
const estadoArq = () => path.join(app.getPath('userData'), 'janela.json');
function lerEstado(){ try { return JSON.parse(fs.readFileSync(estadoArq(), 'utf8')); } catch { return {}; } }
let win = null, pronto = false, fila = [];

function criarJanela(){
  const st = lerEstado();
  win = new BrowserWindow({
    width: st.width || 1360, height: st.height || 880, x: st.x, y: st.y, minWidth: 420, minHeight: 500,
    show: false, backgroundColor: '#17181b', title: 'Vetra', autoHideMenuBar: true,
    icon: path.join(APP_DIR, 'icons', 'icon-512.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, spellcheck: true },
  });
  if (st.max) win.maximize();
  Menu.setApplicationMenu(null);
  carregar();
  win.once('ready-to-show', () => win.show());
  // links externos (Claude, ChatGPT, GitHub…) abrem no navegador, nunca dentro do app
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); } });
  // atalhos de depuração escondidos (Ctrl+Shift+I) e recarregar (F5)
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return;
    if (i.control && i.shift && i.key.toLowerCase() === 'i') { win.webContents.toggleDevTools(); e.preventDefault(); }
    if (i.key === 'F5') { win.webContents.reload(); e.preventDefault(); }
  });
  const salvar = () => { try { const b = win.getNormalBounds(); fs.writeFileSync(estadoArq(), JSON.stringify({ ...b, max: win.isMaximized() })); } catch {} };
  win.on('close', salvar);
  win.on('closed', () => { win = null; pronto = false; });
  // baixar arquivos (backup, Markdown, PDF): pergunta onde salvar
  win.webContents.session.on('will-download', (_e, item) => {
    const p = dialog.showSaveDialogSync(win, { defaultPath: path.join(app.getPath('downloads'), item.getFilename()) });
    if (p) item.setSavePath(p); else item.cancel();
  });
}

// ---------- PDFs vindos do Windows ----------
// Cada PDF aberto pelo Windows ganha um número; o "Salvar" da página grava de volta no mesmo arquivo por esse
// número (a página nunca recebe nem escolhe caminhos: só grava onde o próprio Windows abriu).
const arqCaminhos = () => path.join(app.getPath('userData'), 'arquivos-abertos.json');
let caminhos = null;
function lerCaminhos(){
  if (!caminhos) { try { caminhos = JSON.parse(fs.readFileSync(arqCaminhos(), 'utf8')) || {}; } catch { caminhos = {}; } }
  return caminhos;
}
function idDoArquivo(f){
  const abs = path.resolve(f), c = lerCaminhos();
  for (const [id, p] of Object.entries(c)) if (p.toLowerCase() === abs.toLowerCase()) return id;
  const id = crypto.randomBytes(12).toString('hex');
  c[id] = abs;
  try { fs.writeFileSync(arqCaminhos(), JSON.stringify(c)); } catch {}
  return id;
}
ipcMain.handle('save-file', async (_e, id, bytes) => {
  const p = lerCaminhos()[id];
  if (!p || !/\.pdf$/i.test(p)) return { ok: false, error: 'desconhecido' };
  if (!fs.existsSync(p)) return { ok: false, error: 'sumiu' };
  const tmp = p + '.vetra-salvando';
  try {
    fs.writeFileSync(tmp, Buffer.from(bytes));
    fs.renameSync(tmp, p); // troca de uma vez: se algo falhar no meio, o PDF original fica inteiro
    return { ok: true, name: path.basename(p) };
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch {}
    const bloq = e && ['EBUSY', 'EPERM', 'EACCES'].includes(e.code);
    return { ok: false, error: bloq ? 'bloqueado' : String(e && e.message || e) };
  }
});
const pdfsDe = argv => argv.slice(1).filter(a => /\.(pdf|epub)$/i.test(a) && fs.existsSync(a));
function abrir(arquivos){
  for (const f of arquivos) {
    try { const data = fs.readFileSync(f); fila.push({ name: path.basename(f), data, ...(/\.pdf$/i.test(f) ? { id: idDoArquivo(f) } : {}) }); }
    catch (e) { dialog.showErrorBox('Vetra', 'Não consegui ler o arquivo:\n' + f); }
  }
  enviar();
}
function enviar(){
  if (!win || !pronto) return;
  while (fila.length) win.webContents.send('open-file', fila.shift());
}
ipcMain.on('renderer-ready', () => { pronto = true; enviar(); });
// EPUB → PDF (feito aqui, com o motor de impressão do Chromium)
ipcMain.handle('epub-to-pdf', async (_e, bytes) => {
  try { const r = await epubParaPdf(bytes); return { ok: true, pdf: r.pdf, title: r.title, author: r.author }; }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});
ipcMain.on('open-external', (_e, url) => { if (/^https?:/i.test(String(url))) shell.openExternal(url); });
// Procurar atualizações (botão nas Configurações e uma vez por dia)
ipcMain.handle('update-check', async () => {
  try { return await atualizacao.procurar(APP_DIR); } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});
ipcMain.handle('update-apply', async () => {
  try { const r = await atualizacao.aplicar(APP_DIR); setTimeout(() => { pronto = false; carregar(); }, 400); return r; }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

app.on('second-instance', (_e, argv) => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  abrir(pdfsDe(argv));
});
app.whenReady().then(() => {
  iniciarServico();
  criarJanela();
  abrir(pdfsDe(process.argv));
});
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => { try { servico && servico.kill(); } catch {} });
