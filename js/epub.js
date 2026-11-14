/* EPUB: o Vetra do computador converte o livro em PDF (formato A5, com capítulos, imagens e sumário)
   e abre como qualquer outro PDF — grifos, caneta, notas, IA e sincronização funcionam igual.
   O mesmo EPUB aberto de novo reaproveita o PDF já convertido (os grifos continuam no lugar).
   No celular/navegador não há conversão: o livro convertido chega pela sincronização. */
(() => {
'use strict';
const App = window.App;
const { state, DB, safe } = App;

App.isEpub = f => /\.epub$/i.test(f.name || f) || f.type === 'application/epub+zip';
App.canEpub = () => !!(window.vetraDesktop && window.vetraDesktop.epubToPdf);

async function sha(buf){
  const h = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const tituloPdf = (r, name) => {
  const t = (r && r.title ? r.title : String(name || 'Livro').replace(/\.epub$/i, '')).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  return (t || 'Livro') + '.pdf';
};

App.openEpub = async (buf, name) => {
  const hash = await sha(buf);
  // já convertido antes: abre o mesmo PDF (mesmos grifos)
  const m = await safe(() => DB.get('meta', 'epub:' + hash), null);
  if (m && m.fp) {
    const f = await safe(() => DB.get('files', m.fp), null);
    if (f) return App.loadDoc(f.data, m.name);
  }
  if (!App.canEpub()) {
    App.toast(App.isWeb ? 'EPUB é convertido no Vetra do computador. Com a sincronização ligada, o livro aparece aqui como PDF.' : 'Para abrir EPUB, use o Vetra instalado (o app para Windows).');
    return false;
  }
  App.toast('Convertendo o livro EPUB em PDF…');
  App.setLoading(0.15);
  let r;
  try { r = await window.vetraDesktop.epubToPdf(new Uint8Array(buf)); }
  catch (e) { r = { ok: false, error: String(e) }; }
  if (!r || !r.ok) { App.setLoading(null); App.toast('Não consegui converter este EPUB' + (r && r.error ? ': ' + r.error : '.')); return false; }
  const pdf = r.pdf instanceof Uint8Array ? r.pdf : new Uint8Array(r.pdf);
  const pdfName = tituloPdf(r, name);
  const ok = await App.loadDoc(pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength), pdfName);
  if (ok && state.fp) {
    await safe(() => DB.put('meta', { key: 'epub:' + hash, fp: state.fp, name: pdfName }));
    await App.patchDoc(state.fp, { fromEpub: name || true });
    App.toast(`"${App.baseName(pdfName)}" pronto: ${App.plural(state.pages.length, 'página', 'páginas')} (convertido do EPUB)`);
  }
  return ok;
};
})();
