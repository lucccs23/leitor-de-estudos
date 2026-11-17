// Simulado: marcar na própria prova, riscar, parar e continuar, entregar, resultado, revisar erros,
// refazer só os erros e exportar a planilha. Gabarito da prova de teste: 1-A 2-B 3-C 4-D 5-A…
const START = `A.openExam(); await until(() => btnT($('#examView'), 'Começar simulado'), 20000);
  const v = $('#examView'); v.querySelector('.exSelect').value = '4'; btnT(v, 'Começar simulado').click();
  await until(() => $$('.altBox').length >= 60, 20000);
  return { alts: $$('.altBox').length, q1: $$('.altBox[data-q="1"]').map(b => b.dataset.l).sort().join(''), folha: $$('.qRow').length };`;
const box = (q, L) => `const b = $('.altBox[data-q="${q}"][data-l="${L}"]'); b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.left + Math.min(r.width / 2, 60), y: r.top + Math.min(r.height / 2, 8) };`;
const answer = list => `for (const [q, L] of ${JSON.stringify(list)}) { $('.qRow[data-q="' + q + '"] .qNum').click(); document.dispatchEvent(new KeyboardEvent('keydown', { key: L.toLowerCase(), bubbles: true })); }`;
const DELIVER = `btnT($('#examBar'), 'Entregar').click(); await until(() => btnT($('#examView'), 'Entregar')); btnT($('#examView'), 'Entregar').click();
  await until(() => $('#examView textarea.exKey') || $('#examView .resTop'), 8000);
  const ta = $('#examView textarea.exKey');
  if (ta) { ta.value = Array.from({ length: 20 }, (_, i) => (i + 1) + '-' + 'ABCD'[i % 4]).join(' '); ta.dispatchEvent(new Event('input')); btnT($('#examView'), 'Corrigir').click(); await until(() => $('#examView .resTop')); }`;

