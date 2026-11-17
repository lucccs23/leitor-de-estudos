// Grifos: grifo por cima de grifo vira um só, juntar grifos antigos empilhados e lembrete de revisão.
const SEL = `const selRange = (a, b) => {
    const spans = [...$('.page .textLayer').querySelectorAll('span')].filter(s => s.firstChild && s.firstChild.nodeType === 3);
    let pos = 0, r = document.createRange(), sa = false;
    for (const s of spans) { const n = s.firstChild, L = n.length;
      if (!sa && a < pos + L) { r.setStart(n, a - pos); sa = true; }
      if (sa && b <= pos + L) { r.setEnd(n, b - pos); break; }
      pos += L; }
    const sl = getSelection(); sl.removeAllRanges(); sl.addRange(r); return sl.toString(); };
  const i0 = [...$('.page .textLayer').querySelectorAll('span')].map(s => s.textContent).join('').indexOf('Mulher de 68');
  const texts = () => S.highlights.filter(h => h.kind === 'text').map(h => ({ t: h.text, c: h.color, s: h.style }));`;

export default async ({ launch, fixtures }) => {
  const t = await launch({ width: 1300 });
  await t.open(fixtures.texto, 'texto.pdf');
  await t.ev(`A.setTool('text'); A.setAutoHL(false); return 1`);

  t.step('grifa metade e depois o trecho inteiro');
  let r = await t.ev(`${SEL} if (i0 < 0) return 'sem texto';
    const s1 = selRange(i0, i0 + 30); A.highlightSelection(A.COLORS[0].id);
    const s2 = selRange(i0, i0 + 90); A.highlightSelection(A.COLORS[1].id);
    return { s1, s2, grifos: texts() };`);
  await t.check('metade e depois inteiro: vira 1 grifo, com a cor nova', r.grifos?.length === 1 && r.grifos[0].c === 'g' && r.grifos[0].t.length >= r.s2.trim().length - 2, r);

  t.step('grifa com sobreposição parcial');
  r = await t.ev(`${SEL} selRange(i0 + 60, i0 + 150); A.highlightSelection(A.COLORS[2].id); return texts();`);
  await t.check('sobreposição parcial: junta área e texto', r.length === 1 && r[0].c === 'b' && r[0].t.startsWith('Mulher de 68') && r[0].t.length > 120, r);

  t.step('grifa trecho separado e sublinha por cima');
  r = await t.ev(`${SEL} selRange(i0 + 300, i0 + 340); A.highlightSelection(A.COLORS[3].id);
    S.style = 'underline'; selRange(i0, i0 + 40); A.highlightSelection(A.COLORS[4].id); S.style = 'fill'; return texts();`);
  await t.check('trecho sem sobreposição e sublinhado ficam à parte', r.length === 3 && r.some(x => x.s === 'underline'), r);

  t.step('Ctrl+Z três vezes');
  r = await t.ev(`A.undo(); A.undo(); A.undo(); return S.highlights.filter(h => h.kind === 'text').length;`);
  await t.check('Ctrl+Z desfaz a junção', r === 1, r);

  t.step('cria grifos empilhados à moda antiga e junta');
  r = await t.ev(`const mk = (x, w, c) => A.normHl({ id: A.uid(), kind: 'text', style: 'fill', color: c, text: 't' + x, note: '', parts: [{ page: 2, rects: [{ x, y: .3, w, h: .02 }] }], created: Date.now() });
    S.highlights = S.highlights.filter(h => h.kind !== 'text'); S.highlights.push(mk(.1, .3, 'y'), mk(.1, .6, 'g'), mk(.5, .2, 'b'), mk(.1, .3, 'p'));
    const conta = A.countOverlaps(); A.cleanOverlaps();
    const depois = S.highlights.filter(h => h.kind === 'text'); A.undo();
    return { conta, depois: depois.length, cor: depois[0]?.color, desfeito: S.highlights.filter(h => h.kind === 'text').length };`);
  await t.check('juntar grifos sobrepostos: 1 grifo com a cor do mais novo; Ctrl+Z desfaz', r.conta === 3 && r.depois === 1 && r.cor === 'p' && r.desfeito === 4, r);

  t.step('cartão vencido + reabrir');
  await t.ev(`const h = S.highlights.find(x => x.kind === 'text'); h.srs = { box: 1, due: Date.now() - 1000 }; await A.saveDoc();
    localStorage.removeItem('le.rvDay'); localStorage.removeItem('le.rvHint'); localStorage.setItem('le.overlapHint', JSON.stringify([S.fp])); return 1`);
  await t.reload();
  r = await t.ev(`const seen = []; new MutationObserver(() => { const x = $('#toast').textContent; if (x && seen.at(-1) !== x) seen.push(x); }).observe($('#toast'), { childList: true, characterData: true, subtree: true });
    await until(() => seen.some(x => /para hoje/.test(x)), 9000); const inicio = seen.slice(); return inicio;`);
  await t.check('lembrete ao abrir o Vetra quando há revisão para hoje', r.some(x => /revis.+para hoje/.test(x)), r);
  await t.open(fixtures.texto, 'texto.pdf');
  r = await t.ev(`const seen = []; new MutationObserver(() => { const x = $('#toast').textContent; if (x) seen.push(x); }).observe($('#toast'), { childList: true, characterData: true, subtree: true });
    await until(() => seen.length, 5000); return seen;`);
  await t.check('lembrete ao abrir o PDF com cartão vencido', r.some(x => /para revisar hoje neste PDF/.test(x)), r);
  await t.close();
};
