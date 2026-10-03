"""Nowcast engine. Baseline = optical-flow advection + lifecycle growth + logistic lightning head.
Replace predict() with TaditNet (transformer / ConvLSTM / U-Net); keep the same outputs."""
import numpy as np
from .sim import N, XX, YY, LEAD, STEP, VILLAGES, blur

def shift(a, dx, dy):
    xs, ys = XX - dx, YY - dy
    x0, y0 = np.floor(xs).astype(int), np.floor(ys).astype(int)
    fx, fy = xs - x0, ys - y0
    def g(y, x):
        m = (x >= 0) & (x < N) & (y >= 0) & (y < N)
        return np.where(m, a[np.clip(y, 0, N - 1), np.clip(x, 0, N - 1)], 0)
    return (g(y0, x0) * (1 - fx) * (1 - fy) + g(y0, x0 + 1) * fx * (1 - fy)
            + g(y0 + 1, x0) * (1 - fx) * fy + g(y0 + 1, x0 + 1) * fx * fy)

def motion(f_new, f_old, steps=2):
    best, bx, by = 1e18, 0., 0.
    for dx in np.arange(-3, 3.01, .1):
        for dy in np.arange(-2, 2.01, .1):
            e = np.mean((shift(f_old, dx, dy) - f_new) ** 2)
            if e < best: best, bx, by = e, dx, dy
    return bx / steps, by / steps

def predict(hist, cape):
    z = [h["z"] for h in hist]; bt = hist[-1]["bt"]
    vx, vy = motion(z[-1], z[-3])
    tend = blur(z[-1] - z[-3], 2) / 2
    pts = hist[-1]["ltg"]
    dens = blur(np.histogram2d([p[1] for p in pts] or [0], [p[0] for p in pts] or [0], bins=N, range=[[0, N], [0, N]])[0], 1)
    fz, fp, terms = [], [], []
    for k in range(1, LEAD + 1):
        a = shift(z[-1], vx * k, vy * k)
        grow = shift(tend, vx * k, vy * k) * k * np.exp(-k / 5) * .8
        env = shift(cape, vx * k, vy * k)
        f = np.clip(a + grow + 3 * np.clip((env - 1500) / 1500, -1, 1) * (a > 20) * np.exp(-k / 6), 0, 75)
        f = blur(f, k // 3) if k > 2 else f
        f = np.where(f < 8, 0, f)
        b = shift(bt, vx * k, vy * k)
        t = dict(z=.14 * f, bt=.02 * np.clip(250 - b, 0, None), cape=.0006 * (env - 1000), ltg=.35 * shift(dens, vx * k, vy * k))
        p = 1 / (1 + np.exp(-(-7.5 + sum(t.values())))) * (1 - .02 * k)
        fz.append(f); fp.append(blur(p, k // 3) if k > 2 else p); terms.append(t)
    return fz, fp, (vx, vy), terms

def cells_of(z, ltg_hist, v):
    lab = np.zeros((N, N), int); out = []
    for j, i in zip(*np.nonzero(z >= 35)):
        if lab[j, i]: continue
        lab[j, i] = 1; st, pts = [(j, i)], []
        while st:
            a, b = st.pop(); pts.append((a, b))
            for da, db in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                c, d = a + da, b + db
                if 0 <= c < N and 0 <= d < N and z[c, d] >= 35 and not lab[c, d]: lab[c, d] = 1; st.append((c, d))
        if len(pts) < 3: continue
        ys, xs = [q[0] for q in pts], [q[1] for q in pts]; cx, cy = np.mean(xs), np.mean(ys)
        cnt = [sum(1 for p in h if np.hypot(p[0] - cx, p[1] - cy) < 4) for h in ltg_hist[-5:]]
        jump = len(cnt) > 2 and cnt[-1] >= 6 and cnt[-1] > np.mean(cnt[:-1]) + 2 * np.std(cnt[:-1])
        mx = int(z[ys, xs].max())
        out.append(dict(id=f"C{len(out) + 1}", x=round(float(cx), 1), y=round(float(cy), 1), max=mx, area=len(pts) * 25,
                        speed=int(round(np.hypot(*v) * 30)), dir=int(np.degrees(np.arctan2(v[0], -v[1])) % 360),
                        sev="severe" if mx >= 50 else "moderate", flashes=cnt[-1], jump=bool(jump)))
    return out

def villages(fp, conf):
    out = []
    for name, x, y, pop, sch, farm, pw in VILLAGES:
        s = [int(round(100 * fp[k][max(0, y - 1):y + 2, max(0, x - 1):x + 2].max())) for k in range(LEAD)]
        m = max(s); kp = s.index(m); eta = next((i + 1 for i, v in enumerate(s) if v >= 50), None)
        expo = min(1, .5 * pop / 4000 + .15 * sch + .25 * min(1, farm / 400) + .1 * pw)
        score = m * (.6 + .8 * expo) * conf[kp]
        lv = "red" if score >= 70 else "orange" if score >= 50 else "yellow" if score >= 30 else "green"
        v = dict(name=name, x=x, y=y, pop=pop, schools=sch, farm=farm, power=pw, series=s, peak=m, eta=eta and eta * STEP,
                 exposure=round(expo, 2), score=int(score), level=lv)
        if lv != "green":
            w = f"in about {v['eta']} minutes" if eta else f"within {LEAD * STEP} minutes"
            sev = dict(red="Severe", orange="Moderate", yellow="Minor")[lv]
            v["text"] = dict(en=f"{name}: thunderstorm and lightning likely {w}. Stay out of open fields and take shelter in a pucca building.",
                             hi=f"{name}: {'लगभग ' + str(v['eta']) + ' मिनट में' if eta else 'अगले 3 घंटे में'} तड़ित-झंझावात की संभावना। खुले में न रहें, पक्के भवन में शरण लें।")
            v["cap"] = (f'<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2"><identifier>TN-{name}-{v["eta"] or 0}</identifier>'
                        f'<sender>nowcast@imd.gov.in</sender><status>Draft</status><msgType>Alert</msgType><scope>Public</scope>'
                        f'<info><category>Met</category><event>Thunderstorm and lightning</event><urgency>Expected</urgency>'
                        f'<severity>{sev}</severity><certainty>Likely</certainty><headline>{v["text"]["en"]}</headline>'
                        f'<area><areaDesc>{name}</areaDesc></area></info></alert>')
        out.append(v)
    return sorted(out, key=lambda v: -v["score"])

def verify(fz, T, thr=35):
    d = lambda a, b: round(float(a / b), 2) if b else None
    o = dict(pod=[], far=[], csi=[])
    for k in range(1, LEAD + 1):
        f, t = fz[k - 1] >= thr, T[k] >= thr
        h, m, fa = int((f & t).sum()), int((~f & t).sum()), int((f & ~t).sum())
        o["pod"].append(d(h, h + m)); o["far"].append(d(fa, h + fa)); o["csi"].append(d(h, h + m + fa))
    return o
