// HPC 之美 · The Beauty of Parallelism — 3D renderer (Three.js + WebGL2 + GLSL)
// Author: 意雨轻寒 / Jerry Leibniz
// Every frame is a pure function of time t, so live preview, scrubbing and export match exactly.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { W, H, FPS, DUR, BEAT, PAL, col3, clamp, fract, beatPulse } from './util.js';
import { Overlay, makeBackground, makeVignette } from './overlay.js';
import { Neon2D, drawIntro, drawFinale } from './scene2d.js';
import { POINT_MATS, makeDust } from './common.js';
import { createCPU } from './scenes/cpu.js';
import { createWall } from './scenes/wall.js';
import { createSplit } from './scenes/split.js';
import { createGPU } from './scenes/gpu.js';
import { createFPGA } from './scenes/fpga.js';
import { createCoop } from './scenes/coop.js';
import { exportMP4 } from './export.js';

const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0)).buffer;

async function loadFonts() {
  const F = window.__ASSETS.fonts;
  const faces = [
    new FontFace('HInterL', b64(F.interLight)), new FontFace('HInterT', b64(F.interThin)),
    new FontFace('HNotoL', b64(F.notoLight)), new FontFace('HNotoT', b64(F.notoThin)),
    new FontFace('HMono', b64(F.mono)),
  ];
  for (const f of faces) { await f.load(); document.fonts.add(f); }
}

