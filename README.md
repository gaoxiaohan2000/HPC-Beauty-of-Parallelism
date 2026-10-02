# HPC 之美 · The Beauty of Parallelism (3D)

A 90-second, beat-synced 3D particle animation that shows first-year computer-science students why parallel
computing is beautiful. It follows one idea through four kinds of hardware: CPUs (multithreading, SMT, SIMD), the
power wall, GPUs as AI accelerators, and FPGAs as reconfigurable hardware. It ends with all three working together.

**▶ Live demo: <https://gaoxiaohan2000.github.io/HPC-Beauty-of-Parallelism/>** (open it in Chrome)

- **Author:** 意雨轻寒 / Jerry Leibniz
- **Stack:** Three.js r169 + WebGL2 + GLSL (custom particle and glow shaders) + WebCodecs export
- **Soundtrack:** an original cyber-electronic score (120 BPM, A minor), synthesised from scratch in Python. Every hit is placed on a picture event.

![preview](docs/preview.jpg)

## 1. Render the video (nothing to install)

1. Open the **live demo** in **Chrome**. Or download [`docs/index.html`](docs/index.html) and open it in Chrome; it is one
   self-contained file with the fonts, music and Three.js embedded.
2. When the status bar shows `ready · WebGL 2.0 …`, you can preview:
   - `Space` plays or pauses (with music); drag the timeline to jump to any second
   - `← / →` move one beat; `Shift + ← / →` move two seconds
   - the chapter buttons above the timeline jump straight to a section: 序 Intro / CPU / 功耗墙 Power Wall /
     转折 Split / GPU / FPGA / 协作 Heterogeneous / 终 Finale
3. Choose **1080p** and click **导出 MP4** (Export MP4). Every frame is rendered offline at its exact timestamp,
   independent of real-time playback, so the beat sync is frame-exact. The frames are encoded with the browser's
   hardware encoder (WebCodecs) and the file `HPC_Beauty_of_Parallelism_3D_1080p.mp4` downloads automatically.
   **取消** cancels the export.
4. When the export finishes, the status bar shows which encoders were used, e.g. `H.264 High + AAC`.

> If it reports `VP9 + Opus`, this browser cannot encode H.264/AAC. The file is still valid and plays in Chrome and
> VLC, but not in QuickTime. Chrome on macOS normally uses H.264 + AAC.

## 2. 修改源码后重新打包

```bash
npm install                      # three, mp4-muxer, esbuild
node build.mjs                   # → docs/index.html（也就是 GitHub Pages 上的在线版本）
```

| 文件 | 内容 |
|---|---|
| `src/main.js` | 渲染器、bloom 后期、时间轴、章节切换闪光、预览 UI |
| `src/scenes/cpu.js` | CPU：开盖 → fork 多线程粒子流 → 全息放大视图（SMT、SIMD） |
| `src/scenes/wall.js` | 功耗墙：粒子主频曲线撞上玻璃天花板，芯片过热冒出余烬 |
| `src/scenes/split.js` | 转折：核心逐拍分裂，1 → 9,216 |
| `src/scenes/gpu.js` | GPU → AI：GEMM / Tensor Core → 核心阵列 → 粒子聚合成神经网络 |
| `src/scenes/fpga.js` | FPGA：逻辑块按拍布线成流水线，数据包步进，结果逐列生成 |
| `src/scenes/coop.js` | 异构计算：CPU 分发任务，结果汇成三色三旋臂粒子星系 |
| `src/scene2d.js` | 序章与片尾（按 Python 版原样移植） |
| `src/overlay.js` | 文字层：逐字浮现的章节标题、锚定 3D 物体的引线标注、标语 |
| `src/export.js` | WebCodecs 导出（H.264/AAC 优先，VP9/Opus 备用） |
| `src/util.js` | 时间、节拍（120 BPM）、配色、镜头关键帧 |
| `music/synth.py` | 合成引擎：振荡器、合成器音色、鼓组、电影音效、混音与母带处理 |
| `music/score.py` | 赛博电子配乐的编曲：每个音乐事件都对齐画面事件（时间点见 `synth.py` 里的 `EV`） |

每一帧都只由时间 `t` 决定（`renderAt(t)`），所以预览、拖动和导出的画面完全一致。
时间轴和章节边界与音乐严格对齐，修改动画时保持在 120 BPM 的拍点上（一拍 = 0.5 秒）。

**重新生成配乐**（需要 Python + NumPy/SciPy + ffmpeg）：

```bash
cd music && python score.py && cd ..   # → music/music.wav（约 30 秒）
python prepare_assets.py               # → assets/music.ogg，同时重新生成字体子集
node build.mjs
```

**关于字体**：为了让单文件 HTML 保持小体积，`assets/` 里的中英文字体只保留了片中用到的字符。
新增文字中如果出现子集里没有的汉字，Chrome 会自动用系统字体（苹方）显示。
如果想要统一字体，可以用 `prepare_assets.py` 重新生成子集（需要 fontTools，
并把脚本里的字体路径改成你本机的 Noto Sans CJK SC / Inter 字体文件）。

## 第三方组件与许可 · Third-party notices

| 组件 | 许可 | 文件 |
|---|---|---|
| [three.js](https://github.com/mrdoob/three.js) r169 | MIT | `licenses/three.js-MIT.txt` |
| [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) | MIT | `licenses/mp4-muxer-MIT.txt` |
| Inter（字体子集） | SIL Open Font License 1.1 | `licenses/font-Inter.txt` |
| Noto Sans CJK SC（字体子集） | SIL Open Font License 1.1 | `licenses/font-NotoSansCJK.txt` |
| DejaVu Sans Mono（字体子集） | Bitstream Vera / DejaVu 许可 | `licenses/font-DejaVu.txt` |

`docs/index.html` 中打包了上述组件：three.js 的许可声明保留在文件末尾，全部许可文本见 `licenses/`。
