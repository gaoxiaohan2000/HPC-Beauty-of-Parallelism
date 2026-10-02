"""Synthesis engine for the HPC 之美 soundtracks (120 BPM, 90 s).  Author: 意雨轻寒 / Jerry Leibniz
Everything is generated from scratch with NumPy/SciPy — no samples, no external audio.
"""
import numpy as np
from scipy.signal import butter, sosfilt, lfilter, fftconvolve
from scipy.ndimage import maximum_filter1d, minimum_filter1d, uniform_filter1d

SR = 44100
BPM = 120
BEAT = 60 / BPM
BAR = BEAT * 4
DUR = 90.0
N = int(SR * DUR)
RNG = np.random.default_rng(2026)

def midi(m):
    return 440.0 * 2 ** ((np.asarray(m, float) - 69) / 12)

def ns(d):
    return max(1, int(round(d * SR)))

def tt(n):
    return np.arange(n) / SR

def noise(n):
    return RNG.standard_normal(n)

# ------------------------------------------------------------------ envelopes
def env(n, a=0.005, d=0.15, s=0.7, r=0.1):
    """attack → exponential decay to sustain → linear release at the end of the note"""
    i = np.arange(n, dtype=float)
    an, dn, rn = max(1.0, a * SR), max(1.0, d * SR), max(1.0, r * SR)
    e = np.where(i < an, i / an, s + (1 - s) * np.exp(-(i - an) / dn * 3.0))
    return e * np.clip((n - i) / rn, 0, 1)

def perc(n, decay, attack=0.002):
    i = np.arange(n) / SR
    return np.exp(-i / decay) * np.clip(i / attack, 0, 1)

# ------------------------------------------------------------------ oscillators
def _phase(freq, n, ph0=0.0):
    f = np.broadcast_to(np.asarray(freq, float), (n,)) if np.ndim(freq) else np.full(n, float(freq))
    return ph0 + np.cumsum(f) / SR, f / SR

def _blep_saw(ph, dt):
    t = ph % 1.0
    y = 2 * t - 1
    m = t < dt
    x = t[m] / dt[m]; y[m] -= x + x - x * x - 1
    m = t > 1 - dt
    x = (t[m] - 1) / dt[m]; y[m] -= x * x + x + x + 1
    return y

def saw(freq, n, ph0=0.0):
    ph, dt = _phase(freq, n, ph0)
    return _blep_saw(ph, dt)

def pulse(freq, n, pw=0.5, ph0=0.0):
    ph, dt = _phase(freq, n, ph0)
    return 0.5 * (_blep_saw(ph, dt) - _blep_saw(ph + pw, dt))

def sine(freq, n, ph0=0.0):
    ph, _ = _phase(freq, n, ph0)
    return np.sin(2 * np.pi * ph)

def tri(freq, n):
    ph, _ = _phase(freq, n)
    return 2 * np.abs(2 * (ph % 1.0) - 1) - 1

def supersaw(freq, n, voices=7, spread=0.22):
    det = np.linspace(-1, 1, voices) * spread       # semitones
    w = 1 - 0.35 * np.abs(np.linspace(-1, 1, voices))
    out = np.zeros(n)
    for d, wi in zip(det, w):
        out += wi * saw(freq * 2 ** (d / 12), n, RNG.random())
    return out / w.sum()

# ------------------------------------------------------------------ filters
def lp(x, fc, order=2):
    return sosfilt(butter(order, min(fc, SR * 0.45) / (SR / 2), 'low', output='sos'), x)

def hp(x, fc, order=2):
    return sosfilt(butter(order, max(fc, 10) / (SR / 2), 'high', output='sos'), x)

def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [max(lo, 10) / (SR / 2), min(hi, SR * 0.45) / (SR / 2)], 'band', output='sos'), x)

