// Formas ao segurar no fim do traço, estabilização, traços leves, prévia da ponta e PDF exportado.
import { line } from '../lib/browser.mjs';

const LAST = `S.highlights.filter(h => h.kind === 'ink').at(-1)`, LAST_P = `${LAST}.parts.at(-1).paths.at(-1)`;
const N_INK = `S.highlights.filter(h => h.kind === 'ink').reduce((n, h) => n + h.parts.reduce((m, p) => m + p.paths.length, 0), 0)`;

export default async ({ launch, fixtures }) => {
  const t = await launch({ width: 1300 });
  await t.open(fixtures.texto, 'texto.pdf');
  const G = await t.ev(`A.setPen('pen'); const r = $('.page').getBoundingClientRect(); return { x: r.left + 120, y: Math.max(r.top + 110, 140), w: r.width, h: r.height };`);
  let y = G.y;
  const committed = n => t.ev(`await until(() => ${N_INK} === ${n}, 2500); return ${N_INK};`);
  const stroke = async pts => { const n = await t.ev(`return ${N_INK};`); await t.stroke(pts); await committed(n + 1); };
  // desenha sem soltar, espera a prévia virar a forma (pelo número de curvas do desenho) e solta
  async function holdShape(pts, curves){
    const n = await t.ev(`return ${N_INK};`);
    await t.mouse('mouseMoved', ...pts[0]); await t.mouse('mousePressed', ...pts[0]);
    for (const p of pts.slice(1)) await t.mouse('mouseMoved', p[0], p[1], { buttons: 1 });
    const virou = await t.ev(`return await until(() => { const d = $('.drawLayer svg path')?.getAttribute('d') || ''; return d.split('Q').length - 1 === ${curves}; }, 3000);`);
    await t.mouse('mouseReleased', ...pts.at(-1));
    await committed(n + 1);
    return virou;
  }
  const wobble = (cx, cy, r, n = 36) => Array.from({ length: n + 1 }, (_, i) => { const a = i / n * Math.PI * 2, e = 1 + Math.sin(i * 1.7) * 0.05; return [cx + r * e * Math.cos(a), cy + r * e * Math.sin(a)]; });

  await t.ev(`A.setPenOpt('pen', 'shapes', true); return 1`);
  t.step('segura no fim de um traço reto');
  let m = await holdShape(Array.from({ length: 25 }, (_, i) => [G.x + i * 9, y + Math.sin(i) * 5]), 0);
  let r = await t.ev(`return ${LAST_P}.length;`);
  await t.check('segurar no fim: traço vira reta', m && r === 2, { m, r });

  t.step('segura no fim de um círculo');
  y += 40;
  m = await holdShape(wobble(G.x + 70, y + 60, 55), 47);
  r = await t.ev(`const q = ${LAST_P}, X = q.map(p => p[0] * ${G.w}), Y = q.map(p => p[1] * ${G.h}), cx = (Math.min(...X) + Math.max(...X)) / 2, cy = (Math.min(...Y) + Math.max(...Y)) / 2, D = q.map((p, i) => Math.hypot(X[i] - cx, Y[i] - cy)); return { min: Math.min(...D), max: Math.max(...D) };`);
  await t.check('segurar no fim: círculo sai redondo', m && r.max - r.min < 3 && r.max > 45, { m, ...r });

  t.step('segura no fim de um retângulo');
  y += 130;
  const rect = [];
  for (const [a, b] of [[[0, 0], [130, 0]], [[130, 0], [130, 70]], [[130, 70], [0, 70]], [[0, 70], [0, 0]]]) for (let i = 0; i < 10; i++) rect.push([G.x + a[0] + (b[0] - a[0]) * i / 10 + (i % 2), y + a[1] + (b[1] - a[1]) * i / 10 - (i % 2)]);
  rect.push([G.x + 1, y]);
  m = await holdShape(rect, 8);
  r = await t.ev(`const q = ${LAST_P}; return { xs: new Set(q.map(p => p[0])).size, ys: new Set(q.map(p => p[1])).size };`);
  await t.check('segurar no fim: retângulo com lados retos', m && r.xs === 2 && r.ys === 2, { m, ...r });
  await t.ev(`A.setPenOpt('pen', 'shapes', false); return 1`);

  t.step('estabilizar');
  y += 100;
  const zig = Array.from({ length: 41 }, (_, i) => [G.x + i * 6, y + (i % 2 ? 7 : -7)]);
  const amp = `const Y = ${LAST_P}.slice(4, -4).map(p => p[1] * ${G.h}); return Math.max(...Y) - Math.min(...Y);`;
  await stroke(zig); const a0 = await t.ev(amp);
  await t.ev(`A.setPenOpt('pen', 'smooth', 8); return 1`); y += 40;
  await stroke(zig.map(([x, yy]) => [x, yy + 40])); const a1 = await t.ev(amp);
  await t.ev(`A.setPenOpt('pen', 'smooth', 0); return 1`);
  await t.check('estabilizar reduz o tremor do traço', a1 < a0 * 0.5, { a0, a1 });

  y += 40;
  await stroke(line(G.x, y, G.x + 200, y, 30));
  r = await t.ev(`return ${LAST_P}.length;`);
  await t.check('traço reto guarda poucos pontos', r <= 3, r);

  r = await t.ev(`const a = A.penWidth('pen'), key = k => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); key(']'); const b = A.penWidth('pen'); key('['); return { a, b, c: A.penWidth('pen') };`);
  await t.check('[ e ] mudam a espessura', r.b > r.a && Math.abs(r.c - r.a) < 0.01, r);

  await t.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: G.x + 300, y: G.y + 40, button: 'none', buttons: 0, pointerType: 'mouse' });
  r = await t.ev(`await until(() => !$('.eraserRing').hidden, 2500); const e = $('.eraserRing'); return { on: !e.hidden, ink: e.classList.contains('inkRing'), w: e.getBoundingClientRect().width };`);
  await t.check('prévia da ponta ao pairar', r.on && r.ink && r.w >= 3, r);

  t.step('PDF com tinteiro');
  await t.ev(`A.setPenOpt('pen', 'tip', 'fountain'); return 1`);
  await stroke(Array.from({ length: 20 }, (_, i) => [G.x + 350 + i * 8, G.y + 40 + Math.sin(i / 2) * 8]));
  r = await t.ev(`A.setPenOpt('pen', 'tip', 'ball'); A.setTool('text'); const x = await A.buildPdfBytes(), d = await PDFLib.PDFDocument.load(x.bytes), an = d.getPages()[0].node.Annots(), T = []; for (let i = 0; i < an.size(); i++) T.push(String(an.lookup(i).get(PDFLib.PDFName.of('Subtype')))); return { pol: T.filter(s => s === '/Polygon').length, ink: T.filter(s => s === '/Ink').length, pag: d.getPageCount() };`);
  await t.check('PDF leva o tinteiro como forma preenchida', r.pol >= 1 && r.ink >= 1 && r.pag === 5, r);
  await t.close();
};
