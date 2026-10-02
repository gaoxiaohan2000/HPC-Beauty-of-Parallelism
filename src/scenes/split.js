// Split (34–38 s): one core divides on every beat, children emerging from their parent, amber → green.
import * as THREE from 'three';
import { PAL, BEAT, col3, rng, ease, fract, beatPulse, camAt, lerp } from '../util.js';
import { glowBoxMat, instanced, setTS, setCol, pointsMat, POINT_TAIL } from '../common.js';

const T0 = 34;
const lvl = k => { const cols = 2 ** k; return [cols, Math.max(1, Math.round(cols * 9 / 16))]; };

export function createSplit() {
  const group = new THREE.Group();
  const tilt = new THREE.Group(); tilt.rotation.set(-0.3, 0.26, 0.02); group.add(tilt);
  const MAX = 128 * 72;
  const mat = glowBoxMat({ emis: 0.18, edge: 1.3, rim: 0.3 });
  const cubes = instanced(MAX, mat);
  tilt.add(cubes);

  // sparks on each split
  const NS = 3000, r = rng(34);
  const dir = new Float32Array(NS * 3), sd = new Float32Array(NS);
  for (let i = 0; i < NS; i++) {
    const a = r() * Math.PI * 2, rr = Math.sqrt(r());
    dir[i * 3] = Math.cos(a) * rr; dir[i * 3 + 1] = Math.sin(a) * rr * 0.6; dir[i * 3 + 2] = (r() - 0.5) * 0.6;
    sd[i] = r();
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(dir, 3));
  sg.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
  const sparkMat = pointsMat(/* glsl */`
    uniform float uT, uScale, uAlpha, uLocal, uWidth; uniform vec3 uC;
    attribute float aSeed; varying vec3 vColor;
    void main() {
      vec3 p = vec3(position.xy * uWidth * 0.55 * (0.35 + 0.65 * aSeed) * (1.0 + uLocal * 1.8), position.z * 2.0 + uLocal * 3.0 * aSeed);
      vec3 col = uC * exp(-uLocal * 5.0) * 1.8;
      float size = 0.06 * (0.5 + aSeed);
      ${POINT_TAIL}
    }`, { uLocal: { value: 0 }, uWidth: { value: 3 }, uC: { value: col3(PAL.amber, 1) } });
  const sparks = new THREE.Points(sg, sparkMat); sparks.frustumCulled = false; tilt.add(sparks);

  const cam = [
    [34.0, [0, 0, 9.5], [0, 0, 0], 42],
    [37.7, [0, -0.6, 17.6], [0, 0, 0], 42],
    [38.0, [0, -0.6, 17.8], [0, 0, 0], 42],
  ];
  const cAmber = col3(PAL.amber, 1), cGreen = col3(PAL.green, 1);
  let count = 1;

  function update(t) {
    const lt = t - T0;
    const k = Math.min(7, Math.floor(lt / BEAT));
    const within = lt / BEAT - k;
    const tr = k === 0 ? 1 : ease(within / 0.35);
    const grow = ease(Math.min(1, (k + ease(within * 2)) / 7));
    const width = lerp(2.4, 17.6, grow);
    const [cols, rows] = lvl(k);
    const [pc, pr] = k > 0 ? lvl(k - 1) : [1, 1];
    const cs = width / cols, h = cs * rows, pcs = width / pc, ph = pcs * pr;
    const pulse = beatPulse(t, 5);
    const col = cAmber.clone().lerp(cGreen, k / 7);
    let n = 0;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const x = (i + 0.5) * cs - width / 2, y = h / 2 - (j + 0.5) * cs;
      const pi = Math.floor(i * pc / cols), pj = Math.floor(j * pr / rows);
      const px = (pi + 0.5) * pcs - width / 2, py = ph / 2 - (pj + 0.5) * pcs;
      const s = lerp(pcs, cs, tr) * 0.84;
      const zz = Math.sin(i * 0.37 + j * 0.53 + t * 2) * 0.05 * cs;
      setTS(cubes, n, lerp(px, x, tr), lerp(py, y, tr), zz, s, s, s * 0.45);
      const fl = ((i * 7 + j * 13 + k) % 5 === 0) ? pulse : 0;
      setCol(cubes, n, col, 0.45 + 0.35 * pulse + 1.0 * fl);
      n++;
    }
    count = n;
    cubes.count = n;
    cubes.instanceMatrix.needsUpdate = true; cubes.instanceColor.needsUpdate = true;
    mat.uniforms.uEdge.value = k < 5 ? 1.5 : 0.9;
    sparkMat.uniforms.uLocal.value = within * BEAT;
    sparkMat.uniforms.uWidth.value = width;
    sparkMat.uniforms.uC.value.copy(col);
    return camAt(cam, t);
  }

  function overlay(ov, t) {
    const lt = t - T0;
    const k = Math.min(7, Math.floor(lt / BEAT));
    const col = PAL.amber.map((v, i) => v + (PAL.green[i] - v) * k / 7);
    const pop = 1 + 0.12 * Math.exp(-fract(lt / BEAT) * 8);
    const c2 = ov.ctx; c2.fillStyle = 'rgba(4,7,11,0.72)'; c2.beginPath(); c2.roundRect(1920 / 2 - 230, 1080 - 196, 460, 140, 14); c2.fill();
    c2.strokeStyle = `rgba(${col.map(Math.round).join(',')},0.35)`; c2.lineWidth = 1; c2.stroke();
    ov.text(count.toLocaleString('en-US'), 1920 / 2, 1080 - 138, { font: 'HInterT', size: 72 * pop, color: col, alpha: 0.95, align: 'center', base: 'middle', glow: 18 });
    ov.text(count === 1 ? 'core · 一个核心' : 'cores · 一分为多', 1920 / 2, 1080 - 84, { font: 'HNotoL, HInterL', size: 20, color: col, alpha: 0.7, align: 'center', base: 'middle', spacing: 4 });
  }

  return { group, update, overlay };
}
