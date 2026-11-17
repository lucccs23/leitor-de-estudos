// Barras: barra de cima sempre cabe (menu ⋯ no celular), controle de página nunca fica sob a barra de marcação,
// barras presas no topo (arrastar, clique direito, tela cheia) e controle de página no centro.
import { line } from '../lib/browser.mjs';

const FIT = `const tb = $('#toolbar'); return { cabe: tb.scrollWidth <= tb.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth, mais: !$('#btnTbMore').hidden,
  escondidos: $$('#tbPins > .tbFitHide').map(e => e.dataset.pin), engrenagem: $('#btnMenu').getBoundingClientRect().right <= innerWidth, simulado: $('#btnExam').offsetWidth > 0 };`;
const OVER = `const p = $('#pager').getBoundingClientRect(), d = $('#dock').getBoundingClientRect();
  return Math.min(p.right, d.right) - Math.max(p.left, d.left) > 2 && Math.min(p.bottom, d.bottom) - Math.max(p.top, d.top) > 2;`;
const POS = `const p = $('#pager').getBoundingClientRect(), s = $('#stage').getBoundingClientRect();
  return { meio: Math.round(p.left + p.width / 2 - s.left), centro: Math.round(s.width / 2), pager: $('#pager').parentElement.id, dock: $('#dock').parentElement.id, topo: p.bottom <= s.top };`;

export default async ({ launch, fixtures }) => {
  // celular: a barra de cima cabe, o Simulado fica à vista e o resto vai para ⋯
  for (const width of [390, 360]) {
    const m = await launch({ width });
    await m.open(fixtures.texto, 'texto.pdf');
    let r = await m.ev(FIT);
    await m.check('barra de cima cabe, com Simulado e engrenagem à vista', r.cabe && r.engrenagem && r.simulado && r.mais, r);
    r = await m.ev(`$('#btnTbMore').click(); await until(() => $('.popMenu')); const it = $$('.popMenu .popItem span').map(s => s.textContent); A.closePop(); return it;`);
    await m.check('⋯ lista os botões que não couberam', r.length >= 2, r);
    r = await m.ev(`$('#btnPomo').click(); await until(() => $('.popMenu')); btnT($('.popMenu'), 'Foco de 25')?.click(); await until(() => $('#btnPomo.running') && !$('#btnPomo').classList.contains('tbFitHide'), 3000); ${FIT}`);
    await m.check('com o timer rodando, o chip fica à vista e nada passa da tela', r.cabe && r.engrenagem && !r.escondidos.includes('pomo'), r);
    r = await m.ev(`A.setTool('text'); const d = $('#dock'); return { sobra: d.scrollWidth - d.clientWidth, cor: $$('#palette .swatch').every(s => s.getBoundingClientRect().right <= innerWidth) };`);
    await m.check('barra de marcação cabe inteira, sem cor cortada', r.sobra <= 1 && r.cor, r);
    await m.close();
  }

  const t = await launch({ width: 1300 });
  await t.open(fixtures.texto, 'texto.pdf');
  for (const tool of ['text', 'ink', 'lasso']) {
    const r = await t.ev(`A.setTool('${tool}'); await wait(50); ${OVER}`);
    await t.check(`ferramenta ${tool}: controle de página não fica sob a barra`, !r, r);
  }
  await t.ev(`A.setTool('text'); return 1`);

  t.step('prende o controle de página pelo menu Exibir');
  let r = await t.ev(`$('#btnView').click(); await until(() => !$('#viewMenu').hidden); btnT($('#viewMenu'), 'Controle de página preso no topo').click(); ${POS}`);
  await t.check('Exibir → controle de página preso no topo', r.pager === 'topStrip' && r.topo, r);

  t.step('arrasta a barra de marcação até o topo');
  const g = await t.ev(`const r = $('#dockGrip').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, alvo: $('#topStrip').getBoundingClientRect().top + 10 };`);
  await t.stroke(line(g.x, g.y, g.x, g.alvo, 10));
  r = await t.ev(`await until(() => $('#dock').parentElement.id === 'topStrip', 2000); const s = $('#topStrip'); return { ...(() => { ${POS} })(), cabe: s.scrollWidth <= s.clientWidth + 1 };`);
  await t.check('arrastar a barra até o topo prende ela lá', r.dock === 'topStrip' && r.cabe, r);
  r = await t.ev(`A.toggleDock(); return $('#dock').classList.contains('min');`);
  await t.check('presa no topo, T não recolhe a barra', r === false, r);

  t.step('puxa a barra para baixo');
  const g2 = await t.ev(`const r = $('#dockGrip').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
  await t.stroke(line(g2.x, g2.y, g2.x + 200, g2.y + 400, 10));
  r = await t.ev(`await until(() => $('#dock').parentElement.id === 'stage', 2000); return { dock: $('#dock').parentElement.id, topo: A.ls.get('le.dockTop') };`);
  await t.check('puxar para baixo solta a barra', r.dock === 'stage' && !r.topo, r);

  t.step('clique direito no controle de página → no centro, depois flutuando');
  r = await t.ev(`const p = $('#pager').getBoundingClientRect(); $('#pager').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: p.left + 4, clientY: p.top + 10 }));
    await until(() => $('.popMenu')); const itens = $$('.popMenu .popItem span').map(s => s.textContent); btnT($('.popMenu'), 'No centro').click(); return { itens, ...(() => { ${POS} })() };`);
  await t.check('controle de página no centro (preso no topo)', ['À esquerda', 'No centro', 'À direita'].every(x => r.itens.includes(x)) && Math.abs(r.meio - r.centro) < 12, r);
  r = await t.ev(`A.setBarTop('pager', false); await wait(50); const pos = (() => { ${POS} })(); return { ...pos, sobre: (() => { ${OVER} })() };`);
  await t.check('no centro e flutuando, sem cobrir a barra de marcação', r.pager === 'stage' && Math.abs(r.meio - r.centro) < 12 && !r.sobre, r);

  t.step('tela cheia com as barras presas');
  r = await t.ev(`A.setPagerAlign('right'); A.setBarTop('dock', true); A.setBarTop('pager', true); A.toggleFocus(); await wait(50);
    const dentro = $('#dock').parentElement.id; A.toggleFocus(); await wait(50); return { dentro, depois: $('#dock').parentElement.id };`);
  await t.check('tela cheia: barras flutuam; ao sair, voltam ao topo', r.dentro === 'stage' && r.depois === 'topStrip', r);
  await t.reload();
  await t.open(fixtures.texto, 'texto.pdf');
  r = await t.ev(POS);
  await t.check('lembra as barras presas ao reabrir', r.dock === 'topStrip' && r.pager === 'topStrip', r);
  await t.close();
};
