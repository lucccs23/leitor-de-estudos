// PDFs de teste gerados na hora (nada de PDF pessoal no repositório), com o pdf-lib que o app já traz em lib/.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { deflateRawSync, crc32 } from 'node:zlib';
import { createHash, randomBytes } from 'node:crypto';

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

// ---------- EPUB de teste: ZIP feito aqui (3 capítulos, sumário, CSS, imagem, capa e um script que não pode rodar) ----------

function zip(files){ // [{name, data(Buffer|string), store?}]
  const locais = [], central = []; let off = 0;
  for (const f of files) {
    const data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, 'utf8');
    const comp = f.store ? data : deflateRawSync(data);
    const name = Buffer.from(f.name, 'utf8'), crc = crc32(data) >>> 0, method = f.store ? 0 : 8;
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
    locais.push(lh, name, comp);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    central.push(ch, name);
    off += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(central), eo = Buffer.alloc(22);
  eo.writeUInt32LE(0x06054b50, 0); eo.writeUInt16LE(files.length, 8); eo.writeUInt16LE(files.length, 10); eo.writeUInt32LE(cd.length, 12); eo.writeUInt32LE(off, 16);
  return Buffer.concat([...locais, cd, eo]);
}
// PNG 2x2 vermelho
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDK+mmyAAAAABJRU5ErkJggg==', 'base64');
const PARA_LIVRO = n => `A celula e a unidade basica da vida. Paragrafo ${n}: todas as celulas possuem membrana plasmatica, citoplasma e material genetico. A mitocondria e responsavel pela respiracao celular e pela producao de ATP, a moeda de energia da celula.`;
const cap = (i, titulo, n, extra = '') => `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="pt-BR">
<head><title>${titulo}</title><link rel="stylesheet" type="text/css" href="../css/livro.css"/></head>
<body><section epub:type="chapter"><h1 id="c${i}">${titulo}</h1>
${Array.from({ length: n }, (_, k) => `<p${k === 2 ? ` id="p${i}-3"` : ''}>${PARA_LIVRO(k + 1)}</p>`).join('\n')}
${extra}<script>window.parent.document.title='invadido'</script><p onclick="alert(1)">Fim do ${titulo}.</p></section></body></html>`;

function epubBook({ titulo = 'Livro de Teste', autor = 'Autora Exemplo' } = {}){
  return zip([
    { name: 'mimetype', data: 'application/epub+zip', store: true },
    { name: 'META-INF/container.xml', data: '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>' },
    { name: 'OEBPS/content.opf', data: `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">teste-vetra</dc:identifier><dc:title>${titulo}</dc:title><dc:creator>${autor}</dc:creator><dc:language>pt-BR</dc:language></metadata>
<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="css/livro.css" media-type="text/css"/><item id="capa" href="img/capa.png" media-type="image/png" properties="cover-image"/>
<item id="c1" href="texto/cap1.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="texto/cap2.xhtml" media-type="application/xhtml+xml"/><item id="c3" href="texto/cap%203.xhtml" media-type="application/xhtml+xml"/></manifest>
<spine><itemref idref="c1"/><itemref idref="c2"/><itemref idref="c3"/></spine></package>` },
    { name: 'OEBPS/nav.xhtml', data: `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Sumário</title></head><body><nav epub:type="toc"><ol>
<li><a href="texto/cap1.xhtml">Capítulo 1 - A célula</a></li><li><a href="texto/cap2.xhtml">Capítulo 2 - Mitocôndria</a><ol><li><a href="texto/cap2.xhtml#p2-3">2.1 Respiração</a></li></ol></li><li><a href="texto/cap%203.xhtml">Capítulo 3 - Membrana</a></li></ol></nav></body></html>` },
    { name: 'OEBPS/css/livro.css', data: 'h1{color:rgb(150,20,20);font-size:1.6em} p{text-indent:1.5em;margin:0 0 .4em} .fig{background:url(../img/capa.png)}' },
    { name: 'OEBPS/img/capa.png', data: PNG },
    { name: 'OEBPS/texto/cap1.xhtml', data: cap(1, 'Capítulo 1 - A célula', 6, '<p><img src="../img/capa.png" alt="figura" style="width:120px"/></p><p>Veja o <a href="cap2.xhtml#p2-3">item 2.1</a>.</p>') },
    { name: 'OEBPS/texto/cap2.xhtml', data: cap(2, 'Capítulo 2 - Mitocôndria', 40) },
    { name: 'OEBPS/texto/cap 3.xhtml', data: cap(3, 'Capítulo 3 - Membrana', 8) },
  ]);
}

