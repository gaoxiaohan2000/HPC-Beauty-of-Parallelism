// Shared 3D building blocks: particle shader, neon-edged boxes, dust, chip model.
import * as THREE from 'three';
import { PAL, col3, rng, v3 } from './util.js';

/** every particle material registers here so main.js can feed uT/uScale/uBeat each frame */
export const POINT_MATS = [];

export const POINT_FRAG = /* glsl */`
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = 1.0 - smoothstep(0.0, 0.5, d);
  a = a * a * 1.7;
  gl_FragColor = vec4(vColor * a, 1.0);
}`;

/** Common vertex-shader tail: size attenuation, near-camera fade, clamp. */
export const POINT_TAIL = /* glsl */`
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = -mv.z;
  float near = smoothstep(0.6, 2.5, dist);
  gl_PointSize = clamp(size * uScale / max(dist, 0.001), 0.0, 64.0) * step(0.0, dist);
  vColor = col * uAlpha * near;
`;

export function pointsMat(vertexShader, uniforms = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uT: { value: 0 }, uScale: { value: 1500 }, uBeat: { value: 0 }, uAlpha: { value: 1 },
      ...uniforms,
    },
    vertexShader, fragmentShader: POINT_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  POINT_MATS.push(m);
  return m;
}

/** Points whose positions JS rewrites every frame (attribute aVis hides/shows) */
export function dynamicPoints(n, color, size = 0.05) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), vis = new Float32Array(n), sz = new Float32Array(n);
  const r = rng(n * 7 + 3);
  for (let i = 0; i < n; i++) sz[i] = 0.6 + r() * 0.8;
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aVis', new THREE.BufferAttribute(vis, 1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
  const mat = pointsMat(/* glsl */`
    uniform float uT, uScale, uAlpha, uSize; uniform vec3 uColor;
    attribute float aVis; attribute float aSize; varying vec3 vColor;
    void main() {
      vec3 p = position;
      float size = uSize * aSize * aVis;
      vec3 col = uColor * aVis;
      ${POINT_TAIL}
    }`, { uColor: { value: col3(color, 1.6) }, uSize: { value: size } });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  return { points: pts, pos, vis, geo: g, mat };
}

