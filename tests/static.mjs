// Checagens rápidas (segundos), sem navegador: o que já quebrou o app publicado ou a atualização dos aparelhos.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const R = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, R), 'utf8');
const fails = [], warns = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

// 1) todo script do app compila (erro de sintaxe derruba o app inteiro)
const jsFiles = readdirSync(new URL('js/', R)).filter(f => f.endsWith('.js')).map(f => 'js/' + f).concat('sw.js');
for (const f of jsFiles) { try { new vm.Script(read(f), { filename: f }); } catch (e) { fails.push(`${f} não compila: ${e.message}`); } }

// 2) todo script carregado pelo index.html está na lista offline do sw.js (senão some no celular sem internet / na atualização)
const html = read('index.html'), sw = read('sw.js');
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]).filter(s => !/^https?:/.test(s));
const files = new Set([...sw.matchAll(/'\.\/([^']*)'/g)].map(m => m[1]));
for (const s of scripts) ok(files.has(s), `${s} é carregado pelo index.html mas falta em FILES do sw.js`);
for (const f of files) if (f) ok(existsSync(new URL(f, R)), `sw.js lista ./${f}, que não existe`);
for (const f of readdirSync(new URL('js/', R)).filter(f => f.endsWith('.js'))) ok(scripts.includes('js/' + f), `js/${f} existe mas não é carregado pelo index.html`);

// 3) versão igual no app e no sw.js (é o que faz os aparelhos oferecerem "Atualizar"), e a novidade da versão escrita
const vApp = (read('js/core.js').match(/App\.VERSION = '([\d.]+)'/) || [])[1];
const vSw = (sw.match(/const VERSION = '([\d.]+)'/) || [])[1];
const vNews = (read('js/news.js').match(/\{ v: '([\d.]+)'/) || [])[1];
ok(vApp, 'não achei App.VERSION em js/core.js');
ok(vApp === vSw, `versões diferentes: js/core.js ${vApp} x sw.js ${vSw}`);
ok(vNews === vApp, `a primeira novidade em js/news.js é ${vNews}, mas a versão é ${vApp}`);
const vDesk = JSON.parse(read('desktop/package.json')).version;
if (vDesk !== vApp) warns.push(`desktop/package.json está em ${vDesk} (app ${vApp}) — só importa ao gerar o instalador`);

for (const w of warns) console.log('aviso: ' + w);
if (fails.length) { console.log('Checagens estáticas FALHARAM:'); for (const f of fails) console.log('  - ' + f); process.exit(1); }
console.log(`Checagens estáticas ok (${jsFiles.length} scripts, ${scripts.length} no index.html, versão ${vApp}).`);
