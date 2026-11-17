// PDFs de teste gerados na hora (nada de PDF pessoal no repositório), com o pdf-lib que o app já traz em lib/.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const ROOT = new URL('../../', import.meta.url);
function loadPdfLib(){
  const ctx = {}; ctx.globalThis = ctx; ctx.self = ctx; ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL('lib/pdf-lib.min.js', ROOT), 'utf8'), ctx);
  // o pdf-lib confere "instanceof Array" no próprio contexto: o tamanho da página tem que nascer lá
  ctx.PDFLib.A4 = () => vm.runInContext('[595, 842]', ctx);
  return ctx.PDFLib;
}

const PARA = 'A celula e a unidade basica da vida. Todas as celulas possuem membrana plasmatica, citoplasma e material genetico. A mitocondria e responsavel pela respiracao celular e pela producao de ATP.';

// texto corrido: 5 páginas com título e parágrafos (grifos, caneta, barras)
async function textPdf(P){
  const doc = await P.PDFDocument.create();
  const font = await doc.embedFont(P.StandardFonts.Helvetica), bold = await doc.embedFont(P.StandardFonts.HelveticaBold);
  for (let p = 1; p <= 5; p++) {
    const page = doc.addPage(P.A4());
    page.drawText(`Capitulo ${p} - Biologia celular`, { x: 60, y: 770, size: 20, font: bold });
    let y = 720;
    for (let k = 0; k < 4; k++) {
      for (const line of wrap(`Mulher de 68 anos, paragrafo ${k + 1}. ` + PARA, font, 11, 470)) { page.drawText(line, { x: 60, y, size: 11, font }); y -= 16; }
      y -= 12;
    }
    page.drawText(`- ${p} -`, { x: 290, y: 40, size: 9, font });
  }
  return doc.save();
}

// prova: 20 questões (4 por página) com alternativas A) a D) e gabarito ABCD ABCD… na última página
async function examPdf(P){
  const doc = await P.PDFDocument.create();
  const font = await doc.embedFont(P.StandardFonts.Helvetica), bold = await doc.embedFont(P.StandardFonts.HelveticaBold);
  let q = 1;
  for (let p = 1; p <= 5; p++) {
    const page = doc.addPage(P.A4());
    page.drawText('SIMULADO DE TESTE', { x: 200, y: 790, size: 14, font: bold });
    let y = 740;
    for (let k = 0; k < 4; k++, q++) {
      page.drawText(`${q}.`, { x: 50, y, size: 11, font: bold });
      for (const line of wrap(`Paciente de ${30 + q} anos procura atendimento com queixa numero ${q}. Qual a conduta mais adequada?`, font, 11, 460)) { page.drawText(line, { x: 72, y, size: 11, font }); y -= 15; }
      y -= 4;
      for (const L of 'ABCD') { page.drawText(`${L})`, { x: 72, y, size: 11, font: bold }); page.drawText(`Alternativa ${L} da questao ${q}`, { x: 92, y, size: 11, font }); y -= 15; }
      y -= 22;
    }
  }
  const last = doc.addPage(P.A4());
  last.drawText('GABARITO', { x: 50, y: 780, size: 14, font: bold });
  let y = 750;
  for (let i = 1; i <= 20; i++) { last.drawText(`${i}-${'ABCD'[(i - 1) % 4]}`, { x: 50 + ((i - 1) % 5) * 90, y, size: 11, font }); if (i % 5 === 0) y -= 18; }
  return doc.save();
}

function wrap(text, font, size, max){
  const out = []; let cur = '';
  for (const w of text.split(' ')) { const t = cur ? cur + ' ' + w : w; if (font.widthOfTextAtSize(t, size) > max && cur) { out.push(cur); cur = w; } else cur = t; }
  if (cur) out.push(cur);
  return out;
}

export async function makeFixtures(dir){
  mkdirSync(dir, { recursive: true });
  const P = loadPdfLib();
  const files = { texto: join(dir, 'texto.pdf'), prova: join(dir, 'prova.pdf') };
  writeFileSync(files.texto, await textPdf(P));
  writeFileSync(files.prova, await examPdf(P));
  return files;
}
