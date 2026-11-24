/* Leitor de gabarito: lê as respostas (e os comentários, quando houver) de um PDF ou de uma foto/print.
   Entende tabelas em colunas ("1. D   26. A"), listas ("1-A", "01) C", "Questão 3: Resposta B"),
   tabelas com números numa linha e letras na de baixo, e "anulada". PDF escaneado ou foto: usa o OCR do Windows. */
(() => {
'use strict';
const App = window.App;

// ---------- Texto com posições (de um PDF qualquer, sem abrir como aba) ----------
async function pageItems(page){
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const items = [];
  for (const it of tc.items) {
    if (typeof it.str !== 'string' || !it.str.trim()) continue;
    const t = it.transform, fh = Math.hypot(t[2], t[3]) || Math.abs(t[3]) || 10;
    const [a, b, c, d] = vp.convertToViewportRectangle([t[4], t[5] - fh * 0.2, t[4] + it.width, t[5] + fh * 0.85]);
    items.push({ str: it.str, x: Math.min(a, c) / vp.width, y: Math.min(b, d) / vp.height, w: Math.abs(c - a) / vp.width, h: Math.abs(d - b) / vp.height });
  }
  return items;
}
async function ocrBlob(blob){
  if (!App.localService.ok() && !(await App.localService.check())) throw new Error('servico');
  const r = await App.localService.post('/ocr', blob, 120000);
  const items = [];
  for (const line of r.lines || []) for (const [t, x, y, w, h] of line) if (t && t.trim()) items.push({ str: t, x: x / r.w, y: y / r.h, w: w / r.w, h: h / r.h });
  return items;
}
async function ocrPage(page){
  const vp1 = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: Math.min(3.2, 2600 / Math.max(vp1.width, vp1.height)) });
  const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const blob = await new Promise(r => c.toBlob(r, 'image/png')); c.width = 0;
  return ocrBlob(blob);
}

// ---------- Linhas (agrupa por altura, em ordem de leitura; 2 colunas quando houver) ----------
function toLines(items, byColumn){
  const groups = byColumn ? [items.filter(i => i.x < 0.5), items.filter(i => i.x >= 0.5)] : [items];
  const lines = [];
  for (const g of groups) {
    const sorted = g.slice().sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2) || a.x - b.x);
    let cur = null;
    for (const it of sorted) {
      const cy = it.y + it.h / 2;
      if (cur && Math.abs(cy - cur.cy) < Math.max(it.h, cur.h) * 0.55) { cur.items.push(it); continue; }
      cur = { cy, h: it.h, items: [it] }; lines.push(cur);
    }
  }
  for (const l of lines) { l.items.sort((a, b) => a.x - b.x); l.text = l.items.map(i => i.str.trim()).join(' '); }
  return lines;
}

// ---------- Respostas ----------
const PAIR = /(?:^|[^\p{L}\p{N}])(?:[Qq]uest[ãa]o\s*)?0*(\d{1,3})\s*[.)\-–:=]?\s*(?:(?:[Rr]esposta|[Gg]abarito|[Aa]lternativa|[Ll]etra|[Rr]esp\.?)\s*[:\-–]?\s*)?([A-E]|[Aa][Nn][Uu][Ll][Aa][Dd][AaOo])(?![\p{L}\p{N}])/gu;
function pairsFromLines(lines, nq, out){
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    // tabela "números numa linha, letras na de baixo"
    const nums = L.items.filter(it => /^0*\d{1,3}[.)]?$/.test(it.str.trim()));
    const next = lines[i + 1];
    if (nums.length >= 4 && nums.length === L.items.length && next) {
      const lets = next.items.filter(it => /^([A-E]|[Xx*])$/.test(it.str.trim()));
      if (lets.length >= Math.min(4, nums.length) && lets.length >= next.items.length * 0.8) {
        for (const nIt of nums) {
          const cx = nIt.x + nIt.w / 2;
          let best = null, bd = 0.05;
          for (const l of lets) { const d = Math.abs(l.x + l.w / 2 - cx); if (d < bd) { bd = d; best = l; } }
          if (best) add(out, +nIt.str.replace(/\D/g, ''), best.str.trim(), nq);
        }
        i++; continue;
      }
    }
    PAIR.lastIndex = 0; let m;
    while ((m = PAIR.exec(L.text))) add(out, +m[1], m[2], nq);
  }
}
// a primeira resposta encontrada vale (a tabela vem antes dos comentários);
// "conflito" só quando o comentário oficial ("Resposta X") discorda da tabela
function add(out, q, a, nq, fromComment){
  if (!q || q > nq) return;
  a = /^anulad/i.test(a) || a === 'X' || a === 'x' || a === '*' ? '*' : a.toUpperCase();
  if (!(q in out.key)) { out.key[q] = a; out.count++; }
  else if (fromComment && out.key[q] !== a) out.conflicts.add(q);
}

