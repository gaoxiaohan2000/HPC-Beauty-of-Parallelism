// Intro (0–8 s) and finale (84–90 s): faithful Canvas2D ports of the approved Python version.
import { W, H, PAL, BEAT, css, ease, beatPulse, rng } from './util.js';
import { FONT } from './overlay.js';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const scaleC = (c, k) => c.map(v => Math.min(255, Math.floor(v * k)));
const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

/** additive neon: sharp light layer + two blurred copies (same recipe as Python Frame.render) */
export class Neon2D {
  constructor() {
    this.light = canvas(W, H); this.l = this.light.getContext('2d');
    this.small = canvas(W / 4, H / 4); this.s = this.small.getContext('2d');
  }
  begin() {
    const l = this.l;
    l.setTransform(1, 0, 0, 1, 0, 0); l.globalCompositeOperation = 'source-over'; l.globalAlpha = 1;
    l.fillStyle = '#000'; l.fillRect(0, 0, W, H);
  }
  composite(ctx, g1, k1, g2, k2) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(this.light, 0, 0);
    for (const [g, k] of [[g1, k1], [g2, k2]]) {
      this.s.globalCompositeOperation = 'source-over';
      this.s.filter = 'none'; this.s.fillStyle = '#000'; this.s.fillRect(0, 0, W / 4, H / 4);
      this.s.filter = `blur(${g / 4}px)`;
      this.s.drawImage(this.light, 0, 0, W / 4, H / 4);
      this.s.filter = 'none';
      ctx.globalAlpha = k;
      ctx.drawImage(this.small, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

// ---------------- intro ----------------
const TRACES = (() => {
  const r = rng(7), n = 30, paths = [];
  for (let k = 0; k < n; k++) {
    const ang = 2 * Math.PI * k / n + (r() * 0.1 - 0.05);
    let x = W / 2 + Math.cos(ang) * 60, y = H / 2 + Math.sin(ang) * 60;
    const pts = [[x, y]];
    let horiz = Math.abs(Math.cos(ang)) > Math.abs(Math.sin(ang));
    const segs = 4 + Math.floor(r() * 4);
    for (let s = 0; s < segs; s++) {
      const L = 60 + r() * 160;
      if (horiz) x += Math.sign(Math.cos(ang)) * L; else y += Math.sign(Math.sin(ang)) * L;
      horiz = !horiz;
      pts.push([x, y]);
    }
    paths.push(pts);
  }
  return paths;
})();

function partialPath(pts, frac) {
  const lens = []; let total = 0;
  for (let i = 0; i < pts.length - 1; i++) { const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); lens.push(L); total += L; }
  let rem = total * frac; const out = [pts[0]];
  for (let i = 0; i < lens.length; i++) {
    if (rem >= lens[i]) { out.push(pts[i + 1]); rem -= lens[i]; }
    else { const f = rem / lens[i]; out.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f]); break; }
  }
  return out;
}

