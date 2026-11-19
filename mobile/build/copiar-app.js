// Copia o Vetra (a pasta de cima: o mesmo app do site) para mobile/www, que vai dentro do APK.
// Sem o sw.js: dentro do APK os arquivos já estão no aparelho, e as versões novas chegam por um APK novo.
const fs = require('fs'), path = require('path');
const RAIZ = path.resolve(__dirname, '..', '..');   // Vetra
const DST = path.resolve(__dirname, '..', 'www');    // Vetra\mobile\www (gerado)
const ITENS = ['index.html', 'app.css', 'icone.png', 'manifest.webmanifest', 'icons', 'js', 'lib/pdf.min.js', 'lib/pdf.worker.embed.js', 'lib/pdf-lib.min.js'];

fs.rmSync(DST, { recursive: true, force: true });
for (const de of ITENS) {
  const from = path.join(RAIZ, de), to = path.join(DST, de);
  if (!fs.existsSync(from)) throw new Error('Não encontrei ' + from);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
}
const v = (fs.readFileSync(path.join(RAIZ, 'js', 'core.js'), 'utf8').match(/App\.VERSION = '([\d.]+)'/) || [])[1];
const pkg = require('../package.json');
if (v && v !== pkg.version) console.warn(`Atenção: a versão do app (${v}) é diferente da do APK (${pkg.version}). Ajuste "version" em mobile/package.json.`);
console.log(`Vetra ${v} copiado para mobile/www/`);
