"""方案 B · 赛博电子 Cyber Electronic — darksynth / future-bass score that follows the picture.
Author: 意雨轻寒 / Jerry Leibniz.   python score.py  →  music.wav  (then: python ../prepare_assets.py)
"""
import numpy as np
from synth import *

M = Mix()

def K(t, g=0.75, bus='x_drums', depth=0.65):
    M.add(kick(1.15), t, g, bus=bus); M.sidechain(t, depth, 0.32)

def ct(name):
    return CHORDS[name][0]

def rt(name):
    return CHORDS[name][1]

def four_floor(b0, b1, bus, clap_from=None, hats=True, open_hat=True, kick_g=0.75):
    for b in range(b0, b1):
        for q in range(4):
            t = b * BAR + q * BEAT
            K(t, kick_g, bus)
            if clap_from is not None and b >= clap_from and q % 2: M.add(clap(), t, 0.5, bus=bus)
            if hats:
                M.add(hat(gain=1.0), t + 0.25, 0.4, pan=0.25, bus=bus)
                M.add(hat(gain=0.6), t + 0.125, 0.18, pan=-0.25, bus=bus)
                M.add(hat(gain=0.6), t + 0.375, 0.18, pan=-0.25, bus=bus)
            if open_hat and q == 3: M.add(hat(True, 0.8), t + 0.25, 0.25, pan=0.3, bus=bus)

def bassline(b0, b1, prog, bus, pattern=(0, 0, 12, 0, 0, 12, 0, 7), step=0.125, bright=900, g=0.42):
    for b in range(b0, b1):
        r = rt(prog(b)) + 12
        for k in range(int(BAR / step)):
            M.add(saw_bass(r + pattern[k % len(pattern)], step * 0.9, bright=bright), b * BAR + k * step, g, bus=bus)

def arps(b0, b1, prog, bus, step=0.125, octave=12, g=0.2, bright=3500, order=(0, 1, 2, 1, 0, 2, 1, 2)):
    for b in range(b0, b1):
        c = ct(prog(b))
        for k in range(int(BAR / step)):
            m = c[order[k % len(order)]] + octave + (12 if k % 8 == 7 else 0)
            M.add(arp_pluck(m, step * 1.1, bright), b * BAR + k * step, g, pan=0.5 * np.sin(k * 0.7), bus=bus)

def pads(b0, b1, prog, bus, g=0.16, bright=1600):
    for b in range(b0, b1):
        M.add(strings(ct(prog(b)) + [ct(prog(b))[0] + 12], BAR + 0.1, bright=bright, attack=0.15, spread=0.3), b * BAR, g, bus=bus)

def motif(t0, transpose=0, notes=MOTIF, g=0.2, bus='x_lead', octave=0):
    first = notes[0][0]
    for off, m, ln in notes:
        M.add(lead(m + transpose + octave, ln * BEAT * 0.92, bright=5500, voices=7), t0 + (off - first) * BEAT, g, bus=bus)

def drop_hit(t, notes, big=1.0, bus='x'):
    M.add(sub_drop(1.8), t, 0.6 * big, bus=f'{bus}_hit')
    M.add(crash(3.0), t, 0.45 * big, bus=f'{bus}_drums')
    M.add(stab(notes, 0.6, 5000), t, 0.35 * big, bus=f'{bus}_stab')
    M.add(crush(lp(noise(ns(0.4)), 6000) * np.exp(-tt(ns(0.4)) * 9), 6, 3), t, 0.25 * big, bus=f'{bus}_fx')
    M.sidechain(t, 0.75, 0.5)

def roll(t0, t1, g0, g1, bus, inst=snare):
    t = t0
    while t < t1 - 1e-6:
        u = (t - t0) / (t1 - t0)
        M.add(inst(), t, g0 + (g1 - g0) * u ** 1.5, bus=bus)
        t += 0.125 if u < 0.5 else (0.0625 if u < 0.85 else 0.03125)

# =============================================================== 0–8  intro: arpeggio wakes up behind a closed filter
intro_arp = Mix()
for k in range(64):
    t = k * 0.125; c = ct('Am') if t < 4 else ct('F')
    m = c[(0, 1, 2, 1)[k % 4]] + 12 + (12 if k % 8 == 6 else 0)
    intro_arp.add(arp_pluck(m, 0.14, 2500), t, 0.4, pan=0.4 * np.sin(k * 0.6), bus='i_arp')
