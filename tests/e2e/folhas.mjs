// Folhas de anotação do Vetra (1.29.0): folhas em branco entre as páginas, sem alterar o PDF.
import { line } from '../lib/browser.mjs';

const FOLHA = `$('.page.folha')`;
const DA_FOLHA = `S.highlights.filter(h => h.parts.some(p => p.page > A.FOLHA_BASE))`;

export default async ({ launch, fixtures }) => {
  const t = await launch({ width: 1300, height: 900 });
  await t.open(fixtures.texto, 'texto.pdf');

  t.step('insere uma folha depois da página 1');
  let r = await t.ev(`A.folhas.inserir(1); await until(() => ${FOLHA}); const f = ${FOLHA}, p1 = S.pages[0].el, p2 = S.pages[1].el;
    return { depois: p1.nextElementSibling === f, antes: f.nextElementSibling === p2, largura: f.offsetWidth === p1.offsetWidth, altura: f.offsetHeight === p1.offsetHeight,
      paginas: S.pages.length, folhas: S.folhas.length, ferramenta: S.tool, id: S.folhas[0].id };`);
  await t.check('a folha entra logo depois da página, do mesmo tamanho, sem mudar as páginas do PDF', r.depois && r.antes && r.largura && r.altura && r.paginas === 5 && r.folhas === 1 && r.ferramenta === 'ink', r);

  t.step('escreve na folha');
  const F = await t.ev(`${FOLHA}.scrollIntoView({ block: 'start', behavior: 'instant' }); const q = ${FOLHA}.getBoundingClientRect(); return { x: q.left + 120, y: q.top + 200 };`);
  await t.stroke(line(F.x, F.y, F.x + 250, F.y + 30, 15));
  r = await t.ev(`await until(() => ${DA_FOLHA}.length === 1); return { pagina: S.highlights[0].parts[0].page, naFolha: $$('.page.folha .inkLayer path').length, nasPaginas: $$('.page:not(.folha) .inkLayer path').length };`);
  await t.check('o traço feito na folha fica na folha (e não numa página do PDF)', r.pagina > 100000 && r.naFolha === 1 && r.nasPaginas === 0, r);

  t.step('desfazer, refazer e borracha na folha');
  r = await t.ev(`A.undo(); await until(() => !$$('.page.folha .inkLayer path').length); const d = $$('.page.folha .inkLayer path').length;
    A.redo(); await until(() => $$('.page.folha .inkLayer path').length === 1); return { desfeito: d, refeito: $$('.page.folha .inkLayer path').length };`);
  await t.check('desfazer e refazer funcionam na folha', r.desfeito === 0 && r.refeito === 1, r);
  await t.ev(`A.setTool('erase'); return 1`);
  await t.stroke(line(F.x + 120, F.y - 40, F.x + 120, F.y + 80, 12));
  r = await t.ev(`await until(() => !${DA_FOLHA}.length, 3000); return { grifos: ${DA_FOLHA}.length, naFolha: $$('.page.folha .inkLayer path').length };`);
  await t.check('a borracha apaga o traço da folha', r.grifos === 0 && r.naFolha === 0, r);
  await t.ev(`A.undo(); A.setTool('ink'); await until(() => ${DA_FOLHA}.length === 1); return 1`);

  t.step('fundo, painel e zoom');
  // a barra é refeita a cada troca: o botão é procurado de novo a cada toque
  r = await t.ev(`const a = ${FOLHA}.dataset.estilo; $('.folhaBarra .folhaEstilo').click(); const c = ${FOLHA}.dataset.estilo; $('.folhaBarra .folhaEstilo').click(); const d = ${FOLHA}.dataset.estilo;
    A.renderPanel(); return { a, c, d, cabecalhos: $$('.pgHead').map(x => x.textContent) };`);
  await t.check('o fundo troca entre pautada, quadriculada e lisa, e o painel mostra a folha', r.a === 'pautada' && r.c === 'quadriculada' && r.d === 'lisa' && r.cabecalhos.includes('Folha de anotação (depois da p. 1)'), r);
  r = await t.ev(`A.zoomBy(1.5); await until(() => S.pages[0].el.offsetWidth > 0 && ${FOLHA}.offsetWidth === S.pages[0].el.offsetWidth, 3000); return { folha: ${FOLHA}.offsetWidth, pagina: S.pages[0].el.offsetWidth };`);
  await t.check('com zoom a folha acompanha o tamanho da página', r.folha === r.pagina && r.folha > 0, r);
  await t.ev(`A.fitWidth(); return 1`);

  t.step('a folha não entra no PDF exportado');
  r = await t.ev(`const { bytes, count } = await A.buildPdfBytes(); const doc = await PDFLib.PDFDocument.load(bytes); return { paginas: doc.getPageCount(), marcacoes: count };`);
  await t.check('exportar o PDF continua com as páginas do PDF, sem a folha', r.paginas === 5 && r.marcacoes === 0, r);

  t.step('salva e reabre');
  await t.ev(`await A.saveDoc(); return 1`);
  await t.open(fixtures.prova, 'prova.pdf');
  await t.open(fixtures.texto, 'texto.pdf');
  r = await t.ev(`await until(() => ${FOLHA}); return { folhas: $$('.page.folha').length, depois: S.pages[0].el.nextElementSibling.classList.contains('folha'), tracos: $$('.page.folha .inkLayer path').length, estilo: ${FOLHA}.dataset.estilo };`);
  await t.check('ao reabrir o PDF a folha volta no lugar, com o traço e o fundo', r.folhas === 1 && r.depois && r.tracos === 1 && r.estilo === 'lisa', r);

  t.step('apaga a folha');
  r = await t.ev(`$('.folhaBarra button[title="Apagar esta folha"]').click(); await until(() => /Apagar a folha/.test($('.folhaNome').textContent)); const pergunta = $('.folhaNome').textContent;
    btnT($('.folhaBarra'), 'Apagar').click(); await until(() => !${FOLHA}); return { pergunta, folhas: S.folhas.length, grifos: ${DA_FOLHA}.length, desfazer: A.undoStack.length };`);
  await t.check('apagar pergunta antes e tira a folha e o que estava nela', /Apagar a folha/.test(r.pergunta) && r.folhas === 0 && r.grifos === 0 && r.desfazer === 0, r);
  await t.close();
};
