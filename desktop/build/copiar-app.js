// Copia o Vetra (a pasta de cima: o mesmo app do site) para dentro do app de desktop.
// Só o que o app precisa: página, estilos, scripts, bibliotecas, ícones e o serviço local (backup + OCR).
const fs = require('fs'), path = require('path');
const RAIZ = path.resolve(__dirname, '..', '..');      // Vetra
const DST = path.resolve(__dirname, '..', 'app');       // Vetra\desktop\app (gerado)
const ITENS = [
  ['index.html'], ['app.css'], ['icone.png'], ['icons'], ['js'],
  ['lib/pdf.min.js'], ['lib/pdf.worker.embed.js'], ['lib/pdf-lib.min.js'],
  ['windows/servico-backup.ps1', 'servico-backup.ps1'],
];

fs.rmSync(DST, { recursive: true, force: true });
for (const [de, para = de] of ITENS) {
  const from = path.join(RAIZ, de), to = path.join(DST, para);
  if (!fs.existsSync(from)) throw new Error('Não encontrei ' + from);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
}
// ícones do instalador
fs.copyFileSync(path.join(RAIZ, 'windows', 'vetra.ico'), path.join(__dirname, 'icon.ico'));
fs.copyFileSync(path.join(RAIZ, 'icons', 'icon-512.png'), path.join(__dirname, 'icon.png'));
const v = (fs.readFileSync(path.join(RAIZ, 'js', 'core.js'), 'utf8').match(/App\.VERSION = '([\d.]+)'/) || [])[1];
const pkg = require('../package.json');
if (v && v !== pkg.version) console.warn(`Atenção: a versão do app (${v}) é diferente da do instalador (${pkg.version}). Ajuste "version" em desktop/package.json.`);
console.log(`Vetra ${v} copiado para desktop/app/`);
