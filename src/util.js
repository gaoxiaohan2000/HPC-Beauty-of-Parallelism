// HPC 之美 · 3D — shared constants & helpers.  Author: 意雨轻寒 / Jerry Leibniz
import * as THREE from 'three';

export const W = 1920, H = 1080;
export const BPM = 120, BEAT = 60 / BPM, FPS = 30, DUR = 90;

export const PAL = {
  bg: [7, 9, 15],
  amber: [255, 176, 64],
  red: [255, 72, 48],
  green: [60, 255, 150],
  violet: [178, 108, 255],
  cyan: [120, 220, 255],
  white: [235, 240, 255],
  teal: [70, 230, 210],
  lime: [180, 255, 90],
};

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const fract = x => x - Math.floor(x);
export const ease = x => { x = clamp(x); return x * x * (3 - 2 * x); };
export const easeOut = x => { x = clamp(x); return 1 - Math.pow(1 - x, 3); };
export const easeIn = x => { x = clamp(x); return x * x * x; };
export const easeIO = x => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };

/** 1.0 on every beat, decaying until the next one (same curve as the Python version). */
export const beatPulse = (t, decay = 6) => Math.exp(-fract(t / BEAT) * decay);
/** visible window with soft in/out */
export const win = (t, a, b, fi = 0.4, fo = 0.4) => Math.min(ease((t - a) / fi), ease((b - t) / fo));

/** deterministic PRNG (mulberry32) */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const css = (c, a = 1, k = 1) =>
  `rgba(${Math.round(Math.min(255, c[0] * k))},${Math.round(Math.min(255, c[1] * k))},${Math.round(Math.min(255, c[2] * k))},${clamp(a)})`;
export const mixc = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/** sRGB palette colour -> linear THREE.Color, optionally scaled into HDR for bloom */
export function col3(c, k = 1) {
  return new THREE.Color().setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace).multiplyScalar(k);
}
export const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

/** camera keyframes: [time, [px,py,pz], [lx,ly,lz], fov]; eased between keys */
export function camAt(keys, t) {
  const mk = (k) => ({ pos: v3(...k[1]), look: v3(...k[2]), fov: k[3] });
  if (t <= keys[0][0]) return mk(keys[0]);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t < b[0]) {
      const u = easeIO((t - a[0]) / (b[0] - a[0]));
      return {
        pos: v3(lerp(a[1][0], b[1][0], u), lerp(a[1][1], b[1][1], u), lerp(a[1][2], b[1][2], u)),
        look: v3(lerp(a[2][0], b[2][0], u), lerp(a[2][1], b[2][1], u), lerp(a[2][2], b[2][2], u)),
        fov: lerp(a[3], b[3], u),
      };
    }
  }
  return mk(keys[keys.length - 1]);
}
