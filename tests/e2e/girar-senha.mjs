// Girar a visualização (o arquivo não muda) e abrir PDF com senha (1.30.0).
import { readFileSync } from 'node:fs';
import { line } from '../lib/browser.mjs';
import { SENHA_TESTE } from '../lib/fixtures.mjs';

const PRONTA = `await until(() => S.pages[0].renderedScale === S.scale && !S.pages[0].rendering && S.pages[0].el.querySelectorAll('.textLayer span').length > 2, 8000);`;
const GRIFA = `const sp = S.pages[0].el.querySelectorAll('.textLayer span')[2]; sp.scrollIntoView({ block: 'center', behavior: 'instant' });
  const rg = document.createRange(); rg.selectNodeContents(sp.firstChild); getSelection().removeAllRanges(); getSelection().addRange(rg);
  A.highlightSelection(); await until(() => S.highlights.some(h => h.kind === 'text')); getSelection().removeAllRanges();
  const r = S.highlights.find(h => h.kind === 'text').parts[0].rects[0]; return [r.x, r.y, r.w, r.h].map(v => +v.toFixed(3));`;

export default async ({ launch, fixtures }) => {
  // ---------- girar ----------
  const t = await launch({ width: 1300, height: 900 });
  await t.open(fixtures.texto, 'texto.pdf');

  t.step('grifo sem girar');
  const semGirar = await t.ev(`${PRONTA} ${GRIFA}`);
  await t.ev(`A.undo(); await until(() => !S.highlights.length); return 1`);

  t.step('gira 90°');
  let r = await t.ev(`const a = { w: S.pages[0].el.offsetWidth, h: S.pages[0].el.offsetHeight }; A.girar(90); ${PRONTA}
    return { antes: a, depois: { w: S.pages[0].el.offsetWidth, h: S.pages[0].el.offsetHeight }, rot: S.rotacao, attr: S.pages[0].el.dataset.rot };`);
  await t.check('girar deita a página (a caixa troca de proporção) e marca o giro', r.rot === 90 && r.attr === '90' && r.antes.h > r.antes.w && r.depois.w > r.depois.h, r);

  t.step('grifo com a página girada');
  const girado = await t.ev(`${PRONTA} ${GRIFA}`);
  await t.check('com a página girada, o grifo de texto fica no mesmo lugar da página', girado.every((v, i) => Math.abs(v - semGirar[i]) < 0.002), { semGirar, girado });

  t.step('traço com a página girada');
  const C = await t.ev(`A.setTool('ink'); S.pages[0].el.scrollIntoView({ block: 'start', behavior: 'instant' }); const q = S.pages[0].el.getBoundingClientRect();
    return { x: q.left + 40, y: Math.max(q.top + 40, 80), top: q.top, left: q.left, w: q.width, h: q.height };`);
  await t.stroke(line(C.x, C.y, C.x + 60, C.y, 8));
  r = await t.ev(`await until(() => S.highlights.some(h => h.kind === 'ink')); const p0 = S.highlights.find(h => h.kind === 'ink').parts[0].paths[0][0];
    return { ponto: p0.slice(0, 2), esperado: [(${C.y} - ${C.top}) / ${C.h}, 1 - (${C.x} - ${C.left}) / ${C.w}] };`);
  await t.check('o traço feito no canto da tela vai para o canto certo da página original', Math.abs(r.ponto[0] - r.esperado[0]) < 0.002 && Math.abs(r.ponto[1] - r.esperado[1]) < 0.002, r);

  t.step('clique direito no grifo com a página girada');
  const G = await t.ev(`A.setTool('text'); const g = $('.page .hl'); g.scrollIntoView({ block: 'center', behavior: 'instant' }); const q = g.firstElementChild.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 };`);
  await t.click(G.x, G.y, 'right');
  r = await t.ev(`await until(() => !$('#popup').hidden && $('#popup').childElementCount > 0, 2000); return { popup: !$('#popup').hidden, menu: !!$('.popMenu') };`);
  await t.check('clique direito no grifo da página girada abre a edição do grifo', r.popup && !r.menu, r);

  t.step('reabre');
  await t.ev(`A.closePopup(); await A.saveDoc(); return 1`);
  await t.open(fixtures.prova, 'prova.pdf');
  await t.open(fixtures.texto, 'texto.pdf');
  r = await t.ev(`return { rot: S.rotacao, attr: S.pages[0].el.dataset.rot, deitada: S.pages[0].el.offsetWidth > S.pages[0].el.offsetHeight };`);
  await t.check('o giro de cada PDF fica guardado', r.rot === 90 && r.attr === '90' && r.deitada, r);
  r = await t.ev(`A.girar(90); const a = S.rotacao; A.girar(90); const b = S.rotacao; A.girar(90); return { a, b, volta: S.rotacao, attr: S.pages[0].el.dataset.rot ?? null };`);
  await t.check('girando de novo passa por 180° e 270° e volta à posição original', r.a === 180 && r.b === 270 && r.volta === 0 && r.attr === null, r);
  await t.close();

  // ---------- senha ----------
  const s = await launch({ width: 1300 });
  const b64 = readFileSync(fixtures.protegido).toString('base64');
  const abre = `const bin = atob(${JSON.stringify(b64)}), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);`;

  s.step('abre o PDF com senha');
  r = await s.ev(`${abre} window.__abriu = leitor.openData(u.buffer, 'protegido.pdf'); await until(() => $('#senhaDlg')?.open, 5000);
    return { aberta: $('#senhaDlg').open, titulo: $('#senhaDlg h3').textContent };`);
  await s.check('PDF com senha: o Vetra pede a senha', r.aberta && /senha/.test(r.titulo), r);
  r = await s.ev(`$('#senhaDlg input').value = 'errada'; $('#senhaDlg form').requestSubmit(); await until(() => $('#senhaDlg').open && !$('.senhaErro').hidden, 5000);
    return { deNovo: $('#senhaDlg').open, erro: $('.senhaErro').textContent };`);
  await s.check('senha errada: avisa e pede de novo', r.deNovo && /incorreta/.test(r.erro), r);
  r = await s.ev(`$('#senhaDlg input').value = ${JSON.stringify(SENHA_TESTE)}; $('#senhaDlg form').requestSubmit(); const ok = await __abriu; await until(() => S.pdf && $('.page .textLayer span'), 8000);
    return { ok, texto: $$('.page .textLayer span').map(x => x.textContent).join(' '), protegido: S.protegido };`);
  await s.check('senha certa: abre o PDF com o texto selecionável', r.ok && /Texto secreto do Vetra/.test(r.texto) && r.protegido, r);

  s.step('grifos ficam no Vetra; o arquivo não é regravado');
  const P = await s.ev(`A.setTool('ink'); const q = S.pages[0].el.getBoundingClientRect(); return { x: q.left + 100, y: q.top + 300 };`);
  await s.stroke(line(P.x, P.y, P.x + 200, P.y, 10));
  r = await s.ev(`await until(() => S.highlights.length === 1); await A.savePdf(); const aviso = $('#toast').textContent; return { grifos: S.highlights.length, aviso };`);
  await s.check('desenha normalmente e exportar avisa em vez de regravar o arquivo com senha', r.grifos === 1 && /tem senha/.test(r.aviso), r);

  s.step('reabre na mesma sessão');
  r = await s.ev(`await A.closeTab(S.fp); ${abre} const ok = await leitor.openData(u.buffer, 'protegido.pdf'); return { ok, pediu: !!$('#senhaDlg')?.open, grifos: S.highlights.length };`);
  await s.check('reabrir na mesma sessão não pede a senha de novo e mantém o grifo', r.ok && !r.pediu && r.grifos === 1, r);

  s.step('cancelar');
  await s.reload();
  r = await s.ev(`${abre} const p = leitor.openData(u.buffer, 'protegido.pdf'); await until(() => $('#senhaDlg')?.open, 5000); btnT($('#senhaDlg'), 'Cancelar').click(); const ok = await p; return { ok, pdf: !!S.pdf };`);
  await s.check('cancelar a senha não abre o PDF', !r.ok && !r.pdf, r);
  await s.open(fixtures.texto, 'texto.pdf');
  r = await s.ev(`return { protegido: S.protegido, pediu: !!$('#senhaDlg')?.open };`);
  await s.check('PDF comum abre sem pedir senha', !r.protegido && !r.pediu, r);
  await s.close();
};
