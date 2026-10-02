"""Subset fonts to the characters actually used in src/, and encode the soundtrack to Opus."""
import glob, subprocess, os
from fontTools import subset
from fontTools.ttLib import TTCollection

chars = set()
for f in glob.glob("src/**/*.js", recursive=True) + ["src/template.html"]:
    chars |= set(open(f, encoding="utf-8").read())
chars |= set("0123456789,.:·/ ▌→×—–-")
text = "".join(sorted(c for c in chars if c.isprintable()))
os.makedirs("assets", exist_ok=True)

def sub(src, out, index=None):
    opts = subset.Options(); opts.layout_features = ["*"]; opts.name_IDs = ["*"]; opts.notdef_outline = True
    font = TTCollection(src).fonts[index] if index is not None else subset.load_font(src, opts)
    s = subset.Subsetter(opts); s.populate(text=text); s.subset(font)
    font.save(out); print(out, os.path.getsize(out))

N = "/usr/share/fonts/opentype/noto/"
sub(N + "NotoSansCJK-Light.ttc", "assets/noto-light.otf", 2)   # index 2 = Simplified Chinese (SC)
sub(N + "NotoSansCJK-Thin.ttc", "assets/noto-thin.otf", 2)
sub("/usr/share/fonts/opentype/inter/Inter-Light.otf", "assets/inter-light.otf")
sub("/usr/share/fonts/opentype/inter/Inter-Thin.otf", "assets/inter-thin.otf")
sub("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", "assets/mono.ttf")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", "/home/claude/hpc_video/music.wav", "-c:a", "libopus", "-b:a", "160k", "assets/music.ogg"], check=True)
print("assets/music.ogg", os.path.getsize("assets/music.ogg"))
