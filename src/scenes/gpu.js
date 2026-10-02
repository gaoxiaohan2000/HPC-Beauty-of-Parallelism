// GPU → AI (38–56 s): GEMM on tensor cores → thousands of cores → particles morph into a neural network.
import * as THREE from 'three';
import { PAL, BEAT, col3, v3, rng, ease, beatPulse, camAt, clamp } from '../util.js';
import { glowBoxMat, instanced, setTS, setCol, pointsMat, POINT_TAIL } from '../common.js';

const T0 = 38;
const N = 16, SP = 0.24, CELL = 0.135, HALF = (N - 1) / 2, OFF = (HALF + 1) * SP + 0.75;
const tileT = (ti, tj, tk) => 38.25 + (tk * 7 + ti + tj) * 0.2;
const cellPos = (i, j, k) => [(j - HALF) * SP, (HALF - i) * SP, (k - HALF) * SP];
const aPos = (i, k) => [-OFF, (HALF - i) * SP, (k - HALF) * SP];
const bPos = (k, j) => [(j - HALF) * SP, OFF, (k - HALF) * SP];
const cPos = (i, j) => [(j - HALF) * SP, (HALF - i) * SP, OFF];

// neural network layout
const LX = [-9, -5.4, -1.8, 1.8, 5.4, 9], LC = [8, 14, 18, 18, 14, 6];
const neuron = (l, n) => { const cnt = LC[l], s = Math.min(0.95, 7.6 / cnt); return [LX[l], (n - (cnt - 1) / 2) * s, Math.sin(n * 1.7 + l) * 0.5]; };

