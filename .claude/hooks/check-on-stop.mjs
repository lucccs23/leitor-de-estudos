// Hook Stop: se o app mudou (arquivos fora das checagens), roda as checagens rápidas (npm run check) antes de encerrar.
// Falhou → devolve o erro ao Claude para consertar. Depois de 3 rodadas seguidas falhando, deixa parar
// e manda chamar o Lucas (regra das três rodadas). Os testes ponta a ponta ficam no /verify (são mais lentos).
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REGRAS = /^(tests\/|\.claude\/|\.github\/|CLAUDE\.md$|REVIEW\.md$|eslint\.config\.js$|package\.json$|package-lock\.json$|\.gitignore$)/;
let input = '';
for await (const chunk of process.stdin) input += chunk;
const data = JSON.parse(input || '{}');
const root = process.env.CLAUDE_PROJECT_DIR || data.cwd || process.cwd();
const git = (...a) => { try { return execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return ''; } };

const changed = (git('diff', '--name-only', 'HEAD') + git('ls-files', '--others', '--exclude-standard')).split('\n').filter(Boolean);
const app = changed.filter(f => !REGRAS.test(f) && /\.(js|css|html|webmanifest)$/.test(f));
const counter = join(tmpdir(), `vetra-check-rounds-${data.session_id || 'x'}`);
if (!app.length) { rmSync(counter, { force: true }); process.exit(0); }

const r = spawnSync('npm', ['run', '--silent', 'check'], { cwd: root, encoding: 'utf8', shell: true });
if (r.status === 0) { rmSync(counter, { force: true }); process.exit(0); }

let rounds = 0; try { rounds = +readFileSync(counter, 'utf8') || 0; } catch {}
rounds++;
const out = ((r.stdout || '') + (r.stderr || '')).trim().split('\n').slice(-40).join('\n');
if (rounds >= 3) {
  rmSync(counter, { force: true });
  process.stderr.write(`npm run check ainda falha depois de 3 rodadas. Pare e chame o Lucas com o erro abaixo, o que tentou e a melhor hipótese.\n\n${out}\n`);
  process.exit(0); // deixa encerrar: agora é com o Lucas
}
writeFileSync(counter, String(rounds));
process.stderr.write(`npm run check falhou (rodada ${rounds} de 3) nos arquivos do app que você mudou (${app.join(', ')}). Conserte a causa — sem pular nem afrouxar a checagem:\n\n${out}\n`);
process.exit(2);
