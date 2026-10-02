"""Original procedural electronic track for "HPC 之美" — 120 BPM, A minor, 90 s.
Author: 意雨轻寒 / Jerry Leibniz.  Every note sits on an exact beat grid,
so the picture (render.py, same BPM) lands on the beat frame-perfectly.
"""
import numpy as np
from scipy.signal import butter, sosfilt
from scipy.io import wavfile

SR = 44100
BPM = 120
BEAT = 60 / BPM
BAR = BEAT * 4
DUR = 90.0
N = int(SR * DUR)
rng = np.random.default_rng(42)

L = np.zeros(N); R = np.zeros(N)

def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)

def at(t):
    return int(round(t * SR))

def add(sig, t0, gain=1.0, pan=0.0):
    i = at(t0)
    if i >= N:
        return
    sig = sig[: N - i]
    l = np.cos((pan + 1) * np.pi / 4); r = np.sin((pan + 1) * np.pi / 4)
    L[i:i + len(sig)] += sig * gain * l * 1.414
    R[i:i + len(sig)] += sig * gain * r * 1.414

def env(n, a=0.005, d=0.1, s=0.6, rel=0.1, hold=None):
    a_n, d_n, r_n = int(a * SR), int(d * SR), int(rel * SR)
    hold_n = n - a_n - d_n - r_n if hold is None else int(hold * SR)
    hold_n = max(hold_n, 0)
    e = np.concatenate([np.linspace(0, 1, a_n, endpoint=False),
                        np.linspace(1, s, d_n, endpoint=False),
                        np.full(hold_n, s),
                        np.linspace(s, 0, r_n)])
    if len(e) >= n:                       # short note: truncate, close with a tiny fade
        e = e[:n].copy()
        k = min(n, int(0.004 * SR)); e[n - k:] *= np.linspace(1, 0, k)
    else:
        e = np.concatenate([e, np.zeros(n - len(e))])
    return e

def lp(x, fc, order=2):
    return sosfilt(butter(order, min(fc, SR / 2 - 100) / (SR / 2), "low", output="sos"), x)

def hp(x, fc, order=2):
    return sosfilt(butter(order, fc / (SR / 2), "high", output="sos"), x)

def saw(f, n, detune=0.0):
    t = np.arange(n) / SR
    out = np.zeros(n)
    for d in (-detune, 0, detune) if detune else (0,):
        ph = (t * f * (1 + d)) % 1.0
        out += 2 * ph - 1
    return out / (3 if detune else 1)

def sq(f, n):
    t = np.arange(n) / SR
    return np.sign(np.sin(2 * np.pi * f * t)) * 0.7 + np.sin(2 * np.pi * f * t) * 0.3

def sine(f, n):
    return np.sin(2 * np.pi * f * np.arange(n) / SR)

# ---------------- instruments ----------------
def kick(gain=1.0):
    n = int(0.45 * SR); t = np.arange(n) / SR
    f = 45 + 110 * np.exp(-t * 30)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 7)
    click = rng.standard_normal(n) * np.exp(-t * 300) * 0.3
    return np.tanh((body + click) * 1.6) * gain

def clap():
    n = int(0.3 * SR); t = np.arange(n) / SR
    noise = hp(lp(rng.standard_normal(n), 3500), 900)
    e = np.zeros(n)
    for k in range(3):
        e += np.exp(-np.clip(t - k * 0.011, 0, None) * 60) * (t >= k * 0.011)
    e += np.exp(-t * 18) * 0.5
    return noise * e * 0.6

def hat(open_=False):
    n = int((0.22 if open_ else 0.05) * SR); t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 7000) * np.exp(-t * (14 if open_ else 90)) * 0.35

def snare_hit(gain=1.0):
    n = int(0.18 * SR); t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 25)
    noise = hp(rng.standard_normal(n), 1500) * np.exp(-t * 22)
    return (tone * 0.5 + noise * 0.6) * gain

def pad_chord(notes, dur, bright=1200, detune=0.006):
    n = int(dur * SR)
    x = sum(saw(midi(m), n, detune) for m in notes) / len(notes)
    x = lp(x, bright, 2)
    return x * env(n, a=0.4, d=0.3, s=0.85, rel=0.6)