export function createGPU() {
  const group = new THREE.Group();
  const r = rng(38);

  // ================= GEMM =================
  const gemm = new THREE.Group(); group.add(gemm);
  const prod = instanced(N * N * N, glowBoxMat({ emis: 0.55, edge: 0.9, rim: 0.25 }));
  const faceA = instanced(N * N, glowBoxMat({ emis: 0.6, edge: 0.8, rim: 0.2 }));
  const faceB = instanced(N * N, glowBoxMat({ emis: 0.6, edge: 0.8, rim: 0.2 }));
  const faceC = instanced(N * N, glowBoxMat({ emis: 0.9, edge: 1.4, rim: 0.4 }));
  gemm.add(prod, faceA, faceB, faceC);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) {
    const [x, y, z] = cellPos(i, j, k); setTS(prod, (i * N + j) * N + k, x, y, z, CELL, CELL, CELL);
  }
  for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) {
    let p = aPos(a, b); setTS(faceA, a * N + b, p[0], p[1], p[2], 0.04, CELL, CELL);
    p = bPos(a, b); setTS(faceB, a * N + b, p[0], p[1], p[2], CELL, 0.04, CELL);
    p = cPos(a, b); setTS(faceC, a * N + b, p[0], p[1], p[2], CELL, CELL, 0.04);
  }
  [prod, faceA, faceB, faceC].forEach(m => { m.instanceMatrix.needsUpdate = true; });

  // data-flow particles from A (along +x) and B (along -y) into the active tile
  const per = 56, NF = 64 * per;
  const src = new Float32Array(NF * 3), dst = new Float32Array(NF * 3), st = new Float32Array(NF), kind = new Float32Array(NF);
  let q = 0;
  for (let ti = 0; ti < 4; ti++) for (let tj = 0; tj < 4; tj++) for (let tk = 0; tk < 4; tk++) {
    const T = tileT(ti, tj, tk);
    for (let s = 0; s < per; s++) {
      const i = ti * 4 + Math.floor(r() * 4), j = tj * 4 + Math.floor(r() * 4), k = tk * 4 + Math.floor(r() * 4);
      const fromA = s % 2 === 0;
      const sp = fromA ? aPos(i, k) : bPos(k, j), dp = cellPos(i, j, k);
      src.set(sp, q * 3); dst.set(dp, q * 3); st[q] = T - 0.35 + r() * 0.3; kind[q] = fromA ? 0 : 1; q++;
    }
  }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.BufferAttribute(src, 3));
  fg.setAttribute('aDst', new THREE.BufferAttribute(dst, 3));
  fg.setAttribute('aStart', new THREE.BufferAttribute(st, 1));
  fg.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
  const flowMat = pointsMat(/* glsl */`
    uniform float uT, uScale, uAlpha; uniform vec3 uCA, uCB;
    attribute vec3 aDst; attribute float aStart; attribute float aKind; varying vec3 vColor;
    void main() {
      float pr = (uT - aStart) / 0.45;
      float on = step(0.0, pr) * step(pr, 1.0);
      vec3 p = mix(position, aDst, smoothstep(0.0, 1.0, pr));
      float size = 0.075 * sin(clamp(pr, 0.0, 1.0) * 3.14159) * on;
      vec3 col = mix(uCA, uCB, aKind) * 1.3 * on;
      ${POINT_TAIL}
    }`, { uCA: { value: col3(PAL.teal, 1) }, uCB: { value: col3(PAL.lime, 1) } });
  const flow = new THREE.Points(fg, flowMat); flow.frustumCulled = false; gemm.add(flow);

  // ================= thousands of cores → neural network (one particle system) =================
  const BX = 9, BY = 5, G = 8, GS = 0.14, NP = BX * BY * G * G * G;
  const arr = new Float32Array(NP * 3), nn = new Float32Array(NP * 3);
  const seed = new Float32Array(NP), delay = new Float32Array(NP), layer = new Float32Array(NP), isN = new Float32Array(NP), blk = new Float32Array(NP), gz = new Float32Array(NP);
  let p = 0;
  for (let bx = 0; bx < BX; bx++) for (let by = 0; by < BY; by++) for (let x = 0; x < G; x++) for (let y = 0; y < G; y++) for (let z = 0; z < G; z++) {
    const cx = (bx - 4) * 2.5, cy = (by - 2) * 2.35;
    arr[p * 3] = cx + (x - 3.5) * GS; arr[p * 3 + 1] = cy + (y - 3.5) * GS; arr[p * 3 + 2] = (z - 3.5) * GS;
    blk[p] = Math.hypot(bx - 4, by - 2); gz[p] = z / (G - 1);
    p++;
  }
  // shuffle assignment so the morph swirls instead of sliding
  const order = Array.from({ length: NP }, (_, i) => i);
  for (let i = NP - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const neurons = []; LC.forEach((c, l) => { for (let n = 0; n < c; n++) neurons.push([l, n]); });
  const edgesNN = [];
  for (let l = 0; l < LC.length - 1; l++) for (let a = 0; a < LC[l]; a++) for (let b = 0; b < LC[l + 1]; b++) edgesNN.push([neuron(l, a), neuron(l + 1, b)]);
  const PER_NEURON = 24, nNeuronPts = neurons.length * PER_NEURON;
  for (let s = 0; s < NP; s++) {
    const i = order[s];
    let tx, ty, tz;
    if (s < nNeuronPts) {
      const [l, n] = neurons[Math.floor(s / PER_NEURON)]; [tx, ty, tz] = neuron(l, n);
      const a = r() * Math.PI * 2, b = Math.acos(2 * r() - 1), rr = 0.09 * Math.cbrt(r());
      tx += rr * Math.sin(b) * Math.cos(a); ty += rr * Math.sin(b) * Math.sin(a); tz += rr * Math.cos(b);
      isN[i] = 1;
    } else {
      const e = edgesNN[(s - nNeuronPts) % edgesNN.length];
      const ridx = Math.floor((s - nNeuronPts) / edgesNN.length);
      const u = (ridx + 0.5 + (r() - 0.5) * 0.6) / Math.ceil((NP - nNeuronPts) / edgesNN.length);
      tx = e[0][0] + (e[1][0] - e[0][0]) * u; ty = e[0][1] + (e[1][1] - e[0][1]) * u; tz = e[0][2] + (e[1][2] - e[0][2]) * u;
    }
    nn[i * 3] = tx; nn[i * 3 + 1] = ty; nn[i * 3 + 2] = tz;
    layer[i] = (tx + 9) / 18; seed[i] = r(); delay[i] = r();
  }
  const ng = new THREE.BufferGeometry();
  ng.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  ng.setAttribute('aNN', new THREE.BufferAttribute(nn, 3));
  ng.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  ng.setAttribute('aDelay', new THREE.BufferAttribute(delay, 1));
  ng.setAttribute('aLayer', new THREE.BufferAttribute(layer, 1));
  ng.setAttribute('aIsN', new THREE.BufferAttribute(isN, 1));
  ng.setAttribute('aBlk', new THREE.BufferAttribute(blk, 1));
  ng.setAttribute('aGz', new THREE.BufferAttribute(gz, 1));
  const netMat = pointsMat(/* glsl */`
    uniform float uT, uScale, uAlpha, uBeat; uniform vec3 uG, uW;
    attribute vec3 aNN; attribute float aSeed, aDelay, aLayer, aIsN, aBlk, aGz;
    varying vec3 vColor;
    void main() {
      // array appears as a ripple from the centre block outward
      float tA = (aBlk < 0.01) ? 45.9 : 44.6 + aBlk * 0.12;
      float app = smoothstep(0.0, 1.0, (uT - tA) / 0.5);
      // morph into the network
      float m = smoothstep(0.0, 1.0, (uT - 50.0 - aDelay * 1.6) / 1.6);
      vec3 sw = vec3(sin(aSeed * 31.0 + uT * 1.7), cos(aSeed * 17.0 + uT * 1.3), sin(aSeed * 7.0 + uT * 1.1));
      vec3 p = mix(position, aNN, m) + sw * sin(m * 3.14159) * 1.8;
      // array look: lockstep beat + warp stripes sweeping through depth
      float w = fract(uT * 2.0 - aGz);
      float bArr = 0.35 + 0.8 * uBeat + 0.7 * exp(-w * 9.0);
      // network look: activation wave travelling input → output, one pass per bar
      float xw = fract((uT - 52.0) / 1.0) * 1.3 - 0.15;
      float dx = (aLayer - xw) / 0.06;
      float wave = exp(-dx * dx) * step(52.0, uT);
      float bNN = aIsN > 0.5 ? (1.1 + 2.2 * wave + 0.5 * uBeat) : (0.42 + 2.6 * wave);
      vec3 colNN = mix(uG, uW, aIsN * 0.6 + wave * 0.5);
      vec3 col = mix(uG * bArr, colNN * bNN, m) * app;
      float size = mix(0.055, aIsN > 0.5 ? 0.11 : 0.05, m) * app;
      ${POINT_TAIL}
    }`, { uG: { value: col3(PAL.green, 1.1) }, uW: { value: col3([210, 255, 230], 1.2) } });
  const net = new THREE.Points(ng, netMat); net.frustumCulled = false; group.add(net);

  const cam = [
    [38.0, [-8.4, 5.0, 9.6], [0.3, -0.2, 0], 38],
    [43.9, [-6.4, 3.8, 11.0], [0.3, 0, 0], 38],
    [46.3, [-1.4, 1.2, 22.5], [0, 0, 0], 38],
    [49.8, [1.6, 0.7, 21.2], [0, 0, 0], 38],
    [51.6, [0, 0.6, 20.6], [0, 0, 0], 38],
    [56.0, [2.8, 1.1, 19.6], [0, 0, 0], 38],
  ];
  const cG = col3(PAL.green, 1), cT = col3(PAL.teal, 1), cL = col3(PAL.lime, 1), cW = col3([220, 255, 235], 1);
  const tileI = (T, t) => { const l = t - T; return l < 0 ? 0 : (l < 0.6 ? 0.35 + 1.5 * Math.exp(-l * 5) : 0.13); };

  function update(t) {
    const pulse = beatPulse(t);
    // GEMM cube shrinks into the centre of the core array
    const sh = ease((t - 44.0) / 1.6);
    gemm.scale.setScalar(1 - sh * 0.72);
    const ga = 1 - ease((t - 45.7) / 0.5);
    gemm.visible = ga > 0.01;
    [prod, faceA, faceB, faceC].forEach(m => { m.material.uniforms.uAlpha.value = 1; });
    if (gemm.visible) {
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) {
        const T = tileT(i >> 2, j >> 2, k >> 2), I = tileI(T, t);
        const acc = (t - T >= 0 && t - T < 0.6) ? 1 + 0.6 * pulse : 1;
        setCol(prod, (i * N + j) * N + k, I > 1 ? cW : cG, (I < 0.01 ? 0.035 : I) * acc * ga);
      }
      for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) {
        let ia = 0.08, ib = 0.08, done = 0;
        for (let u = 0; u < 4; u++) {
          const TA = tileT(a >> 2, u, b >> 2), TB = tileT(u, b >> 2, a >> 2);
          if (t >= TA && t < TA + 0.6) ia = Math.max(ia, 0.3 + 1.0 * Math.exp(-(t - TA) * 5));
          if (t >= TB && t < TB + 0.6) ib = Math.max(ib, 0.3 + 1.0 * Math.exp(-(t - TB) * 5));
          if (t >= tileT(a >> 2, b >> 2, u) + 0.3) done++;
        }
        setCol(faceA, a * N + b, cT, ia * ga);
        setCol(faceB, a * N + b, cL, ib * ga);
        setCol(faceC, a * N + b, done === 4 ? cW : cG, (0.1 + 0.6 * done / 4) * ga);
      }
      [prod, faceA, faceB, faceC].forEach(m => { m.instanceColor.needsUpdate = true; });
    }
    flowMat.uniforms.uAlpha.value = ga;
    netMat.uniforms.uAlpha.value = 1;
    net.visible = t > 44.4;
    return camAt(cam, t);
  }

  function overlay(ov, t, lt, P) {
    ov.title(t, T0, 'GPU', '图形处理器  →  AI 加速器', PAL.green, { sub: 'from graphics to artificial intelligence' });
    if (t < 44.4) {
      const fa = Math.min(ease((t - 38.6) / 0.5), ease((44.2 - t) / 0.4));
      const s = 1;
      const pa = P(-OFF * s, (HALF + 1.4) * SP, 0), pb = P(0, OFF + 0.35, -(HALF + 1.2) * SP), pc = P((HALF + 1.6) * SP, -(HALF + 1.6) * SP, OFF);
      if (pa.vis) ov.text('A', pa.x, pa.y, { font: 'HMono', size: 30, color: PAL.teal, alpha: 0.9 * fa, align: 'center', base: 'middle', glow: 12 });
      if (pb.vis) ov.text('B', pb.x, pb.y, { font: 'HMono', size: 30, color: PAL.lime, alpha: 0.9 * fa, align: 'center', base: 'middle', glow: 12 });
      if (pc.vis) ov.text('C', pc.x, pc.y, { font: 'HMono', size: 30, color: [220, 255, 235], alpha: 0.9 * fa, align: 'center', base: 'middle', glow: 12 });
    }
    ov.callout(t, 39.2, 43.9, P(...cPos(1, 15)), 'GEMM  ·  C = A × B', '矩阵乘法：AI 里最核心的运算', PAL.green, { dx: 110, dy: -90, len: 170 });
    ov.callout(t, 40.2, 43.9, P(...cellPos(14, 15, 1)), 'Tensor Core', '一次算完一个 4×4 小块', PAL.green, { dx: 130, dy: 70, len: 160 });
    ov.tagline(t, 46.3, 49.8, 'thousands of cores, in lockstep', '成千上万个核心，齐步运算', PAL.green);
    ov.callout(t, 51.7, 55.8, P(...neuron(3, LC[3] - 1).map((v, i) => i === 1 ? v + 0.25 : v)), 'Neural Network', '神经网络：一层一层的矩阵乘法', PAL.white, { dx: 110, dy: -70, len: 170 });
    ov.tagline(t, 52.6, 55.9, 'AI is matrix multiplication at scale', '人工智能的本质，是海量的矩阵乘法', PAL.green);
  }

  return { group, update, overlay };
}