// PDF protegido pela senha "vetra123" (padrão do PDF: Standard Security Handler R2, RC4 de 40 bits), feito à mão
// porque o pdf-lib não criptografa. Uma página com o texto "Texto secreto do Vetra".
export const SENHA_TESTE = 'vetra123';
function protectedPdf(senha){
  const PAD = Buffer.from('28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A', 'hex');
  const pad = s => Buffer.concat([Buffer.from(s, 'latin1'), PAD]).subarray(0, 32);
  const md5 = (...b) => createHash('md5').update(Buffer.concat(b)).digest();
  const rc4 = (key, data) => {
    const S = [...Array(256).keys()]; let j = 0;
    for (let i = 0; i < 256; i++) { j = (j + S[i] + key[i % key.length]) & 255; [S[i], S[j]] = [S[j], S[i]]; }
    const out = Buffer.alloc(data.length); let i = 0; j = 0;
    for (let k = 0; k < data.length; k++) { i = (i + 1) & 255; j = (j + S[i]) & 255; [S[i], S[j]] = [S[j], S[i]]; out[k] = data[k] ^ S[(S[i] + S[j]) & 255]; }
    return out;
  };
  const ID = randomBytes(16), P = -4, Pb = Buffer.alloc(4); Pb.writeInt32LE(P);
  const O = rc4(md5(pad('dono-' + senha)).subarray(0, 5), pad(senha));
  const KEY = md5(pad(senha), O, Pb, ID).subarray(0, 5), U = rc4(KEY, PAD);
  const chaveObj = n => md5(KEY, Buffer.from([n & 255, (n >> 8) & 255, (n >> 16) & 255, 0, 0])).subarray(0, 10);
  const hex = b => '<' + b.toString('hex') + '>';
  const conteudo = Buffer.from('BT /F1 28 Tf 72 700 Td (Texto secreto do Vetra) Tj ET\nBT /F1 14 Tf 72 660 Td (Pagina protegida por senha, para os testes.) Tj ET', 'latin1');
  const cifrado = rc4(chaveObj(4), conteudo);
  const objs = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    null,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `6 0 obj\n<< /Filter /Standard /V 1 /R 2 /O ${hex(O)} /U ${hex(U)} /P ${P} >>\nendobj\n`,
  ];
  const partes = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')], offs = [];
  let pos = partes[0].length;
  for (const o of objs) {
    offs.push(pos);
    const b = o ? Buffer.from(o, 'latin1') : Buffer.concat([Buffer.from(`4 0 obj\n<< /Length ${cifrado.length} >>\nstream\n`, 'latin1'), cifrado, Buffer.from('\nendstream\nendobj\n', 'latin1')]);
    partes.push(b); pos += b.length;
  }
  const xref = ['xref', `0 ${objs.length + 1}`, '0000000000 65535 f ', ...offs.map(o => String(o).padStart(10, '0') + ' 00000 n ')].join('\n') + '\n';
  partes.push(Buffer.from(xref + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Encrypt 6 0 R /ID [${hex(ID)} ${hex(ID)}] >>\nstartxref\n${pos}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(partes);
}

export async function makeFixtures(dir){
  mkdirSync(dir, { recursive: true });
  const P = loadPdfLib();
  const files = { texto: join(dir, 'texto.pdf'), prova: join(dir, 'prova.pdf'), livro: join(dir, 'livro.epub'), protegido: join(dir, 'protegido.pdf') };
  writeFileSync(files.texto, await textPdf(P));
  writeFileSync(files.prova, await examPdf(P));
  writeFileSync(files.livro, epubBook());
  writeFileSync(files.protegido, protectedPdf(SENHA_TESTE));
  return files;
}