// ---------- Comentários ("1. Resposta D  Banca · questão 3  Pista decisiva: …") ----------
const HEAD = /^0*(\d{1,3})\s*[.)\-–]\s*(?:[Rr]esposta|[Gg]abarito)\s*[:\-–]?\s*([A-E]|[Aa]nulad[ao])\b\s*(.*)$/;
function commentsFromLines(lines, nq){
  const out = {}; let cur = null;
  const push = () => { if (cur) { const txt = cur.parts.join('\n').replace(/-\n(?=\p{Ll})/gu, '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim(); if (txt) out[cur.q] = { src: cur.src, text: txt, ans: cur.ans }; } };
  for (const L of lines) {
    const m = L.text.match(HEAD);
    if (m && +m[1] <= nq) { push(); cur = { q: +m[1], ans: m[2], src: m[3].trim(), parts: [] }; continue; }
    if (!cur) continue;
    if (/^p[áa]gina \d+ de \d+$/i.test(L.text) || /^SIMULADO\b/.test(L.text)) continue; // cabeçalho/rodapé
    cur.parts.push(L.text);
  }
  push();
  return out;
}

// ---------- Leitura de um arquivo (PDF ou imagem) ----------
// opts.n = número de questões; onStatus(texto) para mostrar o andamento
App.readKeyFile = async (file, n, onStatus = () => {}) => {
  const nq = n || 300, out = { key: {}, count: 0, conflicts: new Set() };
  const name = file.name || 'gabarito';
  let comments = {}, usedOcr = false;
  const isPdf = /\.pdf$/i.test(name) || file.type === 'application/pdf' || (file.data && !file.type);
  if (isPdf) {
    const buf = file.data || await file.arrayBuffer();
    const pdf = await App.getDocument({ data: new Uint8Array(buf.slice(0)) });
    try {
      const allLines = [], commentLines = [];
      const last = Math.min(pdf.numPages, 60);
      for (let p = 1; p <= last; p++) {
        onStatus(`Lendo a página ${p} de ${last}…`);
        const page = await pdf.getPage(p);
        let items = await pageItems(page);
        if (items.reduce((s, i) => s + i.str.trim().length, 0) < App.MIN_TEXT) {
          if (p > 6) continue; // escaneado: reconhece só as primeiras páginas (o gabarito costuma estar no começo)
          onStatus(`Reconhecendo o texto da página ${p} (OCR)…`);
          items = await ocrPage(page); usedOcr = true;
        }
        const lines = toLines(items, false);
        allLines.push(...lines);
        commentLines.push(...toLines(items, items.some(i => i.x >= 0.5) && items.some(i => i.x < 0.45 && i.x + i.w < 0.5)));
      }
      pairsFromLines(allLines, nq, out);
      comments = commentsFromLines(commentLines, nq);
      // a resposta escrita no comentário completa o que faltou na tabela
      for (const [q, c] of Object.entries(comments)) add(out, +q, c.ans, nq, true);
    } finally { pdf.destroy(); }
  } else if (/^image\//.test(file.type)) {
    onStatus('Reconhecendo o texto da imagem (OCR)…');
    const items = await ocrBlob(file); usedOcr = true;
    pairsFromLines(toLines(items, false), nq, out);
  } else throw new Error('formato');
  const missing = [];
  for (let q = 1; q <= (n || 0); q++) if (!(q in out.key)) missing.push(q);
  return { key: out.key, count: out.count, conflicts: [...out.conflicts].sort((a, b) => a - b), missing, comments, commentCount: Object.keys(comments).length, usedOcr, name };
};

// Sugere um gabarito já aberto no leitor com nome parecido ("…-caderno" ↔ "…-gabarito")
App.suggestKeyDoc = async () => {
  const base = App.baseName(App.state.name).toLowerCase();
  const stem = base.replace(/[-_\s]*(caderno|prova|quest[oõ]es|simulado)?$/i, '').replace(/[-_\s]+$/, '');
  const docs = (await App.safe(() => App.DB.all('docs'), [])).filter(d => d.hasFile && d.kind !== 'epub' && d.fp !== App.state.fp);
  const norm = s => App.baseName(s).toLowerCase();
  return docs.filter(d => /gabarito|respostas|resolu|coment/i.test(d.name))
    .sort((a, b) => (norm(b.name).startsWith(stem) ? 1 : 0) - (norm(a.name).startsWith(stem) ? 1 : 0) || b.ts - a.ts)[0] || null;
};
})();
