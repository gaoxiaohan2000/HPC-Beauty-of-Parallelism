// Power Wall (24–34 s): clock-speed curve made of particles hits a glass ceiling; the chip overheats.
import * as THREE from 'three';
import { PAL, col3, v3, rng, ease, camAt, clamp } from '../util.js';
import { pointsMat, POINT_TAIL, makeChip } from '../common.js';

const T0 = 24;
const X = yr => (yr - 2005) * 0.36;
const lg = Math.log10;
const Y = g => (lg(g) - lg(0.004)) / (lg(10) - lg(0.004)) * 4.6 - 1.8;
// illustrative trend: ~30x per decade until ~2004, then a plateau
const freq = yr => Math.min(0.033 * Math.pow(30, (yr - 1990) / 10), 3.6 + 0.05 * Math.max(0, yr - 2004));
const CONTACT = 2003.8;

export function createWall() {
  const group = new THREE.Group();
  const r = rng(24);

  // axes
  const axMat = new THREE.LineBasicMaterial({ color: col3([90, 95, 130], 0.9), transparent: true, opacity: 0.8 });
  const y0 = Y(0.004), x0 = X(1985) - 0.3;
  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([v3(x0, Y(10) + 0.3, 0), v3(x0, y0, 0), v3(X(2025) + 0.5, y0, 0)]), axMat));
  const ticks = [];
  for (const yr of [1990, 2000, 2010, 2020]) ticks.push(v3(X(yr), y0, 0), v3(X(yr), y0 - 0.12, 0));
  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ticks), axMat));

  // curve particles
  const N = 9000;
  const pos = new Float32Array(N * 3), yrA = new Float32Array(N), sd = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const yr = 1985 + 40 * (i / N) + (r() - 0.5) * 0.02;
    const a = r() * Math.PI * 2, rad = Math.sqrt(r()) * 0.07;
    pos[i * 3] = X(yr); pos[i * 3 + 1] = Y(freq(yr)) + Math.cos(a) * rad; pos[i * 3 + 2] = Math.sin(a) * rad * 1.6;
    yrA[i] = yr; sd[i] = r();
  }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  cg.setAttribute('aYr', new THREE.BufferAttribute(yrA, 1));
  cg.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
  const curveMat = pointsMat(/* glsl */`
    uniform float uT, uScale, uAlpha, uFront; uniform vec3 uA, uR;
    attribute float aYr; attribute float aSeed; varying vec3 vColor;
    void main() {
      vec3 p = position;
      float on = step(aYr, uFront);
      float head = exp(-max(uFront - aYr, 0.0) * 2.5) * on;
      float hot = smoothstep(2003.0, 2005.5, aYr);
      vec3 col = mix(uA, uR, hot) * (0.7 + 2.6 * head) * (0.75 + 0.25 * sin(uT * 4.0 + aSeed * 30.0)) * on;
      float size = (0.05 + 0.05 * head) * on;
      ${POINT_TAIL}
    }`, { uFront: { value: 1985 }, uA: { value: col3(PAL.amber, 1.3) }, uR: { value: col3(PAL.red, 1.5) } });
  const curve = new THREE.Points(cg, curveMat); curve.frustumCulled = false; group.add(curve);

  // glass ceiling (the wall)
  const ceilY = Y(3.6) + 0.13;
  const ceilW = X(2025) + 0.6 - X(1999);
  const ceilMat = new THREE.MeshBasicMaterial({ color: col3(PAL.red, 0.5), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(ceilW, 3.2, 1, 1), ceilMat);
  ceil.rotation.x = -Math.PI / 2; ceil.position.set(X(1999) + ceilW / 2, ceilY, 0);
  group.add(ceil);
  const gridPts = [];
  for (let i = 0; i <= 14; i++) { const x = X(1999) + ceilW * i / 14; gridPts.push(v3(x, ceilY, -1.6), v3(x, ceilY, 1.6)); }
  for (let j = 0; j <= 4; j++) { const z = -1.6 + 0.8 * j; gridPts.push(v3(X(1999), ceilY, z), v3(X(1999) + ceilW, ceilY, z)); }
  const gridMat = new THREE.LineBasicMaterial({ color: col3(PAL.red, 1.6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(gridPts), gridMat));

  // sparks where the curve presses against the ceiling
  const NS = 2600;
  const sp = new Float32Array(NS * 3), sv = new Float32Array(NS * 3), sph = new Float32Array(NS);
  for (let i = 0; i < NS; i++) {
    sv[i * 3] = (r() - 0.5) * 3.2; sv[i * 3 + 1] = -(0.2 + r() * 1.6); sv[i * 3 + 2] = (r() - 0.5) * 3.2;
    sph[i] = r();
  }
  const sgeo = new THREE.BufferGeometry();
  sgeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  sgeo.setAttribute('aVel', new THREE.BufferAttribute(sv, 3));
  sgeo.setAttribute('aPh', new THREE.BufferAttribute(sph, 1));
  const sparkMat = pointsMat(/* glsl */`
    uniform float uT, uScale, uAlpha, uOn, uBurst; uniform vec3 uHead, uC;
    attribute vec3 aVel; attribute float aPh; varying vec3 vColor;
    void main() {
      float life = 1.1;
      float age = fract(uT / life + aPh) * life;
      vec3 p = uHead + aVel * age * (1.0 + uBurst * 1.5) + vec3(0.0, -1.6, 0.0) * age * age;
      float a = pow(1.0 - age / life, 2.0) * uOn;
      vec3 col = uC * a * (1.0 + uBurst * 2.0);
      float size = 0.045 * (0.5 + aPh) * (1.0 + uBurst);
      ${POINT_TAIL}
    }`, { uOn: { value: 0 }, uBurst: { value: 0 }, uHead: { value: v3(0, 0, 0) }, uC: { value: col3([255, 150, 80], 1.8) } });
  const sparks = new THREE.Points(sgeo, sparkMat); sparks.frustumCulled = false; group.add(sparks);

  // the overheating chip
  const chip = makeChip();
  chip.lid.visible = false;
  chip.group.scale.setScalar(0.55);
  chip.group.position.set(X(2025) + 2.5, -1.3, 0.3);
  chip.group.rotation.set(0.32, -0.55, 0);
  group.add(chip.group);
  const NE = 2200;
  const ep = new Float32Array(NE * 3), es = new Float32Array(NE);
  for (let i = 0; i < NE; i++) { ep[i * 3] = (r() - 0.5) * 3.2; ep[i * 3 + 1] = 0; ep[i * 3 + 2] = (r() - 0.5) * 3.2; es[i] = r(); }
  const egeo = new THREE.BufferGeometry();
  egeo.setAttribute('position', new THREE.BufferAttribute(ep, 3));
  egeo.setAttribute('aSeed', new THREE.BufferAttribute(es, 1));
  const emberMat = pointsMat(/* glsl */`
    uniform float uT, uScale, uAlpha, uHeat; uniform vec3 uBase, uA, uR;
    attribute float aSeed; varying vec3 vColor;
    void main() {
      float h = fract(aSeed * 7.13 + uT * (0.18 + 0.2 * aSeed));
      vec3 p = uBase + vec3(position.x * (1.0 - h * 0.5) + sin(uT * 1.7 + aSeed * 40.0) * 0.18 * h, h * 4.2, position.z * (1.0 - h * 0.5));
      vec3 col = mix(uA, uR, h) * (1.0 - h) * uHeat * 1.6;
      float size = 0.05 * (0.6 + aSeed) * uHeat;
      ${POINT_TAIL}
    }`, { uHeat: { value: 0 }, uBase: { value: chip.group.position.clone().add(v3(0, 0.4, 0)) }, uA: { value: col3([255, 190, 90], 1) }, uR: { value: col3(PAL.red, 1) } });
  const embers = new THREE.Points(egeo, emberMat); embers.frustumCulled = false; group.add(embers);

  const cam = [
    [24, [0.6, 1.0, 21.0], [0.9, 0.5, 0], 35],
    [34, [2.6, 1.7, 18.6], [1.8, 0.6, 0], 35],
  ];

  let front = 1985;
  function update(t) {
    const lt = t - T0;
    front = 1985 + 40 * ease(lt / 6.0);
    curveMat.uniforms.uFront.value = front;
    const near = clamp((front - 2000) / 3.8);
    ceilMat.opacity = 0.05 + 0.1 * near;
    gridMat.opacity = 0.15 + 0.5 * near;
    const pressed = front > CONTACT;
    const hx = X(Math.max(front, CONTACT)), hy = Y(freq(Math.max(front, CONTACT))) + 0.06;
    sparkMat.uniforms.uHead.value.set(hx, hy, 0);
    sparkMat.uniforms.uOn.value = pressed ? 1 : 0;
    // burst when the curve first hits the ceiling
    let tContact = T0; { // invert front(t) numerically (cheap: 40 steps)
      for (let k = 0; k <= 60; k++) { const tt = T0 + k * 0.1; if (1985 + 40 * ease(k * 0.1 / 6) >= CONTACT) { tContact = tt; break; } }
    }
    sparkMat.uniforms.uBurst.value = pressed ? Math.exp(-(t - tContact) * 4) : 0;
    const heat = ease((lt - 2) / 6);
    emberMat.uniforms.uHeat.value = heat;
    const hc = col3(PAL.amber, 1).lerp(col3(PAL.red, 1), heat);
    chip.coreMats.forEach(m => { m.uniforms.uColor.value.copy(hc); m.uniforms.uEmis.value = 0.3 + 1.6 * heat; m.uniforms.uEdge.value = 1.6 + 2.0 * heat; });
    return camAt(cam, t);
  }

  function overlay(ov, t, lt, P) {
    ov.title(t, T0, 'Power Wall', '功耗墙', PAL.red, { sub: 'the end of free speed-ups' });
    for (const yr of [1990, 2000, 2010, 2020]) {
      const p = P(X(yr), y0 - 0.38, 0);
      ov.text(String(yr), p.x, p.y, { size: 20, color: [150, 150, 175], alpha: 0.6, align: 'center', base: 'top' });
    }
    const pa = P(x0, Y(10) + 0.45, 0);
    ov.text('clock speed · 主频', pa.x, pa.y, { font: 'HNotoL, HInterL', size: 18, color: [150, 150, 175], alpha: 0.6, align: 'left', base: 'bottom' });
    const pc = P(X(CONTACT), ceilY + 0.2, 0);
    if (front > CONTACT) ov.text('~2005', pc.x, pc.y - 8, { size: 24, color: PAL.red, alpha: 0.8 * ease((front - CONTACT) / 2), align: 'center', base: 'bottom', glow: 10 });
    ov.callout(t, 28.4, 33.6, P(X(2025) + 2.5, -0.75, 0.3), 'Too hot to clock higher', '频率越高，发热越大', PAL.red, { dx: -60, dy: -150, len: 150, side: -1 });
    ov.tagline(t, 30.0, 33.9, "one core can't simply get faster anymore", '单核，跑不动了', [200, 200, 215]);
  }

  return { group, update, overlay };
}
