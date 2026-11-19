/* EPUB: o Vetra lê o livro direto (sem converter em PDF), no computador, no celular e no tablet.
   Um EPUB é um ZIP com páginas HTML; aqui ele é aberto com o descompactador do próprio navegador
   (DecompressionStream) e vira um "livro" que o leitor (leitor.js) mostra com fonte, tema e margens à escolha.
   No Vetra do computador ainda dá para converter em PDF (menu ⋮ do leitor), para usar a caneta e os simulados. */
(() => {
'use strict';
const App = window.App;
const { state, DB, safe } = App;

App.isEpub = f => /\.epub$/i.test(f.name || f) || f.type === 'application/epub+zip';
App.canEpub = () => !!(window.vetraDesktop && window.vetraDesktop.epubToPdf); // conversão em PDF (só no app de Windows)
// ZIP começa com "PK\3\4"; PDF com "%PDF"
App.isZipData = buf => { const b = new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer, buf.byteOffset || 0, 4); return b[0] === 0x50 && b[1] === 0x4b && b[2] === 3 && b[3] === 4; };

App.sha256 = async buf => {
  const h = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
};

// ---------- ZIP ----------
async function unzip(buf){
  const u8 = new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65558); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('o arquivo não é um EPUB válido');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder(), entries = new Map();
  for (let k = 0; k < count && dv.getUint32(p, true) === 0x02014b50; k++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
    entries.set(name, { method, csize, off });
    p += 46 + nl + xl + cl;
  }
  const lower = new Map([...entries.keys()].map(n => [n.toLowerCase(), n]));
  const find = name => entries.get(name) || entries.get(lower.get(String(name).toLowerCase()));
  async function read(name){
    const e = find(name);
    if (!e) return null;
    const lo = e.off, start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
    const data = u8.subarray(start, start + e.csize);
    if (e.method === 0) return data;
    if (e.method !== 8) throw new Error('compressão do EPUB não suportada');
    if (!window.DecompressionStream) throw new Error('este navegador não consegue abrir EPUB (atualize o navegador ou o WebView do Android)');
    const s = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  return { read, has: n => !!find(n), names: () => [...entries.keys()] };
}

// ---------- Caminhos dentro do livro ----------
const dirOf = p => p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '';
function resolve(base, href){
  if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href)) return href; // http:, mailto:, data:
  let h = href.split('#')[0];
  try { h = decodeURIComponent(h); } catch {}
  const parts = (h.startsWith('/') ? h.slice(1) : dirOf(base) + h).split('/'), out = [];
  for (const s of parts) { if (s === '..') out.pop(); else if (s !== '.' && s !== '') out.push(s); }
  return out.join('/');
}
App.epubResolve = resolve;
const fragOf = href => (String(href || '').split('#')[1] || '');
const byTag = (root, tag) => [...root.getElementsByTagNameNS('*', tag)];
const textOf = n => (n && n.textContent || '').replace(/\s+/g, ' ').trim();

function parseXml(s, html){
  const d = new DOMParser().parseFromString(s, html ? 'application/xhtml+xml' : 'application/xml');
  if (d.getElementsByTagName('parsererror').length) {
    if (html) return new DOMParser().parseFromString(s, 'text/html'); // XHTML malformado: o leitor de HTML perdoa
    throw new Error('o EPUB tem um arquivo de índice com erro');
  }
  return d;
}

