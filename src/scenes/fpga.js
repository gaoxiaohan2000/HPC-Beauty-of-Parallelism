// FPGA (56–72 s): reconfigurable fabric wires itself into a custom pipeline; data streams through it.
import * as THREE from 'three';
import { PAL, BEAT, col3, v3, rng, ease, easeOut, beatPulse, camAt, clamp, fract } from '../util.js';
import { glowBoxMat, instanced, setTS, setCol, pointsMat, POINT_TAIL, dynamicPoints, polyCurve } from '../common.js';

const T0 = 56;
const COLS = 12, ROWS = 7, SP = 1.25;
const cx = c => (c - (COLS - 1) / 2) * SP, cz = r => (r - (ROWS - 1) / 2) * SP;
const H = 0.44;

function buildPath() {
  const rnd = rng(3); const path = []; let r = 3;
  for (let c = 0; c < COLS; c++) {
    path.push([c, r]);
    if (c % 3 === 1 && c < COLS - 1) {
      const nr = Math.max(0, Math.min(ROWS - 1, r + [-2, -1, 1, 2][Math.floor(rnd() * 4)]));
      const step = nr > r ? 1 : -1;
      for (let rr = r + step; rr !== nr + step; rr += step) path.push([c, rr]);
      r = nr;
    }
  }
  return path;
}

