# HPC 之美 · The Beauty of Parallelism — 3D 版

一部 90 秒的音乐卡点动画，面向计算机专业低年级同学，讲 **CPU、GPU、FPGA 三种并行加速方式**之美。
A 90-second beat-synced animation about parallel computing on CPUs, GPUs and FPGAs.

作者：意雨轻寒 / Jerry Leibniz
技术栈：Three.js r169 + WebGL2 + GLSL（自定义粒子与发光 shader）+ WebCodecs 导出

![preview](docs/preview.jpg)

## 一、直接生成视频（不需要安装任何东西）

1. 下载 [`dist/HPC_3D_Renderer.html`](dist/HPC_3D_Renderer.html)（单个文件，字体、音乐和 Three.js 都已内嵌），用 **Chrome** 打开（双击或拖进 Chrome 即可）。
2. 底部状态栏显示 `ready · WebGL 2.0 …` 后就可以预览：
   - `空格` 播放 / 暂停（带音乐），拖动进度条看任意一秒
   - `← / →` 前后移动一拍，`Shift + ← / →` 前后移动 2 秒
   - 进度条上方的章节按钮可以直接跳转：序 / CPU / 功耗墙 / 转折 / GPU / FPGA / 协作 / 终
3. 右下角选 **1080p**，点 **导出 MP4**。页面会逐帧渲染（与实时播放无关，卡点逐帧精确），
   用 M3 的硬件编码器生成带音乐的 MP4，完成后自动下载 `HPC_Beauty_of_Parallelism_3D_1080p.mp4`。
4. 状态栏最后会显示实际使用的编码器，例如 `H.264 High + AAC`。

> 如果状态栏显示的是 `VP9 + Opus`，说明这个浏览器不支持 H.264/AAC 编码。文件仍然可以用，
> Chrome 和 VLC 都能播放，但 QuickTime 不能播放。Mac 上的 Chrome 正常情况下会用 H.264 + AAC。

## 二、修改源码后重新打包

```bash
npm install              # three, mp4-muxer, esbuild
node build.mjs           # → dist/HPC_3D_Renderer.html
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

每一帧都只由时间 `t` 决定（`renderAt(t)`），所以预览、拖动和导出的画面完全一致。
时间轴和章节边界与音乐严格对齐，修改动画时保持在 120 BPM 的拍点上（一拍 = 0.5 秒）。

**关于字体**：为了让单文件 HTML 保持小体积，`assets/` 里的中英文字体只保留了片中用到的字符。
新增文字中如果出现子集里没有的汉字，Chrome 会自动用系统字体（苹方）显示。
如果想要统一字体，可以用 `prepare_assets.py` 重新生成子集（需要 Python + fontTools，
并把脚本里的字体路径改成你本机的 Noto Sans CJK SC / Inter 字体文件）。

音乐为程序化合成的原创电子乐（120 BPM，A 小调），由 `assets/music.py`（Python + NumPy/SciPy）生成。

## 第三方组件与许可 · Third-party notices

| 组件 | 许可 | 文件 |
|---|---|---|
| [three.js](https://github.com/mrdoob/three.js) r169 | MIT | `licenses/three.js-MIT.txt` |
| [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) | MIT | `licenses/mp4-muxer-MIT.txt` |
| Inter（字体子集） | SIL Open Font License 1.1 | `licenses/font-Inter.txt` |
| Noto Sans CJK SC（字体子集） | SIL Open Font License 1.1 | `licenses/font-NotoSansCJK.txt` |
| DejaVu Sans Mono（字体子集） | Bitstream Vera / DejaVu 许可 | `licenses/font-DejaVu.txt` |

`dist/HPC_3D_Renderer.html` 中打包了上述组件：three.js 的许可声明保留在文件末尾，全部许可文本见 `licenses/`。
