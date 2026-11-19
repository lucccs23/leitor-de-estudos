// Painéis da caneta, do marca-texto e da borracha: pontas, linhas, opacidade, ajuste ao texto e favoritos.
import { line } from '../lib/browser.mjs';

const LAST = `S.highlights.filter(h => h.kind === 'ink').at(-1)`;
const LAST_PATH = `[...$$('.inkLayer path')].at(-1)`;
const N_PATH = `$$('.inkLayer path').length`;
const COUNT = key => `S.highlights.filter(h => ${key}).reduce((n, h) => n + h.parts.reduce((m, p) => m + p.paths.length, 0), 0)`;
const opt = (k, o, v) => `A.setPenOpt('${k}', '${o}', ${JSON.stringify(v)});`;

export default async ({ launch, fixtures }) => {
  const t = await launch({ width: 1300 });
  await t.open(fixtures.texto, 'texto.pdf');
  const G = await t.ev(`A.setPen('pen'); const r = $('.page').getBoundingClientRect(); return { x: r.left + 60, y: Math.max(r.top + 60, 90) };`);
  let y = G.y + 300;
  const draw = async (dy = 14) => {
    const n = await t.ev(`return ${N_PATH};`);
    await t.stroke(Array.from({ length: 26 }, (_, i) => [G.x + i * 10, y + Math.sin(i / 2.2) * dy]));
    y += 34;
    await t.ev(`await until(() => ${N_PATH} > ${n}); return 1`);
  };

  let r = await t.ev(`$('[data-penkind=pen]').click(); await until(() => $('.penPop')); return { pontas: $$('.ppTip').length, linhas: $$('.ppLine').length, sw: $$('.ppSwitch').length, cores: $$('.ppColor').length, pag: $$('.ppPage').length };`);
  await t.check('tocar de novo na caneta abre o painel completo', r.pontas === 5 && r.linhas === 4 && r.sw === 3 && r.cores >= 6 && r.pag === 5, r);
  r = await t.ev(`$('.ppTip[data-tip=fountain]').click(); const a = A.penOpt('pen', 'tip'); $('.ppLine[data-line=dash]').click(); const b = A.penOpt('pen', 'line'); $('.ppLine[data-line=solid]').click(); return { a, b, aberto: !!$('.penPop') };`);
  await t.check('painel troca ponta e linha sem fechar', r.a === 'fountain' && r.b === 'dash' && r.aberto, r);
  await t.ev(`A.closePenPop(); return 1`);

  for (const tip of ['fountain', 'callig', 'brush']) {
    t.step(`ponta ${tip}`);
    await t.ev(`${opt('pen', 'tip', tip)} return 1`); await draw();
    r = await t.ev(`const p = ${LAST_PATH}; return { tip: ${LAST}.tip, fill: p.classList.contains('inkFill'), fecha: p.getAttribute('d').endsWith('Z'), sw: p.getAttribute('stroke-width') };`);
    await t.check(`ponta ${tip}: espessura variável`, r.tip === tip && r.fill && r.fecha && !r.sw, r);
  }
  await t.ev(`${opt('pen', 'tip', 'pencil')} return 1`); await draw();
  r = await t.ev(`const p = ${LAST_PATH}; return { tip: ${LAST}.tip, op: getComputedStyle(p).opacity };`);
  await t.check('ponta lápis: traço mais claro', r.tip === 'pencil' && +r.op < 1, r);
  await t.ev(`${opt('pen', 'tip', 'ball')} ${opt('pen', 'line', 'dash')} return 1`); await draw();
  r = await t.ev(`const p = ${LAST_PATH}; return { line: ${LAST}.line, da: p.getAttribute('stroke-dasharray'), tip: ${LAST}.tip };`);
  await t.check('linha tracejada', r.line === 'dash' && !!r.da && !r.tip, r);
  await t.ev(`${opt('pen', 'line', 'dot')} return 1`); await draw();
  r = await t.ev(`return ${LAST_PATH}.getAttribute('stroke-dasharray');`);
  await t.check('linha pontilhada', /^0\.01 /.test(r), r);
  await t.ev(`${opt('pen', 'line', 'taper')} return 1`); await draw();
  r = await t.ev(`return ${LAST_PATH}.classList.contains('inkFill');`);
  await t.check('linha afinada nas pontas', r, r);
  await t.ev(`${opt('pen', 'line', 'solid')} ${opt('pen', 'straight', true)} return 1`);

  t.step('endireitar');
  await t.stroke(Array.from({ length: 21 }, (_, i) => [G.x + i * 12, y + (i % 2 ? 3 : -3) + i * 0.1])); y += 34;
  r = await t.ev(`await until(() => ${LAST}.parts.at(-1).paths.at(-1).length === 2, 2500); const q = ${LAST}.parts.at(-1).paths.at(-1); return { n: q.length, reta: q[0][1] === q.at(-1)[1] };`);
  await t.check('endireitar: traço quase reto vira reta horizontal', r.n === 2 && r.reta, r);
  await draw(26);
  r = await t.ev(`return ${LAST}.parts.at(-1).paths.at(-1).length;`);
  await t.check('endireitar não mexe em traço ondulado', r > 10, r);
  await t.ev(`${opt('pen', 'straight', false)} return 1`);

  t.step('marca-texto');
  r = await t.ev(`A.setPen('marker'); $('[data-penkind=marker]').click(); await until(() => $('.penPop')); return { pontas: $$('.ppTip').length, faixas: $$('.penPop input[type=range]').length, sw: $$('.ppSwitch').length };`);
  await t.check('painel do marca-texto: pontas, faixas e ajustes', r.pontas === 2 && r.faixas === 3 && r.sw === 4, r);
  await t.ev(`const o = $('.ppOpacity input'); o.value = 70; o.dispatchEvent(new Event('input')); $('.ppTip[data-tip=round]').click(); A.closePenPop(); return 1`);
  await draw();
  r = await t.ev(`const p = ${LAST_PATH}, c = getComputedStyle(p); return { op: ${LAST}.opacity, tip: ${LAST}.tip, so: c.strokeOpacity, cap: c.strokeLinecap, blend: c.mixBlendMode };`);
  await t.check('marca-texto: opacidade, ponta redonda e mistura com a página', r.op === 70 && r.tip === 'round' && +r.so === 0.7 && r.cap === 'round' && ['multiply', 'screen'].includes(r.blend), r);

  t.step('ajustar ao texto');
  await t.ev(`${opt('marker', 'tip', 'chisel')} ${opt('marker', 'opacity', 45)} ${opt('marker', 'fit', true)} ${opt('marker', 'straight', true)} await A.pageText(1); return 1`);
  const T = await t.ev(`const b = $$('.page .textLayer span').find(e => e.textContent.length > 30 && e.getBoundingClientRect().top > 200 && e.getBoundingClientRect().top < 700).getBoundingClientRect(); return { x: b.left + 20, y: b.top + b.height / 2 + 3 };`);
  const nT = await t.ev(`return ${N_PATH};`);
  await t.stroke(Array.from({ length: 17 }, (_, i) => [T.x + i * 14, T.y + (i % 2)]));
  r = await t.ev(`await until(() => ${N_PATH} > ${nT}); const h = ${LAST}, q = h.parts.at(-1).paths.at(-1), b = S.pages[0].base, it = (await A.pageText(1)).items.filter(i => q[0][0] >= i.x && q[0][0] <= i.x + i.w && q[0][1] >= i.y - i.h && q[0][1] <= i.y + 2 * i.h)[0]; return { w: h.width, n: q.length, y: q[0][1], esperado: it && it.h * b.h * 1.15, centro: it && it.y + it.h / 2, marker: h.marker };`);
  await t.check('ajustar ao texto: altura da linha e centrado nela', r.marker && r.n === 2 && Math.abs(r.w - r.esperado) < 1 && Math.abs(r.y - r.centro) < 0.004, r);
  await t.ev(`${opt('marker', 'fit', false)} ${opt('marker', 'straight', false)} return 1`);

  t.step('favoritos');
  r = await t.ev(`A.setPen('pen'); ${opt('pen', 'tip', 'brush')} A.setPenWidth('pen', 5); A.setPenColor('pen', '#0aa84f'); $('#btnPenOpts').click(); await until(() => $('.penPop')); $('.ppStar').click(); const fav = $$('.ppFav').length, on = $('.ppStar').classList.contains('on');
    ${opt('pen', 'tip', 'ball')} A.setPenWidth('pen', 2.4); A.setPenColor('pen', '#e01515'); $('.ppFav').click(); return { fav, on, tip: A.penOpt('pen', 'tip'), w: A.penWidth('pen'), cor: A.penColor('pen') };`);
  await t.check('favorito guarda e devolve a configuração', r.fav === 1 && r.on && r.tip === 'brush' && r.w === 5 && r.cor === '#0aa84f', r);
  await t.ev(`A.closePenPop(); ${opt('pen', 'tip', 'ball')} A.setPenWidth('pen', 2.4); return 1`);

  t.step('borracha só no marca-texto');
  y += 10;
  const inkN = COUNT(`h.kind === 'ink'`), markN = COUNT('h.marker');
  let n = await t.ev(`A.setPen('marker'); return ${inkN};`);
  await t.stroke(line(G.x, y, G.x + 200, y, 20));
  await t.ev(`await until(() => ${inkN} === ${n + 1}); A.setPen('pen'); return 1`);
  await t.stroke(line(G.x, y, G.x + 200, y, 20));
  await t.ev(`await until(() => ${inkN} === ${n + 2}); return 1`);
  r = await t.ev(`A.setTool('erase'); $('#penSeg [data-tool=erase]').click(); await until(() => $('.penPop')); const s = { modos: $$('.ppMode').length, sw: $$('.ppSwitch').length, limpar: $('.ppClear').textContent }; $('.ppSwitch input').click(); await until(() => /marca-texto/.test($('.ppClear').textContent)); s.limpar2 = $('.ppClear').textContent; A.closePenPop(); return s;`);
  await t.check('painel da borracha com "somente marca-texto"', r.modos === 2 && r.sw === 1 && /escrita à mão/.test(r.limpar) && /marca-texto/.test(r.limpar2), r);
  const a0 = await t.ev(`return { i: ${inkN}, m: ${markN} };`);
  await t.stroke(line(G.x + 100, y - 12, G.x + 100, y + 12, 8));
  r = await t.ev(`await until(() => ${markN} === ${a0.m - 1}, 2500); return { i: ${inkN}, m: ${markN} };`);
  await t.check('borracha apaga só o marca-texto', r.m === a0.m - 1 && r.i === a0.i - 1, { a0, r });
  await t.close();

  const m = await launch({ width: 390 });
  await m.open(fixtures.texto, 'texto.pdf');
  r = await m.ev(`A.setPen('marker'); $('#btnPenOpts').click(); await until(() => $('.penPop')); await Promise.all($('.penPop').getAnimations().map(a => a.finished)); const p = $('.penPop'), b = p.getBoundingClientRect(); p.scrollTop = 1e4; const fim = p.lastElementChild.getBoundingClientRect(); return { top: b.top, bot: b.bottom, H: innerHeight, W: innerWidth, r: b.right, l: b.left, sw: document.documentElement.scrollWidth, rola: fim.bottom <= b.bottom + 1 };`);
  await m.check('celular: painel cabe na tela e rola até o fim', r.top >= 0 && r.bot <= r.H && r.l >= 0 && r.r <= r.W && r.sw <= r.W && r.rola, r);
  await m.close();
};