def bass_note(m, dur, cutoff=700):
    n = int(dur * SR)
    x = saw(midi(m), n) * 0.6 + sine(midi(m), n) * 0.6
    return lp(x, cutoff, 2) * env(n, a=0.004, d=0.08, s=0.7, rel=0.04)

def arp_note(m, dur=0.12, bright=3000):
    n = int(dur * SR)
    return lp(sq(midi(m), n), bright) * env(n, a=0.002, d=0.05, s=0.3, rel=0.05)

def lead_note(m, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.5 * t) * np.clip(t * 3, 0, 1)
    ph = 2 * np.pi * np.cumsum(midi(m) * vib) / SR
    x = (np.sin(ph) + 0.35 * np.sin(2 * ph) + 0.15 * np.sign(np.sin(ph)))
    return lp(x, 3800) * env(n, a=0.01, d=0.15, s=0.6, rel=0.12)

def stab(notes, dur=0.22):
    n = int(dur * SR)
    x = sum(saw(midi(m), n, 0.01) for m in notes) / len(notes)
    return lp(x, 4500) * env(n, a=0.003, d=0.12, s=0.25, rel=0.06)

def riser(dur):
    n = int(dur * SR); t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    out = np.zeros(n); seg = int(0.05 * SR)
    for i in range(0, n, seg):
        fc = 400 + 9000 * (i / n) ** 2
        out[i:i + seg] = hp(lp(noise[i:i + seg], fc), 200)
    sweep = np.sin(2 * np.pi * np.cumsum(200 + 1200 * (t / dur) ** 2) / SR) * 0.25
    return (out * 0.5 + sweep) * (t / dur) ** 1.5

def sub_drop():
    n = int(1.6 * SR); t = np.arange(n) / SR
    f = 30 + 60 * np.exp(-t * 3)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.6)

# ---------------- harmony: Am - F - C - G (one chord per bar) ----------------
PROG = [(57, [57, 60, 64, 69]),   # Am
        (53, [53, 57, 60, 65]),   # F
        (48, [55, 60, 64, 67]),   # C
        (55, [55, 59, 62, 67])]   # G
def chord(bar):
    return PROG[bar % 4]

def bar_t(b):
    return b * BAR

# Section map (bars): intro 0-3, cpu 4-11, wall 12-16, build 17-18,
# gpu drop 19-27, fpga groove 28-35, coop 36-41, outro 42-44
sidechain = np.ones(N)

def duck(t0, depth=0.6, length=0.32):
    i = at(t0); n = int(length * SR)
    if i >= N: return
    n = min(n, N - i)
    curve = 1 - depth * np.exp(-np.linspace(0, 6, n))
    sidechain[i:i + n] = np.minimum(sidechain[i:i + n], curve)

pad_bus_L = np.zeros(N); pad_bus_R = np.zeros(N)
def add_pad(sig, t0, gain):
    i = at(t0); sig = sig[: N - i]
    pad_bus_L[i:i + len(sig)] += sig * gain
    # slight delay on the right channel for width
    d = int(0.012 * SR)
    j = i + d; s2 = sig[: max(0, N - j)]
    pad_bus_R[j:j + len(s2)] += s2 * gain

# ---- pads (whole track except the wall, which gets a drone) ----
for b in range(45):
    root, notes = chord(b)
    if 12 <= b <= 18:
        continue
    if b < 4:
        g = 0.34 * (b + 1) / 4; bright = 800 + 250 * b
    elif b >= 42:
        g = 0.22 * (45 - b) / 3; bright = 900
    elif 19 <= b <= 27 or 36 <= b <= 41:
        g = 0.2; bright = 2400
    else:
        g = 0.17; bright = 1300
    add_pad(pad_chord(notes, BAR + 0.5, bright), bar_t(b), g)

# final ringing chord
add_pad(pad_chord([57, 64, 69, 72, 76], 6.5, 1500), bar_t(42), 0.12)

# ---- intro sparkle (bars 0-3): sparse high notes on beats ----
sparkle = [81, 76, 84, 79, 81, 88, 84, 76]
for i in range(8):
    t0 = 2.0 + i * BEAT * 1.5
    if t0 < 8:
        add(arp_note(sparkle[i], 0.4, 5000) * 0.6, t0, 0.3, pan=(-0.5 if i % 2 else 0.5))

