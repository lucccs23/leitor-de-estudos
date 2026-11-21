// Leitor de livros: EPUB lido direto (sem converter em PDF), modo leitura do PDF e texto corrido.
// O EPUB de teste (tests/lib/fixtures.mjs) tem 3 capítulos, sumário com subtítulo, CSS, imagem, capa
// e um <script> e um onclick que nunca podem rodar.
import { readFileSync } from 'node:fs';
import { line } from '../lib/browser.mjs';

const abrirLivro = async (t, file) => {
  t.step('abre o livro EPUB');
  const b64 = readFileSync(file).toString('base64');
  return t.ev(`const bin=atob(${JSON.stringify(b64)});const u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
    await leitor.openData(u.buffer, 'livro.epub');
    return await until(() => A.bookState() && A.bookFrame().contentDocument.querySelector('h1'), 15000);`);
};
const LIVRO = `const F = A.bookFrame(), D = F.contentDocument, L = () => A.bookState();`;
// aperta a tecla e espera o capítulo terminar de carregar (enquanto carrega, o leitor ignora as teclas)
const tecla = k => `document.dispatchEvent(new KeyboardEvent('keydown', { key: '${k}', bubbles: true })); await wait(20); await until(() => !A.bookState() || !A.bookState().carregando, 5000);`;