export function createFPGA() {
  const group = new THREE.Group();
  const r = rng(56);
  const path = buildPath(), L = path.length;
  const onPath = new Map(path.map(([c, rr], k) => [`${c},${rr}`, k]));
  const Tk = k => 56.25 + k * 0.25;              // one block configured per eighth note

  const sub = new THREE.Mesh(new THREE.BoxGeometry(16.6, 0.12, 10.6),
    new THREE.MeshStandardMaterial({ color: 0x0d0b16, metalness: 0.55, roughness: 0.45 }));
  sub.position.y = -0.06; group.add(sub);
  // routing channels
  const ch = [];
  for (let c = 0; c <= COLS; c++) { const x = cx(c) - SP / 2; ch.push(v3(x, 0.005, cz(0) - SP / 2), v3(x, 0.005, cz(ROWS - 1) + SP / 2)); }
  for (let rr = 0; rr <= ROWS; rr++) { const z = cz(rr) - SP / 2; ch.push(v3(cx(0) - SP / 2, 0.005, z), v3(cx(COLS - 1) + SP / 2, 0.005, z)); }
  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ch),
    new THREE.LineBasicMaterial({ color: col3(PAL.violet, 0.35), transparent: true, opacity: 0.8 })));

  const clb = instanced(COLS * ROWS, glowBoxMat({ emis: 0.3, edge: 1.8, rim: 0.4 }));
  const sw = instanced((COLS + 1) * (ROWS + 1), glowBoxMat({ emis: 0.4, edge: 1.2, rim: 0.3 }));
  group.add(clb, sw);
  const swDummy = new THREE.Object3D();

  // pipeline route: input port → configured blocks → output port → result panel
  const PX0 = 9.2, PX1 = 12.8, PY0 = 0.35, PY1 = 2.38;    // result panel
  const pts = [v3(cx(0) - 2.0, H, cz(path[0][1]))];
  path.forEach(([c, rr]) => pts.push(v3(cx(c), H, cz(rr))));
  const last = path[L - 1];
  pts.push(v3(cx(COLS - 1) + 1.6, H, cz(last[1])));
  pts.push(v3(PX0 - 0.4, (PY0 + PY1) / 2, 0));
  const curve = polyCurve(pts);
  const NPTS = pts.length;
  const lengths = curve.getLengths(NPTS * 40);
  const arcAtIndex = idx => lengths[Math.round(idx / (NPTS - 1) * NPTS * 40)] / lengths[lengths.length - 1];
  const RAD = 8, TSEG = 900;
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, TSEG, 0.035, RAD, false),
    new THREE.MeshBasicMaterial({ color: col3(PAL.violet, 3.0) }));
  group.add(tube);

  // packets step stage-to-stage on the beat (zero-tension curve eases them automatically)
  const NPK = 60;
  const packets = instanced(NPK, glowBoxMat({ emis: 1.3, edge: 1.2, rim: 0.5 }));
  group.add(packets);
  const cPk = col3([225, 200, 255], 1);

  // trail particles
  const NT = 3200;
  const trail = dynamicPoints(NT, PAL.violet, 0.045);
  trail.mat.uniforms.uColor.value = col3([200, 150, 255], 1.6);
  group.add(trail.points);
  const tSeed = Float32Array.from({ length: NT }, () => r());
  const tJit = Float32Array.from({ length: NT * 3 }, () => (r() - 0.5) * 0.09);
  const LUTN = 1500, LUT = [];
  for (let i = 0; i <= LUTN; i++) LUT.push(curve.getPointAt(i / LUTN));

  // result panel: fills column by column, one result per clock
  const PC = 48, PR = 27, NPN = PC * PR;
  const tgt = new Float32Array(NPN * 3), pst = new Float32Array(NPN), val = new Float32Array(NPN);
  for (let c = 0; c < PC; c++) for (let rr = 0; rr < PR; rr++) {
    const i = c * PR + rr;
    tgt[i * 3] = PX0 + (PX1 - PX0) * c / (PC - 1); tgt[i * 3 + 1] = PY0 + (PY1 - PY0) * rr / (PR - 1); tgt[i * 3 + 2] = 0;
    pst[i] = 62.6 + c * (9.0 / PC) + r() * 0.08;
    const u = c / PC, v = rr / PR;
    val[i] = 0.5 + 0.5 * Math.sin(u * 9 + Math.sin(v * 7) * 1.6) * Math.cos(v * 5 - u * 3);
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(tgt, 3));
  pg.setAttribute('aStart', new THREE.BufferAttribute(pst, 1));
  pg.setAttribute('aVal', new THREE.BufferAttribute(val, 1));
  const panelMat = pointsMat(/* glsl */`
    uniform float uT, uScale, uAlpha, uBeat; uniform vec3 uFrom, uV, uW;
    attribute float aStart, aVal; varying vec3 vColor;
    void main() {
      float pr = clamp((uT - aStart) / 0.35, 0.0, 1.0);
      vec3 p = mix(uFrom, position, smoothstep(0.0, 1.0, pr));
      float on = step(aStart, uT);
      vec3 col = mix(uV * 0.5, uW, aVal * aVal) * (1.0 + 0.35 * uBeat) * on * (0.6 + 0.4 * pr);
      float size = 0.07 * on;
      ${POINT_TAIL}
    }`, { uFrom: { value: pts[NPTS - 1].clone() }, uV: { value: col3(PAL.violet, 1.2) }, uW: { value: col3([240, 225, 255], 1.6) } });
  const panel = new THREE.Points(pg, panelMat); panel.frustumCulled = false; group.add(panel);
  const frame = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([v3(PX0 - 0.15, PY0 - 0.15, 0), v3(PX1 + 0.15, PY0 - 0.15, 0), v3(PX1 + 0.15, PY1 + 0.15, 0), v3(PX0 - 0.15, PY1 + 0.15, 0)]),
    new THREE.LineBasicMaterial({ color: col3(PAL.violet, 0.9), transparent: true, opacity: 0.7 }));
  group.add(frame);

  const cam = [
    [56.0, [0.4, 13.8, 11.4], [0, 0, 0.5], 38],
    [61.7, [-1.4, 12.0, 10.4], [0.2, 0, 0.3], 38],
    [62.9, [4.0, 6.8, 14.2], [4.2, 0.6, 0], 38],
    [72.0, [5.6, 5.8, 13.0], [4.8, 0.8, 0], 38],
  ];
  const cV = col3(PAL.violet, 1), cDim = col3(PAL.violet, 1);

  function update(t) {
    const pulse = beatPulse(t);
    // CLBs: configured blocks rise and light up as the route reaches them
    for (let c = 0; c < COLS; c++) for (let rr = 0; rr < ROWS; rr++) {
      const i = c * ROWS + rr, k = onPath.get(`${c},${rr}`);
      let y = 0.1, e = 0.1 + 0.05 * Math.sin(t * 2 + i);
      if (k !== undefined && t >= Tk(k)) {
        const a = easeOut((t - Tk(k)) / 0.2);
        y = 0.1 + 0.16 * a;
        e = 0.85 + 1.6 * Math.exp(-(t - Tk(k)) * 4) + 0.35 * pulse;
      }
      setTS(clb, i, cx(c), y, cz(rr), 0.82, 0.2, 0.82);
      setCol(clb, i, k !== undefined && t >= Tk(k) ? cV : cDim, e);
    }
    clb.instanceMatrix.needsUpdate = true; clb.instanceColor.needsUpdate = true;
    // switch boxes spin into place next to configured blocks
    let s = 0;
    for (let c = 0; c <= COLS; c++) for (let rr = 0; rr <= ROWS; rr++) {
      let tOn = Infinity;
      for (const [dc, dr] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
        const k = onPath.get(`${c + dc},${rr + dr}`); if (k !== undefined) tOn = Math.min(tOn, Tk(k));
      }
      const a = isFinite(tOn) ? easeOut((t - tOn) / 0.3) : 0;
      swDummy.position.set(cx(c) - SP / 2, 0.04, cz(rr) - SP / 2);
      swDummy.rotation.set(0, Math.PI / 4 + a * Math.PI / 2, 0);
      swDummy.scale.set(0.2, 0.06, 0.2);
      swDummy.updateMatrix();
      sw.setMatrixAt(s, swDummy.matrix);
      setCol(sw, s, cV, isFinite(tOn) && t >= tOn ? 0.5 + 1.2 * Math.exp(-(t - tOn) * 3) : 0.12);
      s++;
    }
    sw.instanceMatrix.needsUpdate = true; sw.instanceColor.needsUpdate = true;
    // tube reveal follows configuration progress
    const kf = clamp((t - 56.25) / 0.25 + 1, 0, L);
    let arc = arcAtIndex(clamp(kf, 0, L));
    if (kf >= L) arc = arcAtIndex(L + 2 * ease((t - Tk(L - 1) - 0.1) / 0.5));
    const segs = Math.floor(arc * TSEG);
    tube.geometry.setDrawRange(0, segs * RAD * 6);
    tube.material.color.copy(col3(PAL.violet, 2.6 + 1.2 * pulse));
    // packets: one per stage, advancing on every beat
    const flowOn = t >= 62.0;
    for (let j = 0; j < NPK; j++) {
      const idx = (t - 62.0) / BEAT - j;
      const vis = flowOn && idx >= 0 && idx <= NPTS - 1 ? 1 : 0;
      const pp = vis ? curve.getPoint(clamp(idx / (NPTS - 1))) : pts[0];
      const sc = 0.15 * vis;
      setTS(packets, j, pp.x, pp.y, pp.z, sc, sc, sc);
      setCol(packets, j, cPk, 1.6 + 0.8 * pulse);
    }
    packets.instanceMatrix.needsUpdate = true; packets.instanceColor.needsUpdate = true;
    // trail particles along the revealed tube
    for (let i = 0; i < NT; i++) {
      const u = fract(tSeed[i] + t * 0.07);
      const ok = u <= arc ? 1 : 0;
      const pp = LUT[Math.floor(u * LUTN)];
      trail.pos[i * 3] = pp.x + tJit[i * 3]; trail.pos[i * 3 + 1] = pp.y + tJit[i * 3 + 1]; trail.pos[i * 3 + 2] = pp.z + tJit[i * 3 + 2];
      trail.vis[i] = ok * (0.35 + 0.65 * Math.sin(tSeed[i] * 80 + t * 4) ** 2);
    }
    trail.geo.attributes.position.needsUpdate = true; trail.geo.attributes.aVis.needsUpdate = true;
    frame.material.opacity = 0.25 + 0.5 * ease((t - 62.2) / 0.6);
    return camAt(cam, t);
  }

  function overlay(ov, t, lt, P) {
    ov.title(t, T0, 'FPGA', '现场可编程门阵列', PAL.violet, { sub: 'Field-Programmable Gate Array' });
    const [c0, r0] = path[2];
    ov.callout(t, 57.2, 61.5, P(cx(c0), 0.3, cz(r0)), 'CLB', '可配置逻辑块：电路的基本积木', PAL.violet, { dx: 70, dy: 110, len: 150 });
    const [c1, r1] = path[Math.floor(L * 0.6)];
    ov.callout(t, 58.8, 61.6, P(cx(c1) - SP / 2, 0.05, cz(r1) - SP / 2), 'Programmable Routing', '连线可以随时重新配置', PAL.violet, { dx: 90, dy: -100, len: 170 });
    const [c2, r2] = path[Math.floor(L * 0.45)];
    ov.callout(t, 63.0, 67.0, P(cx(c2), H + 0.1, cz(r2)), 'Pipeline', '数据像流水线一样连续流过', PAL.violet, { dx: -80, dy: -110, len: 150, side: -1 });
    ov.callout(t, 64.4, 71.6, P((PX0 + PX1) / 2, PY1 + 0.15, 0), 'one result per clock', '每个时钟周期，产出一个结果', PAL.violet, { dx: -40, dy: -90, len: 160, side: -1 });
    ov.tagline(t, 67.3, 71.8, 'hardware shaped to the algorithm', '为算法，定制电路', PAL.violet);
  }

  return { group, update, overlay };
}