def lp_sweep(x, fc, q=0.707, block=128):
    """Resonant RBJ low-pass whose cutoff follows fc (array the length of x, or callable of time)."""
    n = len(x)
    if callable(fc):
        fc = fc(tt(n))
    fc = np.broadcast_to(np.asarray(fc, float), (n,))
    y = np.empty(n); zi = np.zeros(2)
    for s in range(0, n, block):
        e = min(n, s + block)
        f = float(np.clip(fc[(s + e) // 2], 20, SR * 0.45))
        w0 = 2 * np.pi * f / SR; c = np.cos(w0); al = np.sin(w0) / (2 * q)
        b = np.array([(1 - c) / 2, 1 - c, (1 - c) / 2]); a = np.array([1 + al, -2 * c, 1 - al])
        y[s:e], zi = lfilter(b / a[0], a / a[0], x[s:e], zi=zi)
    return y

def crush(x, bits=6, down=4):
    q = 2 ** (bits - 1)
    y = np.round(x * q) / q
    return np.repeat(y[::down], down)[:len(x)]

# ------------------------------------------------------------------ tonal instruments
def piano(m, dur, vel=0.8):
    n = ns(dur + 1.2); t = tt(n); f = float(midi(m))
    out = np.zeros(n); B = 0.00035
    reg = np.clip((m - 40) / 50, 0, 1)
    for k in range(1, 11):
        fk = f * k * np.sqrt(1 + B * k * k)
        if fk > SR * 0.45: break
        amp = vel ** (0.6 + 0.15 * k) / k ** 1.15
        dec = (0.55 + 0.45 * k) * (1 + 1.5 * reg)
        out += amp * np.sin(2 * np.pi * fk * t + RNG.random()) * np.exp(-t * dec)
    out += lp(noise(n), 3000) * np.exp(-t * 60) * 0.08 * vel
    damp = np.clip(1 - (t - dur) / 0.25, 0, 1)
    return out * damp * np.clip(t / 0.003, 0, 1) * 0.5

def celesta(m, dur=1.2):
    n = ns(dur); t = tt(n); f = float(midi(m))
    mod = np.sin(2 * np.pi * f * 3.5 * t) * 2.2 * np.exp(-t * 6)
    car = np.sin(2 * np.pi * f * t + mod) * np.exp(-t * 2.2)
    car += 0.3 * np.sin(2 * np.pi * f * 4 * t) * np.exp(-t * 7)
    return car * np.clip(t / 0.002, 0, 1) * 0.45

def pluck(m, dur=0.6, bright=0.7, damp=0.995):
    f = float(midi(m)); n = ns(dur); P = max(2, int(round(SR / f)))
    exc = np.zeros(n); burst = lp(noise(P), 1500 + 9000 * bright); exc[:P] = burst
    a = np.zeros(P + 2); a[0] = 1; a[P] = -damp / 2; a[P + 1] = -damp / 2
    y = lfilter([1.0], a, exc)
    return y / (np.max(np.abs(y)) + 1e-9) * 0.5 * np.clip((n - np.arange(n)) / ns(0.02), 0, 1)

def strings(notes, dur, bright=1800, attack=0.35, release=0.6, spread=0.18):
    n = ns(dur + release); out = np.zeros(n)
    for m in np.atleast_1d(notes):
        v = supersaw(float(midi(m)) * (1 + 0.003 * np.sin(2 * np.pi * 5.2 * tt(n))), n, 5, spread)
        out += v
    out = lp(out / np.sqrt(len(np.atleast_1d(notes))), bright, 2)
    return out * env(n, a=attack, d=0.4, s=0.9, r=release) * 0.5

def stacc(m, dur=0.22, bright=2600):
    n = ns(dur + 0.08)
    x = supersaw(float(midi(m)), n, 5, 0.12)
    return lp(x, bright) * env(n, a=0.006, d=0.09, s=0.35, r=0.07) * 0.6

def brass(notes, dur, bright=2400, attack=0.05):
    n = ns(dur + 0.25); t = tt(n); out = np.zeros(n)
    for m in np.atleast_1d(notes):
        f = float(midi(m)) * (1 + 0.004 * np.sin(2 * np.pi * 5 * t) * np.clip(t - 0.2, 0, 1))
        out += saw(f, n) + 0.5 * saw(f * 1.003, n)
    fc = lambda tt_: 300 + bright * (1 - np.exp(-tt_ / attack)) * (0.75 + 0.25 * np.exp(-tt_ * 2))
    out = lp_sweep(out / len(np.atleast_1d(notes)), fc, q=0.9)
    return np.tanh(out * 1.6) * env(n, a=attack, d=0.3, s=0.8, r=0.25) * 0.4

def choir(notes, dur, attack=0.6, vowel='a'):
    F = {'a': [(700, 900), (1050, 1350), (2500, 3000)], 'o': [(400, 600), (750, 1000), (2300, 2700)]}[vowel]
    n = ns(dur + 0.8); t = tt(n); src = np.zeros(n)
    for m in np.atleast_1d(notes):
        for d in (-0.08, 0.0, 0.08):
            src += saw(float(midi(m)) * 2 ** (d / 12) * (1 + 0.005 * np.sin(2 * np.pi * (4.6 + d) * t)), n, RNG.random())
    out = sum(g * bp(src, lo, hi) for (lo, hi), g in zip(F, (1.0, 0.6, 0.25)))
    return out / (3 * len(np.atleast_1d(notes))) * env(n, a=attack, d=0.5, s=0.9, r=0.8) * 1.4

def lead(m, dur, bright=5200, voices=5):
    n = ns(dur + 0.15); t = tt(n)
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5.5 * t) * np.clip((t - 0.18) * 4, 0, 1)
    x = supersaw(float(midi(m)) * vib, n, voices, 0.12) + 0.4 * pulse(float(midi(m)) * vib / 2, n, 0.3)
    return lp(x, bright) * env(n, a=0.01, d=0.2, s=0.75, r=0.12) * 0.42

def sub_bass(m, dur, drive=1.0):
    n = ns(dur + 0.03)
    x = sine(float(midi(m)), n) + 0.25 * lp(saw(float(midi(m)), n), 300)
    return np.tanh(x * drive) * env(n, a=0.004, d=0.1, s=0.85, r=0.03) * 0.6

def saw_bass(m, dur, bright=900, q=1.2):
    n = ns(dur + 0.02); t = tt(n)
    x = saw(float(midi(m)), n) + 0.6 * pulse(float(midi(m)) / 2, n, 0.5)
    x = lp_sweep(x, lambda tt_: bright * (0.35 + 0.65 * np.exp(-tt_ * 14)), q=q)
    return np.tanh(x * 1.4) * env(n, a=0.003, d=0.1, s=0.7, r=0.02) * 0.45

def wobble(m, dur, rate, depth=2200):
    n = ns(dur + 0.02); t = tt(n); f = float(midi(m))
    x = saw(f, n) + saw(f * 1.006, n) + 0.8 * pulse(f / 2, n)
    lfo = 0.5 - 0.5 * np.cos(2 * np.pi * rate * t)
    y = lp_sweep(x, 120 + depth * lfo ** 2, q=3.5)
    y = np.tanh(y * 2.2) + 0.6 * sine(f / 2, n)
    return y * env(n, a=0.004, d=0.1, s=0.9, r=0.02) * 0.4

def reese(m, dur, fc0=200, fc1=900):
    n = ns(dur + 0.3); t = tt(n); f = float(midi(m))
    x = saw(f * 0.995, n) + saw(f * 1.005, n) + 0.7 * sine(f / 2, n)
    y = lp_sweep(x, fc0 + (fc1 - fc0) * (t / (dur + 0.3)), q=1.5)
    return np.tanh(y * 1.5) * env(n, a=0.4, d=0.3, s=0.9, r=0.3) * 0.4

def acid(m, dur, accent=0.0, cutoff=500, envamt=2000, q=7.0):
    n = ns(dur); t = tt(n); f = float(midi(m))
    x = saw(f, n)
    y = lp_sweep(x, cutoff + (envamt * (1 + accent)) * np.exp(-t * (14 - 6 * accent)), q=q, block=64)
    return np.tanh(y * (1.8 + accent)) * env(n, a=0.002, d=0.08, s=0.6, r=0.02) * 0.32

def arp_pluck(m, dur=0.14, bright=3500):
    n = ns(dur + 0.04)
    x = pulse(float(midi(m)), n, 0.35) + 0.5 * saw(float(midi(m)) * 1.004, n)
    return lp_sweep(x, lambda tt_: 300 + bright * np.exp(-tt_ * 18), q=1.6) * env(n, a=0.002, d=0.06, s=0.25, r=0.04) * 0.35

def bleep(m, dur=0.08):
    n = ns(dur); t = tt(n); f = float(midi(m))
    return np.sin(2 * np.pi * f * t + 1.5 * np.sin(2 * np.pi * f * 2 * t)) * perc(n, dur / 3) * 0.3

def stab(notes, dur=0.25, bright=4500):
    n = ns(dur + 0.1); out = np.zeros(n)
    for m in np.atleast_1d(notes):
        out += supersaw(float(midi(m)), n, 5, 0.18)
    out = lp_sweep(out / np.sqrt(len(np.atleast_1d(notes))), lambda tt_: 500 + bright * np.exp(-tt_ * 8), q=1.0)
    return out * env(n, a=0.003, d=0.12, s=0.4, r=0.08) * 0.5

# ------------------------------------------------------------------ drums & percussion
def kick(punch=1.0, tone=48):
    n = ns(0.5); t = tt(n)
    f = tone + 110 * np.exp(-t * 28) + 50 * np.exp(-t * 140)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 6.5)
    click = hp(noise(n), 2500) * np.exp(-t * 260) * 0.35
    return np.tanh((body + click) * 1.8 * punch) / np.tanh(1.8) * 0.9

def snare(gain=1.0, tone=190):
    n = ns(0.3); t = tt(n)
    body = (np.sin(2 * np.pi * tone * t) + 0.5 * np.sin(2 * np.pi * tone * 1.7 * t)) * np.exp(-t * 22)
    nz = bp(noise(n), 1500, 9500) * np.exp(-t * 15)
    return (0.5 * body + 0.8 * nz) * gain * 0.6

def clap():
    n = ns(0.35); t = tt(n); nz = bp(noise(n), 900, 4200)
    e = sum(np.exp(-np.clip(t - k * 0.011, 0, None) * 70) * (t >= k * 0.011) for k in range(4)) + 0.6 * np.exp(-t * 14)
    return nz * e * 0.45

def hat(open_=False, gain=1.0):
    n = ns(0.35 if open_ else 0.06); t = tt(n)
    x = hp(noise(n), 7500) + 0.3 * hp(sum(pulse(f, n) for f in (410, 571, 813, 1111)), 6000)
    return x * np.exp(-t * (9 if open_ else 80)) * 0.25 * gain

def rim():
    n = ns(0.08); t = tt(n)
    return (np.sin(2 * np.pi * 1700 * t) * np.exp(-t * 80) + 0.4 * hp(noise(n), 3000) * np.exp(-t * 120)) * 0.35

def taiko(size=1.0):
    n = ns(1.2); t = tt(n)
    f = (52 + 70 * np.exp(-t * 16)) / size
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 4.2 / size)
    skin = lp(noise(n), 900) * np.exp(-t * 22) * 0.6
    slap = hp(noise(n), 1800) * np.exp(-t * 70) * 0.25
    return np.tanh((body + skin + slap) * 1.5) * 0.8