export default async ({ launch, fixtures }) => {
  const t = await launch({ width: 1300 });
  await t.open(fixtures.prova, 'prova.pdf');
  t.step('configura e começa');
  let r = await t.ev(START);
  await t.check('acha as 20 questões e as alternativas A–D no PDF', r.folha === 20 && r.alts >= 80 && r.q1 === 'ABCD', r);

  t.step('clica na alternativa C da questão 1');
  let p = await t.ev(box(1, 'C')); await t.click(p.x, p.y);
  r = await t.ev(`await until(() => $('.qRow[data-q="1"] .bubble.sel')); return { sel: $('.altBox[data-q="1"][data-l="C"]').classList.contains('sel'), bolha: $('.qRow[data-q="1"] .bubble.sel')?.textContent, etiqueta: $('.qBadge[data-q="1"]')?.textContent };`);
  await t.check('clicar na alternativa da prova marca a resposta', r.sel && r.bolha === 'C' && r.etiqueta === 'C', r);
  t.step('botão direito na A');
  p = await t.ev(box(1, 'A')); await t.click(p.x, p.y, 'right');
  r = await t.ev(`await until(() => $('.qRow[data-q="1"] .bubble.elim')); return { risca: $('.altBox[data-q="1"][data-l="A"]').classList.contains('elim'), resposta: $('.qRow[data-q="1"] .bubble.sel')?.textContent };`);
  await t.check('botão direito risca a alternativa e mantém a resposta', r.risca && r.resposta === 'C', r);

  t.step('responde pelo teclado; Z na 3');
  r = await t.ev(`${answer([[2, 'B'], [3, 'A'], [4, 'D'], [5, 'A']])} $('.qRow[data-q="3"] .qNum').click(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', bubbles: true })); return $('#exProg').textContent;`);
  await t.check('teclado responde e Z marca chute', /^5 de 20 respondidas/.test(r) && /1 no chute/.test(r), r);

  t.step('Parar → sair e continuar depois');
  r = await t.ev(`$('#examBar .exStop').click(); await until(() => $('.popMenu')); btnT($('.popMenu'), 'Sair e continuar depois').click();
    return { modo: document.body.classList.contains('exam'), botao: $('#btnExam').textContent.trim() };`);
  await t.check('parar: sai da prova e o botão vira "Continuar simulado"', !r.modo && r.botao === 'Continuar simulado', r);
  r = await t.ev(`$('#btnExam').click(); await until(() => document.body.classList.contains('exam')); return { modo: true, prog: $('#exProg').textContent };`);
  await t.check('continuar retoma com as respostas', /^5 de 20/.test(r.prog), r);

  t.step('entrega e corrige');
  r = await t.ev(`${DELIVER} const res = $('#examView'); return { placar: res.querySelector('h2').textContent, botoes: [...res.querySelectorAll('.rvActions button')].map(b => b.textContent.trim()) };`);
  // acertos: 2, 4, 5 · erros: 1 (C≠A), 3 (A≠C, no chute) · 15 em branco
  await t.check('resultado: 3 de 20, com Revisar erros (2), Refazer só os erros (17) e Exportar planilha',
    /^3 de 20/.test(r.placar) && r.botoes.includes('Revisar os erros na prova (2)') && r.botoes.includes('Refazer só os erros (17)') && r.botoes.includes('Exportar planilha'), r);

  t.step('exporta a planilha');
  r = await t.ev(`let got; const d = A.download; A.download = (c, n) => { got = { c, n }; }; btnT($('#examView'), 'Exportar planilha').click(); A.download = d;
    const L = got.c.split('\\r\\n'); return { nome: got.n, bom: got.c.charCodeAt(0) === 0xfeff, q3: L.find(l => l.startsWith('3;')), linhas: L.length };`);
  await t.check('planilha: uma linha por questão (resposta, gabarito, resultado, chute)', r.nome.endsWith('.csv') && r.bom && /^3;[^;]*;A;C;erro;sim;/.test(r.q3), r);

  t.step('revisar os erros na prova');
  r = await t.ev(`btnT($('#examView'), 'Revisar os erros na prova').click(); await until(() => $('#examView').hidden);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true }));
    return { filtro: $('.exFilter.on')?.textContent, linhas: $$('.qRow').filter(x => !x.hidden).map(x => x.dataset.q), cur: $('.qRow.cur')?.dataset.q, certa1: $$('.altMark.key[data-q="1"]').map(x => x.dataset.l) };`);
  await t.check('revisar erros: só as erradas na folha, J pula para a próxima, a certa destacada', /Erradas 2/.test(r.filtro) && r.linhas.join() === '1,3' && r.cur === '3' && r.certa1.join() === 'A', r);

  t.step('refazer só os erros');
  r = await t.ev(`btnT($('#examBar'), 'Resultado').click(); await until(() => btnT($('#examView'), 'Refazer só os erros')); btnT($('#examView'), 'Refazer só os erros').click();
    await until(() => !document.body.classList.contains('exam-review') && $$('.qRow').length);
    return { linhas: $$('.qRow').length, primeira: $('.qRow')?.dataset.q, apagadas: $$('.qBadge.off').map(b => b.dataset.q), alts2: $$('.altBox[data-q="2"]').length, prog: $('#exProg').textContent };`);
  await t.check('refazer só os erros: 17 questões; acertadas apagadas e sem clique', r.linhas === 17 && r.primeira === '1' && ['2', '4', '5'].every(q => r.apagadas.includes(q)) && r.alts2 === 0 && /^0 de 17/.test(r.prog), r);
  r = await t.ev(`${answer([[1, 'A'], [3, 'C']])} return { prog: $('#exProg').textContent, q2: $('.qRow[data-q="2"]') ? 'na folha' : 'fora' };`);
  await t.check('só valem as questões do conjunto', /^2 de 17/.test(r.prog) && r.q2 === 'fora', r);
  r = await t.ev(`${DELIVER} const res = $('#examView'); return { placar: res.querySelector('h2').textContent, aviso: [...res.querySelectorAll('.resInfo p')].some(p => /só com os erros/.test(p.textContent)) };`);
  await t.check('resultado da tentativa conta só as 17', /^2 de 17/.test(r.placar) && r.aviso, r);
  await t.close();

  // celular: marcar tocando na prova e entregar
  const m = await launch({ width: 390 });
  await m.open(fixtures.prova, 'prova.pdf');
  r = await m.ev(START);
  await m.check('celular: questões encontradas', r.folha === 20 && r.q1 === 'ABCD', r);
  p = await m.ev(box(2, 'B')); await m.click(p.x, p.y);
  r = await m.ev(`await until(() => $('.qBadge[data-q="2"]')?.textContent === 'B'); return { etiqueta: $('.qBadge[data-q="2"]')?.textContent, cabe: document.documentElement.scrollWidth <= innerWidth };`);
  await m.check('celular: tocar na alternativa marca, nada passa da largura', r.etiqueta === 'B' && r.cabe, r);
  await m.close();
};
