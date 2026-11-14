import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { embedWatermark, verifyWatermark, findSmartTagPositions, mixProducerTag, encodeWav24 } from '../source/modules/audio-protection.mjs';
if (!globalThis.crypto) globalThis.crypto = webcrypto;

const sr = 44100;
function music(seconds = 12, sampleRate = sr) {
  const x = new Float32Array(Math.floor(seconds * sampleRate));
  let rnd = 12345678;
  for (let i = 0; i < x.length; i++) {
    rnd ^= rnd << 13; rnd ^= rnd >>> 17; rnd ^= rnd << 5;
    const t = i / sampleRate;
    const beat = Math.exp(-((t * 2) % 1) * 15);
    const notes = Math.sin(2*Math.PI*220*t) + .5 * Math.sin(2*Math.PI*330*t)
      + .25 * Math.sin(2*Math.PI*880*t) + .1 * Math.sin(2*Math.PI*1760*t);
    x[i] = (.14*notes + .05*beat*((rnd/0x7fffffff)) + .025*(rnd/0x7fffffff));
  }
  return [x];
}
const config = { sampleRate: sr, owner: 'CrookzFakinBeatz', assetId: 'TRACK-2026-001', secret: 'secret-passphrase-strong-1234' };

test('watermark embeds and verifies on 12 s synthetic beat', async () => {
  const channels = music();
  const tagged = await embedWatermark({ channels, ...config });
  const positive = await verifyWatermark({ channels: tagged.channels, ...config });
  const negative = await verifyWatermark({ channels, ...config });
  const bad = await verifyWatermark({ channels: tagged.channels, ...config, secret: 'wrong-passphrase-123456' });
  console.log({ positive, negative, bad });
  assert.equal(positive.detected, true, 'Watermarked copy should be detected');
  assert.equal(negative.detected, false, 'Original should not be detected');
  assert.equal(bad.detected, false, 'Wrong secret should not match');
  const length = channels[0].length;
  assert.equal(tagged.channels[0].length, length);
  const error = Math.sqrt(channels[0].reduce((sum, original, index) => sum + (original - tagged.channels[0][index])**2, 0) / length);
  console.log('RMS watermark alteration:', error);
  assert.ok(error < .03, 'Watermark should keep distortion small');
});

test('smart placement is within bounds, producer tag produces waveform', async () => {
  const channels = music();
  const tag = music(1.6);
  const positions = findSmartTagPositions(channels, sr, 1.6, 'smart');
  assert.ok(positions.length > 0 && positions[0] >= 0 && positions[0] < 11);
  const combined = mixProducerTag({ channels, sampleRate: sr, tagChannels: tag, tagSampleRate: sr, positions });
  assert.equal(combined[0].length, channels[0].length);
  assert.ok(combined[0].some((x, i) => x !== channels[0][i]));
  const wav = encodeWav24(combined, sr);
  assert.equal(wav.size, 44 + channels[0].length * 3);
});

test('WAV 24-bit export has BWF and INFO metadata when supplied', async () => {
  const source = music(8);
  const wav = encodeWav24(source, sr, {
    owner: 'CrookzFakinBeatz', title: 'Dark Beat', deliveryId: 'PULSE-ABC', recipient: 'Label A',
    isrc: 'CZABC2600001', generatedAt: '2026-11-14T13:24:40.000Z'
  });
  const bytes = new Uint8Array(await wav.arrayBuffer());
  assert.equal(String.fromCharCode(...bytes.slice(0, 4)), 'RIFF');
  const decoded = new DataView(bytes.buffer);
  assert.equal(decoded.getUint32(4, true) + 8, bytes.byteLength);
  const text = Buffer.from(bytes).toString('latin1');
  assert.ok(text.includes('bext'));
  assert.ok(text.includes('LIST'));
  assert.ok(text.includes('CrookzFakinBeatz'));
  assert.ok(text.includes('Dark Beat'));
  assert.ok(text.includes('PULSE-ABC'));
  assert.ok(text.includes('2026-11-14'));
  assert.ok(text.includes('13:24:40'));
});

test('public preview cuts content with fade-out and periodic marks are optional', async () => {
  const { cutPublicPreview, addPeriodicMark } = await import('../source/modules/audio-protection.mjs');
  const source = music(40);
  const copy = cutPublicPreview(source, sr, 30);
  assert.equal(copy[0].length, sr * 30);
  assert.equal(Math.abs(copy[0].at(-1)), 0);
  assert.equal(source[0].length, sr * 40, 'Original must remain unchanged');
  const clean = addPeriodicMark(copy, sr, { mode: 'off' });
  assert.deepEqual(clean, copy);
  const marked = addPeriodicMark(copy, sr, { mode: 'tone', interval: 28, volume: .05 });
  assert.ok(marked[0].some((x, i) => x !== clean[0][i]));
});
