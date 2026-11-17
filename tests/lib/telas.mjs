// Capturas das telas principais em 1300/820/390 para conferir no olho (npm run shots → tests/out/telas-<largura>-<tela>.png).
// Não verifica nada sozinho além de "nada passa da largura": quem olha as imagens é você (ou o Claude, pelo /verify).
export default async ({ launch, fixtures }) => {
  for (const width of [1300, 820, 390]) {
    const t = await launch({ width });
    const fits = async nome => { const r = await t.ev(`return document.documentElement.scrollWidth <= innerWidth && $('#toolbar').scrollWidth <= $('#toolbar').clientWidth + 1;`); await t.check(`tela "${nome}" cabe na largura`, r, r); await t.shot(nome); };
    await fits('1-inicio');
    await t.open(fixtures.texto, 'texto.pdf');
    await t.ev(`A.setTool('text'); return 1`);
    await fits('2-leitura');
    await t.ev(`A.setPen('pen'); return 1`);
    await fits('3-caneta');
    await t.ev(`A.setTool('text'); return 1`);
    await t.open(fixtures.prova, 'prova.pdf');
    await t.ev(`A.openExam(); await until(() => btnT($('#examView'), 'Começar simulado'), 20000); const v = $('#examView'); v.querySelector('.exSelect').value = '4'; btnT(v, 'Começar simulado').click(); await until(() => $$('.altBox').length >= 60, 20000); return 1`);
    await fits('4-simulado');
    await t.close();
  }
};