L = intro_arp.L['i_arp'][:ns(8.2)]; R = intro_arp.R['i_arp'][:ns(8.2)]
cut = lambda tt_: 250 * (2600 / 250) ** (tt_ / 8.0)
M.add(lp_sweep(L, cut, q=2.5), 0, 0.5, pan=-0.3, bus='intro_arp'); M.add(lp_sweep(R, cut, q=2.5), 0, 0.5, pan=0.3, bus='intro_arp')
M.add(sub_bass(33, 8.0), 0.0, 0.25, bus='intro_bass')
M.add(strings([45, 52, 57], 8.4, bright=500, attack=3.0, release=1.2), 0, 0.3, bus='intro_pad')
rng = np.random.default_rng(7)
for k in range(10, 60):                                  # data blips at the circuit heads
    if rng.random() < 0.35:
        M.add(bleep(int(rng.choice([88, 91, 93, 96, 98, 100]))), k * 0.125, 0.12 * min(1, k / 30), pan=rng.uniform(-0.8, 0.8), bus='intro_blip')
M.add(riser(2.0, 200, 8000), 6.0, 0.14, bus='intro_fx')
M.add(rev_cymbal(1.5), 6.5, 0.35, bus='intro_fx')

# =============================================================== 8–24  CPU
CPU = {4: 'Am', 5: 'Am', 6: 'Am', 7: 'F', 8: 'C', 9: 'G', 10: 'Am', 11: 'E'}
drop_hit(8.0, [57, 60, 64, 69], 1.0, bus='cpu')
four_floor(4, 12, 'cpu_drums', clap_from=5)
bassline(4, 12, CPU.get, 'cpu_bass')
pads(4, 12, CPU.get, 'cpu_pad', 0.12, 1300)
M.add(servo(1.4), EV['lid'], 0.55, pan=-0.2, bus='cpu_fx')               # lid lifts
M.add(whoosh(1.2, 500, 8000), EV['lid'] + 0.2, 0.35, pan=np.array([-0.5, 0.6]), bus='cpu_fx')
# fork: each level splits into twice as many voices — a 1/2/4/8-note digital strum
FORKN = [[57], [57, 64], [57, 64, 69, 72], [57, 64, 69, 72, 76, 81, 84, 88]]
for lv, t0 in enumerate(EV['fork'][:4]):
    for j, m in enumerate(FORKN[lv]):
        M.add(arp_pluck(m + 12, 0.35, 5000), t0 + j * 0.022, 0.24, pan=-0.85 + 1.7 * j / max(1, len(FORKN[lv]) - 1) if lv else 0, bus='cpu_arp')
    M.add(bleep(81 + 5 * lv, 0.12), t0, 0.18, bus='cpu_blip')