def tom(m=45):
    n = ns(0.6); t = tt(n); f0 = float(midi(m))
    f = f0 * (1 + 0.6 * np.exp(-t * 20))
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7) + lp(noise(n), 1200) * np.exp(-t * 30) * 0.3) * 0.6

def crash(dur=2.8, gain=1.0):
    n = ns(dur); t = tt(n)
    x = hp(noise(n), 3500) * np.exp(-t * 2.0)
    x += 0.15 * sum(np.sin(2 * np.pi * f * t + RNG.random()) for f in (3150, 4420, 5390, 6810, 8130)) * np.exp(-t * 1.4)
    return lp(x, 13000) * np.clip(t / 0.002, 0, 1) * 0.32 * gain

def rev_cymbal(dur=2.0):
    c = crash(dur + 0.5)[:ns(dur)][::-1]
    return c * np.linspace(0, 1, len(c)) ** 1.5

def anvil(m=88):
    n = ns(0.5); t = tt(n); f = float(midi(m))
    x = sum(np.sin(2 * np.pi * f * r * t) * np.exp(-t * d) for r, d in ((1, 9), (2.76, 14), (5.4, 22), (8.93, 30)))
    return (x * 0.3 + hp(noise(n), 4000) * np.exp(-t * 90) * 0.4) * 0.45

