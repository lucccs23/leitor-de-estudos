// Hook PreToolUse: as checagens (tests/, .claude/, .github/, CLAUDE.md, REVIEW.md, eslint.config.js, package.json)
// só podem ser editadas num branch checks/..., e num branch checks/... só as checagens.
// É uma barreira local; a de verdade é o GitHub Actions (verify.yml), que roda sempre as regras do main.
import { execFileSync } from 'node:child_process';
import { relative, resolve } from 'node:path';

const REGRAS = /^(tests\/|\.claude\/|\.github\/|CLAUDE\.md$|REVIEW\.md$|eslint\.config\.js$|package\.json$|package-lock\.json$|\.gitignore$)/;

let input = '';
for await (const chunk of process.stdin) input += chunk;
const data = JSON.parse(input || '{}');
const root = process.env.CLAUDE_PROJECT_DIR || data.cwd || process.cwd();
const file = data.tool_input?.file_path || data.tool_input?.notebook_path;
if (!file) process.exit(0);

const rel = relative(root, resolve(root, file)).replace(/\\/g, '/');
if (rel.startsWith('..')) process.exit(0); // fora do repositório
let branch = '';
try { branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { process.exit(0); }

const regra = REGRAS.test(rel), checks = branch.startsWith('checks/');
let motivo = '';
if (regra && !checks) motivo = `${rel} é uma checagem: só muda num branch checks/... (você está em ${branch}). A mudança não pode editar as regras que a julgam — faça um PR separado só de checagens.`;
else if (!regra && checks) motivo = `${rel} é código do app, mas o branch ${branch} é só de checagens. Faça a mudança do app noutro branch (feat/... ou fix/...).`;

if (motivo) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: motivo } }));
}
process.exit(0);
