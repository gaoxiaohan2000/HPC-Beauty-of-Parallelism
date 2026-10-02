// node build.mjs  →  dist/HPC_3D_Renderer.html (single self-contained file)
import { build } from 'esbuild';
import fs from 'fs';
const res = await build({ entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'iife', target: 'es2022', write: false, legalComments: 'eof' });
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const b = f => fs.readFileSync(f).toString('base64');
const assets = {
  fonts: { interLight: b('assets/inter-light.otf'), interThin: b('assets/inter-thin.otf'), notoLight: b('assets/noto-light.otf'), notoThin: b('assets/noto-thin.otf'), mono: b('assets/mono.ttf') },
  audio: b('assets/music.ogg'),
};
let html = fs.readFileSync('src/template.html', 'utf8');
html = html.replace('/*__ASSETS__*/', () => `window.__ASSETS=${JSON.stringify(assets)};`);
html = html.replace('/*__BUNDLE__*/', () => js);
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/HPC_3D_Renderer.html', html);
console.log('dist/HPC_3D_Renderer.html', (html.length / 1e6).toFixed(2), 'MB');