def tick(gain=1.0):
    n = ns(0.03); t = tt(n)
    return (hp(noise(n), 5000) * np.exp(-t * 600) + 0.5 * np.sin(2 * np.pi * 3200 * t) * np.exp(-t * 300)) * 0.35 * gain

def heartbeat():
    n = ns(0.7); t = tt(n); out = np.zeros(n)
    for off, g in ((0.0, 1.0), (0.19, 0.7)):
        tl = np.clip(t - off, 0, None)
        out += g * np.sin(2 * np.pi * (45 + 25 * np.exp(-tl * 25)) * tl) * np.exp(-tl * 9) * (t >= off)
    return out * 0.7

# ------------------------------------------------------------------ cinematic FX
def braam(notes, dur=3.5, drive=2.0):
    n = ns(dur); t = tt(n); out = np.zeros(n)
    for m in np.atleast_1d(notes):
        f = float(midi(m))
        out += saw(f, n) + saw(f * 1.004, n) + 0.7 * saw(f * 0.996, n)
    out = lp_sweep(out, lambda tt_: 180 + 3200 * np.exp(-tt_ * 2.5) * (1 - np.exp(-tt_ * 60)), q=1.1)
    out = np.tanh(out * drive / len(np.atleast_1d(notes)))
    sub = np.sin(2 * np.pi * np.cumsum(float(midi(min(np.atleast_1d(notes)) - 12)) * (1 + 0.5 * np.exp(-t * 8))) / SR)
    body = (out * 0.6 + sub * 0.6) * env(n, a=0.01, d=0.8, s=0.55, r=1.2)
    return body + lp(noise(n), 2500) * np.exp(-t * 6) * 0.25

