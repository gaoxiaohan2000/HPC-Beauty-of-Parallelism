// 2D text layer drawn on top of the 3D render: kinetic titles, 3D-anchored callouts, taglines.
import { W, H, PAL, css, ease, easeOut, clamp } from './util.js';

export const FONT = { enL: 'HInterL', enT: 'HInterT', zhL: 'HNotoL, HInterL', zhT: 'HNotoT, HNotoL', mono: 'HMono' };

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

export class Overlay {
  constructor() {
    this.cv = canvas(W, H);
    this.ctx = this.cv.getContext('2d');
  }
  begin() {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    c.filter = 'none'; c.shadowBlur = 0; c.letterSpacing = '0px';
    c.clearRect(0, 0, W, H);
  }
  text(s, x, y, { font = FONT.enL, size = 24, color = PAL.white, alpha = 1, align = 'left', base = 'alphabetic', spacing = 0, glow = 0 } = {}) {
    if (alpha <= 0.003) return;
    const c = this.ctx;
    c.font = `${size}px ${font}`;
    c.letterSpacing = `${spacing}px`;
    c.textAlign = align; c.textBaseline = base;
    c.fillStyle = css(color, alpha);
    if (glow) { c.shadowColor = css(color, alpha * 0.7); c.shadowBlur = glow; }
    c.fillText(s, x, y);
    c.shadowBlur = 0; c.letterSpacing = '0px';
  }
  /** English term with a quieter Chinese line under it (same shape as the Python label) */
  label(x, y, en, zh, { color = PAL.white, alpha = 0.75, enSize = 30, zhSize = 20, align = 'left', enFont = FONT.enL, base = 'top' } = {}) {
    this.text(en, x, y, { font: enFont, size: enSize, color, alpha, align, base });
    if (zh) this.text(zh, x, y + enSize * 1.25, { font: FONT.zhL, size: zhSize, color, alpha: alpha * 0.7, align, base });
  }

  /** Kinetic chapter title: letters rise in one by one, underline draws on, Chinese fades in. */
  title(t, t0, en, zh, color, { x = 120, y = 150, size = 84, sub = null, dimAfter = 4.0 } = {}) {
    const lt = t - t0;
    if (lt < 0) return;
    const c = this.ctx;
    const dim = 1 - 0.45 * ease((lt - dimAfter) / 1.2);
    c.font = `${size}px ${FONT.enT}`;
    const sp = size * 0.1;
    c.letterSpacing = '0px'; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    let cx = x;
    [...en].forEach((ch, i) => {
      const a = easeOut((lt - i * 0.07) / 0.5);
      const dy = (1 - a) * 30;
      c.fillStyle = css(color, a * dim);
      c.shadowColor = css(color, 0.55 * a * dim); c.shadowBlur = 22;
      c.fillText(ch, cx, y + dy);
      cx += c.measureText(ch).width + sp;
    });
    c.shadowBlur = 0;
    const wTitle = cx - sp - x;
    // underline drawing on, with a bright head
    const ul = easeOut((lt - 0.25) / 0.9);
    if (ul > 0) {
      const ly = y + 24;
      const grad = c.createLinearGradient(x, 0, x + wTitle * 1.25, 0);
      grad.addColorStop(0, css(color, 0.8 * dim)); grad.addColorStop(1, css(color, 0.0));
      c.strokeStyle = grad; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(x, ly); c.lineTo(x + wTitle * 1.25 * ul, ly); c.stroke();
      if (ul < 1) {
        c.fillStyle = css(PAL.white, 0.9);
        c.shadowColor = css(color, 0.9); c.shadowBlur = 14;
        c.beginPath(); c.arc(x + wTitle * 1.25 * ul, ly, 2.5, 0, Math.PI * 2); c.fill();
        c.shadowBlur = 0;
      }
    }
    const za = ease((lt - 0.5) / 0.6) * dim;
    this.text(zh, x, y + 64, { font: FONT.zhL, size: 26, color, alpha: 0.88 * za, spacing: 6 });
    if (sub) this.text(sub.toUpperCase(), x, y + 98, { font: FONT.enL, size: 15, color, alpha: 0.5 * ease((lt - 0.8) / 0.6) * dim, spacing: 4 });
  }