# ---- CPU section bars 4-11: kick 4/4, bass 8ths, hats from bar 8 ----
for b in range(4, 12):
    root, _ = chord(b)
    for q in range(4):
        t0 = bar_t(b) + q * BEAT
        add(kick(), t0, 0.85)
        duck(t0, 0.35)
        add(bass_note(root - 12, BEAT / 2 - 0.02, 600), t0 + BEAT / 2, 0.42)
        if b >= 8:
            add(hat(), t0 + BEAT / 2, 0.5, pan=0.3)
    if b >= 10:
        add(clap(), bar_t(b) + BEAT, 0.5); add(clap(), bar_t(b) + 3 * BEAT, 0.5)

# ---- the wall bars 12-16: drums out, low drone, slow heartbeat ----
wall_n = int(5 * BAR * SR)
t = np.arange(wall_n) / SR
drone = (saw(midi(33), wall_n, 0.004) * 0.6 + sine(midi(45), wall_n) * 0.4)
drone = lp(drone, 500) * np.clip(t / 1.0, 0, 1) * np.clip((5 * BAR - t) / 0.3, 0, 1)
add(drone, bar_t(12), 0.3)
dis = pad_chord([57, 58, 64], 5 * BAR, 900, 0.01)  # tense minor-second cluster
add(dis, bar_t(12), 0.08)
for b in range(12, 17):
    add(kick(0.7), bar_t(b), 0.6)           # heartbeat
    add(kick(0.4), bar_t(b) + BEAT * 0.6, 0.4)

# ---- build bars 17-18: snare roll accelerating + riser ----
roll_start, roll_end = bar_t(17), bar_t(19)
tt = roll_start
k = 0
while tt < roll_end - 0.01:
    prog = (tt - roll_start) / (roll_end - roll_start)
    step = BEAT / 2 if prog < 0.25 else BEAT / 4 if prog < 0.6 else BEAT / 8
    add(snare_hit(0.3 + 0.7 * prog), tt, 0.5, pan=0.15 * np.sin(k))
    tt += step; k += 1
add(riser(roll_end - roll_start), roll_start, 0.5)
for b in (17, 18):
    root, notes = chord(b)
    for q in range(8):
        add(bass_note(root - 12 + (12 if q >= 4 and b == 18 else 0), BEAT / 2 - 0.02, 400 + 300 * q),
            bar_t(b) + q * BEAT / 2, 0.3)

# ---- DROP bars 19-27 (GPU): full drums, saw bass, stabs ----
add(sub_drop(), bar_t(19), 0.6)
add(hat(True), bar_t(19), 0.6)
for b in range(19, 28):
    root, notes = chord(b)
    for q in range(4):
        t0 = bar_t(b) + q * BEAT
        add(kick(), t0, 1.0); duck(t0, 0.7)
        for s16 in range(4):
            add(hat(open_=(s16 == 2)), t0 + s16 * BEAT / 4, 0.38 if s16 != 2 else 0.3,
                pan=(0.35 if s16 % 2 else -0.2))
        for e8 in range(2):
            add(bass_note(root - 12 + (12 if e8 else 0), BEAT / 2 - 0.02, 1400), t0 + e8 * BEAT / 2, 0.5)
    add(clap(), bar_t(b) + BEAT, 0.7); add(clap(), bar_t(b) + 3 * BEAT, 0.7)
    # off-beat chord stabs
    for q in (0, 1, 2, 3):
        add(stab([n + 12 for n in notes[:3]]), bar_t(b) + q * BEAT + BEAT * 0.5, 0.16, pan=0.25)

# ---- FPGA groove bars 28-35: mechanical 16th arpeggio ("pipeline") ----
for b in range(28, 36):
    root, notes = chord(b)
    pattern = [notes[0], notes[1], notes[2], notes[3], notes[2] + 12, notes[3], notes[1] + 12, notes[2]]
    for s16 in range(16):
        t0 = bar_t(b) + s16 * BEAT / 4
        m = pattern[s16 % 8] + 12
        add(arp_note(m, 0.11, 2200 + 1800 * ((b - 28) / 8)), t0, 0.2, pan=0.4 * np.sin(s16 * 0.8))
    for q in range(4):
        t0 = bar_t(b) + q * BEAT
        add(kick(0.9), t0, 0.85); duck(t0, 0.45)
        add(hat(), t0 + BEAT / 2, 0.45, pan=0.3)
        add(hat(), t0 + 3 * BEAT / 4, 0.25, pan=-0.3)
        add(bass_note(root - 12, BEAT * 0.35, 800), t0, 0.45)
        add(bass_note(root - 12, BEAT * 0.2, 800), t0 + BEAT * 0.75, 0.3)
    add(clap(), bar_t(b) + BEAT, 0.55); add(clap(), bar_t(b) + 3 * BEAT, 0.55)

