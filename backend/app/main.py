from functools import lru_cache
from pathlib import Path
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from . import sim, nowcast

app = FastAPI(title="TaditNetra demo API", version="0.1.0")
I = lambda a: np.rint(a).astype(int).tolist()

@app.get("/healthz", include_in_schema=False)
def healthz():
    return {"status": "ok"}

@lru_cache(8)
def state(scn, seed):
    if scn not in sim.SCEN: raise HTTPException(400, "unknown scenario")
    hist, cape, T = sim.observe(scn, seed)
    fz, fp, v, terms = nowcast.predict(hist, cape)
    return hist, cape, T, fz, fp, v, terms

@app.get("/api/run")
def run(scenario: str = "squall", seed: int = 7):
    hist, cape, T, fz, fp, v, _ = state(scenario, seed)
    conf = [round(max(.35, 1 - .04 * (k + 1)), 2) for k in range(sim.LEAD)]
    return dict(
        meta=dict(n=sim.N, step=sim.STEP, hist=sim.HIST, lead=sim.LEAD, ai_lead=12, cell_km=5, vel=[float(v[0]), float(v[1])],
                  radars=sim.RADARS, radar_range=sim.RANGE, cov=sim.COV.astype(int).tolist(), power=sim.POWER, conf=conf),
        hist=dict(z=[I(h["z"]) for h in hist], bt=[I(h["bt"]) for h in hist], strikes=[h["ltg"] for h in hist]),
        cape=I(cape), fc=dict(z=[I(f) for f in fz], p=[I(100 * p) for p in fp]),
        cells=nowcast.cells_of(hist[-1]["z"], [h["ltg"] for h in hist], v),
        villages=nowcast.villages(fp, conf), verify=nowcast.verify(fz, T))

@app.get("/api/explain")
def explain(scenario: str, seed: int, x: int, y: int, lead: int = 1):
    *_, fp, v, terms = state(scenario, seed)
    k = max(1, min(sim.LEAD, lead)) - 1; x = max(0, min(sim.N - 1, x)); y = max(0, min(sim.N - 1, y))
    c = {n: round(float(a[y, x]), 2) for n, a in terms[k].items()}
    return dict(base=-7.5, terms=c, p=int(round(100 * fp[k][y, x])))

app.mount("/", StaticFiles(directory=Path(__file__).resolve().parents[2] / "frontend", html=True), name="web")