export default async ({ launch, fixtures }) => {
  // ---------- computador ----------
  let t = await launch({ width: 1300 });
  await t.ev(`localStorage.setItem('le.leitura', JSON.stringify({ tema: 'dia' })); return 1`); await t.reload();
  let ok = await abrirLivro(t, fixtures.livro);
  let r = await t.ev(`${LIVRO} return { ok: ${!!ok}, pdf: !!S.pdf, st: L(), h1: D.querySelector('h1')?.textContent, titulo: document.title };`);
  await t.check('EPUB abre direto no leitor, sem converter em PDF', r.ok && !r.pdf && r.st.name === 'Livro de Teste' && /A célula/.test(r.h1) && /Livro de Teste/.test(r.titulo), r);

  r = await t.ev(`${LIVRO} await until(() => D.images[0] && D.images[0].complete, 5000);
    return { scripts: D.scripts.length, onclick: !!D.querySelector('[onclick]'), titulo: document.title, sandbox: F.getAttribute('sandbox'), img: D.images[0]?.naturalWidth, css: getComputedStyle(D.querySelector('h1')).color };`);
  await t.check('o livro não roda código (sem scripts nem onclick) e mostra imagem e estilo da editora',
    r.scripts === 0 && !r.onclick && !/invadido/.test(r.titulo) && r.sandbox === 'allow-same-origin' && r.img > 0 && r.css === 'rgb(150, 20, 20)', r);

  r = await t.ev(`${LIVRO} $('.lrTop button[title^="Sumário"]').click(); await until(() => !$('.lrSide').hidden);
    const itens = $$('.lrSide .lrItem').map(b => b.querySelector('span').textContent);
    $$('.lrSide .lrItem').find(b => /2\\.1/.test(b.textContent)).click();
    await until(() => L().ch === 1 && L().off > 0 && !L().carregando, 5000); return { itens, st: L(), cap: $('.lrCap').textContent };`);
  await t.check('sumário do livro (com subtítulo) leva ao ponto certo', r.itens.length === 4 && r.st.ch === 1 && r.st.off > 0 && /2\.1/.test(r.cap), r);

  r = await t.ev(`${LIVRO} const p0 = L().pag, n = L().paginas; ${tecla('ArrowRight')} const p1 = L().pag;
    for (let i = 0; i < 30 && L().ch === 1; i++) { ${tecla('ArrowRight')} }
    const depois = L(); ${tecla('ArrowLeft')} await until(() => A.bookState().ch === 1, 3000); const volta = L();
    return { p0, p1, n, depois, volta };`);
  await t.check('setas viram a página e passam de um capítulo para o outro (e voltam ao fim do anterior)',
    r.n > 1 && r.p1 === r.p0 + 1 && r.depois.ch === 2 && r.depois.pag === 0 && r.volta.ch === 1 && r.volta.pag === r.volta.paginas - 1, r);

  r = await t.ev(`${LIVRO} const antes = L().pag; return { antes, x: F.getBoundingClientRect().right - 30, y: 400 };`);
  await t.click(r.x, r.y);
  r = await t.ev(`${LIVRO} await until(() => A.bookState().ch === 2 && !A.bookState().carregando, 3000); return L();`);
  await t.check('clique na borda direita vira a página', r.ch === 2, r);

  r = await t.ev(`${LIVRO} ${tecla('ArrowLeft')} await until(() => L().ch === 1, 3000); ${tecla('ArrowLeft')} await wait(100); const antes = L().off;
    $('.lrAa').click(); await until(() => !$('.lrSheet').hidden);
    const mais = () => [...$$('.lrSheet .lrChip')].find(b => b.textContent === 'A+');
    mais().click(); await wait(250); mais().click(); await wait(250); const depois = L().off;
    [...$$('.lrTema')].find(b => b.textContent.includes('Sépia')).click(); await wait(200);
    return { antes, depois, fs: getComputedStyle(D.documentElement).fontSize, bg: getComputedStyle(D.documentElement).backgroundColor, tema: L().tema };`);
  await t.check('letra maior não perde o ponto de leitura; tema sépia muda o fundo', r.antes > 0 && r.depois === r.antes && r.fs === '21.6px' && r.tema === 'sepia' && r.bg === 'rgb(243, 232, 208)', r);

  r = await t.ev(`${LIVRO} [...$$('.lrSheet .lrChip')].find(b => b.textContent === 'Rolagem').click(); await wait(250);
    const rol = { paginas: L().paginas, overflow: getComputedStyle(D.documentElement).overflowY, off: L().off };
    [...$$('.lrSheet .lrChip')].find(b => b.textContent === 'Páginas').click(); await wait(250);
    [...$$('.lrSheet .lrChip')].find(b => b.textContent === 'A−').click(); await wait(200); [...$$('.lrSheet .lrChip')].find(b => b.textContent === 'A−').click(); await wait(200);
    $('.lrVeu').click(); return { rol, pag: L() };`);
  await t.check('modo rolagem e volta para páginas, no mesmo ponto', r.rol.paginas === 1 && r.rol.overflow === 'auto' && r.pag.modo === 'paginas' && r.pag.off === r.rol.off, r);
  await t.shot('livro-paginas');

  // grifo com o mouse
  r = await t.ev(`${LIVRO} await A.closeBook(); await until(() => !document.body.classList.contains('lendo'));
    await until(() => $('#recentList .recent'), 4000); $('#recentList .recent').click(); await until(() => A.bookState() && A.bookFrame().contentDocument.querySelector('p'), 8000);
    const D2 = A.bookFrame().contentDocument; ${tecla('Home')} await until(() => A.bookState().ch === 0 && D2.querySelector('#c1'), 4000); await wait(100);
    const p = A.bookFrame().contentDocument.querySelectorAll('p')[0], g = A.bookFrame().contentDocument.createRange(); g.setStart(p.firstChild, 2); g.setEnd(p.firstChild, 30);
    const q = g.getClientRects()[0], f = A.bookFrame().getBoundingClientRect(); return [q.left + f.left + 1, q.top + f.top + q.height / 2, q.right + f.left - 1];`);
  t.step('seleciona um trecho com o mouse');
  await t.stroke(line(r[0], r[1], r[2], r[1], 8));
  r = await t.ev(`await until(() => !$('.lrPop').hidden, 3000); const cores = $$('.lrPop .lrCor').length; $$('.lrPop .lrCor')[1].click();
    const D = A.bookFrame().contentDocument; await until(() => D.querySelector('mark.lrHl'), 2000); await wait(500);
    const rec = (await A.DB.all('docs')).find(d => d.kind === 'epub');
    return { cores, mark: D.querySelector('mark.lrHl')?.textContent, salvo: rec.highlights.map(h => ({ text: h.text, ch: h.ep && h.ep.ch, color: h.color })) };`);
  await t.check('selecionar e escolher a cor grifa o trecho e salva o grifo', r.cores === 6 && r.mark === 'celula e a unidade basica da' && r.salvo.length === 1 && r.salvo[0].ch === 0 && r.salvo[0].text === r.mark, r);

  r = await t.ev(`const D = A.bookFrame().contentDocument; D.querySelector('mark.lrHl').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 300, clientY: 130, pointerType: 'mouse' }));
    D.querySelector('mark.lrHl').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 300, clientY: 130, pointerType: 'mouse' }));
    await until(() => $('.lrPop .lrNota'), 2000); const n = $('.lrPop .lrNota'); n.value = 'O que é a célula?'; n.dispatchEvent(new Event('input')); await wait(500);
    const rec = (await A.DB.all('docs')).find(d => d.kind === 'epub'); return { nota: rec.highlights[0].note, classe: D.querySelector('mark.lrHl').classList.contains('nota') };`);
  await t.check('tocar no grifo abre a nota, que fica salva', r.nota === 'O que é a célula?' && r.classe, r);

  r = await t.ev(`A.openReview(); await until(() => !$('#review').hidden, 3000); const txt = $('#review').innerText;
    const ver = [...$$('#review button')].some(b => b.textContent === 'Ver no livro'); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(100);
    if (!$('#review').hidden) [...$$('#review button')].find(b => /Encerrar|Fechar|Sair/.test(b.textContent))?.click(); await wait(100);
    return { aberta: true, txt: txt.slice(0, 200), ver, fechou: $('#review').hidden };`);
  await t.check('os grifos do livro viram cartões da revisão', /Revisar grifos/.test(r.txt) && /\(1\)/.test(r.txt), r);

  r = await t.ev(`${tecla('b')} await wait(400); const rec = (await A.DB.all('docs')).find(d => d.kind === 'epub');
    $('.lrTop button[title^="Sumário"]').click(); await until(() => !$('.lrSide').hidden); [...$$('.lrTab')].find(b => /Marcadores/.test(b.textContent)).click(); await wait(50);
    const itens = $$('.lrSide .lrItem').length; $('.lrVeu').click(); return { marcas: rec.bookmarks.length, itens, on: $('.lrTop button[title^="Marcar"]').classList.contains('on') };`);
  await t.check('B marca a página (fica salvo e aparece no painel)', r.marcas === 1 && r.itens === 1 && r.on, r);

  r = await t.ev(`$('.lrTop button[title^="Buscar"]').click(); await until(() => $('.lrBuscaIn')); const i = $('.lrBuscaIn'); i.value = 'paragrafo 33'; i.dispatchEvent(new Event('input'));
    await until(() => $$('.lrBusca .lrItem').length, 5000); const n = $$('.lrBusca .lrItem').length; $$('.lrBusca .lrItem')[0].click();
    await until(() => A.bookState().ch === 1 && A.bookFrame().contentDocument.querySelector('mark.lrTemp'), 4000);
    return { n, st: A.bookState(), achado: A.bookFrame().contentDocument.querySelector('mark.lrTemp')?.textContent };`);
  await t.check('busca no livro (sem acento e sem maiúscula) leva ao trecho', r.n === 1 && r.st.ch === 1 && r.achado === 'Paragrafo 33', r);

  r = await t.ev(`const antes = A.bookState(); await A.closeBook(); await until(() => !document.body.classList.contains('lendo') && $('#recentList .recent'), 4000);
    await wait(200); const card = $('#recentList .recent'); const info = { txt: card.innerText, capa: !!card.querySelector('.recentThumb img') };
    card.click(); await until(() => A.bookState() && A.bookState().off === antes.off, 8000); return { antes, depois: A.bookState(), info };`);
  await t.check('continuar de onde parou: o livro aparece na página inicial (com capa) e reabre no mesmo ponto',
    r.depois.ch === r.antes.ch && r.depois.off === r.antes.off && r.info.capa && /cap\. 2 de 3/.test(r.info.txt) && /grifo/.test(r.info.txt), r);

  r = await t.ev(`const md = []; const d0 = A.download; A.download = (c, n) => md.push({ c, n });
    $('.lrTop button[title^="Sumário"]').click(); await until(() => !$('.lrSide').hidden); [...$$('.lrTab')].find(b => /Grifos/.test(b.textContent)).click(); await wait(50);
    [...$$('.lrSide button')].find(b => b.textContent.includes('Exportar')).click(); A.download = d0; $('.lrVeu').click();
    return { n: md[0]?.n, c: md[0]?.c };`);
  await t.check('exportar os grifos do livro em Markdown, por capítulo e com a nota', /grifos\.md$/.test(r.n) && /## Capítulo 1 - A célula/.test(r.c) && /> celula e a unidade basica da/.test(r.c) && /Nota: O que é a célula\?/.test(r.c), r);
  await t.close();

  // ---------- PDF: modo leitura e texto corrido ----------
  t = await launch({ width: 1300 });
  await t.open(fixtures.texto, 'texto.pdf');
  r = await t.ev(`const s0 = S.scale; A.toggleFocus(); await until(() => !$('.lpBar').hidden, 3000);
    [...$$('.lpBar button')].find(b => b.textContent.includes('Margens')).click(); await until(() => S.scale > s0 * 1.1, 4000);
    return { barra: !$('.lpBar').hidden, s0, s1: S.scale, esq: $('#viewer').scrollLeft };`);
  await t.check('modo leitura do PDF: barra de leitura e cortar as margens amplia a página', r.barra && r.s1 > r.s0 * 1.1 && r.esq > 0, r);

  r = await t.ev(`A.goToPage(3); await wait(200); [...$$('.lpBar button')].find(b => b.textContent.includes('Texto corrido')).click();
    await until(() => A.bookState() && A.bookFrame().contentDocument.querySelector('p'), 10000); await wait(200);
    const D = A.bookFrame().contentDocument;
    return { st: A.bookState(), marcas: [...D.querySelectorAll('.vetraPg')].map(x => x.textContent), ps: D.querySelectorAll('p').length, h3: D.querySelector('h3')?.textContent, p: D.querySelector('p').textContent, emenda: /celula s\\b/.test(D.body.textContent) };`);
  await t.check('texto corrido: o PDF vira livro (parágrafos e títulos) e abre na página em que estava',
    r.marcas.length === 5 && r.ps === 20 && /Capitulo 1/.test(r.h3) && /^Mulher de 68 anos, paragrafo 1\. A celula/.test(r.p) && r.st.pct > 0.35 && r.st.pct < 0.5, r);
  await t.shot('texto-corrido');

  r = await t.ev(`${tecla('End')} await wait(100); const fim = A.bookState(); await A.closeBook(); await until(() => !A.bookState(), 3000); await wait(200); const pFim = S.currentPage;
    A.openReflow(); await until(() => A.bookState() && !A.bookState().carregando && A.bookFrame().contentDocument.querySelector('p'), 10000);
    ${tecla('Home')} await wait(100); await A.closeBook(); await until(() => !A.bookState(), 3000); await wait(200);
    return { fim, pFim, pIni: S.currentPage, foco: document.body.classList.contains('focus'), pdf: !!S.pdf };`);
  await t.check('sair do texto corrido volta ao PDF na página onde a leitura parou (fim → p. 3 ou depois, início → p. 1)', r.pdf && r.foco && r.pFim >= 3 && r.pIni === 1, r);
  r = await t.ev(`A.toggleFocus(); await wait(200); return { foco: document.body.classList.contains('focus'), barra: !$('.lpBar').hidden, page: document.documentElement.dataset.page };`);
  await t.check('sair do modo leitura esconde a barra', !r.foco && !r.barra, r);
  await t.close();

  // ---------- celular ----------
  t = await launch({ width: 390, height: 800 });
  await abrirLivro(t, fixtures.livro);
  const tap = async (x, y) => { await t.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await t.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
  r = await t.ev(`await until(() => !document.querySelector('section.leitor').classList.contains('ui'), 4000); return A.bookState();`);
  t.step('toca na borda direita');
  await tap(370, 420);
  r = await t.ev(`await until(() => A.bookState().pag === ${r.pag + 1} || A.bookState().ch > ${r.ch}, 3000); return A.bookState();`);
  const virou = r.pag === 1 || r.ch === 1;
  t.step('toca no meio');
  await tap(195, 420);
  const meio = await t.ev(`await until(() => document.querySelector('section.leitor').classList.contains('ui'), 2000); return { ui: $('section.leitor').classList.contains('ui'), largura: document.documentElement.scrollWidth, barra: $('.lrTop').getBoundingClientRect().right };`);
  await t.check('celular: toque na borda vira a página, no meio mostra o menu, e nada passa da largura', virou && meio.ui && meio.largura <= 390 && meio.barra <= 390, { r, meio });
  await t.shot('livro-celular');
  await t.close();
};
