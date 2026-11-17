// Roda os testes ponta a ponta (tests/e2e/*.mjs) contra o app servido localmente, num navegador sem janela.
// Uso: npm test                 → todas as suítes
//      npm test -- simulado     → só as suítes cujo nome contém "simulado"
//      npm test -- --shots      → também tira capturas das telas principais em 1300/820/390 (tests/out/telas)
import { readdirSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { serve } from './lib/serve.mjs';
import { makeFixtures } from './lib/fixtures.mjs';
import { launch } from './lib/browser.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const args = process.argv.slice(2), shots = args.includes('--shots'), filter = args.filter(a => !a.startsWith('--'));
const outDir = join(here, 'out');
rmSync(outDir, { recursive: true, force: true }); mkdirSync(outDir, { recursive: true });

const fixtures = await makeFixtures(join(outDir, 'fixtures'));
const server = await serve(join(here, '..'));
const results = [];
let suites = readdirSync(join(here, 'e2e')).filter(f => f.endsWith('.mjs')).sort();
if (filter.length) suites = suites.filter(f => filter.some(x => f.includes(x)));
if (shots) suites.push('telas');

const t0 = Date.now();
for (const file of suites) {
  const suite = file.replace(/\.mjs$/, '');
  console.log(`\n▶ ${suite}`);
  const ctx = { suite, url: server.url, outDir, results, fixtures };
  const mod = file === 'telas' ? await import('./lib/telas.mjs') : await import(new URL(`./e2e/${file}`, import.meta.url));
  try { await mod.default({ ...ctx, launch: opts => launch(ctx, opts) }); }
  catch (e) { results.push({ suite, name: 'a suíte rodou até o fim', ok: false, info: String(e.stack || e) }); console.log(`  FALHOU [${suite}] a suíte parou: ${String(e.message || e).slice(0, 500)}`); }
}
server.close();

const bad = results.filter(r => !r.ok);
console.log(`\n${results.length - bad.length} de ${results.length} verificações passaram em ${Math.round((Date.now() - t0) / 1000)} s.`);
if (bad.length) {
  console.log('Falharam:'); for (const r of bad) console.log(`  - [${r.suite}${r.width ? '@' + r.width : ''}] ${r.name}`);
  console.log(`Capturas das falhas em ${outDir}`);
}
process.exit(bad.length ? 1 : 0);