def sub_drop(dur=1.8, f0=60, f1=28):
    n = ns(dur); t = tt(n)
    f = f1 + (f0 - f1) * np.exp(-t * 2.5)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.5) * np.clip(t / 0.005, 0, 1) * 0.9

def riser(dur, f0=300, f1=9000, tone=True):
    n = ns(dur); t = tt(n); u = t / dur
    nz = lp_sweep(hp(noise(n), 150), f0 + (f1 - f0) * u ** 2, q=2.0)
    out = nz * 0.5
    if tone:
        out += 0.2 * saw(120 * 2 ** (u * 3.5), n)
    return out * u ** 2

def downlifter(dur):
    return riser(dur)[::-1] * 0.8

def shepard(dur, base=55.0, octaves_per_s=0.5, comps=8):
    n = ns(dur); t = tt(n); out = np.zeros(n)
    for k in range(comps):
        pos = (k + t * octaves_per_s) % comps
        f = base * 2 ** pos
        a = np.exp(-((pos - comps / 2) / 1.6) ** 2)
        out += a * np.sin(2 * np.pi * np.cumsum(f) / SR)
    return out / 3 * np.clip(t / 0.5, 0, 1)

def whoosh(dur=0.9, f0=600, f1=6000):
    n = ns(dur); t = tt(n); u = t / dur
    shape = np.sin(np.pi * u) ** 2
    return lp_sweep(hp(noise(n), 200), f0 + (f1 - f0) * np.sin(np.pi * u * 0.5) ** 2, q=3.0) * shape * 0.5

def power_down(dur=0.9, f0=420, f1=30):
    n = ns(dur); t = tt(n); u = t / dur
    f = f1 + (f0 - f1) * (1 - u) ** 2
    x = saw(f, n) * 0.5 + sine(f / 2, n)
    return np.tanh(lp(x, 1500) * 1.4) * (1 - u) ** 0.7 * 0.5

def glitch(dur=0.6, rate=16):
    n = ns(dur); grain = crush(bp(noise(ns(1 / rate)), 500, 6000), 4, 6)
    reps = int(np.ceil(n / len(grain)))
    x = np.tile(grain, reps)[:n]
    return x * np.exp(-tt(n) * 4) * 0.5

def servo(dur=1.2, f0=180, f1=520):
    n = ns(dur); t = tt(n); u = t / dur
    f = f0 + (f1 - f0) * np.sin(np.pi * u / 2)
    return lp(pulse(f, n, 0.3) + 0.5 * saw(f * 2.01, n), 2200) * np.sin(np.pi * u) ** 0.5 * 0.25