/** Lit box with neon edges + fresnel rim. Use BoxGeometry(1,1,1) and scale it. */
export function glowBoxMat({ base = [0.018, 0.02, 0.03], color = [1, 1, 1], emis = 0.4, edge = 2.0, rim = 0.5, transparent = false } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uBase: { value: new THREE.Color(...base) },
      uColor: { value: new THREE.Color(...color) },
      uEmis: { value: emis }, uEdge: { value: edge }, uRim: { value: rim }, uAlpha: { value: 1 },
    },
    transparent, depthWrite: !transparent,
    blending: transparent ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vC; varying vec3 vV; varying vec3 vL;
      void main() {
        vec4 p = vec4(position, 1.0);
        vec3 n = normal;
        vL = position;
        #ifdef USE_INSTANCING
          p = instanceMatrix * p;
          n = mat3(instanceMatrix) * n;
        #endif
        #ifdef USE_INSTANCING_COLOR
          vC = instanceColor;
        #else
          vC = vec3(1.0);
        #endif
        vec4 mv = modelViewMatrix * p;
        vN = normalize(normalMatrix * n);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uBase, uColor; uniform float uEmis, uEdge, uRim, uAlpha;
      varying vec3 vN; varying vec3 vC; varying vec3 vV; varying vec3 vL;
      void main() {
        vec3 c = vC * uColor;
        float l = 0.3 + 0.7 * max(dot(vN, normalize(vec3(0.35, 0.85, 0.4))), 0.0);
        float fr = pow(1.0 - max(dot(vN, vV), 0.0), 2.5);
        vec3 a = abs(vL) * 2.0;
        float ex = smoothstep(0.84, 0.99, a.x), ey = smoothstep(0.84, 0.99, a.y), ez = smoothstep(0.84, 0.99, a.z);
        float e = clamp(ex * ey + ey * ez + ex * ez, 0.0, 1.0);
        vec3 col = uBase * l + c * uEmis * (0.4 + 0.6 * l) + c * fr * uRim + c * e * uEdge;
        gl_FragColor = vec4(col * uAlpha, uAlpha);
      }`,
  });
}

export const BOX = new THREE.BoxGeometry(1, 1, 1);

/** write a translate+scale matrix straight into an InstancedMesh (fast path) */
export function setTS(mesh, i, x, y, z, sx, sy, sz) {
  const a = mesh.instanceMatrix.array, o = i * 16;
  a[o] = sx; a[o + 1] = 0; a[o + 2] = 0; a[o + 3] = 0;
  a[o + 4] = 0; a[o + 5] = sy; a[o + 6] = 0; a[o + 7] = 0;
  a[o + 8] = 0; a[o + 9] = 0; a[o + 10] = sz; a[o + 11] = 0;
  a[o + 12] = x; a[o + 13] = y; a[o + 14] = z; a[o + 15] = 1;
}
export function setCol(mesh, i, c, k) {
  const a = mesh.instanceColor.array;
  a[i * 3] = c.r * k; a[i * 3 + 1] = c.g * k; a[i * 3 + 2] = c.b * k;
}
export function instanced(n, mat) {
  const m = new THREE.InstancedMesh(BOX, mat, n);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
  m.frustumCulled = false;
  return m;
}

/** floating dust for depth in every 3D scene */
export function makeDust() {
  const n = 2600, r = rng(99);
  const pos = new Float32Array(n * 3), seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (r() - 0.5) * 60; pos[i * 3 + 1] = (r() - 0.5) * 26; pos[i * 3 + 2] = (r() - 0.5) * 60;
    seed[i] = r();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = pointsMat(/* glsl */`
    uniform float uT, uScale, uAlpha; attribute float aSeed; varying vec3 vColor;
    void main() {
      vec3 p = position + vec3(sin(uT * 0.11 + aSeed * 6.28), sin(uT * 0.13 + aSeed * 12.0), cos(uT * 0.09 + aSeed * 9.0)) * 0.7;
      float tw = 0.55 + 0.45 * sin(uT * (0.6 + aSeed) + aSeed * 40.0);
      float size = 0.045 * (0.6 + aSeed);
      vec3 col = vec3(0.30, 0.42, 0.75) * 0.55 * tw;
      ${POINT_TAIL}
    }`);
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  return pts;
}

/** Stylised CPU package: substrate, pads, die, 8 cores, shared L3, lid. */
export function makeChip() {
  const group = new THREE.Group();
  const pkg = new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, 6),
    new THREE.MeshStandardMaterial({ color: 0x15171f, metalness: 0.7, roughness: 0.35 }));
  pkg.position.y = 0.15; group.add(pkg);

  const padMat = glowBoxMat({ color: col3(PAL.amber, 1).toArray(), emis: 0.12, edge: 0.35, rim: 0.1 });
  const pads = instanced(56, padMat);
  let k = 0;
  const amberC = new THREE.Color(1, 1, 1);
  for (let side = 0; side < 4; side++) {
    for (let i = 0; i < 14; i++) {
      const u = -2.6 + i * 0.4;
      const [x, z, sx, sz] = side === 0 ? [u, -2.75, 0.2, 0.3] : side === 1 ? [u, 2.75, 0.2, 0.3]
        : side === 2 ? [-2.75, u, 0.3, 0.2] : [2.75, u, 0.3, 0.2];
      setTS(pads, k, x, 0.31, z, sx, 0.02, sz); setCol(pads, k, amberC, 0.5); k++;
    }
  }
  group.add(pads);

  const die = new THREE.Mesh(BOX, glowBoxMat({ color: col3(PAL.cyan, 0.5).toArray(), emis: 0.0, edge: 0.45, rim: 0.05 }));
  die.scale.set(4.4, 0.06, 4.4); die.position.y = 0.33; group.add(die);

  const l3 = new THREE.Mesh(BOX, glowBoxMat({ color: col3(PAL.cyan, 1).toArray(), emis: 0.12, edge: 0.7, rim: 0.15 }));
  l3.scale.set(3.9, 0.05, 0.46); l3.position.set(0, 0.385, 0); group.add(l3);

  const cores = [], coreMats = [];
  for (const z of [-1, 1]) for (const x of [-1.5, -0.5, 0.5, 1.5]) {
    const m = glowBoxMat({ color: col3(PAL.amber, 1).toArray(), emis: 0.15, edge: 1.0, rim: 0.25 });
    const c = new THREE.Mesh(BOX, m);
    c.scale.set(0.8, 0.14, 1.2); c.position.set(x, 0.43, z);
    group.add(c); cores.push(c); coreMats.push(m);
  }
  const lidMat = new THREE.MeshStandardMaterial({ color: 0x9aa1ad, metalness: 1.0, roughness: 0.28, transparent: true });
  const lid = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.14, 4.8), lidMat);
  lid.position.y = 0.62; group.add(lid);
  return { group, cores, coreMats, lid, lidMat, l3 };
}

/** zero-tension Catmull-Rom = straight segments that ease in/out at every point (stepwise motion) */
export function polyCurve(points) {
  return new THREE.CatmullRomCurve3(points.map(p => p.clone ? p.clone() : v3(...p)), false, 'catmullrom', 0);
}
