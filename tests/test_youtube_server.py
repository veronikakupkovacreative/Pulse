"""Offline integration tests: real FFmpeg, simulated permitted audio source."""
import json
import math
from pathlib import Path
import shutil
import struct
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request
import wave
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server

VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'


def fixture_extract(url, directory=None):
    info = {
        'title': 'Pulse integration test', 'duration': 8,
        'acodec': 'pcm_s16le', 'vcodec': 'none', 'ext': 'wav',
        'abr': 192, 'asr': 48000, 'format_id': 'fixture'
    }
    if directory:
        with wave.open(str(Path(directory) / 'source.wav'), 'wb') as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(48000)
            frames = bytearray()
            for i in range(48000):  # 1 sec is enough for conversion testing
                frames.extend(struct.pack('<h', int(5000 * math.sin(2 * math.pi * 440 * i / 48000))))
            w.writeframes(frames)
    return info


class YoutubeTests(unittest.TestCase):
    def tearDown(self):
        with server.JOB_LOCK:
            jobs = list(server.JOBS.values())
            server.JOBS.clear()
        for job in jobs:
            shutil.rmtree(job['directory'], ignore_errors=True)

    def test_url_validation(self):
        self.assertEqual(server.normalize_youtube_url(VIDEO), VIDEO)
        self.assertEqual(server.normalize_youtube_url('https://youtu.be/dQw4w9WgXcQ?t=5'), VIDEO)
        self.assertEqual(server.normalize_youtube_url('https://www.youtube.com/shorts/dQw4w9WgXcQ'), VIDEO)
        # URLs pasted from YouTube without the scheme or with radio/playlist
        # parameters are one-video links, not whole playlists.
        self.assertEqual(server.normalize_youtube_url('youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ&start_radio=1'), VIDEO)
        self.assertEqual(server.normalize_youtube_url('www.youtube.com/watch?v=dQw4w9WgXcQ'), VIDEO)
        self.assertEqual(server.normalize_youtube_url('music.youtube.com/watch?v=dQw4w9WgXcQ'), VIDEO)
        self.assertEqual(server.normalize_youtube_url('youtu.be/dQw4w9WgXcQ?si=shared'), VIDEO)
        for invalid in ['http://www.youtube.com/watch?v=dQw4w9WgXcQ',
                        'https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ',
                        'https://www.youtube.com/playlist?list=foo',
                        'file:///etc/passwd',
                        'https://localhost/watch?v=dQw4w9WgXcQ',
                        'https://www.youtube.com/watch?v=dQw4w9WgXcQ123',
                        'youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
                        'http://youtube.com/watch?v=dQw4w9WgXcQ',
                        '//youtube.com/watch?v=dQw4w9WgXcQ']:
            with self.subTest(invalid=invalid), self.assertRaises(server.PulseError):
                server.normalize_youtube_url(invalid)

    @patch.object(server, 'extract_info', fixture_extract)
    def test_all_export_formats(self):
        for format, expected_ext in [('native', 'wav'), ('wav16', 'wav'),
                                     ('wav24', 'wav'), ('mp3', 'mp3'), ('m4a', 'm4a'), ('flac', 'flac')]:
            with self.subTest(format=format):
                data = server.prepare_download(VIDEO, format)
                job = server.JOBS[data['id']]
                self.assertTrue(job['path'].is_file())
                self.assertTrue(data['filename'].endswith('.' + expected_ext))
                if format.startswith('wav') or format == 'native':
                    with wave.open(str(job['path']), 'rb') as w:
                        self.assertEqual(w.getframerate(), 48000)
                        self.assertEqual(w.getsampwidth(), 3 if format == 'wav24' else 2)
                else:
                    self.assertGreater(job['path'].stat().st_size, 1000)
                if format == 'flac':
                    self.assertEqual(job['path'].read_bytes()[:4], b'fLaC')
                if format == 'm4a':
                    self.assertIn(b'ftyp', job['path'].read_bytes()[:24])

    @patch.object(server, 'extract_info', fixture_extract)
    @patch.object(server, 'dependencies', lambda: [])
    def test_http_info_download_and_file(self):
        httpd = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        port = httpd.server_port
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/youtube/health') as response:
                self.assertTrue(json.load(response)['ready'])
            def post(endpoint, payload):
                request = urllib.request.Request(
                    f'http://127.0.0.1:{port}/api/youtube/{endpoint}',
                    data=json.dumps(payload).encode(),
                    headers={'Content-Type': 'application/json', 'X-Pulse-Request': '1'},
                    method='POST')
                with urllib.request.urlopen(request, timeout=15) as response:
                    return json.load(response)
            self.assertEqual(post('info', {'url': VIDEO})['source']['codec'], 'pcm_s16le')
            result = post('download', {'url': VIDEO, 'format': 'wav24'})
            with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/youtube/file/{result["id"]}') as response:
                self.assertEqual(response.headers.get_content_type(), 'audio/wav')
                body = response.read()
                self.assertEqual(len(body), result['bytes'])
                self.assertTrue(body.startswith(b'RIFF'))
        finally:
            httpd.shutdown()
            httpd.server_close()
            thread.join(timeout=4)

if __name__ == '__main__':
    unittest.main()
