// Offline, frame-exact MP4 export with WebCodecs (+ mp4-muxer). Runs entirely in the browser.
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

const VIDEO_CANDIDATES = [
  { codec: 'avc1.640028', mux: 'avc', label: 'H.264 High' },
  { codec: 'avc1.4d0028', mux: 'avc', label: 'H.264 Main' },
  { codec: 'vp09.00.40.08', mux: 'vp9', label: 'VP9' },
];
const AUDIO_CANDIDATES = [
  { codec: 'mp4a.40.2', mux: 'aac', label: 'AAC' },
  { codec: 'opus', mux: 'opus', label: 'Opus' },
];
const SR = 48000;

export async function pickCodecs(width, height, fps) {
  if (!('VideoEncoder' in window)) throw new Error('This browser has no WebCodecs VideoEncoder — please use Chrome or Edge.');
  let v = null, a = null;
  for (const c of VIDEO_CANDIDATES) {
    for (const hw of ['prefer-hardware', 'no-preference']) {
      const cfg = { codec: c.codec, width, height, bitrate: height >= 1080 ? 16e6 : 8e6, framerate: fps, hardwareAcceleration: hw };
      try { const s = await VideoEncoder.isConfigSupported(cfg); if (s.supported) { v = { ...c, cfg }; break; } } catch { /* try next */ }
    }
    if (v) break;
  }
  for (const c of AUDIO_CANDIDATES) {
    const cfg = { codec: c.codec, sampleRate: SR, numberOfChannels: 2, bitrate: 192000 };
    try { const s = await AudioEncoder.isConfigSupported(cfg); if (s.supported) { a = { ...c, cfg }; break; } } catch { /* try next */ }
  }
  if (!v) throw new Error('No supported video encoder (H.264 / VP9) found.');
  return { v, a };
}

/** resample the decoded soundtrack to 48 kHz stereo planar */
async function to48k(buffer) {
  const n = Math.ceil(buffer.duration * SR);
  const off = new OfflineAudioContext(2, n, SR);
  const src = off.createBufferSource(); src.buffer = buffer; src.connect(off.destination); src.start();
  const out = await off.startRendering();
  return [out.getChannelData(0), out.getChannelData(1)];
}

/**
 * renderAt(t) must draw the full frame into `canvas` synchronously.
 * Returns { blob, video: label, audio: label, frames }.
 */
export async function exportMP4({ renderAt, canvas, audioBuffer, fps = 30, start = 0, end = 90, height = 1080, onProgress = () => {}, shouldCancel = () => false }) {
  const width = Math.round(height * 16 / 9);
  const { v, a } = await pickCodecs(width, height, fps);
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: v.mux, width, height, frameRate: fps },
    audio: a ? { codec: a.mux, numberOfChannels: 2, sampleRate: SR } : undefined,
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });
  let failure = null;

  // ---- audio first (fast) ----
  if (a && audioBuffer) {
    const [L, R] = await to48k(audioBuffer);
    const ae = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: e => { failure = e; } });
    ae.configure(a.cfg);
    const s0 = Math.round(start * SR), s1 = Math.min(L.length, Math.round(end * SR)), step = 4800;
    for (let s = s0; s < s1; s += step) {
      const n = Math.min(step, s1 - s);
      const data = new Float32Array(n * 2);
      data.set(L.subarray(s, s + n), 0); data.set(R.subarray(s, s + n), n);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: SR, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((s - s0) / SR * 1e6), data });
      ae.encode(ad); ad.close();
    }
    await ae.flush(); ae.close();
  }

  // ---- video: render every frame at its exact timestamp ----
  const ve = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: e => { failure = e; } });
  const vcfg = { ...v.cfg, latencyMode: 'quality' };
  if (v.mux === 'avc') vcfg.avc = { format: 'avc' };
  ve.configure(vcfg);
  let target = canvas, tctx = null;
  if (canvas.height !== height) {
    target = document.createElement('canvas'); target.width = width; target.height = height;
    tctx = target.getContext('2d');
  }
  const f0 = Math.round(start * fps), f1 = Math.round(end * fps), total = f1 - f0;
  const t0 = performance.now();
  for (let f = f0; f < f1; f++) {
    if (failure) throw failure;
    if (shouldCancel()) { ve.close(); throw new Error('cancelled'); }
    renderAt(f / fps);
    if (tctx) tctx.drawImage(canvas, 0, 0, width, height);
    const frame = new VideoFrame(target, { timestamp: Math.round((f - f0) * 1e6 / fps), duration: Math.round(1e6 / fps) });
    ve.encode(frame, { keyFrame: (f - f0) % (fps * 2) === 0 });
    frame.close();
    while (ve.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 1));
    if ((f - f0) % 5 === 0) {
      const done = f - f0 + 1, el = (performance.now() - t0) / 1000;
      onProgress(done / total, `${done}/${total} frames · ${el.toFixed(0)} s · ETA ${(el / done * (total - done)).toFixed(0)} s`);
      await new Promise(r => setTimeout(r, 0));
    }
  }
  await ve.flush(); ve.close();
  if (failure) throw failure;
  muxer.finalize();
  onProgress(1, 'done');
  return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), video: v.label, audio: a ? a.label : 'none', frames: total };
}