def alarm(dur=0.22, m=88):
    n = ns(dur)
    return lp(pulse(float(midi(m)), n, 0.5), 3500) * env(n, a=0.003, d=0.05, s=0.7, r=0.05) * 0.18

# ------------------------------------------------------------------ mixing
class Mix:
    """Buses of stereo audio; each bus can have reverb send, delay send and sidechain ducking."""
    def __init__(self):
        self.L, self.R = {}, {}
        self.duck = np.ones(N)

    def _bus(self, b):
        if b not in self.L:
            self.L[b] = np.zeros(N); self.R[b] = np.zeros(N)
        return self.L[b], self.R[b]

    def add(self, sig, t0, gain=1.0, pan=0.0, bus='music'):
        i = int(round(t0 * SR))
        if i >= N or len(sig) == 0:
            return
        if i < 0:
            sig = sig[-i:]; i = 0
        sig = sig[:N - i]
        L, R = self._bus(bus)
        if np.ndim(pan) == 0:
            l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        else:
            p = np.interp(np.linspace(0, 1, len(sig)), np.linspace(0, 1, len(pan)), pan)
            l, r = np.cos((p + 1) * np.pi / 4), np.sin((p + 1) * np.pi / 4)
        L[i:i + len(sig)] += sig * gain * l * 1.414
        R[i:i + len(sig)] += sig * gain * r * 1.414

    def sidechain(self, t0, depth=0.6, length=0.3):
        i = int(round(t0 * SR)); n = min(ns(length), N - i)
        if n <= 0: return
        c = 1 - depth * np.exp(-np.linspace(0, 6, n))
        self.duck[i:i + n] = np.minimum(self.duck[i:i + n], c)

    def tape_stop(self, prefix, t0, dur=0.7, curve=1.8):
        """Everything on buses starting with `prefix` slows to a halt from t0 (pitch and speed fall together)."""
        i0, n = int(round(t0 * SR)), ns(dur)
        rate = (1 - np.arange(n) / n) ** curve
        pos = i0 + np.cumsum(rate)
        idx = np.arange(N)
        for b in [b for b in self.L if b.startswith(prefix)]:
            for X in (self.L[b], self.R[b]):
                seg = np.interp(pos, idx, X) * (1 - np.arange(n) / n) ** 0.3
                X[i0:] = 0
                X[i0:i0 + n] = seg

    def cut(self, prefix, t0, fade=0.02):
        i0, n = int(round(t0 * SR)), ns(fade)
        ramp = np.linspace(1, 0, n)
        for b in [b for b in self.L if b.startswith(prefix)]:
            for X in (self.L[b], self.R[b]):
                X[i0:i0 + n] *= ramp
                X[i0 + n:] = 0

    def render(self, sends, ducked, rt60=2.4, delays=None, faders=None, automation=None):
        """Bus names are <section>_<kind>; sends/ducked/delays are keyed by kind."""
        mixL, mixR = np.zeros(N), np.zeros(N)
        rvL, rvR = np.zeros(N), np.zeros(N)
        for b in self.L:
            L, R = self.L[b], self.R[b]
            kind = b.split('_')[-1]
            fg = 10 ** ((faders or {}).get(kind, 0.0) / 20)
            if fg != 1.0:
                L, R = L * fg, R * fg
            dk = ducked.get(kind, 0.0)
            if dk:
                g = 1 - dk * (1 - self.duck)
                L, R = L * g, R * g
            if delays and kind in delays:
                tdel, fb, wet = delays[kind]
                L, R = _pingpong(L, R, tdel, fb, wet)
            mixL += L; mixR += R
            s = sends.get(kind, 0.0)
            if s:
                rvL += L * s; rvR += R * s
        irL, irR = _ir(rt60)
        mixL += fftconvolve(rvL, irL)[:N]
        mixR += fftconvolve(rvR, irR)[:N]
        if automation:
            ts, ds = zip(*automation)
            g = 10 ** (np.interp(tt(N), ts, ds) / 20)
            mixL, mixR = mixL * g, mixR * g
        return master(mixL, mixR)

def _ir(rt60):
    n = ns(rt60 * 1.1); t = tt(n)
    decay = np.exp(-t * 6.9 / rt60)
    pre = ns(0.022)
    out = []
    for _ in range(2):
        x = noise(n) * decay
        x = lp(x, 7000) * 0.6 + lp(x, 1800) * 0.4
        x[:pre] = 0
        out.append(x / np.sqrt(np.sum(x ** 2)) * 0.9)
    return out

