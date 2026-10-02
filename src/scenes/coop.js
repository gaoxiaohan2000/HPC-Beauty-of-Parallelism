// Heterogeneous computing (72–84 s): CPU dispatches, GPU and FPGA compute, results merge into one galaxy.
import * as THREE from 'three';
import { PAL, BEAT, col3, v3, rng, ease, beatPulse, camAt } from '../util.js';
import { makeChip, glowBoxMat, instanced, setTS, setCol, pointsMat, POINT_TAIL, polyCurve } from '../common.js';

const T0 = 72;
const CPU_P = v3(0, 3.3, 0), GPU_P = v3(-6.2, -0.2, 0), FPGA_P = v3(6.2, -0.4, 0), CORE_P = v3(0, -1.75, 0.6);

export function createCoop() {
  const group = new THREE.Group();
  const r = rng(72);

  // CPU (conductor)
  const chip = makeChip();
  chip.lid.visible = false;
  chip.group.scale.setScalar(0.42); chip.group.position.copy(CPU_P); chip.group.rotation.set(0.6, 0, 0);
  group.add(chip.group);

  // GPU: a block of compute points
  const G = 12, NG = G * G * G;
  const gp = new Float32Array(NG * 3), gs = new Float32Array(NG);
  let q = 0;
  for (let x = 0; x < G; x++) for (let y = 0; y < G; y++) for (let z = 0; z < G; z++) {
    gp[q * 3] = (x - 5.5) * 0.16; gp[q * 3 + 1] = (y - 5.5) * 0.16; gp[q * 3 + 2] = (z - 5.5) * 0.16; gs[q] = z / (G - 1); q++;
  }
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.BufferAttribute(gp, 3));
  gg.setAttribute('aGz', new THREE.BufferAttribute(gs, 1));
  const gpuMat = pointsMat(/* glsl */`
    uniform float uT, uScale, uAlpha, uBeat; uniform vec3 uC, uCenter;
    attribute float aGz; varying vec3 vColor;
    void main() {
      float a = uT * 0.5;
      vec3 q = position;
      vec3 p = uCenter + vec3(q.x * cos(a) + q.z * sin(a), q.y, -q.x * sin(a) + q.z * cos(a));
      float w = fract(uT * 2.0 - aGz);
      vec3 col = uC * (0.4 + 0.8 * uBeat + 0.8 * exp(-w * 9.0));
      float size = 0.06;
      ${POINT_TAIL}
    }`, { uC: { value: col3(PAL.green, 1.2) }, uCenter: { value: GPU_P.clone() } });
  const gpu = new THREE.Points(gg, gpuMat); gpu.frustumCulled = false; group.add(gpu);

  // FPGA: mini fabric with a lit snake pipeline
  const fp = new THREE.Group(); fp.position.copy(FPGA_P); fp.rotation.set(0.75, -0.25, 0); group.add(fp);
  const sub = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.08, 2.6), new THREE.MeshStandardMaterial({ color: 0x0d0b16, metalness: 0.55, roughness: 0.45 }));
  fp.add(sub);
  const fc = instanced(15, glowBoxMat({ emis: 0.9, edge: 1.8, rim: 0.4 }));
  const snake = [];
  for (let rr = 0; rr < 3; rr++) for (let c = 0; c < 5; c++) {
    const cc = rr % 2 === 0 ? c : 4 - c; snake.push(v3((cc - 2) * 0.72, 0.16, (rr - 1) * 0.72));
  }
  snake.forEach((p, i) => { setTS(fc, i, p.x, 0.1, p.z, 0.48, 0.14, 0.48); setCol(fc, i, col3(PAL.violet, 1), 0.9); });
  fc.instanceMatrix.needsUpdate = true; fc.instanceColor.needsUpdate = true;
  fp.add(fc);
  const sCurve = polyCurve(snake.map(p => v3(p.x, 0.26, p.z)));
  fp.add(new THREE.Mesh(new THREE.TubeGeometry(sCurve, 300, 0.025, 6, false), new THREE.MeshBasicMaterial({ color: col3(PAL.violet, 2.8) })));
  const fpk = instanced(16, glowBoxMat({ emis: 1.4, edge: 1, rim: 0.5 }));
  fp.add(fpk);

  // dispatch bursts CPU → GPU / FPGA on every beat
  const beats = 24, per = 34, ND = beats * 2 * per;
  const dSt = new Float32Array(ND), dTg = new Float32Array(ND), dSd = new Float32Array(ND), dPos = new Float32Array(ND * 3);
  for (let b = 0, i = 0; b < beats; b++) for (let tg = 0; tg < 2; tg++) for (let k = 0; k < per; k++, i++) {
    dSt[i] = 72 + b * BEAT + r() * 0.06; dTg[i] = tg; dSd[i] = r();
    dPos[i * 3] = (r() - 0.5) * 0.5; dPos[i * 3 + 1] = (r() - 0.5) * 0.3; dPos[i * 3 + 2] = (r() - 0.5) * 0.5;
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
  dg.setAttribute('aStart', new THREE.BufferAttribute(dSt, 1));
  dg.setAttribute('aTg', new THREE.BufferAttribute(dTg, 1));
  dg.setAttribute('aSeed', new THREE.BufferAttribute(dSd, 1));
  const dispMat = pointsMat(/* glsl */`
    uniform float uT, uScale, uAlpha; uniform vec3 uSrc, uG, uF, uA, uCG, uCF;
    attribute float aStart, aTg, aSeed; varying vec3 vColor;
    void main() {
      float pr = (uT - aStart) / 0.48;
      float on = step(0.0, pr) * step(pr, 1.0);
      float e = smoothstep(0.0, 1.0, pr);
      vec3 dst = mix(uG, uF, aTg) + vec3(0.0, 1.0, 0.0);
      vec3 ctl = mix(uSrc, dst, 0.5) + vec3(0.0, 1.8, 1.2);
      vec3 p = (1.0 - e) * (1.0 - e) * uSrc + 2.0 * (1.0 - e) * e * ctl + e * e * dst + position * sin(pr * 3.14159);
      vec3 col = mix(uA, mix(uCG, uCF, aTg), e) * 1.9 * on;
      float size = 0.07 * on * (0.6 + aSeed * 0.8);
      ${POINT_TAIL}
    }`, { uSrc: { value: CPU_P.clone().add(v3(0, -0.2, 0.4)) }, uG: { value: GPU_P.clone() }, uF: { value: FPGA_P.clone() },
    uA: { value: col3(PAL.amber, 1) }, uCG: { value: col3(PAL.green, 1) }, uCF: { value: col3(PAL.violet, 1) } });
  const disp = new THREE.Points(dg, dispMat); disp.frustumCulled = false; group.add(disp);

  // result streams GPU / FPGA → core
  const NR = 2600;
  const rS = new Float32Array(NR), rT = new Float32Array(NR), rJ = new Float32Array(NR * 3);
  for (let i = 0; i < NR; i++) { rS[i] = r(); rT[i] = i % 2; rJ[i * 3] = (r() - 0.5) * 0.25; rJ[i * 3 + 1] = (r() - 0.5) * 0.25; rJ[i * 3 + 2] = (r() - 0.5) * 0.25; }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.BufferAttribute(rJ, 3));
  rg.setAttribute('aSeed', new THREE.BufferAttribute(rS, 1));
  rg.setAttribute('aTg', new THREE.BufferAttribute(rT, 1));
  const resMat = pointsMat(/* glsl */`
    uniform float uT, uScale, uAlpha, uOn; uniform vec3 uG, uF, uCore, uCG, uCF, uW;
    attribute float aSeed, aTg; varying vec3 vColor;
    void main() {
      float u = fract(aSeed + uT * 0.42);
      vec3 s = mix(uG, uF, aTg);
      vec3 ctl = vec3(s.x * 0.45, uCore.y - 1.2, 1.4);
      vec3 p = (1.0 - u) * (1.0 - u) * s + 2.0 * (1.0 - u) * u * ctl + u * u * uCore + position * (1.0 - u);
      vec3 col = mix(mix(uCG, uCF, aTg), uW, u * u) * 1.3 * uOn * smoothstep(0.0, 0.1, u) * (1.0 - smoothstep(0.92, 1.0, u));
      float size = 0.05;
      ${POINT_TAIL}
    }`, { uOn: { value: 0 }, uG: { value: GPU_P.clone() }, uF: { value: FPGA_P.clone() }, uCore: { value: CORE_P.clone() },
    uCG: { value: col3(PAL.green, 1) }, uCF: { value: col3(PAL.violet, 1) }, uW: { value: col3(PAL.white, 1) } });
  const res = new THREE.Points(rg, resMat); res.frustumCulled = false; group.add(res);

  // tri-colour galaxy: the single result everyone built
  const NGx = 7000;
  const gx = new Float32Array(NGx * 3), gk = new Float32Array(NGx), gr = new Float32Array(NGx);
  for (let i = 0; i < NGx; i++) {
    const rad = 0.18 + Math.pow(r(), 0.8) * 1.85;
    gx[i * 3] = rad; gx[i * 3 + 1] = (r() - 0.5) * 0.22 * (2.1 - rad); gx[i * 3 + 2] = (r() - 0.5) * (0.35 + 0.5 * r()) + (r() < 0.12 ? r() * 6.28 : 0);
    gk[i] = i % 3; gr[i] = r();
  }
  const xg = new THREE.BufferGeometry();
  xg.setAttribute('position', new THREE.BufferAttribute(gx, 3));
  xg.setAttribute('aKind', new THREE.BufferAttribute(gk, 1));
  xg.setAttribute('aRank', new THREE.BufferAttribute(gr, 1));
  const galMat = pointsMat(/* glsl */`
    uniform float uT, uScale, uAlpha, uBeat, uFill; uniform vec3 uCore, uA, uG, uV;
    attribute float aKind, aRank; varying vec3 vColor;
    void main() {
      float lt = uT - 72.0;
      float rad = position.x, ang = position.z + lt * (0.9 - rad * 0.12) + floor(aKind) * 2.094 + rad * 1.9;
      vec3 q = vec3(cos(ang) * rad, position.y, sin(ang) * rad);
      float tl = 0.85;
      vec3 p = uCore + vec3(q.x, q.y * cos(tl) - q.z * sin(tl), q.y * sin(tl) + q.z * cos(tl));
      float on = step(aRank, uFill);
      vec3 c = aKind < 0.5 ? uA : (aKind < 1.5 ? uG : uV);
      vec3 col = mix(c, vec3(1.0), (1.0 - smoothstep(0.2, 0.9, rad)) * 0.6) * (1.0 + 0.4 * uBeat) * 0.85 * on;
      float size = 0.042 * on;
      ${POINT_TAIL}
    }`, { uFill: { value: 0 }, uCore: { value: CORE_P.clone() }, uA: { value: col3(PAL.amber, 1) }, uG: { value: col3(PAL.green, 1) }, uV: { value: col3(PAL.violet, 1) } });
  const gal = new THREE.Points(xg, galMat); gal.frustumCulled = false; group.add(gal);

  const cam = [
    [72.0, [0, 1.9, 19.5], [0, 0.6, 0], 38],
    [84.0, [0, 1.2, 16.5], [0, 0.4, 0], 38],
  ];
  const cPk = col3([225, 200, 255], 1);

  function update(t) {
    const pulse = beatPulse(t);
    chip.coreMats.forEach((m, k) => { m.uniforms.uEmis.value = 0.6 + 1.2 * beatPulse(t + k * BEAT / 8); });
    for (let j = 0; j < 16; j++) {
      const idx = (t - 72) / BEAT - j * 1.0;
      const vis = idx >= 0 && idx <= 14 ? 1 : 0;
      const pp = sCurve.getPoint(Math.min(1, Math.max(0, idx / 14)));
      setTS(fpk, j, pp.x, pp.y + 0.05, pp.z, 0.13 * vis, 0.13 * vis, 0.13 * vis);
      setCol(fpk, j, cPk, 1.6 + 0.6 * pulse);
    }
    fpk.instanceMatrix.needsUpdate = true; fpk.instanceColor.needsUpdate = true;
    resMat.uniforms.uOn.value = ease((t - 72.8) / 0.8);
    galMat.uniforms.uFill.value = ease((t - 73.2) / 9.5);
    return camAt(cam, t);
  }

  function overlay(ov, t, lt, P) {
    ov.title(t, T0, 'Heterogeneous Computing', '异构计算 · 各展所长', PAL.white, { size: 46, sub: 'the right processor for each job' });
    ov.callout(t, 73.0, 83.5, P(CPU_P.x + 1.2, CPU_P.y + 0.2, CPU_P.z), 'CPU', '调度与控制', PAL.amber, { dx: 110, dy: -50, len: 110 });
    ov.callout(t, 73.6, 83.5, P(GPU_P.x - 0.6, GPU_P.y + 1.1, 0), 'GPU', '海量并行计算', PAL.green, { dx: -60, dy: -100, len: 120, side: -1 });
    ov.callout(t, 74.2, 83.5, P(FPGA_P.x + 1.6, FPGA_P.y + 0.6, 0), 'FPGA', '定制流水线', PAL.violet, { dx: 60, dy: -100, len: 120 });
    ov.callout(t, 77.0, 83.5, P(CORE_P.x + 1.7, CORE_P.y, CORE_P.z), 'one result', '同一个结果', PAL.white, { dx: 120, dy: 50, len: 130 });
  }

  return { group, update, overlay };
}
