// S Pen: ponta e borracha mostradas sob a caneta, aviso da ação do botão ao lado da ponta, mão apoiada (palma)
// e o aviso do botão que chega depois do toque (o começo do traço vira borracha).
// A caneta é simulada pelo protocolo do navegador (pointerType "pen"); o aviso do app de Android, por window.vetraSpenBotao.
export default async ({ launch, fixtures }) => {
  const t = await launch({ width: 1300 });
  await t.open(fixtures.texto, 'texto.pdf');
  const P = await t.ev(`A.setPen('pen'); A.setTool('ink'); const r = S.pages[0].el.getBoundingClientRect(); return { x: r.left + 150, y: r.top + 300 };`);
  const pen = (type, x, y, buttons = 0) => t.send('Input.dispatchMouseEvent', { type, x, y, button: buttons || type === 'mouseReleased' ? 'left' : 'none', buttons, pointerType: 'pen', force: buttons & 1 ? 0.5 : 0 });
  const risco = async (y, meio) => {
    await pen('mouseMoved', P.x, y); await pen('mousePressed', P.x, y, 1);
    for (let i = 1; i <= 30; i++) { if (i === 3 && meio) await meio(); await pen('mouseMoved', P.x + i * 8, y, 1); }
    await pen('mouseReleased', P.x + 240, y);
  };
  const anel = () => t.ev(`const a = $('.penAnel'); return { visivel: !a.hidden, classe: a.className };`);

  t.step('caneta pairando');
  await pen('mouseMoved', P.x, P.y); await pen('mouseMoved', P.x + 4, P.y);
  let r = await anel();
  await t.check('pairando com a Caneta aparece o ponto da ponta', r.visivel && /ponta/.test(r.classe), r);
  r = await t.ev(`await until(() => $('.penAnel').hidden, 2000); return $('.penAnel').hidden;`);
  await t.check('sem sinal da caneta (afastou da tela) o ponto some sozinho', r, r);
  await pen('mouseMoved', P.x + 8, P.y);
  r = await t.ev(`window.vetraSpenLonge(); return $('.penAnel').hidden;`);
  await t.check('o aviso do app de Android de que a caneta saiu também apaga o ponto', r, r);

  t.step('borracha');
  await risco(P.y);
  await t.ev(`await until(() => S.highlights.length === 1); A.setTool('erase'); return 1`);
  await pen('mouseMoved', P.x + 40, P.y - 30);
  r = await anel();
  await t.check('pairando com a borracha aparece o círculo da borracha', r.visivel && /borracha/.test(r.classe), r);
  await pen('mousePressed', P.x + 40, P.y - 30, 1);
  for (let i = 1; i <= 15; i++) await pen('mouseMoved', P.x + 40, P.y - 30 + i * 4, 1);
  r = await t.ev(`const a = $('.penAnel'); return { visivel: !a.hidden, grifos: S.highlights.length };`);
  await pen('mouseReleased', P.x + 40, P.y + 30);
  await t.check('apagando, o círculo continua sob a caneta', r.visivel && r.grifos === 0, r);

  t.step('botão no ar mostra a borracha e avisa ao lado da ponta');
  await t.ev(`A.undo(); A.setTool('ink'); await until(() => S.highlights.length === 1); return 1`);
  await t.ev(`window.vetraSpenBotao(true, false); return 1`);
  await pen('mouseMoved', P.x + 60, P.y);
  r = await anel();
  await t.check('com o botão apertado no ar, a Caneta mostra o círculo da borracha', r.visivel && /borracha/.test(r.classe), r);
  await t.ev(`window.vetraSpenBotao(false, false); return 1`);
  r = await t.ev(`await until(() => $('.spenAviso.show'), 2000); return { texto: $('.spenAviso').textContent, grifos: S.highlights.length };`);
  await t.check('soltar o botão sem encostar desfaz e avisa ao lado da ponta', r.texto === 'Desfeito' && r.grifos === 0, r);

  t.step('aviso do botão depois do toque');
  await t.ev(`A.undo(); await until(() => S.highlights.length === 1); return 1`);
  await risco(P.y, () => t.ev(`window.vetraSpenBotao(true, true); return 1`));
  await t.ev(`window.vetraSpenBotao(false, false); return 1`);
  r = await t.ev(`await until(() => !S.highlights.length, 2000); return { grifos: S.highlights.length, desenho: $$('.drawLayer svg').length, ferramenta: S.tool };`);
  await t.check('se o aviso do botão chega logo depois do toque, o traço inteiro vira borracha', r.grifos === 0 && r.desenho === 0 && r.ferramenta === 'ink', r);

  t.step('mão apoiada');
  const toque = id => t.ev(`const dl = S.pages[0].el.querySelector('.drawLayer'), r = dl.getBoundingClientRect(), s0 = $('#viewer').scrollTop;
    const o = { pointerType: 'touch', pointerId: ${id}, bubbles: true, cancelable: true, clientX: r.left + 300, clientY: r.top + 500, button: 0, buttons: 1, width: 20, height: 20 };
    dl.dispatchEvent(new PointerEvent('pointerdown', o)); dl.dispatchEvent(new PointerEvent('pointermove', { ...o, clientY: o.clientY - 150 }));
    dl.dispatchEvent(new PointerEvent('pointerup', { ...o, clientY: o.clientY - 150 })); return $('#viewer').scrollTop - s0;`);
  await pen('mouseMoved', P.x, P.y);
  const palma = await toque(91);
  const dedo = await t.ev(`await until(() => !A.penRecente(), 3000); return 1`).then(() => toque(92));
  await t.check('com a caneta por perto, o toque da mão não rola a página; sem a caneta, o dedo rola', palma === 0 && dedo > 100, { palma, dedo });
  await t.close();
};