  /** Leader-line callout anchored to a projected 3D point. p = {x, y, vis} */
  callout(t, tIn, tOut, p, en, zh, color, { dx = 90, dy = -70, len = 150, side = 1 } = {}) {
    if (!p || !p.vis || t < tIn || t > tOut + 0.45) return;
    const c = this.ctx;
    const fade = ease((tOut + 0.45 - t) / 0.45);
    const g = easeOut((t - tIn) / 0.5);
    const ex = p.x + dx, ey = p.y + dy;
    const hx = ex + side * len;
    // anchor marker
    c.strokeStyle = css(color, 0.9 * fade); c.lineWidth = 1.4;
    c.beginPath(); c.arc(p.x, p.y, 6 + 6 * (1 - g), 0, Math.PI * 2); c.stroke();
    c.fillStyle = css(PAL.white, 0.95 * fade);
    c.beginPath(); c.arc(p.x, p.y, 2.2, 0, Math.PI * 2); c.fill();
    // elbow line, drawn progressively
    const l1 = Math.hypot(dx, dy), l2 = len, L = (l1 + l2) * g;
    c.strokeStyle = css(color, 0.75 * fade); c.lineWidth = 1.2;
    c.beginPath();
    const ux = dx / l1, uy = dy / l1;
    const sx = p.x + ux * 8, sy = p.y + uy * 8;
    c.moveTo(sx, sy);
    if (L <= l1) c.lineTo(p.x + ux * L, p.y + uy * L);
    else { c.lineTo(ex, ey); c.lineTo(ex + side * (L - l1), ey); }
    c.stroke();
    const ta = ease((t - tIn - 0.3) / 0.45) * fade;
    const align = side > 0 ? 'left' : 'right';
    const tx = side > 0 ? ex + 4 : ex - 4;
    this.text(en, tx, ey - 10, { font: FONT.enL, size: 23, color: mixLight(color), alpha: 0.95 * ta, align, glow: 10 });
    if (zh) this.text(zh, tx, ey + 26, { font: FONT.zhL, size: 16, color, alpha: 0.75 * ta, align, spacing: 1.5 });
    void hx;
  }

  /** small monospace code tag */
  code(t, tIn, tOut, x, y, s, color) {
    const a = Math.min(ease((t - tIn) / 0.4), ease((tOut - t) / 0.4));
    if (a <= 0) return;
    const n = Math.floor(clamp((t - tIn) / 0.6) * s.length);
    this.text(s.slice(0, n) + (n < s.length ? '▌' : ''), x, y, { font: FONT.mono, size: 18, color, alpha: 0.8 * a, glow: 8 });
  }

  tagline(t, tIn, tOut, en, zh, color, { x = W / 2, y = H - 128, align = 'center' } = {}) {
    const a = Math.min(ease((t - tIn) / 0.6), ease((tOut - t) / 0.5));
    if (a <= 0) return;
    const rise = (1 - easeOut((t - tIn) / 0.8)) * 14;
    this.text(en, x, y + rise, { font: FONT.enL, size: 30, color: mixLight(color), alpha: 0.85 * a, align, spacing: 1.2, glow: 12 });
    this.text(zh, x, y + 40 + rise, { font: FONT.zhL, size: 19, color, alpha: 0.65 * a, align, spacing: 5 });
  }
}

function mixLight(c) { return c.map(v => v + (255 - v) * 0.35); }

/** Python-version background: radial vignette + faint 48px dot grid */
export function makeBackground() {
  const c = canvas(W, H), x = c.getContext('2d');
  const img = x.createImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
    const r = Math.sqrt(((xx - W / 2) / W) ** 2 + ((y - H / 2) / H) ** 2);
    const v = clamp(1 - r * 1.4);
    const k = 0.55 + 0.6 * v;
    const dot = (xx % 48 < 1.5 && y % 48 < 1.5) ? 14 * v : 0;
    const o = (y * W + xx) * 4;
    d[o] = PAL.bg[0] * k + dot; d[o + 1] = PAL.bg[1] * k + dot; d[o + 2] = PAL.bg[2] * k + dot; d[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return c;
}

export function makeVignette() {
  const c = canvas(W, H), x = c.getContext('2d');
  const g = x.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.6)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  return c;
}