// ---------- Livro ----------
App.parseEpub = async buf => {
  const z = await unzip(buf), dec = new TextDecoder();
  const txt = async p => { const b = await z.read(p); return b ? dec.decode(b) : null; };
  const cont = await txt('META-INF/container.xml');
  if (!cont) throw new Error('o arquivo não é um EPUB (falta o META-INF/container.xml)');
  const opfPath = byTag(parseXml(cont), 'rootfile')[0]?.getAttribute('full-path');
  const opfTxt = opfPath && await txt(opfPath);
  if (!opfTxt) throw new Error('o EPUB não tem o arquivo de conteúdo (OPF)');
  const opf = parseXml(opfTxt);
  const manifest = new Map(), byHref = new Map();
  for (const it of byTag(opf, 'item')) {
    const m = { id: it.getAttribute('id'), href: resolve(opfPath, it.getAttribute('href')), type: it.getAttribute('media-type') || '', props: it.getAttribute('properties') || '' };
    manifest.set(m.id, m); byHref.set(m.href, m);
  }
  const spineEl = byTag(opf, 'spine')[0];
  const spine = byTag(opf, 'itemref').map(r => manifest.get(r.getAttribute('idref'))).filter(m => m && /x?html|xml/i.test(m.type) && z.has(m.href)).map(m => ({ href: m.href }));
  if (!spine.length) throw new Error('o EPUB não tem capítulos');
  const meta = byTag(opf, 'metadata')[0] || opf;
  const title = textOf(byTag(meta, 'title')[0]), author = textOf(byTag(meta, 'creator')[0]), lang = textOf(byTag(meta, 'language')[0]);
  // capa
  let cover = [...manifest.values()].find(m => /(^|\s)cover-image(\s|$)/.test(m.props));
  if (!cover) { const id = byTag(meta, 'meta').find(m => m.getAttribute('name') === 'cover')?.getAttribute('content'); cover = id && manifest.get(id); }
  if (cover && !/^image\//.test(cover.type)) cover = null;
  // sumário: EPUB 3 (nav) ou EPUB 2 (toc.ncx)
  const toc = [];
  const nav = [...manifest.values()].find(m => /(^|\s)nav(\s|$)/.test(m.props));
  if (nav) {
    const d = parseXml(await txt(nav.href) || '<html/>', true);
    const navs = byTag(d, 'nav');
    const tocNav = navs.find(n => /toc/.test(n.getAttribute('epub:type') || n.getAttributeNS('http://www.idpf.org/2007/ops', 'type') || '')) || navs[0];
    const walk = (ol, level) => {
      for (const li of [...(ol?.children || [])].filter(c => c.localName === 'li')) {
        const a = [...li.children].find(c => c.localName === 'a' || c.localName === 'span');
        if (a && a.getAttribute('href')) toc.push({ title: textOf(a), href: resolve(nav.href, a.getAttribute('href')), frag: fragOf(a.getAttribute('href')), level });
        walk([...li.children].find(c => c.localName === 'ol'), level + 1);
      }
    };
    if (tocNav) walk([...tocNav.children].find(c => c.localName === 'ol'), 0);
  }
  if (!toc.length) {
    const ncx = manifest.get(spineEl?.getAttribute('toc')) || [...manifest.values()].find(m => /ncx/.test(m.type));
    const s = ncx && await txt(ncx.href);
    if (s) {
      const walk = (parent, level) => {
        for (const np of [...parent.children].filter(c => c.localName === 'navPoint')) {
          const src = [...np.children].find(c => c.localName === 'content')?.getAttribute('src');
          const label = textOf([...np.children].find(c => c.localName === 'navLabel'));
          if (src) toc.push({ title: label, href: resolve(ncx.href, src), frag: fragOf(src), level });
          walk(np, level + 1);
        }
      };
      const map = byTag(parseXml(s), 'navMap')[0];
      if (map) walk(map, 0);
    }
  }
  for (const t of toc) t.ch = spine.findIndex(c => c.href === t.href);
  const book = { kind: 'epub', title, author, lang, spine, toc: toc.filter(t => t.ch >= 0 && t.title), cover: cover && cover.href, z, byHref };
  // capítulo como documento (para o leitor importar no quadro de leitura)
  book.chapterDoc = async i => parseXml(await txt(spine[i].href) || '<html><body></body></html>', true);
  book.chapterHref = i => spine[i].href;
  book.file = p => z.read(p);
  book.typeOf = p => (byHref.get(p) || {}).type || '';
  return book;
};

// ---------- Abrir ----------
App.openEpub = async (buf, name) => {
  App.setLoading(0.15);
  let book, hash;
  try { [book, hash] = await Promise.all([App.parseEpub(buf), App.sha256(buf)]); }
  catch (e) { App.setLoading(null); console.error(e); App.toast('Não consegui abrir este EPUB: ' + (e.message || e)); return false; }
  const fp = 'epub-' + hash.slice(0, 40);
  book.fp = fp; book.hash = hash;
  book.name = (book.title || String(name || 'Livro').replace(/\.epub$/i, '')).replace(/\s+/g, ' ').trim().slice(0, 140) || 'Livro';
  if (state.pdf) await App.closeDoc();
  if (!(await safe(() => DB.has('files', fp), false))) await safe(() => DB.put('files', { fp, data: buf }));
  const ok = await App.openBook(book);
  App.setLoading(null);
  if (ok) App.pruneFiles();
  return ok;
};

// Vetra do computador: o EPUB aberto vira PDF (para caneta, simulados e exportar grifos no PDF)
App.epubToPdf = async (buf, name) => {
  if (!App.canEpub()) { App.toast('A conversão em PDF fica no Vetra do computador.'); return false; }
  const hash = await App.sha256(buf);
  const m = await safe(() => DB.get('meta', 'epub:' + hash), null);
  if (m && m.fp) {
    const f = await safe(() => DB.get('files', m.fp), null);
    if (f) { App.closeBook?.(); return App.loadDoc(f.data, m.name); }
  }
  App.toast('Convertendo o livro EPUB em PDF…');
  App.setLoading(0.15);
  let r;
  try { r = await window.vetraDesktop.epubToPdf(new Uint8Array(buf)); }
  catch (e) { r = { ok: false, error: String(e) }; }
  if (!r || !r.ok) { App.setLoading(null); App.toast('Não consegui converter este EPUB' + (r && r.error ? ': ' + r.error : '.')); return false; }
  const pdf = r.pdf instanceof Uint8Array ? r.pdf : new Uint8Array(r.pdf);
  const t = (r.title || String(name || 'Livro').replace(/\.epub$/i, '')).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  const pdfName = (t || 'Livro') + '.pdf';
  App.closeBook?.();
  const ok = await App.loadDoc(pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength), pdfName);
  if (ok && state.fp) {
    await safe(() => DB.put('meta', { key: 'epub:' + hash, fp: state.fp, name: pdfName }));
    await App.patchDoc(state.fp, { fromEpub: name || true });
    App.toast(`"${App.baseName(pdfName)}" pronto: ${App.plural(state.pages.length, 'página', 'páginas')} (convertido do EPUB)`);
  }
  return ok;
};
})();
