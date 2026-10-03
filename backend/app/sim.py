"""Synthetic observing system: 2 radars, geostationary IR, lightning network, NWP CAPE."""
import numpy as np

N, STEP, HIST, LEAD = 48, 10, 6, 18          # 48x48 grid, 5 km cells, 10-min steps
RADARS = [(9, 14), (37, 33)]                 # grid positions
RANGE = 19                                   # radar range in cells (130 km)
YY, XX = np.mgrid[0:N, 0:N].astype(float)
SCEN = {
    "squall":   dict(n=6, v=(.85, .12), pk=(52, 64), life=7, line=True),
    "isolated": dict(n=3, v=(.55, .08), pk=(46, 60), life=9, line=False),
    "weak":     dict(n=4, v=(.60, -.10), pk=(34, 46), life=5, line=False),
}

def blur(a, n=1):
    for _ in range(n):
        a = (a + np.roll(a, 1, 0) + np.roll(a, -1, 0) + np.roll(a, 1, 1) + np.roll(a, -1, 1)) / 5
    return a

def make_cells(scn, seed):
    p, r = SCEN[scn], np.random.default_rng(seed)
    cells = []
    for i in range(p["n"]):
        cells.append(dict(
            x=r.uniform(0, 14), y=(10 + i * 5 + r.uniform(-2, 2)) if p["line"] else r.uniform(6, 42),
            vx=p["v"][0] + r.normal(0, .08), vy=p["v"][1] + r.normal(0, .06),
            pk=r.uniform(*p["pk"]), tpk=r.uniform(-1, 5), life=p["life"] * r.uniform(.8, 1.2),
            s=r.uniform(1.7, 2.8)))
    return cells

def truth(cells, k):
    z = np.zeros((N, N))
    for c in cells:
        cx, cy = c["x"] + c["vx"] * (k + HIST), c["y"] + c["vy"] * (k + HIST)
        amp = c["pk"] * np.exp(-((k - c["tpk"]) / c["life"]) ** 2)
        z = np.maximum(z, amp * np.exp(-((XX - cx) ** 2 + (YY - cy) ** 2) / (2 * c["s"] ** 2)))
    return np.where(z < 8, 0, z)

def radar_obs(z, r):
    out = np.zeros((N, N))
    for rx, ry in RADARS:
        d = np.hypot(XX - rx, YY - ry)
        o = np.where(d < RANGE, z * (1 - .3 * d / RANGE) + r.normal(0, 1.5, z.shape), 0)
        out = np.maximum(out, o)
    return np.clip(out, 0, 75)

def sat_bt(z, r):
    c = blur(z, 3)
    c = np.maximum(c, np.roll(c, 2, 1) * .8)                     # downwind anvil
    return np.clip(290 - np.clip(c * 3.6, 0, 85) + r.normal(0, 1, z.shape), 200, 295)

def lightning(z, r):
    cnt = r.poisson(.05 * np.clip(z - 30, 0, None) ** 1.4)
    pts = []
    for j, i in zip(*np.nonzero(cnt)):
        for _ in range(min(int(cnt[j, i]), 6)):
            pts.append([round(i + r.uniform(-.5, .5), 2), round(j + r.uniform(-.5, .5), 2)])
    return pts

def cape_field(z0):
    c = 1500 + 700 * np.sin(XX / 12) + 500 * np.cos(YY / 9) - 25 * blur(z0, 3)
    return np.clip(c, 200, 3500)

COV = np.zeros((N, N), bool)
for _rx, _ry in RADARS: COV |= np.hypot(XX - _rx, YY - _ry) < RANGE
# name, x, y, population, schools, farm_ha, power_line
VILLAGES = [("Dhanaura",16,12,2400,1,320,0),("Kherli",20,17,5200,2,150,1),("Sitapura",24,22,1800,1,540,0),("Barwara",18,27,3600,2,260,1),
            ("Nimoda",26,32,900,0,610,0),("Jhalra",22,37,4100,1,180,1),("Rampur",32,20,1500,1,420,0),("Chandpur",30,40,700,0,380,0)]
POWER = [[0,31],[18,27],[34,29],[48,36]]

def observe(scn, seed):
    cells, r = make_cells(scn, seed), np.random.default_rng(seed + 1)
    T = {k: truth(cells, k) for k in range(-HIST, LEAD + 1)}
    hist = []
    for k in range(-HIST, 1):
        rad, bt = radar_obs(T[k], r), sat_bt(T[k], r)
        vr = np.clip((290 - bt) / 3.6 * 2.2 - 10, 0, 60)           # virtual radar: IR cloud-top -> reflectivity
        hist.append(dict(z=np.where(COV, rad, np.where(vr < 8, 0, vr)), bt=bt, ltg=lightning(T[k], r)))
    return hist, cape_field(T[0]), T
