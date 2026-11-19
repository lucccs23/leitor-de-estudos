// Botão lateral da S Pen (configurável no painel da caneta): apertar no ar e segurar na tela.
// A caneta é simulada pelo protocolo do navegador (pointerType "pen"); o botão lateral é o bit 2 de "buttons".
const N_INK = `S.highlights.filter(h => h.kind === 'ink').length`;

export default async ({ launch, fixtures }) => {
  const t = await launch({ width: 1300 });
  await t.open(fixtures.texto, 'texto.pdf');
  const G = await t.ev(`A.setPen('pen'); A.setTool('ink'); const r = $('.page').getBoundingClientRect(); return { x: r.left + 140, y: Math.max(r.top + 160, 200) };`);
  const pen = (type, x, y, buttons, button = 'none') => t.send('Input.dispatchMouseEvent', { type, x, y, button, buttons, pointerType: 'pen', force: buttons & 1 ? 0.5 : 0 });
  const traco = async (y, botoes) => {
    await pen('mouseMoved', G.x, y, 0); await pen('mousePressed', G.x, y, botoes, 'left');
    for (let i = 1; i <= 10; i++) await pen('mouseMoved', G.x + i * 20, y, botoes);
    await pen('mouseReleased', G.x + 200, y, 0, 'left');
  };
  // apertar o botão com a caneta no ar (depois de um intervalo sem tocar na tela)
  const noAr = async () => { await t.ev('await wait(450); return 1'); await pen('mouseMoved', G.x + 300, G.y + 200, 0); await pen('mouseMoved', G.x + 302, G.y + 201, 2); await pen('mouseMoved', G.x + 304, G.y + 202, 0); };

  t.step('traço com a caneta');
  await traco(G.y, 1);
  let r = await t.ev(`await until(() => ${N_INK} === 1, 2500); return ${N_INK};`);
  t.step('aperta o botão no ar (padrão: desfazer)');
  await noAr();
  r = await t.ev(`await until(() => ${N_INK} === 0, 2500); return { n: ${N_INK}, tool: S.tool };`);
  await t.check('apertar o botão no ar desfaz o último traço (padrão)', r.n === 0 && r.tool === 'ink', r);

  await t.ev(`A.setSpen('ar', 'borracha'); return 1`);
  t.step('botão no ar em "borracha"');
  await noAr();
  const liga = await t.ev(`await until(() => S.tool === 'erase', 2000); return S.tool;`);
  await noAr();
  const volta = await t.ev(`await until(() => S.tool === 'ink', 2000); return S.tool;`);
  await t.check('configurado como borracha: liga e, apertado de novo, volta à caneta', liga === 'erase' && volta === 'ink', { liga, volta });

  await t.ev(`A.setSpen('tela', 'marcatexto'); return 1`);
  t.step('traço segurando o botão (botão apertado antes de encostar)');
  await traco(G.y + 60, 3);
  r = await t.ev(`await until(() => ${N_INK} === 1, 2500); const h = S.highlights.filter(h => h.kind === 'ink').at(-1); await wait(500);
    return { n: ${N_INK}, marker: !!(h && h.marker), pen: S.pen, tool: S.tool };`);
  await t.check('segurar o botão na tela risca com o marca-texto, sem trocar a ferramenta, e não conta como clique no ar', r.n === 1 && r.marker && r.pen === 'pen' && r.tool === 'ink', r);

  r = await t.ev(`$('#btnPenOpts').click(); await until(() => $('.ppSpen select'), 2000);
    const s = $$('.ppSpen select'); s[0].value = 'proxima'; s[0].dispatchEvent(new Event('change'));
    return { valores: s.map(x => x.value), salvo: A.spen() };`);
  await t.check('o painel da caneta mostra e salva a escolha do botão', r.valores[1] === 'marcatexto' && r.salvo.ar === 'proxima' && r.salvo.tela === 'marcatexto', r);
  await t.ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return 1`);

  t.step('botão no ar em "próxima página"');
  const p0 = await t.ev('return S.currentPage');
  await noAr();
  r = await t.ev(`await until(() => S.currentPage === ${p0 + 1}, 3000); return S.currentPage;`);
  await t.check('configurado como "próxima página": vira a página', r === p0 + 1, { p0, r });
  await t.close();
};
