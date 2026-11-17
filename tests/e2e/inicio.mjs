// Abrir o app, abrir um PDF, voltar sempre para a página inicial e reabrir a última aba fechada.
export default async ({ launch, fixtures }) => {
  for (const width of [1300, 390]) {
    const t = await launch({ width });
    t.step('confere a página inicial');
    let r = await t.ev(`return { home: !document.body.classList.contains('has-doc'), versao: A.VERSION };`);
    await t.check('abre na página inicial', r.home && /^\d+\.\d+\.\d+$/.test(r.versao), r);
    await t.open(fixtures.texto, 'texto.pdf');
    r = await t.ev(`return { doc: document.body.classList.contains('has-doc'), paginas: S.pages.length, texto: $$('.page .textLayer span').length > 5 };`);
    await t.check('abre o PDF com texto selecionável', r.doc && r.paginas === 5 && r.texto, r);
    await t.reload();
    r = await t.ev(`return { doc: document.body.classList.contains('has-doc'), abas: $$('#tabs .tab').length };`);
    await t.check('reabre na página inicial, sem abas', !r.doc && r.abas === 0, r);
    t.step('Ctrl+Shift+T');
    r = await t.ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'T', code: 'KeyT', ctrlKey: true, shiftKey: true, bubbles: true })); await until(() => S.pdf, 8000); return { doc: !!S.pdf, nome: S.name };`);
    await t.check('Ctrl+Shift+T traz o último PDF de volta', r.doc && r.nome === 'texto.pdf', r);
    await t.close();
  }
};
