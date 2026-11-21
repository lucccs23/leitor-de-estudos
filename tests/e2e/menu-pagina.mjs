// Menu do botão direito na página, ferramentas Mão (H) e Marcação de zoom (Z), e o X / Esc do painel lateral.
import { line } from '../lib/browser.mjs';

export default async ({ launch, fixtures }) => {
  const t = await launch({ width: 1300 });
  await t.open(fixtures.texto, 'texto.pdf');
  const P = await t.ev(`const r = $('.page').getBoundingClientRect(); return { x: r.left + 300, y: r.top + 500 };`);

  t.step('clique direito na página');
  await t.click(P.x, P.y, 'right');
  let r = await t.ev(`await until(() => $('.popMenu')); return $$('.popMenu .popItem span').map(s => s.textContent);`);
  const esperados = ['Adicionar nota aqui', 'Marcar a página 1', 'Copiar o texto desta página', 'Ferramenta Selecionar', 'Ferramenta Mão', 'Marcação de zoom', 'Marcar área', 'Aumentar o zoom aqui', 'Diminuir o zoom', 'Ajustar à largura', 'Localizar', 'Imprimir…', 'Propriedades do documento…'];
  await t.check('clique direito na página abre o menu com as ações da página', esperados.every(x => r.includes(x)), r);

  t.step('adicionar nota pelo menu');
  r = await t.ev(`const n0 = S.highlights.filter(h => h.kind === 'note').length; btnT($('.popMenu'), 'Adicionar nota aqui').click();
    await until(() => S.highlights.filter(h => h.kind === 'note').length > n0); return { antes: n0, depois: S.highlights.filter(h => h.kind === 'note').length };`);
  await t.check('"Adicionar nota aqui" cria uma nota na página', r.depois === r.antes + 1, r);

  t.step('marcar a página pelo menu');
  await t.ev(`A.closePopup(); document.activeElement.blur(); return 1`);
  await t.click(P.x + 250, P.y + 200, 'right');
  r = await t.ev(`await until(() => $('.popMenu')); [...$$('.popMenu .popItem')].find(b => /Marcar a página/.test(b.textContent)).click();
    await until(() => S.bookmarks.length); return S.bookmarks.map(b => b.page);`);
  await t.check('"Marcar a página" cria o marcador da página', r.includes(1), r);

  t.step('ferramenta Mão');
  const s0 = await t.ev(`A.setTool('hand'); return $('#viewer').scrollTop;`);
  await t.stroke(line(P.x, P.y, P.x, P.y - 200, 10));
  r = await t.ev(`return { antes: ${s0}, depois: $('#viewer').scrollTop, sel: getSelection().toString().length };`);
  await t.check('Mão: arrastar rola a página sem selecionar texto', r.depois - r.antes > 150 && r.sel === 0, r);

  t.step('marcação de zoom');
  const z0 = await t.ev(`A.setTool('text'); A.fitWidth(); await until(() => S.scale); A.setTool('zoom'); return S.scale;`);
  const Z = await t.ev(`const r = $('.page').getBoundingClientRect(); return { x: r.left + 300, y: Math.max(r.top + 300, 300) };`);
  await t.stroke(line(Z.x - 100, Z.y - 100, Z.x + 100, Z.y + 50, 10));
  r = await t.ev(`await until(() => S.scale > ${z0} * 1.5, 3000); return { antes: ${z0}, depois: S.scale, ferramenta: S.tool };`);
  await t.check('Marcação de zoom: o trecho contornado é ampliado e a ferramenta volta à seleção', r.depois > r.antes * 1.5 && r.ferramenta === 'text', r);

  t.step('atalhos H e Z');
  r = await t.ev(`document.activeElement?.blur(); A.closePopup(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true })); const h = S.tool;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', bubbles: true })); const z = S.tool; A.setTool('text'); return { h, z };`);
  await t.check('H liga a Mão e Z liga a Marcação de zoom', r.h === 'hand' && r.z === 'zoom', r);

  t.step('clique direito num grifo');
  const G = await t.ev(`A.fitWidth(); await until(() => $$('.page .textLayer span').length);
    const sp = $$('.page .textLayer span').find(s => s.textContent.length > 20); sp.scrollIntoView({ block: 'center', behavior: 'instant' }); const rg = document.createRange(); rg.selectNodeContents(sp.firstChild);
    getSelection().removeAllRanges(); getSelection().addRange(rg); A.highlightSelection(); await until(() => S.highlights.some(h => h.kind === 'text'));
    getSelection().removeAllRanges(); sp.scrollIntoView({ block: 'center', behavior: 'instant' }); const q = sp.getBoundingClientRect(); return { x: q.left + 10, y: q.top + q.height / 2 };`);
  await t.click(G.x, G.y, 'right');
  r = await t.ev(`await until(() => !$('#popup').hidden && $('#popup').childElementCount > 0, 2000); return { popup: !$('#popup').hidden, menu: !!$('.popMenu') };`);
  await t.check('clique direito num grifo abre a edição do grifo (não o menu)', r.popup && !r.menu, r);

  t.step('X e Esc do painel lateral');
  r = await t.ev(`$('.popMenu') && document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await until(() => !$('.popMenu')); A.closePopup(); A.openSearch(); await until(() => document.body.classList.contains('side-open')); $('#btnSideClose').click();
    await until(() => !document.body.classList.contains('side-open')); const x = !document.body.classList.contains('side-open');
    A.openSearch(); await until(() => document.body.classList.contains('side-open'));
    $('#sidebar input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await until(() => !document.body.classList.contains('side-open')); return { x, esc: !document.body.classList.contains('side-open') };`);
  await t.check('o X e o Esc fecham o painel lateral', r.x && r.esc, r);
  await t.close();
};
