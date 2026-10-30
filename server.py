"""Local-only Pulse Studio server for authorized YouTube audio downloads.

Static BPM/Key/Converter/Loop tools work without this server; YouTube import
uses yt-dlp and FFmpeg here because browsers cannot fetch YouTube streams.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import mimetypes
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import tempfile
import threading
import time
from urllib.parse import parse_qs, quote, urlparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parent
MAX_DURATION = 20 * 60
MAX_NATIVE_BYTES = 200 * 1024 * 1024
MAX_OUTPUT_BYTES = 420 * 1024 * 1024
JOB_TTL = 10 * 60
JOBS = {}
JOB_LOCK = threading.Lock()
VIDEO_ID = re.compile(r'^[A-Za-z0-9_-]{11}$')
JOB_ID = re.compile(r'^[A-Za-z0-9_-]{20,80}$')


class PulseError(Exception):
    pass


def normalize_youtube_url(value):
    if not isinstance(value, str) or len(value) > 2048:
        raise PulseError('Vloz platny odkaz na jedno YouTube video.')
    try:
        raw = value.strip()
        # YouTube share links are often pasted without the scheme. Canonicalize
        # only known hosts; all other inputs are still rejected by the allowlist.
        if re.match(r'^(?:(?:www|m|music)\.)?youtube\.com(?:[/?#]|$)|^youtu\.be(?:[/?#]|$)', raw, re.I):
            raw = 'https://' + raw
        parsed = urlparse(raw)
        host = (parsed.hostname or '').lower()
        if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.port:
            raise ValueError('scheme')
        if host in ('www.youtube.com', 'youtube.com', 'm.youtube.com', 'music.youtube.com'):
            if parsed.path == '/watch':
                vid = parse_qs(parsed.query).get('v', [''])[0]
            elif re.fullmatch(r'/(shorts|live|embed)/[A-Za-z0-9_-]{11}/?', parsed.path):
                vid = parsed.path.strip('/').split('/')[1]
            else:
                vid = ''
        elif host == 'youtu.be':
            vid = parsed.path.strip('/')
        else:
            vid = ''
    except (ValueError, TypeError):
        vid = ''
    if not VIDEO_ID.fullmatch(vid):
        raise PulseError('Vloz odkaz na konkretni YouTube video nebo Short, ne na samostatny playlist.')
    return 'https://www.youtube.com/watch?v=' + vid


def dependencies():
    missing = []
    if importlib.util.find_spec('yt_dlp') is None:
        missing.append('yt-dlp (pip install -r requirements.txt)')
    if not shutil.which('ffmpeg'):
        missing.append('FFmpeg')
    if not shutil.which('deno'):
        missing.append('Deno JavaScript runtime')
    if importlib.util.find_spec('yt_dlp_ejs') is None:
        missing.append('yt-dlp-ejs')
    return missing


def ydl_options(directory=None, video=False):
    options = {
        'format': ('bv*[height<=720][vcodec^=avc1]+ba[ext=m4a]/b[ext=mp4][height<=720]/bv*[height<=720]+ba/b[height<=720]' if video else 'bestaudio'), 'noplaylist': True,
        'quiet': True, 'no_warnings': True, 'retries': 2,
        'fragment_retries': 2, 'socket_timeout': 25,
        'max_filesize': MAX_NATIVE_BYTES,
        'cachedir': False,
    }
    if directory is not None:
        options['outtmpl'] = str(Path(directory) / 'source.%(ext)s')
        if video:
            options['merge_output_format'] = 'mp4'
    return options


def extract_info(url, directory=None, video=False):
    from yt_dlp import YoutubeDL
    with YoutubeDL(ydl_options(directory, video=video)) as ydl:
        info = ydl.extract_info(url, download=(directory is not None))
        if not info or info.get('_type') == 'playlist' or info.get('entries'):
            raise PulseError('Vyber jedno video, ne playlist.')
        if video:
            if info.get('vcodec') in (None, 'none'):
                raise PulseError('Video stream neni dostupny.')
        elif info.get('acodec') == 'none' or info.get('vcodec') not in (None, 'none'):
            raise PulseError('Nebyla nalezena samostatna audio stopa.')
        duration = info.get('duration')
        if not duration or not isinstance(duration, (int, float)) or duration > MAX_DURATION:
            raise PulseError('Video musi mit znamou delku a maximalne 20 minut.')
        return info


def public_info(info):
    return {
        'title': str(info.get('title') or 'YouTube audio')[:200],
        'duration': round(float(info.get('duration') or 0)),
        'codec': str(info.get('acodec') or 'unknown')[:48],
        'bitrate': round(float(info['abr'])) if isinstance(info.get('abr'), (float, int)) else None,
        'sampleRate': int(info['asr']) if isinstance(info.get('asr'), (float, int)) else None,
        'container': str(info.get('ext') or '').upper()[:12],
        'formatId': str(info.get('format_id') or '')[:64],
    }


def safe_filename(title, ext):
    safe = re.sub(r'[\\/\x00-\x1f\x7f<>:"|?*]+', ' ', str(title))
    safe = re.sub(r'\s+', ' ', safe).strip(' .')[:100] or 'Pulse YouTube audio'
    return safe + '.' + ext


def prepare_download(url, output):
    if output not in ('wav24', 'wav16', 'native', 'mp3', 'm4a', 'flac', 'mp4'):
        raise PulseError('Neznamy vystupni format.')
    directory = Path(tempfile.mkdtemp(prefix='pulse-youtube-'))
    try:
        info = extract_info(url, directory, video=True) if output == 'mp4' else extract_info(url, directory)
        candidates = [file for file in directory.iterdir()
                      if file.is_file() and file.name.startswith('source.')
                      and not file.name.endswith(('.part', '.ytdl'))]
        if len(candidates) != 1:
            raise PulseError('YouTube audio se nepodarilo ulozit.')
        original = candidates[0]
        if original.stat().st_size > MAX_NATIVE_BYTES:
            raise PulseError('Zdroj je prilis velky.')
        if output == 'native':
            final = original
            extension = original.suffix.lstrip('.').lower() or 'audio'
        else:
            extension = {'mp3': 'mp3', 'm4a': 'm4a', 'flac': 'flac', 'mp4': 'mp4'}.get(output, 'wav')
            final = directory / ('pulse-output.' + extension)
            if output == 'mp4':
                # MP4 includes video; cap it at 720p upstream. Compatible H.264/AAC.
                # Video transcoding is intentionally bounded to protect CPU and disk.
                maps = ['-map', '0:v:0', '-map', '0:a:0?']
                codec = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24',
                         '-pix_fmt', 'yuv420p', '-threads', '2',
                         '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart']
                deadline = 240
            else:
                maps = ['-map', '0:a:0', '-vn']
                codec = {
                    'mp3': ['-c:a', 'libmp3lame', '-b:a', '320k'],
                    'm4a': ['-c:a', 'aac', '-b:a', '256k'],
                    'flac': ['-c:a', 'flac'],
                    'wav24': ['-c:a', 'pcm_s24le'],
                    'wav16': ['-c:a', 'pcm_s16le'],
                }[output]
                deadline = 120
            args = ['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error',
                    '-y', '-i', str(original), *maps, '-sn', '-dn', *codec, str(final)]
            try:
                result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                        timeout=deadline, check=False)
            except subprocess.TimeoutExpired:
                raise PulseError('Conversion took too long. Try a shorter clip.')
            if result.returncode != 0:
                raise PulseError('FFmpeg could not create the selected format.')
        if not final.exists() or final.stat().st_size == 0:
            raise PulseError('Vysledny soubor je prazdny.')
        if final.stat().st_size > MAX_OUTPUT_BYTES:
            raise PulseError('Output is too large. Try MP3, M4A or a shorter video.')
        token = secrets.token_urlsafe(32)
        job = {'directory': directory, 'path': final, 'name': safe_filename(info.get('title'), extension),
               'created': time.monotonic(), 'meta': public_info(info)}
        with JOB_LOCK:
            JOBS[token] = job
        return {'id': token, 'filename': job['name'], 'bytes': final.stat().st_size,
                'source': job['meta'], 'converted': output != 'native'}
    except Exception:
        shutil.rmtree(directory, ignore_errors=True)
        raise


def cleanup():
    now = time.monotonic()
    expired = []
    with JOB_LOCK:
        for key, job in tuple(JOBS.items()):
            if now - job['created'] > JOB_TTL:
                expired.append(JOBS.pop(key))
    for job in expired:
        shutil.rmtree(job['directory'], ignore_errors=True)


class Handler(SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        print('[pulse]', fmt % args)

    def json_reply(self, code, payload):
        data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        cleanup()
        if self.path == '/api/youtube/health':
            missing = dependencies()
            return self.json_reply(200, {'ready': not missing, 'missing': missing, 'local': True})
        if self.path.startswith('/api/youtube/file/'):
            token = self.path.rsplit('/', 1)[-1]
            if not JOB_ID.fullmatch(token):
                return self.json_reply(404, {'error': 'Soubor nenalezen.'})
            with JOB_LOCK:
                job = JOBS.get(token)
            if not job or not job['path'].is_file():
                return self.json_reply(404, {'error': 'Soubor vyprsel. Stahni ho znovu.'})
            file = job['path']
            mimetype = 'audio/wav' if file.suffix.lower() == '.wav' else (
                mimetypes.guess_type(file.name)[0] or 'application/octet-stream')
            self.send_response(200)
            self.send_header('Content-Type', mimetype)
            self.send_header('Content-Length', str(file.stat().st_size))
            self.send_header('Content-Disposition', "attachment; filename=\"pulse-audio.%s\"; filename*=UTF-8''%s" % (
                file.suffix.lstrip('.') or 'bin', quote(job['name'])))
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            try:
                with file.open('rb') as handle:
                    shutil.copyfileobj(handle, self.wfile, length=1024 * 1024)
            except (ConnectionResetError, BrokenPipeError):
                pass
            return
        if self.path.startswith('/api/'):
            return self.json_reply(404, {'error': 'Neznamy pozadavek.'})
        return super().do_GET()

    def do_POST(self):
        cleanup()
        origin = self.headers.get('Origin', '')
        allowed = ('http://localhost:%s' % self.server.server_port,
                   'http://127.0.0.1:%s' % self.server.server_port)
        if self.headers.get('X-Pulse-Request') != '1' or (origin and origin not in allowed):
            return self.json_reply(403, {'error': 'Pozadavek neni povolen.'})
        if self.path not in ('/api/youtube/info', '/api/youtube/download'):
            return self.json_reply(404, {'error': 'Neznamy pozadavek.'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 4096 or 'application/json' not in self.headers.get('Content-Type', ''):
                raise PulseError('Neplatny pozadavek.')
            payload = json.loads(self.rfile.read(length))
            url = normalize_youtube_url(payload.get('url'))
            missing = dependencies()
            if missing:
                raise PulseError('Chybi zavislosti: ' + ', '.join(missing))
            if self.path.endswith('/info'):
                result = {'source': public_info(extract_info(url))}
            else:
                result = prepare_download(url, payload.get('format'))
            return self.json_reply(200, result)
        except PulseError as exc:
            return self.json_reply(400, {'error': str(exc)})
        except json.JSONDecodeError:
            return self.json_reply(400, {'error': 'Neplatny JSON.'})
        except Exception as exc:
            print('[pulse] External fetch failed:', type(exc).__name__, str(exc)[:200])
            return self.json_reply(502, {'error': 'YouTube nelze nacist. Video muze byt nedostupne, omezene nebo se zmenilo jeho API. Zkus aktualizovat yt-dlp.'})


def main():
    parser = argparse.ArgumentParser(description='Pulse Studio local YouTube helper')
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error('port must be 1024..65535')
    httpd = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    print('Pulse Studio: http://127.0.0.1:%d' % args.port, flush=True)
    print('YouTube helper dependencies:', 'OK' if not dependencies() else ', '.join(dependencies()), flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
        with JOB_LOCK:
            jobs = list(JOBS.values())
            JOBS.clear()
        for job in jobs:
            shutil.rmtree(job['directory'], ignore_errors=True)


if __name__ == '__main__':
    main()
