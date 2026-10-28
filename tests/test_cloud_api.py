"""Cloud API smoke tests with original, permitted synthetic audio fixture."""
import math
from pathlib import Path
import shutil
import struct
import sys
import unittest
from unittest.mock import patch
import wave

from fastapi.testclient import TestClient
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend import api
import server

VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
HEADERS = {'Origin': 'https://pulse-rose-theta-57.vercel.app', 'X-Pulse-Request': '1'}


def fake_extract(url, directory=None):
    info = {'title': 'Original test melody', 'duration': 8, 'acodec': 'pcm_s16le',
            'vcodec': 'none', 'ext': 'wav', 'abr': 768, 'asr': 48000, 'format_id': 'test'}
    if directory:
        with wave.open(str(Path(directory) / 'source.wav'), 'wb') as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(48000)
            data = bytearray()
            for i in range(48000):
                data += struct.pack('<h', round(4000 * math.sin(2 * math.pi * 440 * i / 48000)))
            w.writeframes(data)
    return info


class CloudApiTests(unittest.TestCase):
    def tearDown(self):
        with server.JOB_LOCK:
            jobs = list(server.JOBS.values())
            server.JOBS.clear()
        for item in jobs:
            shutil.rmtree(item['directory'], ignore_errors=True)

    def test_security_and_cors(self):
        with TestClient(api.app) as client:
            invalid = client.post('/api/youtube/info', json={'url': VIDEO}, headers={
                'Origin': 'https://evil.example', 'X-Pulse-Request': '1'})
            self.assertEqual(invalid.status_code, 403)
            preflight = client.options('/api/youtube/info', headers={
                'Origin': HEADERS['Origin'], 'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'x-pulse-request,content-type'})
            self.assertEqual(preflight.status_code, 200)
            self.assertEqual(preflight.headers['access-control-allow-origin'], HEADERS['Origin'])

    @patch.object(server, 'extract_info', fake_extract)
    @patch.object(api, 'extract_info', fake_extract)
    def test_info_convert_download(self):
        with TestClient(api.app) as client:
            info = client.post('/api/youtube/info', json={'url': VIDEO}, headers=HEADERS)
            self.assertEqual(info.status_code, 200)
            self.assertEqual(info.json()['source']['sampleRate'], 48000)
            result = client.post('/api/youtube/download', json={'url': VIDEO, 'format': 'wav24'}, headers=HEADERS)
            self.assertEqual(result.status_code, 200, result.text)
            output = client.get('/api/youtube/file/'+result.json()['id'])
            self.assertEqual(output.status_code, 200)
            self.assertEqual(output.headers['content-type'], 'audio/wav')
            self.assertTrue(output.content.startswith(b'RIFF'))
            self.assertIn('attachment', output.headers['content-disposition'])


if __name__ == '__main__':
    unittest.main()