M.add(riser(2.25, 400, 6000, tone=True), 12.0, 0.12, bus='cpu_fx')
M.add(stab([53, 57, 60, 65, 69], 0.5, 5500), EV['arrive'], 0.45, bus='cpu_stab')
M.add(anvil(84), EV['arrive'], 0.2, bus='cpu_hit'); M.add(kick(1.3), EV['arrive'], 0.5, bus='cpu_hit')
M.add(snare(1.3), EV['arrive'], 0.5, bus='cpu_drums'); M.add(crash(2.2), EV['arrive'], 0.3, bus='cpu_drums')
# SMT: two threads, ping-pong left/right on every eighth note
SMT = {'C': ([72, 76, 79, 76], [84, 88, 91, 88]), 'G': ([71, 74, 79, 74], [83, 86, 91, 86])}
for i in range(16):
    t = EV['smt0'] + i * 0.25
    lo, hi = SMT[CPU[int(t // BAR)]]
    if i % 2 == 0: M.add(arp_pluck(lo[(i // 2) % 4], 0.3, 4000), t, 0.32, pan=-0.75, bus='cpu_arp')
    else: M.add(celesta(hi[(i // 2) % 4], 0.6), t, 0.2, pan=0.75, bus='cpu_bell')
# SIMD: supersaw chord stacks 1 → 2 → 4 → 8 notes as the drops land, then lockstep on E
STACK = [[57], [57, 64], [57, 64, 69, 72], [45, 57, 64, 69, 72, 76, 81, 84]]
for k, t0 in enumerate(EV['simd']):
    M.add(stab(STACK[k], 0.35, 6000), t0 + 0.15, 0.3 + 0.05 * k, bus='cpu_stab')
    M.add(snare(1.2), t0 + 0.15, 0.25 + 0.06 * k, bus='cpu_hit'); M.add(bleep(88 + 2 * k, 0.06), t0 + 0.15, 0.18, bus='cpu_hit')
for k in range(4):
    M.add(stab([40, 52, 59, 64, 68, 71, 76, 80], 0.35, 6500), 22.0 + k * BEAT + 0.15, 0.48, bus='cpu_stab')
roll(22.0, 24.0, 0.08, 0.45, 'cpu_drums')
M.add(riser(2.0, 300, 10000), 22.0, 0.2, bus='cpu_fx')

# =============================================================== 24–34  Power Wall: tape stop, glitch, overheating
M.add(power_down(1.2, 600, 25), EV['wall'], 0.5, bus='wall_fx')
M.add(kick(1.4, 36), EV['wall'], 0.75, bus='wall_hit'); M.add(crush(crash(1.5), 5, 4), EV['wall'], 0.3, bus='wall_hit')
M.add(glitch(0.5, 24), EV['wall'] + 0.05, 0.3, bus='wall_fx')
M.add(crush(sub_bass(33, 10.0, 1.5), 7, 6), 24.4, 0.22, bus='wall_bass')
M.add(crush(strings([57, 64], 9.6, bright=900, attack=1.5), 8, 3), 24.4, 0.22, bus='wall_pad')
t, ticks = 24.4, []
while t < 34.0:
    u = np.clip((t - 24.4) / (EV['contact'] - 24.4), 0, 1)
    ticks.append(t); t += 1 / (2 * 8 ** u)
for k, t in enumerate(ticks):
    after = t > EV['contact']
    g = (0.15 + 0.2 * np.clip((t - 24.4) / 2.5, 0, 1)) if not after else 0.13 * np.exp(-(t - EV['contact']) / 4)
    M.add(crush(tick(1.0), 5, 2), t, g, pan=0.4 * (-1) ** k, bus='wall_tick')
M.add(rev_cymbal(1.0), EV['contact'] - 1.0, 0.28, bus='wall_fx')
M.add(crush(crash(3.0), 6, 3), EV['contact'], 0.45, bus='wall_drums')
M.add(glitch(0.7, 32), EV['contact'], 0.4, pan=0.2, bus='wall_fx')
M.add(sub_drop(2.0, 60, 24), EV['contact'], 0.65, bus='wall_hit')
M.add(kick(1.4, 40), EV['contact'], 0.6, bus='wall_drums')
M.add(riser(7.0, 200, 3000, tone=False), 27.0, 0.07, bus='wall_fx')
for t0, m, g in [(28.0, 38, 0.32), (30.0, 34, 0.36), (32.0, 40, 0.42)]:
    M.add(reese(m, 1.95, 180, 1100), t0, g, bus='wall_bass')
for k in range(6):
    M.add(heartbeat(), 28.0 + k, 0.32 + 0.06 * k, bus='wall_drums')
for k in range(4):                                       # overheat alarm
    M.add(alarm(0.2, 88), 32.0 + k * BEAT, 0.5, pan=0.3, bus='wall_fx'); M.add(alarm(0.2, 84), 32.25 + k * BEAT, 0.45, pan=-0.3, bus='wall_fx')
roll(33.0, 34.0, 0.05, 0.3, 'wall_drums')

# =============================================================== 34–38  Split: the arpeggio doubles its rate every beat
K(34.0, 0.7, 'split_drums')
for k in range(8):
    tb = 34.0 + k * BEAT; n = min(2 ** k, 32)
    for j in range(n):
        m = 64 + 2 * k + (12 if j % 2 else 0)
        M.add(arp_pluck(m, max(0.03, BEAT / n), 3000 + 600 * k), tb + j * BEAT / n, 0.22 if n < 16 else 0.15, pan=0.5 * (-1) ** j, bus='split_arp')
    if k < 4: K(tb, 0.6, 'split_drums')
roll(35.0, 37.8, 0.08, 0.45, 'split_drums')
M.add(shepard(3.8, 55, 0.6), 34.0, 0.25, bus='split_fx')
M.add(riser(3.8, 300, 12000), 34.0, 0.2, bus='split_fx')
M.add(reese(40, 3.6, 200, 3000), 34.0, 0.3, bus='split_bass')

# =============================================================== 38–56  GPU → AI
GPU = {b: ['Am', 'F', 'C', 'G'][(b - 19) % 4] for b in range(19, 28)}
drop_hit(38.0, [45, 57, 60, 64, 69], 1.2, bus='gpu')
RATES = [4, 4, 8, 8, 4, 4, 12, 16]                        # wobble rate per beat (Hz) — 1/8, 1/16, triplets
for b in range(19, 22):
    t = b * BAR
    K(t, 0.85, 'gpu_drums'); K(t + 0.75, 0.55, 'gpu_drums')
    M.add(snare(1.4), t + 1.0, 0.6, bus='gpu_drums'); M.add(clap(), t + 1.0, 0.55, bus='gpu_drums')
    for k in range(8): M.add(hat(gain=0.8), t + k * 0.25, 0.3, pan=0.3, bus='gpu_drums')
    for q in range(4):
        M.add(wobble(rt(GPU[b]), BEAT, RATES[(b * 4 + q) % 8]), t + q * BEAT, 0.55, bus='gpu_bass')
    for q in (1, 3):
        M.add(stab(ct(GPU[b]) + [ct(GPU[b])[0] + 12], 0.25, 5000), t + q * BEAT + 0.25, 0.3, bus='gpu_stab')
motif(38.0, bus='gpu_lead', g=0.2)
for k in range(48):                                      # data stutters while tiles compute
    if k % 3 != 2:
        M.add(bleep([93, 96, 98, 100, 103][(k * 3) % 5], 0.05), 38.0 + k * 0.125, 0.09, pan=0.7 * np.sin(k), bus='gpu_blip')
# 44–46 pull back: bass filters down, beat drops out
M.add(downlifter(1.6), 44.0, 0.25, bus='gpu_fx')
M.add(lp(wobble(31, 1.9, 2, 900), 400), 44.0, 0.4, bus='gpu_bass')
M.add(whoosh(0.9, 300, 6000), 45.4, 0.45, pan=np.array([0.6, -0.6]), bus='gpu_fx')
# 46–50 lockstep: techno with a 16th trance-gate on the chords
K(46.0, 0.8, 'gpu_drums'); M.add(crash(2.0), 46.0, 0.35, bus='gpu_drums')
four_floor(23, 25, 'gpu_drums', clap_from=23)
bassline(23, 25, GPU.get, 'gpu_bass', bright=1200)
for b in (23, 24):
    for k in range(16):
        if k % 4 != 3:
            M.add(stab(ct(GPU[b]) + [ct(GPU[b])[0] + 12], 0.1, 4500), b * BAR + k * 0.125, 0.2, bus='gpu_gate')
# 50–52 morph: everything sucks back, swirl rises
M.add(rev_cymbal(2.0), 50.0, 0.45, bus='gpu_fx')
M.add(riser(2.0, 300, 12000), 50.0, 0.25, bus='gpu_fx')
M.add(shepard(2.0, 110, 1.0), 50.0, 0.2, bus='gpu_fx')
M.add(lp_sweep(strings([53, 57, 60, 65, 69], 2.0, bright=5000, attack=1.2), lambda t_: 300 + 6000 * (t_ / 2) ** 2, q=3), 50.0, 0.25, bus='gpu_pad')
# 52–56 neural network: future-bass chords, one left→right sweep per activation wave
drop_hit(52.0, [45, 57, 60, 64, 69], 1.0, bus='gpu')
for b in (26, 27):
    t = b * BAR
    K(t, 0.85, 'gpu_drums'); K(t + 0.75, 0.5, 'gpu_drums')
    M.add(snare(1.4), t + 1.0, 0.6, bus='gpu_drums'); M.add(clap(), t + 1.0, 0.5, bus='gpu_drums')
    for k in range(8): M.add(hat(gain=0.8), t + k * 0.25, 0.3, pan=0.3, bus='gpu_drums')
    M.add(sub_bass(rt(GPU[b]), BAR), t, 0.45, bus='gpu_bass')
    for q in range(4):                                   # chord swells that bloom on every beat
        M.add(lp_sweep(stab(ct(GPU[b]) + [ct(GPU[b])[1] + 12, ct(GPU[b])[0] + 24], 0.45, 7000), lambda t_: 600 + 7000 * np.clip(t_ * 6, 0, 1), q=1.2), t + q * BEAT, 0.3, bus='gpu_stab')
motif(52.0, notes=MOTIF[10:], bus='gpu_lead', g=0.22)
for n in range(4):
    M.add(whoosh(0.85, 900, 9000), 52.1 + n, 0.35, pan=np.array([-0.95, 0.95]), bus='gpu_fx')
roll(55.5, 56.0, 0.2, 0.5, 'gpu_drums', inst=lambda: tom(45))

# =============================================================== 56–72  FPGA: acid techno pipeline
FP = {b: ['Am', 'F', 'C', 'G'][(b - 28) % 4] for b in range(28, 36)}
K(56.0, 0.8, 'fpga_drums'); M.add(crash(2.2), 56.0, 0.3, bus='fpga_drums')
PENTA = [69, 72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96, 98, 100, 103, 105, 108]
for k in range(EV['ncfg']):                              # one blip per configured logic block, panned along the route
    pan = -0.85 + 1.7 * FPGA_COLS[k] / 11
    M.add(bleep(PENTA[k], 0.1), EV['cfg0'] + k * 0.25, 0.2, pan=pan, bus='fpga_blip')
    M.add(rim(), EV['cfg0'] + k * 0.25, 0.25, pan=pan, bus='fpga_drums')
ACID = [(0, 0.0), (0, 0.0), (12, 1.0), (0, 0.0), (7, 0.3), (0, 0.0), (10, 1.0), (12, 0.0),
        (0, 0.0), (3, 0.6), (0, 0.0), (12, 1.0), (0, 0.0), (7, 0.0), (5, 0.6), (3, 0.0)]
for b in range(28, 36):
    r = rt(FP[b]) + 12
    u = (b - 28) / 8
    for k, (iv, acc) in enumerate(ACID):
        M.add(acid(r + iv, 0.125, acc, cutoff=250 + 1400 * u, envamt=900 + 2400 * u, q=7 + 3 * u), b * BAR + k * 0.125, 0.5, bus='fpga_acid')
    for q in range(4):
        t = b * BAR + q * BEAT
        K(t, 0.62 if b < 31 else 0.78, 'fpga_drums')
        M.add(hat(gain=1.0), t + 0.25, 0.35, pan=0.25, bus='fpga_drums')
        if b >= 31:                                       # packets step on every beat: clank
            M.add(anvil(88), t, 0.12, pan=0.3 * (-1) ** q, bus='fpga_drums')
            if q % 2: M.add(clap(), t, 0.45, bus='fpga_drums')
        for s in range(4): M.add(rim(), t + s * 0.125 + 0.0625, 0.06, pan=-0.4, bus='fpga_drums')
pads(28, 36, FP.get, 'fpga_pad', 0.1, 1200)
motif(64.0, notes=MOTIF[:10], g=0.13, bus='fpga_lead', octave=-12)
motif(68.0, notes=MOTIF[10:], g=0.16, bus='fpga_lead')
M.add(riser(4.0, 300, 11000), 68.0, 0.2, bus='fpga_fx')
roll(70.0, 72.0, 0.08, 0.5, 'fpga_drums')

# =============================================================== 72–84  euphoric anthem (key change ↑ B minor)
CO = {36: 'Bm', 37: 'G', 38: 'D', 39: 'A', 40: 'Bm', 41: 'A'}
drop_hit(72.0, [47, 59, 62, 66, 71], 1.3, bus='coop')
four_floor(36, 42, 'coop_drums', clap_from=36, kick_g=0.85)
bassline(36, 42, CO.get, 'coop_bass', pattern=(0, 12, 0, 12, 0, 12, 7, 12), bright=1100)
for b in range(36, 42):
    c = ct(CO[b]); voic = c + [c[0] + 12, c[1] + 12]
    for q in range(4):
        M.add(stab(voic, 0.42, 6500), b * BAR + q * BEAT + 0.25, 0.28, bus='coop_stab')
    M.add(strings(voic, BAR + 0.1, bright=3500, attack=0.1, spread=0.35), b * BAR, 0.14, bus='coop_pad')
arps(36, 42, CO.get, 'coop_arp', octave=24, g=0.13)
motif(72.0, transpose=2, g=0.24, bus='coop_lead')
motif(80.0, transpose=2, notes=MOTIF[:10], g=0.2, bus='coop_lead', octave=12)
for k in range(24):
    t = 72.0 + k * BEAT; c = ct(CO[int(t // BAR)])
    M.add(bleep(c[k % 3] + 24, 0.07), t, 0.12, pan=-0.75, bus='coop_blip')
    M.add(bleep(c[(k + 1) % 3] + 28, 0.07), t, 0.1, pan=0.75, bus='coop_blip')
for b in (36, 38, 40): M.add(crash(2.0), b * BAR, 0.3, bus='coop_drums')
M.add(riser(2.0, 300, 12000), 82.0, 0.22, bus='coop_fx')
roll(83.0, 84.0, 0.1, 0.55, 'coop_drums')

# =============================================================== 84–90  finale: A major, arpeggio winds down
drop_hit(84.0, [45, 57, 61, 64, 69], 1.1, bus='fin')
M.add(strings([57, 61, 64, 69], 5.6, bright=2000, attack=0.4, release=1.2, spread=0.3), 84.0, 0.22, bus='fin_pad')
fin = Mix()
for k in range(40):
    m = [69, 73, 76, 81, 76, 73][k % 6] + (12 if k % 12 == 9 else 0)
    fin.add(arp_pluck(m, 0.16, 3000), 84.25 + k * 0.125, 0.4 * (1 - k / 40) ** 1.3, pan=0.5 * np.sin(k * 0.6), bus='f_arp')
s0 = ns(84.25)
for X, p in ((fin.L['f_arp'], -0.3), (fin.R['f_arp'], 0.3)):
    seg = X[s0:]
    M.add(lp_sweep(seg, lambda t_: 6000 * (300 / 6000) ** np.clip(t_ / 5.5, 0, 1), q=1.5), 84.25, 0.6, pan=p, bus='fin_arp')
M.add(celesta(93, 1.6), 88.0, 0.08, pan=0.4, bus='fin_bell')
M.add(power_down(1.5, 300, 30), 88.3, 0.15, bus='fin_fx')

# =============================================================== mix
M.tape_stop('cpu_', EV['wall'], dur=0.8, curve=1.4)
M.cut('split_', 37.8, fade=0.03)
SENDS = {'pad': 0.3, 'arp': 0.25, 'bell': 0.45, 'blip': 0.35, 'stab': 0.2, 'lead': 0.25, 'drums': 0.08, 'hit': 0.2,
         'fx': 0.3, 'bass': 0.0, 'acid': 0.06, 'gate': 0.15, 'tick': 0.15}
DUCK = {'pad': 0.6, 'arp': 0.4, 'stab': 0.5, 'bass': 0.55, 'lead': 0.2, 'gate': 0.5, 'acid': 0.4}
DELAY = {'arp': (0.375, 0.45, 0.3), 'bell': (0.375, 0.45, 0.35), 'blip': (0.25, 0.4, 0.35), 'lead': (0.375, 0.3, 0.2)}
FADERS = {'arp': 3, 'pad': 6, 'stab': 2, 'lead': 4, 'bass': -1, 'acid': 2, 'gate': 2, 'bell': 2, 'blip': 0, 'drums': 0, 'hit': 0, 'fx': -2, 'tick': 0}
AUTO = [(0, -10), (7.6, -8), (8.0, -2), (11.9, -3), (12.0, -5), (14.25, -2), (16.0, -5), (20.0, -4), (23.9, 0),
        (24.0, -1), (24.8, -10), (26.7, -8), (26.88, -2), (27.6, -9), (31.5, -7), (33.9, -4),
        (34.0, -8), (37.8, 0), (38.0, 0), (43.9, 0), (44.0, -6), (45.9, -4), (46.0, -1), (49.9, -1),
        (50.0, -7), (51.9, -3), (52.0, 0), (55.9, 0), (56.0, -4), (61.9, -4), (62.0, -2), (71.9, 0),
        (72.0, 1), (83.9, 1.5), (84.0, 0), (86.0, -4), (90, -9)]
if __name__ == '__main__':
    out = M.render(SENDS, DUCK, rt60=2.0, delays=DELAY, faders=FADERS, automation=AUTO)
    write('music.wav', out)
    print('wrote music.wav')
