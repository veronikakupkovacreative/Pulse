"""Cloud API for the Pulse Studio front end.

Run behind a managed HTTPS host (e.g. Railway).  The Pulse web app remains
static on Vercel; only approved YouTube import requests reach this service.
"""
from __future__ import annotations

from collections import defaultdict, deque
from contextlib import asynccontextmanager
import mimetypes
import os
from pathlib import Path
import threading
import time

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from server import (
    JOBS, JOB_LOCK, JOB_ID, PulseError, cleanup, dependencies,
    extract_info, normalize_youtube_url, prepare_download, public_info,
)

DEFAULT_ORIGINS = 'https://pulse-rose-theta-57.vercel.app,http://localhost:3000,http://127.0.0.1:8000'
ORIGINS = [item.strip().rstrip('/') for item in
           os.environ.get('PULSE_ALLOWED_ORIGINS', DEFAULT_ORIGINS).split(',') if item.strip()]
MAX_ACTIVE_DOWNLOADS = 2
active_downloads = threading.BoundedSemaphore(MAX_ACTIVE_DOWNLOADS)
RATE_WINDOW = 15 * 60
requests_by_client = defaultdict(deque)
rate_lock = threading.Lock()

app = FastAPI(title='Pulse Studio Audio API', docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINS,
    allow_credentials=False,
    allow_methods=['GET', 'POST'],
    allow_headers=['Content-Type', 'X-Pulse-Request'],
)


class YoutubeInput(BaseModel):
    url: str = Field(min_length=10, max_length=2048)
    format: str | None = None


def protect_request(request: Request, kind: str):
    origin = request.headers.get('origin', '').rstrip('/')
    if origin not in ORIGINS or request.headers.get('x-pulse-request') != '1':
        raise HTTPException(403, detail='Požadavek není povolen.')
    client = request.client.host if request.client else 'anonymous'
    # Basic resource protection, not a substitute for edge rate limiting.
    budget = 30 if kind == 'info' else 6
    now = time.monotonic()
    key = (client, kind)
    with rate_lock:
        hits = requests_by_client[key]
        while hits and hits[0] < now - RATE_WINDOW:
            hits.popleft()
        if len(hits) >= budget:
            raise HTTPException(429, detail='Příliš mnoho požadavků. Zkus to později.')
        hits.append(now)


def raise_service_error(exc: Exception):
    if isinstance(exc, PulseError):
        raise HTTPException(400, detail=str(exc)) from exc
    # External extractor errors should not disclose internal stack details.
    print('[pulse-cloud] download failed:', type(exc).__name__, str(exc)[:180], flush=True)
    raise HTTPException(502, detail='YouTube audio momentálně nelze načíst. Video může být omezené nebo služba YouTube změnila způsob přístupu.') from exc


@app.get('/api/youtube/health')
def health():
    missing = dependencies()
    return {'ready': not missing, 'cloud': True, 'missing': missing}


@app.post('/api/youtube/info')
def info(data: YoutubeInput, request: Request):
    protect_request(request, 'info')
    cleanup()
    try:
        url = normalize_youtube_url(data.url)
        return {'source': public_info(extract_info(url))}
    except Exception as exc:
        raise_service_error(exc)


@app.post('/api/youtube/download')
def download(data: YoutubeInput, request: Request):
    protect_request(request, 'download')
    cleanup()
    # 20-min track, max 420 MB WAV; keep memory and disk use bounded.
    if not active_downloads.acquire(blocking=False):
        raise HTTPException(429, detail='Služba právě zpracovává další tracky. Zkus to za chvíli.')
    try:
        url = normalize_youtube_url(data.url)
        with JOB_LOCK:
            if len(JOBS) >= 12:
                raise HTTPException(503, detail='Úložiště je dočasně vytížené. Zkus to za chvíli.')
        return prepare_download(url, data.format)
    except HTTPException:
        raise
    except Exception as exc:
        raise_service_error(exc)
    finally:
        active_downloads.release()


@app.get('/api/youtube/file/{token}')
def file(token: str):
    cleanup()
    if not JOB_ID.fullmatch(token):
        raise HTTPException(404, detail='Soubor nenalezen.')
    with JOB_LOCK:
        job = JOBS.get(token)
    if not job or not Path(job['path']).is_file():
        raise HTTPException(404, detail='Soubor již není dostupný. Připrav ho znovu.')
    path = Path(job['path'])
    mime = 'audio/wav' if path.suffix.lower() == '.wav' else (mimetypes.guess_type(str(path))[0] or 'application/octet-stream')
    return FileResponse(path, filename=job['name'], media_type=mime, headers={
        'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    })


@app.exception_handler(HTTPException)
async def http_errors(request: Request, exc: HTTPException):
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=exc.status_code, content={'error': exc.detail})
