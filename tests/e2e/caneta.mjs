// Caneta: traço, marca-texto, desfazer/refazer, espessura, laço, borracha parcial e seletor de cor.
import { line, circle } from '../lib/browser.mjs';

export default async ({ launch, fixtures }) => {
  const t = await launch({ width: 1300 });
  await t.open(fixtures.texto, 'texto.pdf');
  const inkCount = `S.highlights.filter(h => h.kind === 'ink').reduce((n, h) => n + h.parts.reduce((m, p) => m + p.paths.length, 0), 0)`;
  let r = await t.ev(`A.setPen('pen'); const rr = $('.page').getBoundingClientRect(); return { x: rr.left, y: rr.top, w: rr.width };`);
  const X = r.x + Math.min(120, r.w * 0.2), Y = Math.max(r.y + 140, 200);

  t.step('traço de caneta');
  await t.stroke(line(X, Y, X + 160, Y));
  r = await t.ev(`await until(() => S.highlights.some(h => h.kind === 'ink')); const h = S.highlights.filter(h => h.kind === 'ink'); return { n: h.length, w: h[0]?.width, marker: !!h[0]?.marker, undo: !$('#btnUndo').disabled, redo: !$('#btnRedo').disabled };`);
  await t.check('caneta desenha com a espessura da caneta', r.n === 1 && r.w === 2.4 && !r.marker && r.undo && !r.redo, r);

  t.step('marca-texto com outra cor e espessura');
  r = await t.ev(`A.setPen('marker'); A.setPenWidth('marker', 20); A.pickColor(A.COLORS[2].id); return { cor: A.penColor('marker'), corCaneta: A.penColor('pen') };`);
  await t.stroke(line(X, Y + 60, X + 160, Y + 60));
  r = { ...r, ...(await t.ev(`await until(() => S.highlights.some(h => h.marker)); const m = S.highlights.find(x => x.marker); return { n: S.highlights.filter(h => h.kind === 'ink').length, mw: m?.width, mcor: m?.color };`)) };
  await t.check('marca-texto separado, com cor e espessura próprias', r.n === 2 && r.mw === 20 && r.mcor === r.cor && r.cor !== r.corCaneta, r);

  t.step('desfazer e refazer');
  r = await t.ev(`$('#btnUndo').click(); const a = S.highlights.filter(h => h.kind === 'ink').length; const rd = !$('#btnRedo').disabled; $('#btnRedo').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })); const b = S.highlights.filter(h => h.kind === 'ink').length;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true })); return { a, rd, b, c: S.highlights.filter(h => h.kind === 'ink').length };`);
  await t.check('desfazer/refazer pelos botões e por Ctrl+Z / Ctrl+Y', r.a === 1 && r.rd && r.b === 1 && r.c === 2, r);

  t.step('painel de espessura');
  r = await t.ev(`A.setPen('pen'); $('#btnPenOpts').click(); await until(() => $('.penPop')); const p = $('.penPop'); const rg = p.querySelector('input[type=range]'); rg.value = 5; rg.dispatchEvent(new Event('input'));
    const out = { w: A.penWidth('pen'), preview: !!p.querySelector('.ppPreview path') }; document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); A.setPenWidth('pen', 2.4); return out;`);
  await t.check('painel de espessura com prévia', r.w === 5 && r.preview, r);

  t.step('laço em volta dos dois traços');
  await t.ev(`A.setTool('lasso'); return 1`);
  await t.stroke(circle(X + 80, Y + 30, 120, 36));
  r = await t.ev(`await until(() => $('.lassoBox')); return { sel: $$('.inkLayer path.lassoSel').length, bar: !!$('.lassoBar') };`);
  await t.check('laço seleciona os traços de dentro', r.sel === 2 && r.bar, r);
  const before = await t.ev(`return S.highlights.find(h => h.kind === 'ink' && !h.marker).parts[0].paths[0][0];`);
  await t.stroke(line(X + 80, Y + 30, X + 80, Y + 150, 12));
  r = await t.ev(`return S.highlights.find(h => h.kind === 'ink' && !h.marker).parts[0].paths[0][0];`);
  await t.check('arrastar a seleção move os traços', r[1] > before[1] + 0.03, { before, depois: r });
  r = await t.ev(`A.pickColor('#e0115f'); return S.highlights.filter(h => h.kind === 'ink' && h.color === '#e0115f').length;`);
  await t.check('cor na paleta pinta a seleção', r === 2, r);
  r = await t.ev(`const n0 = ${inkCount}; btnT($('.lassoBar'), 'Duplicar').click(); const n1 = ${inkCount}; btnT($('.lassoBar'), 'Apagar').click(); return { n0, n1, n2: ${inkCount}, semSel: !$('.lassoBox') };`);
  await t.check('duplicar e apagar pelo laço (os 2 traços selecionados)', r.n1 === r.n0 + 2 && r.n2 === r.n0 && r.semSel, r);

  t.step('borracha "só onde passar" num traço isolado');
  await t.ev(`A.setPen('pen'); return 1`);
  await t.stroke(line(X, Y + 320, X + 200, Y + 320, 40));
  const antes = await t.ev(`await until(() => ${inkCount} > 0); localStorage.setItem('le.eraseMode', JSON.stringify('area')); A.setTool('erase'); return ${inkCount};`);
  await t.stroke(line(X + 100, Y + 300, X + 100, Y + 340, 10));
  r = await t.ev(`return ${inkCount};`);
  await t.check('borracha parcial corta o traço em dois', r === antes + 1, { antes, depois: r });
  r = await t.ev(`$('#btnPenOpts').click(); await until(() => $('.penPop')); const p = $('.penPop'); const out = { modos: $$('.penPop .ppMode').length, tamanho: !!p.querySelector('input[type=range]') };
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); localStorage.setItem('le.eraseMode', JSON.stringify('stroke')); return out;`);
  await t.check('opções da borracha (dois modos e tamanho)', r.modos === 2 && r.tamanho, r);

  t.step('seletor de cor da caneta');
  r = await t.ev(`A.setPen('pen'); const sw = () => $$('#palette .swatch')[1]; sw().click(); const cor = A.penColor('pen'); sw().click(); await until(() => $('.colorPop'));
    const out = { cor, pop: !!$('.colorPop'), celulas: $$('.cpCell').length, mais: !!$('#palette .moreColor') };
    const c = $$('.cpCell')[61]; c.click(); btnT($('.cpActs'), 'Concluir').click(); return { ...out, hex: c.dataset.hex, nova: A.penColor('pen'), fechou: !$('.colorPop') };`);
  await t.check('tocar de novo na cor abre o seletor; Concluir troca a cor', r.pop && r.celulas === 120 && r.mais && r.nova === r.hex && r.fechou, r);
  r = await t.ev(`const d = $('#dock').getBoundingClientRect(); return { cabe: d.right <= innerWidth && d.left >= 0 };`);
  await t.check('barra da caneta cabe na tela', r.cabe, r);
  await t.close();
};
