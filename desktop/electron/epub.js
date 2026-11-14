// EPUB → PDF: extrai o livro, junta os capítulos na ordem de leitura (com o estilo e as imagens do próprio livro)
// e imprime em PDF tamanho A5, com o sumário (marcadores) gerado pelos títulos dos capítulos.
const { BrowserWindow } = require('electron');
const path = require('path'), fs = require('fs'), os = require('os'), zlib = require('zlib'), { pathToFileURL } = require('url');

// ---------- ZIP (o EPUB é um .zip) ----------
function unzip(buf){
  const sig = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const eocd = buf.lastIndexOf(sig);
  if (eocd < 0) throw new Error('Este arquivo não é um EPUB válido.');
  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map();
  for (let i = 0; i < total; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), loff = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nlen).toString('utf8');
    p += 46 + nlen + elen + clen;
    if (name.endsWith('/')) continue;
    const ln = buf.readUInt16LE(loff + 26), le = buf.readUInt16LE(loff + 28);
    const data = buf.slice(loff + 30 + ln + le, loff + 30 + ln + le + csize);
    out.set(name, method === 8 ? zlib.inflateRawSync(data) : data);
  }
  return out;
}

const attr = (tag, name) => { const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i')); return m ? (m[2] ?? m[3]) : null; };
const decode = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function lerLivro(files){
  const container = files.get('META-INF/container.xml');
  if (!container) throw new Error('Este arquivo não é um EPUB válido (sem META-INF/container.xml).');
  const opfPath = attr(container.toString('utf8').match(/<rootfile\b[^>]*>/i)[0], 'full-path');
  const opf = files.get(opfPath).toString('utf8'), base = path.posix.dirname(opfPath);
  const title = decode(((opf.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i) || [])[1] || '').trim());
  const author = decode(((opf.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i) || [])[1] || '').trim());
  const manifest = new Map();
  for (const tag of opf.match(/<item\b[^>]*>/gi) || []) manifest.set(attr(tag, 'id'), { href: path.posix.normalize(path.posix.join(base, decodeURI(attr(tag, 'href') || ''))), type: attr(tag, 'media-type') || '', props: attr(tag, 'properties') || '' });
  const spine = (opf.match(/<itemref\b[^>]*>/gi) || []).filter(t => attr(t, 'linear') !== 'no').map(t => manifest.get(attr(t, 'idref'))).filter(x => x && /html/.test(x.type));
  // capa (quando não é já a primeira página do livro)
  let cover = [...manifest.values()].find(x => /cover-image/.test(x.props));
  if (!cover) { const cid = attr((opf.match(/<meta\b[^>]*name\s*=\s*["']cover["'][^>]*>/i) || [''])[0], 'content'); if (cid) cover = manifest.get(cid); }
  return { title, author, spine, cover: cover && /image/.test(cover.type) ? cover : null };
}

// ---------- Monta um HTML só com todos os capítulos ----------
function montarHtml(dir, livro){
  const links = new Set(), estilos = [];
  const partes = [];
  const abs = (fromDir, v) => {
    if (!v || /^(#|[a-z]+:)/i.test(v)) return v;
    const [p, hash] = v.split('#');
    return pathToFileURL(path.join(fromDir, decodeURI(p))).href + (hash ? '#' + hash : '');
  };
  livro.spine.forEach((it, i) => {
    const file = path.join(dir, it.href), fromDir = path.dirname(file);
    let html; try { html = fs.readFileSync(file, 'utf8'); } catch { return; }
    for (const tag of html.match(/<link\b[^>]*>/gi) || []) if (/stylesheet/i.test(attr(tag, 'rel') || '')) links.add(abs(fromDir, attr(tag, 'href')));
    for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) estilos.push(m[1]);
    let body = (html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i) || [, html])[1];
    body = body.replace(/<script\b[\s\S]*?<\/script>/gi, '')
      // imagens e recursos: caminho completo; ligações entre capítulos viram âncoras internas
      .replace(/\b(src|xlink:href|poster)\s*=\s*("([^"]*)"|'([^']*)')/gi, (_, a, _q, d, s) => `${a}="${abs(fromDir, d ?? s)}"`)
      .replace(/\bhref\s*=\s*("([^"]*)"|'([^']*)')/gi, (_, _q, d, s) => { const v = d ?? s; if (/^(https?:|mailto:)/i.test(v)) return `href="${v}"`; const h = v.split('#')[1]; return h ? `href="#${h}"` : 'href="#"'; });
    partes.push(`<section class="vetra-cap" id="vetra-cap-${i}">${body}</section>`);
  });
  const capa = livro.cover ? `<section class="vetra-capa"><img src="${pathToFileURL(path.join(dir, livro.cover.href)).href}" alt=""></section>` : '';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(livro.title || 'Livro')}</title>
${[...links].map(h => `<link rel="stylesheet" href="${h}">`).join('\n')}
<style>${estilos.join('\n')}</style>
<style>
  @page { size: A5; margin: 15mm 13mm 16mm; }
  html, body { background: #fff; }
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 11.5pt; line-height: 1.5; color: #111; margin: 0; }
  img, svg, video { max-width: 100% !important; height: auto !important; }
  pre, code { white-space: pre-wrap; word-break: break-word; }
  table { max-width: 100%; border-collapse: collapse; }
  .vetra-cap { break-before: page; }
  .vetra-cap:first-of-type { break-before: auto; }
  .vetra-capa { break-after: page; display: flex; align-items: center; justify-content: center; height: 175mm; }
  .vetra-capa img { max-height: 175mm !important; object-fit: contain; }
</style></head><body>${capa}${partes.join('\n')}</body></html>`;
}

async function epubParaPdf(bytes){
  const files = unzip(Buffer.from(bytes));
  const livro = lerLivro(files);
  if (!livro.spine.length) throw new Error('Não encontrei os capítulos deste EPUB.');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vetra-epub-'));
  try {
    for (const [name, data] of files) {
      const dest = path.join(dir, name);
      if (!dest.startsWith(dir)) continue; // nunca fora da pasta temporária
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, data);
    }
    const htmlPath = path.join(dir, '__vetra_livro.html');
    fs.writeFileSync(htmlPath, montarHtml(dir, livro));
    const w = new BrowserWindow({ show: false, width: 800, height: 1100, webPreferences: { javascript: false, sandbox: true, offscreen: false } });
    try {
      await w.loadFile(htmlPath);
      // espera as imagens e as fontes do livro
      await new Promise(r => setTimeout(r, 600));
      const pdf = await w.webContents.printToPDF({ pageSize: 'A5', printBackground: true, preferCSSPageSize: true, generateDocumentOutline: true, generateTaggedPDF: true });
      return { pdf, title: livro.title, author: livro.author };
    } finally { w.destroy(); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
module.exports = { epubParaPdf };