def _pingpong(L, R, tdel, fb, wet):
    d = ns(tdel); outL, outR = L.copy(), R.copy()
    srcL, srcR = L * wet, R * wet
    for k in range(1, 7):
        g = fb ** (k - 1)
        sh = d * k
        if sh >= N: break
        if k % 2:
            outR[sh:] += lp(srcL[:N - sh], 5000) * g
        else:
            outL[sh:] += lp(srcR[:N - sh], 5000) * g
    return outL, outR

def master(L, R, target=0.89, low_cut_db=-3.0, air_db=1.5):
    L, R = hp(L, 28), hp(R, 28)
    gl, ga = 10 ** (low_cut_db / 20) - 1, 10 ** (air_db / 20) - 1
    L = L + gl * lp(L, 90) + ga * hp(L, 7000)
    R = R + gl * lp(R, 90) + ga * hp(R, 7000)
    # glue compressor (RMS, 2.5:1 above threshold)
    m = np.sqrt(uniform_filter1d((L ** 2 + R ** 2) / 2, ns(0.03)))
    thr = np.percentile(m, 97)
    gr = np.where(m > thr, (thr / (m + 1e-9)) ** (1 - 1 / 2.0), 1.0)
    gr = uniform_filter1d(gr, ns(0.05))
    L, R = L * gr, R * gr
    # look-ahead peak limiter
    pk = maximum_filter1d(np.maximum(np.abs(L), np.abs(R)), ns(0.006))
    ceil = np.percentile(pk, 99.7)
    g = np.minimum(1.0, ceil / (pk + 1e-9))
    g = uniform_filter1d(minimum_filter1d(g, ns(0.006)), ns(0.004))
    L, R = L * g, R * g
    peak = max(np.max(np.abs(L)), np.max(np.abs(R)))
    L, R = L / peak * target, R / peak * target
    fade = np.clip((N - np.arange(N)) / ns(0.6), 0, 1)
    return np.stack([L * fade, R * fade], 1)

def write(path, stereo):
    from scipy.io import wavfile
    wavfile.write(path, SR, (np.clip(stereo, -1, 1) * 32767).astype(np.int16))

# ------------------------------------------------------------------ harmony helpers
CHORDS = {   # close voicings around middle C + bass root
    'Am': ([57, 60, 64], 33), 'F': ([57, 60, 65], 29), 'C': ([55, 60, 64], 36), 'G': ([55, 59, 62], 31),
    'Dm': ([57, 62, 65], 38), 'E': ([56, 59, 64], 40), 'Bb': ([58, 62, 65], 34),
    'Bm': ([59, 62, 66], 35), 'D': ([57, 62, 66], 38), 'A': ([57, 61, 64], 33), 'Gb': ([58, 61, 66], 30),
}
# the HPC motif (beat offset, midi, beats) — 4 bars over Am F C G
MOTIF = [(0, 76, 1), (1, 81, .5), (1.5, 79, .5), (2, 76, 1), (3, 74, .5), (3.5, 72, .5),
         (4, 74, 1), (5, 76, 1), (6, 72, 1.5), (7.5, 71, .5),
         (8, 76, 1), (9, 79, .5), (9.5, 81, .5), (10, 84, 1.5), (11.5, 83, .5),
         (12, 79, 1), (13, 81, .5), (13.5, 79, .5), (14, 74, 1), (15, 71, 1)]

# picture events (seconds) taken from the 3D renderer
EV = dict(lid=9.0, fork=[12.0, 12.5, 13.0, 13.5, 14.0], arrive=14.25, smt0=16.0, simd=[20.0, 20.5, 21.0, 21.5],
          wall=24.0, contact=26.88, split=34.0, drop=38.0, shrink=44.0, array=46.0, morph=50.0, nn=52.0,
          fpga=56.0, cfg0=56.25, ncfg=17, packets=62.0, coop=72.0, finale=84.0)
FPGA_COLS = [0, 1, 1, 2, 3, 4, 4, 4, 5, 6, 7, 7, 8, 9, 10, 10, 11]
