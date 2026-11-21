// Estudo no tablet (1.28.0): lupa de escrita, toque com dois/três dedos, trilho de canetas favoritas,
// esferográfica sensível à pressão e desfazer depois de mover com o laço.
import { line, circle } from '../lib/browser.mjs';

const FAVS = [
  { k: 'pen', w: 1.2, color: '#1238e0', tip: 'ball', line: 'solid', straight: false, smooth: 0, shapes: false, pressao: false },
  { k: 'pen', w: 4, color: '#e01515', tip: 'fountain', line: 'solid', straight: false, smooth: 0, shapes: false, pressao: false },
  { k: 'marker', w: 14, color: '#ffe600', tip: 'chisel', opacity: 45, straight: false, fit: false, smooth: 0, shapes: false },
];
const N_PATHS = `S.highlights.reduce((n, h) => n + (h.parts[0].paths ? h.parts[0].paths.length : 0), 0)`;

export default async ({ launch, fixtures }) => {
  // ---------- tablet ----------
  const t = await launch({ width: 820, height: 1100 });
  await t.ev(`localStorage.setItem('le.penFavs', ${JSON.stringify(JSON.stringify(FAVS))}); return 1`); await t.reload();
  await t.open(fixtures.texto, 'texto.pdf');
  const pen = (type, x, y, buttons, force = 0.5) => t.send('Input.dispatchMouseEvent', { type, x, y, button: buttons || type === 'mouseReleased' ? 'left' : 'none', buttons, pointerType: 'pen', force });

  t.step('trilho de canetas favoritas');
  let r = await t.ev(`const antes = !$('.favRail').hidden; A.setTool('ink'); return { antes, depois: !$('.favRail').hidden, n: $$('.favPen').length };`);
  await t.check('com a Caneta e favoritos guardados aparece o trilho de favoritas (e não na seleção de texto)', !r.antes && r.depois && r.n === 3, r);
  r = await t.ev(`$$('.favPen')[1].click(); return { pen: S.pen, w: A.penWidth(), cor: A.penColor(), tip: A.penOpt('pen', 'tip'), ligado: $$('.favPen').findIndex(b => b.classList.contains('on')) };`);
  await t.check('um toque no trilho aplica a caneta favorita', r.pen === 'pen' && r.w === 4 && r.cor === '#e01515' && r.tip === 'fountain' && r.ligado === 1, r);

  t.step('esferográfica sensível à pressão');
  await t.ev(`A.setPenOpt('pen', 'tip', 'ball'); A.setPenOpt('pen', 'pressao', true); return 1`);
  const P = await t.ev(`const r = S.pages[0].el.getBoundingClientRect(); return { x: r.left + 100, y: r.top + 260 };`);
  await pen('mouseMoved', P.x, P.y, 0, 0); await pen('mousePressed', P.x, P.y, 1, 0.1);
  for (let i = 1; i <= 30; i++) await pen('mouseMoved', P.x + i * 8, P.y, 1, 0.1 + 0.85 * Math.sin(i / 30 * Math.PI));
  await pen('mouseReleased', P.x + 240, P.y, 0, 0);
  r = await t.ev(`await until(() => S.highlights.length === 1); const h = S.highlights[0]; return { pressao: !!h.pressao, ponto: h.parts[0].paths[0][3], cheio: $$('.page .inkLayer path').at(-1).classList.contains('inkFill') };`);
  await t.check('com "Sensível à pressão", a esferográfica guarda a pressão e varia a espessura', r.pressao && r.ponto && r.ponto.length === 3 && r.cheio, r);

  t.step('dois e três dedos');
  const toque = pts => t.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
  const solta = () => t.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await t.ev(`S.penSeen = false; A.setPenOpt('pen', 'pressao', false); await until(() => !A.penRecente(), 3000); return 1`);
  await toque([[300, 500], [380, 500]]); await solta();
  r = await t.ev(`await until(() => S.highlights.length === 0, 2000); return { n: S.highlights.length, aviso: $('#toast').textContent };`);
  await t.check('toque rápido com dois dedos desfaz', r.n === 0 && /Desfeito/.test(r.aviso), r);
  await toque([[300, 500], [380, 500], [460, 500]]); await solta();
  r = await t.ev(`await until(() => S.highlights.length === 1, 2000); return { n: S.highlights.length, aviso: $('#toast').textContent };`);
  await t.check('toque rápido com três dedos refaz', r.n === 1 && /Refeito/.test(r.aviso), r);
  const z0 = await t.ev(`return S.scale;`);
  await toque([[300, 500], [380, 500]]);
  await t.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 240, y: 500, id: 0 }, { x: 460, y: 500, id: 1 }] });
  await solta();
  r = await t.ev(`await until(() => S.scale > ${z0} * 1.3, 3000); return { n: S.highlights.length, antes: ${z0}, depois: S.scale };`);
  await t.check('pinça dá zoom e não desfaz', r.n === 1 && r.depois > r.antes * 1.3, r);
  await t.ev(`A.fitWidth(); await until(() => Math.abs(S.scale - ${z0}) < 0.05, 3000); return 1`);
  await t.close();

  // ---------- computador: lupa de escrita e laço ----------
  const c = await launch({ width: 1300, height: 900 });
  await c.open(fixtures.texto, 'texto.pdf');
  const cpen = (type, x, y, buttons) => c.send('Input.dispatchMouseEvent', { type, x, y, button: buttons || type === 'mouseReleased' ? 'left' : 'none', buttons, pointerType: 'pen', force: 0.5 });

  c.step('abre a lupa');
  const v = await c.ev(`A.setTool('ink'); A.lupa.abrir(); await until(() => !$('.lupa').hidden && $('.lupaAlvo')); await until(() => $('.lupaCanvas').width > 0, 5000);
    const r = $('.lupaVista').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, fundo: $('.lupaCanvas').width };`);
  await c.check('a lupa abre com o trecho marcado na página e o PDF desenhado nela', v.w > 600 && v.h >= 136 && v.fundo > 0, v);

  c.step('escreve na lupa');
  await cpen('mouseMoved', v.x + v.w * 0.2, v.y + v.h * 0.5, 0); await cpen('mousePressed', v.x + v.w * 0.2, v.y + v.h * 0.5, 1);
  for (let i = 1; i <= 20; i++) await cpen('mouseMoved', v.x + v.w * (0.2 + i * 0.02), v.y + v.h * (0.5 + Math.sin(i / 3) * 0.15), 1);
  const vivo = await c.ev(`return !!($('.lupaViva path') && $('.lupaViva path').getAttribute('d'));`);
  await cpen('mouseReleased', v.x + v.w * 0.6, v.y + v.h * 0.5, 0);
  r = await c.ev(`await until(() => S.highlights.length === 1); const pts = S.highlights[0].parts[0].paths[0], xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
    const a = $('.lupaAlvo').style, ax = parseFloat(a.left) / 100, aw = parseFloat(a.width) / 100, ay = parseFloat(a.top) / 100, ah = parseFloat(a.height) / 100;
    await until(() => $$('.lupaTinta path').length === 1, 2000);
    return { min: Math.min(...xs), max: Math.max(...xs), de: ax + 0.2 * aw, ate: ax + 0.6 * aw, dentro: Math.min(...ys) >= ay && Math.max(...ys) <= ay + ah, naLupa: $$('.lupaTinta path').length };`);
  await c.check('o que se escreve na lupa vai para a página, no lugar do trecho, e aparece na lupa', vivo && Math.abs(r.min - r.de) < 0.01 && Math.abs(r.max - r.ate) < 0.01 && r.dentro && r.naLupa === 1, { vivo, ...r });

  c.step('avança perto da borda e próxima linha');
  const x0 = await c.ev(`return parseFloat($('.lupaAlvo').style.left);`);
  await cpen('mouseMoved', v.x + v.w * 0.6, v.y + v.h * 0.4, 0); await cpen('mousePressed', v.x + v.w * 0.6, v.y + v.h * 0.4, 1);
  for (let i = 1; i <= 15; i++) await cpen('mouseMoved', v.x + v.w * (0.6 + i * 0.022), v.y + v.h * 0.4, 1);
  await cpen('mouseReleased', v.x + v.w * 0.93, v.y + v.h * 0.4, 0);
  r = await c.ev(`await until(() => parseFloat($('.lupaAlvo').style.left) > ${x0}, 2000); const x1 = parseFloat($('.lupaAlvo').style.left), y1 = parseFloat($('.lupaAlvo').style.top);
    $('.lupaLinha').click(); return { x0: ${x0}, x1, y1, x2: parseFloat($('.lupaAlvo').style.left), y2: parseFloat($('.lupaAlvo').style.top) };`);
  await c.check('escrevendo perto da borda a lupa avança, e "Próxima linha" volta à margem uma linha abaixo', r.x1 > r.x0 && r.x2 === r.x0 && r.y2 > r.y1, r);
  r = await c.ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return { lupa: $('.lupa').hidden, quadro: !!$('.lupaAlvo'), sobras: $$('.lupaTinta path, .lupaViva path').length };`);
  await c.check('Esc fecha a lupa sem deixar nada dela na página', r.lupa && !r.quadro && r.sobras === 0, r);

  c.step('laço: mover e desfazer');
  await c.ev(`A.undo(); A.undo(); await until(() => !S.highlights.length); A.setTool('ink'); return 1`);
  const G = await c.ev(`const r = S.pages[0].el.getBoundingClientRect(); return { x: r.left + 150, y: r.top + 300 };`);
  await c.stroke(line(G.x, G.y, G.x + 200, G.y, 15));
  await c.ev(`await until(() => S.highlights.length === 1); return 1`);
  const pos = `S.highlights[0].parts[0].paths[0][0].slice(0, 2).join(',')`;
  const p0 = await c.ev(`return ${pos};`);
  await c.ev(`A.setTool('lasso'); return 1`);
  await c.stroke(circle(G.x + 100, G.y, 140, 40));
  await c.ev(`await until(() => $('.lassoBox, .lassoSel, [class*=lassoSel]')); return 1`).catch(() => 0);
  await c.stroke(line(G.x + 100, G.y, G.x + 100, G.y + 120, 10));
  r = await c.ev(`await until(() => ${pos} !== '${p0}', 2000); const movido = ${pos}; A.undo(); await until(() => ${pos} === '${p0}', 2000); const desfeito = ${pos}; A.redo(); await until(() => ${pos} === movido, 2000);
    return { p0: '${p0}', movido, desfeito, refeito: ${pos}, tracos: ${N_PATHS} };`);
  await c.check('mover com o laço, desfazer e refazer voltam às posições certas', r.movido !== r.p0 && r.desfeito === r.p0 && r.refeito === r.movido && r.tracos === 1, r);
  await c.close();
};