export function drawIntro(ctx, neon, ov, bg, t) {
  ctx.drawImage(bg, 0, 0);
  neon.begin();
  const l = neon.l, p = ease(t / 7.0), pulse = beatPulse(t);
  l.lineJoin = 'miter'; l.lineCap = 'butt';
  TRACES.forEach((pts, i) => {
    const frac = ease(p * 1.3 - (i % 7) * 0.04);
    if (frac <= 0) return;
    const seg = partialPath(pts, frac);
    l.strokeStyle = rgb(scaleC(PAL.cyan, 0.35 + 0.25 * pulse)); l.lineWidth = 2;
    l.beginPath(); l.moveTo(seg[0][0], seg[0][1]); for (const q of seg.slice(1)) l.lineTo(q[0], q[1]); l.stroke();
    const [hx, hy] = seg[seg.length - 1];
    l.fillStyle = rgb(PAL.cyan); l.beginPath(); l.arc(hx, hy, 4, 0, Math.PI * 2); l.fill();
    const bit = ((i * 31 + Math.floor(t * 8)) % 3) ? '1' : '0';
    ov.text(bit, hx + 8, hy - 10, { font: FONT.mono, size: 16, color: PAL.cyan, alpha: 110 / 255, base: 'top' });
  });
  // the single switch at the centre
  const s = 34 + 6 * pulse, cx = W / 2, cy = H / 2;
  l.strokeStyle = rgb(PAL.white); l.lineWidth = 3;
  l.beginPath(); l.roundRect(cx - s, cy - s, 2 * s, 2 * s, 8); l.stroke();
  l.fillStyle = rgb(scaleC(PAL.white, 0.6 + 0.4 * pulse));
  l.fillRect(cx - s * 0.45, cy - s * 0.45, s * 0.9, s * 0.9);
  l.strokeStyle = rgb(PAL.white); l.lineWidth = 2;
  for (let k = -2; k <= 2; k++) {
    const o = k * s * 0.38;
    l.beginPath(); l.moveTo(cx + o, cy - s); l.lineTo(cx + o, cy - s - 12); l.stroke();
    l.beginPath(); l.moveTo(cx + o, cy + s); l.lineTo(cx + o, cy + s + 12); l.stroke();
  }
  // quiet zone under the caption (Python intro_mask)
  l.save();
  l.globalCompositeOperation = 'destination-out';
  l.translate(W / 2, H - 125); l.scale(620, 95);
  const g = l.createRadialGradient(0, 0, 0.6, 0, 0, 1.6);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.5, 'rgba(0,0,0,0.65)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  l.fillStyle = g; l.beginPath(); l.arc(0, 0, 0.6, 0, Math.PI * 2); l.fillStyle = 'rgba(0,0,0,1)'; l.fill();
  l.fillStyle = g; l.fillRect(-2, -2, 4, 4);
  l.restore();
  ov.label(W / 2, H - 150, 'Everything begins with a switch', '一切计算，始于一个开关',
    { alpha: 0.6 * ease((t - 2) / 2), align: 'center', enSize: 28, zhSize: 19 });
  neon.composite(ctx, 8, 0.9, 50, 0.7);
  ctx.drawImage(ov.cv, 0, 0);
}

// ---------------- finale ----------------
export function drawFinale(ctx, neon, ov, bg, t) {
  ctx.drawImage(bg, 0, 0);
  neon.begin();
  const l = neon.l, lt = t - 84;
  const titleA = ease((lt - 0.5) / 1.5);
  const r = rng(11);
  const rows = [[430, 110, 34, 14], [575, 165, 48, 18], [780, 230, 66, 24]];
  rows.forEach(([ytop, rh, rw, gap], ri) => {
    const depth = 0.45 + ri * 0.27;
    const n = Math.floor((W - 120) / (rw + gap));
    const offs = (W - n * (rw + gap) + gap) / 2;
    for (let k = 0; k < n; k++) {
      const x = offs + k * (rw + gap);
      l.strokeStyle = rgb(scaleC([80, 92, 140], depth)); l.lineWidth = 1;
      l.strokeRect(x + 0.5, ytop + 0.5, rw, rh);
      const slots = 8 + ri * 2;
      for (let s = 0; s < slots; s++) {
        const ly = ytop + 8 + s * (rh - 16) / slots;
        const col = [PAL.amber, PAL.green, PAL.violet][(k * 3 + s + ri) % 3];
        const ph = r();
        const on = beatPulse(t + ph * BEAT * 4, 2.5) > 0.35;
        l.fillStyle = rgb(scaleC(col, on ? 0.95 * depth : 0.15 * depth));
        l.fillRect(x + 5, ly, rw * 0.35, 3);
      }
    }
  });
  const hx = W / 2, hy = 300;
  l.fillStyle = rgb(PAL.white); l.beginPath(); l.arc(hx, hy, 5, 0, Math.PI * 2); l.fill();
  [PAL.amber, PAL.green, PAL.violet].forEach((col, i) => {
    const ang = Math.PI / 2 + (i - 1) * 0.9 + lt * 0.4;
    const px = hx + Math.cos(ang) * 22, py = hy + Math.sin(ang) * 22 * 0.4;
    l.fillStyle = rgb(col); l.beginPath(); l.arc(px, py, 3, 0, Math.PI * 2); l.fill();
  });
  ov.text('并行之美', W / 2, 170, { font: FONT.zhT, size: 92, alpha: titleA, align: 'center', base: 'middle' });
  ov.text('The Beauty of Parallelism', W / 2, 252, { font: FONT.enT, size: 36, alpha: 0.8 * titleA, align: 'center', base: 'middle' });
  ov.text('意雨轻寒  /  Jerry Leibniz', W / 2, 1040, { font: FONT.zhL, size: 22, color: [210, 215, 235], alpha: 0.55 * ease((lt - 2.5) / 1.5), align: 'center', base: 'middle' });
  neon.composite(ctx, 8, 0.9, 60, 0.65);
  ctx.drawImage(ov.cv, 0, 0);
}
export { css };
