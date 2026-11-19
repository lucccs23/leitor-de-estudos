// "Grifar ao selecionar" no celular e no tablet: a seleção com o dedo ou com a S Pen termina sem o mouseup
// do computador (como no Android). Cada caso abre o app de novo para um não interferir no outro.

// seleciona um trecho como o Android faz: o ponteiro desce, a seleção muda e nenhum mouseup chega
const SELECT = (type, { auto = true, cancel = false, up = false } = {}) => `A.setTool('text'); A.setAutoHL(${auto}); const n0 = S.highlights.length;
  const sp = $$('.page .textLayer span').filter(e => e.textContent.length > 20)[0];
  dispatchEvent(new PointerEvent('pointerdown', { pointerType: '${type}', bubbles: true, isPrimary: true }));
  ${cancel ? `dispatchEvent(new PointerEvent('pointercancel', { pointerType: '${type}', bubbles: true }));` : ''}
  const r = document.createRange(); r.setStart(sp.firstChild, 0); r.setEnd(sp.firstChild, 12); getSelection().removeAllRanges(); getSelection().addRange(r);
  ${up ? `dispatchEvent(new PointerEvent('pointerup', { pointerType: '${type}', bubbles: true }));` : ''}
  const fim = await until(() => S.highlights.length > n0 || !$('#popup').hidden, 3000);
  return { fim, grifos: S.highlights.length - n0, menu: !$('#popup').hidden };`;

export default async ({ launch, fixtures }) => {
  const casos = [
    ['dedo: selecionar grifa sozinho', 'touch', {}, r => r.grifos === 1],
    ['S Pen (navegador assume o arraste): selecionar grifa sozinho', 'pen', { cancel: true }, r => r.grifos === 1],
    ['S Pen saindo da tela: grifa uma vez só', 'pen', { up: true }, r => r.grifos === 1],
    ['S Pen com o grifo desligado: abre o menu de cores', 'pen', { auto: false, cancel: true }, r => r.menu && r.grifos === 0],
  ];
  for (const [nome, tipo, o, ok] of casos) {
    const t = await launch({ width: 820 });
    await t.open(fixtures.texto, 'texto.pdf');
    t.step(nome);
    const r = await t.ev(SELECT(tipo, o));
    await t.check(nome, r.fim && ok(r), r);
    await t.close();
  }
};
