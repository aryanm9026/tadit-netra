# TaditNetra

TaditNetra is a demonstration storm-monitoring desk for the observe → fuse → forecast → respond workflow. It runs as one FastAPI service: the API serves both the browser interface and the simulation endpoints.

> **Demonstration only:** the radar, satellite, lightning, CAPE, forecast, village, and map-boundary data are simulated or illustrative. This project is not an operational weather service and must not be used to issue public warnings.

## Run locally

Requires Python 3.12 (3.11+ may work) and PowerShell on Windows.

```powershell
cd backend
py -3.12 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

Open <http://127.0.0.1:8000>. The API documentation is at <http://127.0.0.1:8000/docs>, and the service health endpoint is `/healthz`.

## Build and run with Docker

From the repository root:

```sh
docker build -t taditnetra .
docker run --rm -p 8000:8000 taditnetra
```

Open <http://localhost:8000>. The image uses Python 3.12, installs the backend requirements, serves the frontend from the same origin, and runs as a non-root user. The service reads the hosting platform's `PORT` environment variable and listens on `0.0.0.0`.

## Deploy

Deploy the repository as a Docker service using the root `Dockerfile`. Configure the service health check to request `/healthz`; no database or application secrets are required for the demo. The Three.js volume view currently loads Three.js from a CDN, so that view needs browser access to the CDN. The 2D map and API are served by the container.

This repository does not include a provider-specific deployment manifest because the hosting platform has not been selected. Use the platform's Docker deployment option and set the health check path to `/healthz`.

## API

- `GET /api/run?scenario=squall&seed=7` — generate a deterministic demo run.
- `GET /api/explain?scenario=squall&seed=7&x=20&y=20&lead=3` — explain a forecast grid point.
- `GET /healthz` — lightweight service health check.

Supported scenarios are `squall`, `isolated`, and `weak`. Seeds make the simulation repeatable.

## GitHub

The project directory is not currently connected to a GitHub repository. Once a remote repository is created, add it and push the commit from the project root:

```sh
git remote add origin https://github.com/OWNER/REPOSITORY.git
git push -u origin main
```

Keep `.venv`, Python bytecode, and local `.env` files out of commits; `.gitignore` is configured for these files.

## Replacing the simulation with live feeds

- `backend/app/sim.py` creates the synthetic observing feeds and illustrative village coordinates.
- `backend/app/nowcast.py` contains the optical-flow advection and hand-set logistic baseline.
- Replace these pieces with validated operational ingest and forecast systems before using real locations or issuing any alerts.
