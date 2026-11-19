// Escrita com caneta stylus: ponto ao tocar, traço fechado, mão apoiada, borracha em reta e botão da caneta.
import { line, circle } from '../lib/browser.mjs';

const N_INK = `S.highlights.filter(h => h.kind === 'ink').reduce((n, h) => n + h.parts.reduce((m, p) => m + p.paths.length, 0), 0)`;
const LAST = `S.highlights.filter(h => h.kind === 'ink').at(-1)?.parts.at(-1).paths.at(-1)`;

export default async ({ launch, fixtures }) => {
  const t = await launch({ width: 1300 });
  await t.open(fixtures.texto, 'texto.pdf');
  await t.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const G = await t.ev(`A.setPen('pen'); S.penSeen = true; const r = $('.page').getBoundingClientRect(); return { x: r.left + 120, y: Math.max(r.top + 120, 150), w: r.width };`);
  const pen = (type, x, y, o = {}) => t.send('Input.dispatchMouseEvent', { type, x, y, button: o.button || (type === 'mouseMoved' && o.buttons === 0 ? 'none' : 'left'), buttons: type === 'mouseReleased' ? 0 : (o.buttons ?? 1), clickCount: 1, pointerType: 'pen', force: o.force ?? 0.5 });
  const touch = (type, pts) => t.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  const inkIs = n => t.ev(`await until(() => ${N_INK} === ${n}, 2500); return ${N_INK};`);
  const count = () => t.ev(`return ${N_INK};`);
  let y = G.y;

  t.step('toque da caneta');
  let n0 = await count();
  await pen('mouseMoved', G.x, y, { buttons: 0 }); await pen('mousePressed', G.x, y); await pen('mouseReleased', G.x, y);
  let r = await inkIs(n0 + 1);
  await t.check('toque da caneta faz um ponto (pingo do i)', r === n0 + 1, { n0, r });

  t.step('traço que volta ao início');
  y += 50; n0 = await count();
  await t.stroke(circle(G.x + 60, y + 40, 40, 30));
  r = await inkIs(n0 + 1);
  await t.check('traço fechado não some', r === n0 + 1, { n0, r });

  t.step('mão encosta durante o traço');
  y += 110; n0 = await count();
  await pen('mouseMoved', G.x, y, { buttons: 0 }); await pen('mousePressed', G.x, y);
  for (let i = 1; i <= 10; i++) await pen('mouseMoved', G.x + i * 10, y);
  await touch('touchStart', [[G.x + 300, y + 200]]);
  for (let i = 11; i <= 20; i++) await pen('mouseMoved', G.x + i * 10, y);
  await touch('touchEnd', []);
  for (let i = 21; i <= 30; i++) await pen('mouseMoved', G.x + i * 10, y);
  await pen('mouseReleased', G.x + 300, y);
  await inkIs(n0 + 1);
  r = await t.ev(`const q = ${LAST}; return { x0: q[0][0], x1: q.at(-1)[0], sobra: $$('.drawLayer svg').length };`);
  await t.check('mão apoiada não interrompe o traço', r.sobra === 0 && Math.abs((r.x1 - r.x0) * G.w - 300) < 15, r);

  t.step('mão já apoiada antes da caneta');
  y += 50; n0 = await count();
  await touch('touchStart', [[G.x + 300, y + 150]]);
  await pen('mouseMoved', G.x, y, { buttons: 0 }); await pen('mousePressed', G.x, y);
  for (let i = 1; i <= 15; i++) await pen('mouseMoved', G.x + i * 10, y);
  await pen('mouseReleased', G.x + 150, y); await touch('touchEnd', []);
  r = await inkIs(n0 + 1);
  await t.check('caneta desenha com a mão já apoiada', r === n0 + 1, { n0, r });

  t.step('pressão no tinteiro');
  y += 50; n0 = await count();
  await t.ev(`A.setPenOpt('pen', 'tip', 'fountain'); return 1`);
  await pen('mouseMoved', G.x, y, { buttons: 0 }); await pen('mousePressed', G.x, y, { force: 0.1 });
  for (let i = 1; i <= 24; i++) await pen('mouseMoved', G.x + i * 10, y + Math.sin(i / 2) * 10, { force: i < 12 ? 0.15 : 0.95 });
  await pen('mouseReleased', G.x + 240, y);
  await inkIs(n0 + 1);
  r = await t.ev(`const q = ${LAST}; A.setPenOpt('pen', 'tip', 'ball'); return { n: q.length, com: q.filter(p => p.length === 3).length, fraca: q[6]?.[2], forte: q.at(-3)?.[2] };`);
  await t.check('tinteiro guarda a pressão da caneta', r.com === r.n && r.fraca < 0.3 && r.forte > 0.8, r);

  t.step('borracha de área numa reta');
  y += 50; n0 = await count();
  await t.ev(`A.setPenOpt('pen', 'straight', true); return 1`);
  await t.stroke(line(G.x, y, G.x + 200, y, 20));
  n0 = await inkIs(n0 + 1);
  await t.ev(`A.setPenOpt('pen', 'straight', false); localStorage.setItem('le.eraseMode', JSON.stringify('area')); A.setTool('erase'); return 1`);
  await t.stroke(line(G.x + 100, y - 14, G.x + 100, y + 14, 6));
  r = await inkIs(n0 + 1);
  await t.check('borracha de área corta uma reta em duas', r === n0 + 1, { n0, r });
  await t.ev(`localStorage.setItem('le.eraseMode', JSON.stringify('stroke')); A.setPen('pen'); return 1`);

  t.step('botão da caneta');
  y += 50; n0 = await count();
  await t.stroke(line(G.x, y, G.x + 200, y, 20));
  n0 = await inkIs(n0 + 1);
  await pen('mouseMoved', G.x + 100, y - 12, { buttons: 0 }); await pen('mousePressed', G.x + 100, y - 12, { button: 'right', buttons: 2 });
  for (let i = 1; i <= 8; i++) await pen('mouseMoved', G.x + 100, y - 12 + i * 3, { button: 'right', buttons: 2 });
  await pen('mouseReleased', G.x + 100, y + 12, { button: 'right' });
  r = { n: await inkIs(n0 - 1), tool: await t.ev(`return S.tool;`) };
  await t.check('botão da caneta apaga sem trocar de ferramenta', r.n === n0 - 1 && r.tool === 'ink', { n0, r });
  await t.close();
};