# ---- coop bars 36-41: everything + lead melody ----
melody = [  # (beat offset within 2 bars, midi, length in beats) — A minor pentatonic
    (0, 76, 1), (1, 79, 0.5), (1.5, 81, 1.5), (3, 79, 1),
    (4, 76, 1.5), (5.5, 74, 0.5), (6, 72, 1), (7, 74, 1)]
melody_b = [
    (0, 76, 1), (1, 79, 0.5), (1.5, 81, 1), (2.5, 84, 1.5),
    (4, 83, 1), (5, 81, 1), (6, 79, 1), (7, 76, 1)]
for b in range(36, 42):
    root, notes = chord(b)
    for q in range(4):
        t0 = bar_t(b) + q * BEAT
        add(kick(), t0, 1.0); duck(t0, 0.65)
        for s16 in range(4):
            add(hat(open_=(s16 == 2)), t0 + s16 * BEAT / 4, 0.34, pan=(0.35 if s16 % 2 else -0.2))
        for e8 in range(2):
            add(bass_note(root - 12 + (12 if e8 else 0), BEAT / 2 - 0.02, 1500), t0 + e8 * BEAT / 2, 0.48)
    add(clap(), bar_t(b) + BEAT, 0.7); add(clap(), bar_t(b) + 3 * BEAT, 0.7)
    pattern = [notes[0], notes[1], notes[2], notes[3]]
    for s16 in range(16):
        add(arp_note(pattern[s16 % 4] + 24, 0.09, 3500), bar_t(b) + s16 * BEAT / 4, 0.1,
            pan=0.5 * np.sin(s16 * 0.9))
    if (b - 36) % 2 == 0:
        mel = melody if (b - 36) % 4 == 0 else melody_b
        for off, m, ln in mel:
            add(lead_note(m, ln * BEAT * 0.95), bar_t(b) + off * BEAT, 0.22, pan=-0.1)
            add(lead_note(m, ln * BEAT * 0.95), bar_t(b) + off * BEAT + BEAT * 0.75, 0.06, pan=0.5)  # echo

# ---- outro bars 42-44: arpeggio fading out, one last kick ----
add(kick(), bar_t(42), 0.8)
add(hat(True), bar_t(42), 0.5)
for s8 in range(24):
    t0 = bar_t(42) + s8 * BEAT / 2
    fade = (1 - s8 / 24) ** 1.5
    add(arp_note([69, 72, 76, 81][s8 % 4] + 12, 0.25, 2500), t0, 0.16 * fade, pan=0.5 * np.sin(s8))

# ---------------- mixdown ----------------
# simple reverb on pads: a few feedback delays
def verb(x, mix=0.25):
    out = x.copy()
    for d, g in ((0.031, 0.5), (0.047, 0.45), (0.071, 0.4), (0.113, 0.33), (0.179, 0.25)):
        n = int(d * SR)
        y = np.zeros_like(x); y[n:] = x[:-n] * g
        out += y * mix
    return lp(out, 6000)

L += verb(pad_bus_L) * sidechain
R += verb(pad_bus_R) * sidechain

mixdown = np.stack([L, R], 1)
mixdown = hp(mixdown.T, 25).T
fade_in = np.clip(np.arange(N) / (SR * 1.0), 0, 1)
fade_out = np.clip((N - np.arange(N)) / (SR * 1.0), 0, 1)
mixdown *= (fade_in * fade_out)[:, None]
peak = np.max(np.abs(mixdown))
mixdown = np.tanh(mixdown / peak * 1.3) / np.tanh(1.3) * 0.89
wavfile.write("music.wav", SR, (mixdown * 32767).astype(np.int16))
print("wrote music.wav", mixdown.shape, "peak", np.max(np.abs(mixdown)))
