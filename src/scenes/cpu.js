// CPU (8–24 s): multi-core die → fork/join multithreading → magnified hologram of one core: SMT, then SIMD.
import * as THREE from 'three';
import { PAL, BEAT, col3, v3, rng, ease, easeOut, easeIn, fract, beatPulse, camAt, clamp, win } from '../util.js';
import { makeChip, dynamicPoints, glowBoxMat, instanced, setTS, setCol, BOX } from '../common.js';

const T0 = 8;
const CX = -1.5, CZ = -1;               // core 0
const D = new THREE.Vector3(-1.5, 2.9, -1.0);   // centre of the magnified hologram above core 0

export function createCPU() {
  const group = new THREE.Group();
  const chip = makeChip();
  group.add(chip.group);

  // ---------- fork tree (explicit edges, so branches share exact prefixes) ----------
  const levelT = [12.0, 12.5, 13.0, 13.5, 14.0];
  const grow = (lv, t) => easeOut((t - levelT[lv]) / 0.45);
  const edges = [];
  const bez = (a, b, c, n = 40) => { const out = []; for (let i = 0; i <= n; i++) { const u = i / n; out.push(new THREE.Vector3().copy(a).multiplyScalar((1 - u) ** 2).addScaledVector(c, 2 * (1 - u) * u).addScaledVector(b, u * u)); } return out; };
  const mkEdge = (a, b, lv, straight = false) => {
    const c = straight ? a.clone().lerp(b, 0.5) : v3(b.x, a.y, b.z);
    const e = { pts: bez(a, b, c), lv };
    e.line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(e.pts),
      new THREE.LineBasicMaterial({ color: col3(PAL.amber, 1.4), transparent: true, opacity: 0.6 }));
    group.add(e.line); edges.push(e); return e;
  };
  const S0 = v3(0, 7.2, 0), S = v3(0, 4.6, 0);
  const root = mkEdge(S0, S, 0, true);
  const leafPaths = [];
  for (const sx of [-1, 1]) {
    const e1 = mkEdge(S, v3(sx, 3.6, 0), 1);
    for (const sz of [-1, 1]) {
      const e2 = mkEdge(v3(sx, 3.6, 0), v3(sx, 2.6, sz), 2);
      for (const cx of (sx < 0 ? [-1.5, -0.5] : [0.5, 1.5])) {
        const e3 = mkEdge(v3(sx, 2.6, sz), v3(cx, 1.7, sz), 3);
        const e4 = mkEdge(v3(cx, 1.7, sz), v3(cx, 0.52, sz), 4, true);
        leafPaths.push([root, e1, e2, e3, e4]);
      }
    }
  }
  const SHARE = [8, 4, 2, 1, 1];          // how many leaf paths share a segment of each level
  const LUT = leafPaths.map(path => {
    const pts = [], lv = [], fr = [];
    path.forEach(e => e.pts.forEach((p, i) => { pts.push(p); lv.push(e.lv); fr.push(i / (e.pts.length - 1)); }));
    return { pts, lv, fr };
  });
  const PER = 640, NTH = PER * 8;
  const threads = dynamicPoints(NTH, PAL.amber, 0.055);
  threads.mat.uniforms.uColor.value = col3([255, 200, 120], 1.25);
  group.add(threads.points);
  const r = rng(5);
  const seeds = Float32Array.from({ length: NTH }, () => r());
  const speeds = Float32Array.from({ length: NTH }, () => 0.26 + r() * 0.12);
  const jit = Float32Array.from({ length: NTH * 3 }, () => (r() - 0.5) * 0.05);

  // ---------- magnified hologram: frame + beam from core 0 ----------
  const holo = new THREE.Group(); group.add(holo);
  const frameGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(3.8, 2.4, 4.2));
  const frameMat = new THREE.LineBasicMaterial({ color: col3(PAL.cyan, 0.9), transparent: true, opacity: 0 });
  const frame = new THREE.LineSegments(frameGeo, frameMat); frame.position.copy(D); holo.add(frame);
  const beamMat = new THREE.LineBasicMaterial({ color: col3(PAL.amber, 1.2), transparent: true, opacity: 0 });
  const beam = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([
    v3(CX - 0.4, 0.5, CZ - 0.6), v3(D.x - 1.9, D.y - 1.2, D.z - 2.1), v3(CX + 0.4, 0.5, CZ - 0.6), v3(D.x + 1.9, D.y - 1.2, D.z - 2.1),
    v3(CX - 0.4, 0.5, CZ + 0.6), v3(D.x - 1.9, D.y - 1.2, D.z + 2.1), v3(CX + 0.4, 0.5, CZ + 0.6), v3(D.x + 1.9, D.y - 1.2, D.z + 2.1)]), beamMat);
  holo.add(beam);

  // SMT: two threads interleave through one pipeline
  const smt = new THREE.Group(); holo.add(smt);
  const stageMat = glowBoxMat({ color: col3(PAL.amber, 1).toArray(), emis: 0.08, edge: 1.2, rim: 0.3, transparent: true });
  for (let k = 0; k < 5; k++) {
    const m = new THREE.Mesh(BOX, stageMat);
    m.scale.set(2.2, 0.05, 0.42); m.position.set(D.x, D.y - 0.22, D.z - 1.6 + k * 0.8);
    smt.add(m);
  }
  const NP = 30;
  const packets = instanced(NP, glowBoxMat({ emis: 0.7, edge: 1.0, rim: 0.4 }));
  smt.add(packets);
  const cA = col3(PAL.amber, 1.5), cB = col3(PAL.cyan, 1.5);

  // SIMD: one instruction, 8 lanes
  const simd = new THREE.Group(); holo.add(simd);
  const lanes = instanced(8, glowBoxMat({ emis: 0.35, edge: 1.4, rim: 0.35, transparent: true }));
  const drops = instanced(8, glowBoxMat({ emis: 0.9, edge: 0.8, rim: 0.3 }));
  const instr = new THREE.Mesh(BOX, glowBoxMat({ color: col3(PAL.cyan, 1).toArray(), emis: 0.4, edge: 1.4, rim: 0.3 }));
  instr.scale.set(3.3, 0.08, 0.3); instr.position.set(D.x, D.y + 0.95, D.z);
  simd.add(lanes, drops, instr);
  const laneX = j => D.x - 1.33 + j * 0.38;
  const cAm = col3(PAL.amber, 1), cWh = col3(PAL.white, 1);

  const cam = [
    [8.0, [8.6, 6.2, 8.6], [0, 0.3, 0], 35],
    [10.0, [3.0, 7.6, 11.2], [0, 0.4, 0], 35],
    [11.7, [-1.6, 7.2, 11.0], [0, 1.0, 0], 35],
    [12.5, [0.3, 5.9, 12.6], [0, 2.7, 0], 35],
    [15.6, [0.9, 5.6, 12.0], [0, 2.5, 0], 35],
    [16.6, [D.x + 2.4, D.y + 1.3, D.z + 5.0], [D.x, D.y - 0.1, D.z], 36],
    [19.7, [D.x + 2.0, D.y + 1.1, D.z + 5.2], [D.x, D.y - 0.1, D.z], 36],
    [20.4, [D.x + 0.5, D.y + 0.8, D.z + 5.4], [D.x, D.y + 0.2, D.z], 36],
    [24.0, [D.x - 0.4, D.y + 0.9, D.z + 5.1], [D.x, D.y + 0.2, D.z], 36],
  ];

  function update(t) {
    const pulse = beatPulse(t);
    const lu = ease((t - 9.0) / 1.5);
    chip.lid.position.y = 0.62 + lu * 3.2;
    chip.lid.rotation.x = lu * 0.5;
    chip.lidMat.opacity = 1 - ease((t - 9.6) / 0.9);
    chip.lid.visible = chip.lidMat.opacity > 0.01;
    chip.l3.material.uniforms.uEmis.value = 0.12 + 0.25 * pulse;
    const arrive = 14.3, closeup = ease((t - 15.8) / 0.8);
    chip.coreMats.forEach((m, k) => {
      const bp = beatPulse(t + k * BEAT / 8);
      let e = t >= arrive ? 0.45 + 0.6 * bp : 0.12 + 0.18 * beatPulse(t + k * BEAT / 4);
      let ed = t >= arrive ? 1.1 + 0.8 * bp : 0.8;
      if (k !== 0) { e *= 1 - 0.7 * closeup; ed *= 1 - 0.5 * closeup; }
      else { e += 0.4 * closeup * pulse; }
      m.uniforms.uEmis.value = e; m.uniforms.uEdge.value = ed;
    });
    // fork edges grow level by level on the beat
    const treeA = win(t, 11.8, 16.2, 0.3, 0.5);
    edges.forEach(e => {
      const g = grow(e.lv, t);
      e.line.geometry.setDrawRange(0, Math.floor(g * e.pts.length));
      e.line.material.opacity = 0.55 * treeA;
      e.line.visible = treeA > 0.01 && g > 0;
    });
    if (treeA > 0.01) {
      for (let i = 0; i < NTH; i++) {
        const leaf = Math.floor(i / PER), L = LUT[leaf];
        const u = fract(seeds[i] + (t - 12) * speeds[i]);
        const gi = u * (L.pts.length - 1), i0 = Math.floor(gi), i1 = Math.min(i0 + 1, L.pts.length - 1), f = gi - i0;
        const lv = L.lv[i0];
        const ok = (L.fr[i0] <= grow(lv, t) + 1e-3 && leaf % SHARE[lv] === 0) ? 1 : 0;
        const p0 = L.pts[i0], p1 = L.pts[i1];
        threads.pos[i * 3] = p0.x + (p1.x - p0.x) * f + jit[i * 3];
        threads.pos[i * 3 + 1] = p0.y + (p1.y - p0.y) * f + jit[i * 3 + 1];
        threads.pos[i * 3 + 2] = p0.z + (p1.z - p0.z) * f + jit[i * 3 + 2];
        threads.vis[i] = ok * treeA * (0.5 + 0.5 * Math.sin(seeds[i] * 50 + t * 3) ** 2);
      }
      threads.geo.attributes.position.needsUpdate = true;
      threads.geo.attributes.aVis.needsUpdate = true;
    }
    threads.points.visible = treeA > 0.01;

    // hologram frame & beam
    const holoA = win(t, 15.9, 24.6, 0.6, 0.4);
    holo.visible = holoA > 0.01;
    frameMat.opacity = 0.35 * holoA; beamMat.opacity = 0.3 * holoA;

    // SMT pipeline: packets alternate thread A / thread B, one stage per eighth note
    const smtA = win(t, 16.1, 20.2, 0.5, 0.35);
    smt.visible = smtA > 0.01;
    stageMat.uniforms.uAlpha.value = smtA;
    stageMat.uniforms.uEmis.value = 0.08 + 0.18 * pulse;
    for (let j = 0; j < NP; j++) {
      const i = j - 8, Ti = 16.2 + i * 0.25, s = (t - Ti) / 0.25;
      const si = Math.floor(s), q = si + ease(clamp((s - si) / 0.5));
      const side = (i % 2 === 0) ? -1 : 1;
      let x = D.x, z = D.z - 1.6 + q * 0.8, vis = 1;
      if (q < 0) { x = D.x + side * 1.3 * Math.min(1, -q / 2); z = D.z - 1.6 + q * 0.7; }
      if (q > 4) vis = clamp(1 - (q - 4) / 1.5);
      if (q < -2.5) vis = 0;
      const sc = 0.26 * vis * smtA;
      setTS(packets, j, x, D.y, z, sc, sc, sc);
      setCol(packets, j, side < 0 ? cA : cB, 1);
    }
    packets.instanceMatrix.needsUpdate = true; packets.instanceColor.needsUpdate = true;

    // SIMD lanes: 1 → 2 → 4 → 8 active on successive beats, then all 8 in lockstep
    const simdA = win(t, 20.0, 24.2, 0.45, 0.3);
    simd.visible = simdA > 0.01;
    const b = Math.floor((t - 20) / BEAT), ph = fract((t - 20) / BEAT);
    const active = t < 20 ? 0 : Math.min(8, 2 ** Math.max(0, b));
    lanes.material.uniforms.uAlpha.value = simdA;
    for (let j = 0; j < 8; j++) {
      const on = j < active;
      const flash = on ? (ph >= 0.3 ? 0.3 + 1.4 * Math.exp(-(ph - 0.3) * 7) : 0.3) : 0.06;
      setTS(lanes, j, laneX(j), D.y, D.z, 0.2, 1.3, 0.2);
      setCol(lanes, j, cAm, flash);
      const dy = D.y + 1.9 - 1.15 * easeIn(ph / 0.3);
      const dv = on && ph < 0.3 ? simdA : 0;
      setTS(drops, j, laneX(j), dy, D.z, 0.2 * dv, 0.2 * dv, 0.2 * dv);
      setCol(drops, j, cWh, 1.4);
    }
    lanes.instanceMatrix.needsUpdate = true; lanes.instanceColor.needsUpdate = true;
    drops.instanceMatrix.needsUpdate = true; drops.instanceColor.needsUpdate = true;
    instr.material.uniforms.uEmis.value = (0.25 + 1.0 * pulse);
    instr.material.uniforms.uAlpha.value = 1;

    return camAt(cam, t);
  }

  function overlay(ov, t, lt, P) {
    ov.title(t, T0, 'CPU', '中央处理器', PAL.amber, { sub: 'Central Processing Unit' });
    ov.callout(t, 9.8, 11.7, P(1.5, 0.5, 1), 'Multi-core', '几个强大的核心', PAL.amber, { dx: 110, dy: -60, len: 140 });
    ov.callout(t, 10.4, 11.7, P(-1.95, 0.41, 0), 'Shared L3 Cache', '核心共享的三级缓存', PAL.cyan, { dx: -100, dy: 90, len: 150, side: -1 });
    const s = P(0, 4.6, 0);
    ov.callout(t, 12.7, 15.6, s, 'Multithreading · fork', '一个任务，拆成多个线程并行执行', PAL.amber, { dx: 150, dy: -50, len: 170 });
    if (s.vis) ov.code(t, 12.3, 15.6, s.x - 360, s.y - 110, '#pragma omp parallel for', PAL.amber);
    ov.callout(t, 16.9, 19.7, P(D.x + 1.1, D.y - 0.2, D.z - 0.8), 'SMT · Hyper-Threading', '两个线程，轮流共享同一个核心', PAL.amber, { dx: 120, dy: -120, len: 180 });
    ov.callout(t, 20.8, 23.7, P(laneX(7) + 0.1, D.y + 0.6, D.z), 'SIMD', '一条指令，同时处理八份数据', PAL.amber, { dx: 120, dy: -80, len: 170 });
    ov.tagline(t, 9.3, 11.7, 'few cores, each one powerful', '少而强', PAL.amber);
  }

  return { group, update, overlay };
}
