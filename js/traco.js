/* Aparência do traço da caneta: pontas de espessura variável, contorno, endireitar linhas, formas e simplificação. */
(() => {
'use strict';
const App = window.App;
const { clamp01, distSeg } = App;

function pathD(pts, b){
  if (!pts.length) return '';
  const P = pts.map(([x, y]) => [x * b.w, y * b.h]);
  const f = v => v.toFixed(1);
  if (P.length === 1) return `M${f(P[0][0])} ${f(P[0][1])} l0.1 0`;
  let d = `M${f(P[0][0])} ${f(P[0][1])}`;
  for (let i = 1; i < P.length - 1; i++) {
    const mx = (P[i][0] + P[i + 1][0]) / 2, my = (P[i][1] + P[i + 1][1]) / 2;
    d += ` Q${f(P[i][0])} ${f(P[i][1])} ${f(mx)} ${f(my)}`;
  }
  const L = P[P.length - 1];
  return d + ` L${f(L[0])} ${f(L[1])}`;
}
App.pathD = pathD;
// ---------- Aparência do traço: pontas de espessura variável viram um contorno preenchido ----------
const VAR_TIPS = new Set(['fountain', 'callig', 'brush']);
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
function inkWidths(P, s){
  const n = P.length, w = s.width || 2.4, len = [0];
  for (let i = 1; i < n; i++) len[i] = len[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
  const total = len[n - 1] || 1, avg = total / (n - 1) || 1, hasP = P.some(q => q[2] != null);
  const L = s.line === 'taper' ? Math.min(total * 0.35, w * 9) : s.tip === 'brush' ? Math.min(total * 0.3, w * 5) : s.tip === 'fountain' ? Math.min(total * 0.2, w * 2) : 0;
  let out = P.map((q, i) => {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
    // sem pressão (mouse, dedo): quanto mais rápido o traço, mais fino
    const pr = hasP ? clampN(q[2] ?? 0.5, 0.05, 1) : clampN(1.15 - 0.55 * Math.hypot(b[0] - a[0], b[1] - a[1]) / (2 * avg), 0.2, 1);
    let f = 1;
    if (s.tip === 'fountain') f = 0.45 + 0.95 * pr;
    else if (s.tip === 'brush') f = 0.2 + 1.7 * Math.pow(pr, 1.4);
    else if (s.tip === 'callig') f = 0.22 + 1.15 * Math.abs(Math.sin(Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 4));
    if (L) f *= Math.max(0.08, Math.sin(Math.min(1, Math.min(len[i], total - len[i]) / L) * Math.PI / 2));
    return w * f;
  });
  for (let pass = 0; pass < 2; pass++) out = out.map((v, i) => (out[Math.max(0, i - 1)] + v + out[Math.min(n - 1, i + 1)]) / 3);
  return out;
}
function outlineSides(pts, s, b){
  const P = pts.map(q => [q[0] * b.w, q[1] * b.h, q[2]]), n = P.length, W = inkWidths(P, s), A = [], B = [];
  P.forEach((q, i) => {
    const a = P[Math.max(0, i - 1)], c = P[Math.min(n - 1, i + 1)], dx = c[0] - a[0], dy = c[1] - a[1], m = Math.hypot(dx, dy) || 1, r = W[i] / 2;
    A.push([q[0] - dy / m * r, q[1] + dx / m * r]); B.push([q[0] + dy / m * r, q[1] - dx / m * r]);
  });
  return { A, B, W, n };
}
function outlineD(pts, s, b){
  const { A, B, W, n } = outlineSides(pts, s, b), f = v => v.toFixed(1);
  const run = L => { let d = ''; for (let i = 1; i < L.length - 1; i++) d += ` Q${f(L[i][0])} ${f(L[i][1])} ${f((L[i][0] + L[i + 1][0]) / 2)} ${f((L[i][1] + L[i + 1][1]) / 2)}`; const e = L[L.length - 1]; return d + ` L${f(e[0])} ${f(e[1])}`; };
  const R = B.slice().reverse(), r1 = f(W[n - 1] / 2), r0 = f(W[0] / 2);
  return `M${f(A[0][0])} ${f(A[0][1])}${run(A)} A${r1} ${r1} 0 0 0 ${f(R[0][0])} ${f(R[0][1])}${run(R)} A${r0} ${r0} 0 0 0 ${f(A[0][0])} ${f(A[0][1])}Z`;
}
const inkFilled = (pts, s) => !s.marker && pts.length > 2 && (s.line === 'taper' || ((s.line || 'solid') === 'solid' && VAR_TIPS.has(s.tip)));
App.inkFilled = inkFilled;
App.inkOutline = (pts, s, b) => { const { A, B } = outlineSides(pts, s, b); return [...A, ...B.reverse()]; };
// o contorno de cada traço só é recalculado quando o traço muda (a chave inclui os pontos das pontas e do meio,
// porque mover com o laço altera os pontos no lugar)
const dMemo = new WeakMap();
function inkD(pts, s, b, fill){
  const n = pts.length, k = `${fill ? 'f' : 's'}|${s.width || 2.4}|${s.tip || ''}|${s.line || ''}|${b.w}|${b.h}|${n}|${pts[0]}|${pts[n >> 1]}|${pts[n - 1]}`;
  let m = dMemo.get(pts);
  if (!m || m.k !== k) { m = { k, d: fill ? outlineD(pts, s, b) : pathD(pts, b) }; dMemo.set(pts, m); }
  return m.d;
}
function paintInk(path, pts, s, b){
  const w = s.width || 2.4, line = s.line || 'solid', marker = !!s.marker;
  const fill = inkFilled(pts, s);
  path.classList.toggle('marker', marker);
  path.classList.toggle('markerRound', marker && s.tip === 'round');
  path.classList.toggle('inkFill', fill);
  path.classList.toggle('tipPencil', !marker && s.tip === 'pencil');
  if (marker && s.opacity) path.style.setProperty('--mo', s.opacity / 100); else path.style.removeProperty('--mo');
  if (line === 'dash') path.setAttribute('stroke-dasharray', `${+(w * 2.6).toFixed(2)} ${+(w * 2.4).toFixed(2)}`);
  else if (line === 'dot') path.setAttribute('stroke-dasharray', `0.01 ${+(w * 2.2).toFixed(2)}`);
  else path.removeAttribute('stroke-dasharray');
  if (fill) { path.removeAttribute('stroke-width'); path.setAttribute('d', inkD(pts, s, b, true)); }
  else { path.setAttribute('stroke-width', w); path.setAttribute('d', inkD(pts, s, b, false)); }
}
App.paintInk = paintInk;
// "Endireitar as linhas": um traço quase reto vira reta (e quase horizontal/vertical encaixa no eixo)
function straighten(pts, rect, s){
  if (pts.length < 3) return pts;
  const px = q => [q[0] * rect.width, q[1] * rect.height], a = px(pts[0]), z = px(pts[pts.length - 1]);
  const dx = z[0] - a[0], dy = z[1] - a[1], L = Math.hypot(dx, dy);
  if (L < 14) return pts;
  let dev = 0;
  for (const q of pts) { const c = px(q); dev = Math.max(dev, Math.abs((c[0] - a[0]) * dy - (c[1] - a[1]) * dx) / L); }
  if (dev > Math.max(7, L * 0.09)) return pts;
  const ang = Math.abs(Math.atan2(dy, dx)) * 180 / Math.PI, A = [pts[0][0], pts[0][1]], Z = [pts[pts.length - 1][0], pts[pts.length - 1][1]];
  if (ang < 5 || ang > 175) Z[1] = A[1]; else if (Math.abs(ang - 90) < 5) Z[0] = A[0];
  const n = denseFor(s, L);
  return Array.from({ length: n + 1 }, (_, i) => [A[0] + (Z[0] - A[0]) * i / n, A[1] + (Z[1] - A[1]) * i / n]);
}
// "Ajustar a espessura ao texto": usa a altura da linha de texto sob o marca-texto e centraliza nela
function fitToText(pts, d){
  const items = d.textItems; if (!items || !items.length) return null;
  const step = Math.max(1, Math.floor(pts.length / 12)), hits = new Set();
  for (let i = 0; i < pts.length; i += step) for (const it of items) if (it.w > 0 && pts[i][0] >= it.x && pts[i][0] <= it.x + it.w && pts[i][1] >= it.y - it.h * 0.2 && pts[i][1] <= it.y + it.h * 1.2) hits.add(it);
  if (!hits.size) return null;
  const mid = l => l.sort((a, b) => a - b)[l.length >> 1], list = [...hits], h = mid(list.map(it => it.h)), cy = mid(list.map(it => it.y + it.h / 2));
  const ys = pts.map(q => q[1]), my = (Math.min(...ys) + Math.max(...ys)) / 2, flat = Math.max(...ys) - Math.min(...ys) < h * 1.2;
  return { pts: flat ? pts.map(q => [q[0], clamp01(q[1] + cy - my)]) : pts, w: +clampN(h * d.p.base.h * 1.15, 5, 40).toFixed(1) };
}
// segurar parado no fim do traço: vira reta, círculo/elipse ou retângulo
const denseFor = (s, L) => s.marker || (!VAR_TIPS.has(s.tip) && s.line !== 'taper') ? 1 : Math.max(3, Math.min(24, Math.ceil(L / 12)));
function detectShape(pts, rect, s){
  if (pts.length < 6) return null;
  const P = pts.map(q => [q[0] * rect.width, q[1] * rect.height]);
  let len = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  P.forEach((q, i) => { if (i) len += Math.hypot(q[0] - P[i - 1][0], q[1] - P[i - 1][1]); x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); });
  if (len < 30) return null;
  const a = P[0], z = P[P.length - 1], gap = Math.hypot(z[0] - a[0], z[1] - a[1]), norm = ([x, y]) => [clamp01(x / rect.width), clamp01(y / rect.height)];
  const sample = (A, B, n) => Array.from({ length: n }, (_, i) => [A[0] + (B[0] - A[0]) * i / n, A[1] + (B[1] - A[1]) * i / n]);
  if (gap > len * 0.28) {
    let dev = 0; for (const q of P) dev = Math.max(dev, Math.abs((q[0] - a[0]) * (z[1] - a[1]) - (q[1] - a[1]) * (z[0] - a[0])) / (gap || 1));
    if (dev > gap * 0.22) return null;
    const n = denseFor(s, gap); return [...sample(a, z, n), z].map(norm);
  }
  const w = x1 - x0, h = y1 - y0; if (w < 14 || h < 14) return null;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = w / 2, ry = h / 2, m = Math.min(w, h);
  let eE = 0, eR = 0;
  for (const [x, y] of P) {
    const nx = (x - cx) / rx, ny = (y - cy) / ry, dist = Math.hypot(nx, ny) || 1;
    eE += Math.abs(1 - 1 / dist) * Math.hypot(x - cx, y - cy);
    eR += Math.min(Math.abs(x - x0), Math.abs(x - x1), Math.abs(y - y0), Math.abs(y - y1));
  }
  eE /= P.length; eR /= P.length;
  if (Math.min(eE, eR) > m * 0.16) return null;
  if (eE <= eR) return Array.from({ length: 49 }, (_, i) => { const t = i / 48 * Math.PI * 2 - Math.PI / 2; return norm([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]); });
  const C = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], out = [];
  C.forEach((q, i) => out.push(q, ...sample(q, C[(i + 1) % 4], denseFor(s, Math.max(w, h)))));
  return [...out, C[0], C[0]].map(norm);
}
// tira pontos que não mudam o desenho (o arquivo fica leve); pontas de espessura variável guardam todos
function simplify(pts, rect, s){
  if (pts.length < 4 || inkFilled(pts, s)) return pts;
  const P = pts.map(q => [q[0] * rect.width, q[1] * rect.height]), keep = new Uint8Array(P.length), stack = [[0, P.length - 1]];
  keep[0] = keep[P.length - 1] = 1;
  while (stack.length) {
    const [i, j] = stack.pop(); let best = 0, at = -1;
    for (let k = i + 1; k < j; k++) { const e = distSeg(P[k][0], P[k][1], P[i][0], P[i][1], P[j][0], P[j][1]); if (e > best) { best = e; at = k; } }
    if (best > 0.22) { keep[at] = 1; stack.push([i, at], [at, j]); }
  }
  return pts.filter((_, i) => keep[i]);
}
function inkNow(d){
  const P = d.pen; let pts = d.shape || d.pts, w = P.w;
  if (P.straight && !d.shape) pts = straighten(pts, d.rect, P);
  if (P.marker && P.fit) { const r = fitToText(pts, d); if (r) { pts = r.pts; w = r.w; } }
  return { pts, P: { ...P, w, width: w } };
}


// para o núcleo e os grifos
Object.assign(App, { detectShape, inkNow, simplify });
})();