async function main() {
  const status = document.getElementById('status');
  status.textContent = 'loading fonts…';
  await loadFonts();

  // ---------- renderer ----------
  status.textContent = 'starting WebGL2…';
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  const gl = renderer.getContext();
  const glInfo = gl.getParameter(gl.VERSION);

  const scene = new THREE.Scene();
  scene.background = col3(PAL.bg);
  scene.fog = new THREE.FogExp2(col3(PAL.bg), 0.02);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;
  scene.add(new THREE.AmbientLight(0x6070a0, 0.5));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(4, 8, 6); scene.add(key);

  const camera = new THREE.PerspectiveCamera(35, W / H, 0.03, 300);
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(1); composer.setSize(W, H);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.6, 0.45, 0.55);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const dust = makeDust(); scene.add(dust);
  status.textContent = 'building scenes…';
  const S3 = {
    cpu: createCPU(), wall: createWall(), split: createSplit(), gpu: createGPU(), fpga: createFPGA(), coop: createCoop(),
  };
  Object.values(S3).forEach(s => { s.group.visible = false; scene.add(s.group); });

  const SECTIONS = [
    { a: 0, b: 8, name: '序', d2: drawIntro, calm: true },
    { a: 8, b: 24, name: 'CPU', s: S3.cpu },
    { a: 24, b: 34, name: '功耗墙', s: S3.wall, calm: true },
    { a: 34, b: 38, name: '转折', s: S3.split },
    { a: 38, b: 56, name: 'GPU', s: S3.gpu },
    { a: 56, b: 72, name: 'FPGA', s: S3.fpga },
    { a: 72, b: 84, name: '协作', s: S3.coop },
    { a: 84, b: 90, name: '终', d2: drawFinale, calm: true },
  ];

  // ---------- 2D layers ----------
  const out = document.getElementById('out');
  out.width = W; out.height = H;
  const o = out.getContext('2d');
  const ov = new Overlay(), neon = new Neon2D(), bg = makeBackground(), vig = makeVignette();
  const _v = new THREE.Vector3();
  const project = (x, y, z) => {
    _v.set(x, y, z).project(camera);
    return { x: (_v.x + 1) / 2 * W, y: (1 - _v.y) / 2 * H, vis: _v.z > -1 && _v.z < 1 };
  };

  function renderAt(t) {
    t = clamp(t, 0, DUR - 1e-6);
    const sec = SECTIONS.find(s => t >= s.a && t < s.b);
    o.setTransform(1, 0, 0, 1, 0, 0); o.globalAlpha = 1; o.globalCompositeOperation = 'source-over'; o.filter = 'none';
    o.fillStyle = '#07090f'; o.fillRect(0, 0, W, H);
    let z = 1;
    if (!sec.calm) z = 1 + 0.018 * Math.exp(-fract(t / (BEAT * 4)) * 20);
    o.setTransform(z, 0, 0, z, (1 - z) * W / 2, (1 - z) * H / 2);
    ov.begin();
    if (sec.d2) {
      sec.d2(o, neon, ov, bg, t);
    } else {
      for (const s of Object.values(S3)) s.group.visible = s === sec.s;
      dust.visible = true;
      const c = sec.s.update(t, t - sec.a);
      camera.position.copy(c.pos); camera.lookAt(c.look);
      camera.fov = c.fov; camera.updateProjectionMatrix();
      const sc = H / (2 * Math.tan(camera.fov * Math.PI / 360));
      const bp = beatPulse(t);
      for (const m of POINT_MATS) { m.uniforms.uT.value = t; m.uniforms.uScale.value = sc; m.uniforms.uBeat.value = bp; }
      bloom.strength = 0.55 + 0.2 * bp;
      composer.render();
      o.drawImage(renderer.domElement, 0, 0, W, H);
      sec.s.overlay(ov, t, t - sec.a, project);
      o.setTransform(1, 0, 0, 1, 0, 0);
      o.drawImage(vig, 0, 0);
      o.setTransform(z, 0, 0, z, (1 - z) * W / 2, (1 - z) * H / 2);
      o.drawImage(ov.cv, 0, 0);
    }
    o.setTransform(1, 0, 0, 1, 0, 0);
    // chapter-cut flash and global fade in/out (same as the Python version)
    const fl = sec.a > 0 ? Math.exp(-(t - sec.a) * 8) * 45 : 0;
    if (fl > 1) { o.globalCompositeOperation = 'lighter'; o.fillStyle = `rgb(${fl | 0},${fl | 0},${fl | 0})`; o.fillRect(0, 0, W, H); o.globalCompositeOperation = 'source-over'; }
    const fade = Math.min(1, t / 1.2) * Math.min(1, (DUR - t) / 1.0);
    if (fade < 1) { o.fillStyle = `rgba(0,0,0,${1 - fade})`; o.fillRect(0, 0, W, H); }
    return sec.name;
  }

  // ---------- audio ----------
  status.textContent = 'decoding music…';
  const actx = new AudioContext();
  const audioBuffer = await actx.decodeAudioData(b64(window.__ASSETS.audio));

  // ---------- UI ----------
  const ui = {
    play: document.getElementById('play'), seek: document.getElementById('seek'), time: document.getElementById('time'),
    chapters: document.getElementById('chapters'), exp: document.getElementById('export'), res: document.getElementById('res'),
    bar: document.getElementById('bar'), prog: document.getElementById('prog'), cancel: document.getElementById('cancel'),
  };
  let tNow = 0, playing = false, src = null, startCtx = 0, exporting = false, cancel = false;
  const fmt = t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(1).padStart(4, '0')}`;
  const show = () => { const name = renderAt(tNow); ui.time.textContent = `${fmt(tNow)} / 01:30.0 · ${name}`; ui.seek.value = tNow; };
  function stopAudio() { if (src) { try { src.stop(); } catch { } src.disconnect(); src = null; } }
  function play() {
    if (tNow >= DUR - 0.05) tNow = 0;
    actx.resume(); stopAudio();
    src = actx.createBufferSource(); src.buffer = audioBuffer; src.connect(actx.destination);
    src.start(0, tNow); startCtx = actx.currentTime - tNow; playing = true; ui.play.textContent = '❚❚';
  }
  function pause() { stopAudio(); playing = false; ui.play.textContent = '▶'; }
  function seek(t) { tNow = clamp(t, 0, DUR - 1 / FPS); if (playing) play(); else show(); }
  ui.play.onclick = () => (playing ? pause() : play());
  ui.seek.max = DUR; ui.seek.step = 1 / FPS;
  ui.seek.oninput = () => seek(parseFloat(ui.seek.value));
  SECTIONS.forEach(s => {
    const b = document.createElement('button'); b.textContent = s.name; b.title = `${s.a}s`;
    b.style.left = `${s.a / DUR * 100}%`; b.onclick = () => seek(s.a + 0.001); ui.chapters.appendChild(b);
  });
  window.addEventListener('keydown', e => {
    if (exporting) return;
    if (e.code === 'Space') { e.preventDefault(); playing ? pause() : play(); }
    if (e.code === 'ArrowRight') seek(tNow + (e.shiftKey ? 2 : BEAT));
    if (e.code === 'ArrowLeft') seek(tNow - (e.shiftKey ? 2 : BEAT));
  });
  function loop() {
    if (playing && !exporting) {
      tNow = actx.currentTime - startCtx;
      if (tNow >= DUR) { tNow = DUR - 1 / FPS; pause(); }
      show();
    }
    requestAnimationFrame(loop);
  }
  ui.cancel.onclick = () => { cancel = true; };
  ui.exp.onclick = async () => {
    if (exporting) return;
    pause(); exporting = true; cancel = false;
    ui.exp.disabled = true; ui.cancel.style.display = 'inline-block'; ui.bar.style.display = 'block';
    try {
      const h = parseInt(ui.res.value, 10);
      const r = await exportMP4({
        renderAt, canvas: out, audioBuffer, fps: FPS, start: 0, end: DUR, height: h,
        onProgress: (p, msg) => { ui.prog.style.width = `${(p * 100).toFixed(1)}%`; status.textContent = `exporting ${msg}`; },
        shouldCancel: () => cancel,
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(r.blob); a.download = `HPC_Beauty_of_Parallelism_3D_${h}p.mp4`;
      document.body.appendChild(a); a.click(); a.remove();
      status.textContent = `done ✓ ${r.frames} frames · ${r.video} + ${r.audio} · ${(r.blob.size / 1e6).toFixed(1)} MB`;
    } catch (e) {
      status.textContent = e.message === 'cancelled' ? 'export cancelled' : `export failed: ${e.message}`;
      console.error(e);
    }
    exporting = false; ui.exp.disabled = false; ui.cancel.style.display = 'none';
    show();
  };

  window.HPC = { renderAt, exportMP4: (opts) => exportMP4({ renderAt, canvas: out, audioBuffer, fps: FPS, ...opts }), glInfo, S3 };
  status.textContent = `ready · ${glInfo} · space = play/pause, ←/→ = one beat`;
  show();
  loop();
  window.__ready = true;
}

main().catch(e => {
  document.getElementById('status').textContent = `error: ${e.message}`;
  console.error(e);
  window.__error = String(e && e.stack || e);
});
