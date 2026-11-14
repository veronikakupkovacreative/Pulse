import {
  embedWatermark, verifyWatermark, findSmartTagPositions,
  mixProducerTag, cutPublicPreview, addPeriodicMark, encodeWav24, sha256File
} from './audio-protection.mjs';

const DEFAULT_TRACK_PREFIX = 'PULSE';
const WATERMARK_RATE = 44100; // Stable spectral layout across browser output devices.
function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
function cleanName(text) { return (text || 'track').replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '-').slice(0, 90); }
function channelsOf(buffer) { return Array.from({ length: Math.min(2, buffer.numberOfChannels) }, (_, i) => new Float32Array(buffer.getChannelData(i))); }
function formatDuration(seconds) { const m = Math.floor(seconds / 60); return `${m}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`; }
function makeId() { return `${DEFAULT_TRACK_PREFIX}-${crypto.randomUUID()}`; }
async function resampleBuffer(source, targetSampleRate = WATERMARK_RATE) {
  if (source.sampleRate === targetSampleRate) return source;
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Offline) throw new Error('OfflineAudioContext is unavailable.');
  const offline = new Offline(Math.min(2, source.numberOfChannels), Math.ceil(source.duration * targetSampleRate), targetSampleRate);
  const node = offline.createBufferSource(); node.buffer = source;
  node.connect(offline.destination); node.start();
  return offline.startRendering();
}
async function readAudio(file, targetSampleRate = WATERMARK_RATE) {
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) throw new Error('This browser does not support Web Audio.');
  const context = new Context();
  try {
    const source = await context.decodeAudioData(await file.arrayBuffer());
    return await resampleBuffer(source, targetSampleRate);
  } finally { await context.close(); }
}
function downloadJson(json, filename) {
  download(new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }), filename);
}

/**
 * Mount in PULSE, providing its existing 01 / SOURCE AUDIO.
 * getSourceAudio: () => { file?: File, buffer: AudioBuffer } | null
 * No separate upload for the song, no remote API keys, no server transfer.
 */
export function mountAudioProtection({ root, getSourceAudio }) {
  if (!(root instanceof HTMLElement) || typeof getSourceAudio !== 'function') {
    throw new Error('Pass a container and getSourceAudio function.');
  }
  root.innerHTML = `
    <section class="pulse-protection" aria-label="Audio protection">
      <div class="ap-heading"><div><span class="ap-kicker">LOCAL PROTECTION / WATERMARK ENGINE</span><h2>Mark your music<span>.</span></h2></div><p>Add a keyed hidden ID and an optional voice tag to the audio already loaded in <strong>01 / SOURCE AUDIO</strong>.</p></div>
      <div class="ap-tabs" role="tablist" aria-label="Audio protection actions">
        <button class="ap-tab active" role="tab" aria-selected="true" id="ap-protect-tab" aria-controls="ap-protect-panel" type="button">01 / Protect</button>
        <button class="ap-tab" role="tab" aria-selected="false" id="ap-verify-tab" aria-controls="ap-verify-panel" type="button">02 / Verify</button>
      </div>
      <div class="ap-panel" id="ap-protect-panel" role="tabpanel" aria-labelledby="ap-protect-tab">
        <div class="ap-source"><span class="ap-label">ACTIVE SOURCE AUDIO</span><strong id="ap-source-name">No source audio loaded</strong><small id="ap-source-detail">Use 01 / SOURCE AUDIO first.</small><div class="ap-source-actions"><button type="button" id="ap-refresh">Refresh source</button></div></div>
        <div class="ap-grid">
          <label>Owner / Producer name<input id="ap-owner" type="text" maxlength="120" autocomplete="off" placeholder="Your artist / producer name"></label>
          <label>Unique delivery ID<input id="ap-track-id" type="text" maxlength="120" spellcheck="false"><button type="button" class="ap-small-action" id="ap-new-id">New recipient copy ↗</button></label>
        </div>
        <div class="ap-grid">
          <label>Track title<input id="ap-title" type="text" maxlength="120" placeholder="Track / beat name"></label>
          <label>Recipient (optional)<input id="ap-recipient" type="text" maxlength="120" placeholder="Artist, label or buyer"></label>
          <label>ISRC (optional)<input id="ap-isrc" type="text" maxlength="12" spellcheck="false" placeholder="CCXXXYYNNNNN"></label>
          <label>Contact (optional)<input id="ap-contact" type="text" maxlength="180" placeholder="Email or website"></label>
        </div>
        <label class="ap-full">Private verification passphrase <span class="ap-note">Keep it private. Not included in the receipt.</span>
          <div class="ap-input-action"><input id="ap-secret" type="password" minlength="12" autocomplete="new-password" placeholder="At least 12 characters"><button type="button" id="ap-generate-secret">Generate</button><button type="button" id="ap-show-secret" aria-pressed="false">Show</button></div>
        </label>
        <div class="ap-divider"></div>
        <label class="ap-check"><input id="ap-add-voice" type="checkbox"><span><b>Add audible producer tag</b><small>Record your own short vocal tag with a microphone. Optional.</small></span></label>
        <div id="ap-voice-fields" hidden>
          <div class="ap-voice-controls"><button type="button" id="ap-record">Record with microphone</button><button type="button" id="ap-stop-record" hidden>Stop recording</button></div>
          <p class="ap-subtle" id="ap-voice-status">No producer tag recorded. The hidden watermark works without one.</p>
          <div class="ap-grid">
            <label>Placement<select id="ap-placement"><option value="smart">Smart / Quiet opening</option><option value="intro">At 00:01.5</option><option value="repeat">Smart + every ~28 seconds</option></select></label>
            <label>Voice effect<select id="ap-effect"><option value="radio">Lo-fi telephone</option><option value="distorted">Dark distortion</option><option value="clean">Clean</option></select></label>
            <label>Tag volume <output id="ap-volume-label">60%</output><input id="ap-volume" type="range" min="10" max="100" value="60"></label>
            <label>Music ducking <output id="ap-duck-label">35%</output><input id="ap-duck" type="range" min="0" max="85" value="35"></label>
          </div>
        </div>
        <div class="ap-divider"></div>
        <div class="ap-grid">
          <label>Export length<select id="ap-preview-length"><option value="90">Public preview · first 90 s</option><option value="60">Public preview · first 60 s</option><option value="0">Full track</option></select></label>
          <label>Periodic audible mark<select id="ap-periodic"><option value="off">Off</option><option value="tone">Short tone every ~28 s</option><option value="hiss">Soft noise every ~28 s</option></select></label>
        </div>
        <p class="ap-subtle">Public previews are shortened, not a replacement for full-resolution originals. Share WAV/stems only with authorized licensees.</p>
        <label class="ap-full">Hidden mark strength <output id="ap-strength-label">Balanced</output><input id="ap-strength" type="range" min="6" max="20" value="13"></label>
        <p class="ap-subtle">Output is always 44.1 kHz / 24-bit WAV for consistent local verification. PULSE embeds a secret-keyed 64-bit spectral ID. This is local DSP, not generative AI or a certified forensic product. Survival after MP3, editing or mixing is not guaranteed. Metadata and timestamps can be altered.</p>
        <button class="ap-primary" type="button" id="ap-process">Protect source & prepare WAV <span aria-hidden="true">↗</span></button>
        <div class="ap-result" id="ap-result" hidden><strong>Protected version ready</strong><p id="ap-result-info"></p><audio id="ap-player" controls preload="none"></audio><div class="ap-downloads"><button type="button" id="ap-download-wav">Download protected WAV</button><button type="button" id="ap-download-receipt">Download receipt JSON</button></div></div>
      </div>
      <div class="ap-panel" id="ap-verify-panel" role="tabpanel" aria-labelledby="ap-verify-tab" hidden>
        <p class="ap-subtle">Check the newly exported WAV or the track in SOURCE AUDIO. Verification uses the same owner, track ID and private passphrase.</p>
        <label class="ap-check"><input id="ap-check-generated" type="checkbox" checked><span><b>Check newly exported protected WAV</b><small>Available after export. Otherwise verify the SOURCE AUDIO.</small></span></label>
        <button class="ap-primary" type="button" id="ap-check">Check watermark <span aria-hidden="true">↗</span></button>
        <div class="ap-verification" id="ap-check-result" hidden role="status"></div>
      </div>
      <div class="ap-progress" id="ap-progress-wrap" hidden><div class="ap-progress-track"><div id="ap-progress-bar"></div></div><span id="ap-progress-message">Processing</span><button id="ap-cancel" type="button">Cancel</button></div>
      <p class="ap-message" id="ap-status" role="status" aria-live="polite">All processing is local. Keep your original session files and dated evidence of authorship.</p>
    </section>`;

  const $ = name => root.querySelector(`#ap-${name}`);
  let tagBuffer = null, tagFileName = '', resultBlob = null, receipt = null, resultUrl = null;
  let recorder = null, stream = null, chunks = [], controller = null, busy = false;
  let previousSourceBuffer;
  $('track-id').value = makeId();
  $('voice-fields').hidden = true;
  function setStatus(msg, error = false) { $('status').textContent = msg; $('status').classList.toggle('ap-error', error); }
  function source() {
    const current = getSourceAudio();
    if (!current?.buffer || typeof current.buffer.getChannelData !== 'function') throw new Error('Upload a track in 01 / SOURCE AUDIO first.');
    return current;
  }
  function updateSource() {
    const current = getSourceAudio();
    const valid = Boolean(current?.buffer);
    if (previousSourceBuffer !== undefined && previousSourceBuffer !== (current?.buffer || null)) {
      controller?.abort(); clearOutput(); $('check-result').hidden = true;
      setStatus('SOURCE AUDIO changed. Generate a new protected copy for this track.');
    }
    previousSourceBuffer = current?.buffer || null;
    $('source-name').textContent = valid ? current.file?.name || 'Audio from shared workspace' : 'No source audio loaded';
    $('source-detail').textContent = valid ? `${formatDuration(current.buffer.duration)} · ${(current.buffer.sampleRate / 1000).toFixed(1)} kHz · ${current.buffer.numberOfChannels} channel(s)` : 'Use 01 / SOURCE AUDIO first.';
    return valid;
  }
  function identity() {
    const owner = $('owner').value.trim(), assetId = $('track-id').value.trim(), secret = $('secret').value;
    if (!owner || !assetId || secret.length < 12) throw new Error('Enter owner, track ID and a private passphrase (12+ characters).');
    return { owner, assetId, secret };
  }
  function working(isBusy, message) {
    busy = isBusy;
    $('process').disabled = isBusy; $('check').disabled = isBusy;
    $('progress-wrap').hidden = !isBusy;
    if (message) $('progress-message').textContent = message;
    if (!isBusy) controller = null;
  }
  function progress(value, label) {
    $('progress-bar').style.width = `${Math.max(0, Math.min(100, value * 100))}%`;
    if (label) $('progress-message').textContent = `${label} · ${Math.round(value * 100)}%`;
  }
  function clearOutput() {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = null; resultBlob = null; receipt = null;
    $('player').removeAttribute('src'); $('player').load();
    $('result').hidden = true;
  }
  async function chooseVoice(file) {
    if (!file) return;
    if (file.size > 18 * 1024 * 1024) throw new Error('Voice tag max size: 18 MB.');
    source(); // Voice tag is an additional overlay, not a second music source.
    const target = WATERMARK_RATE;
    const decoded = await readAudio(file, target);
    if (decoded.duration < .15 || decoded.duration > 15) throw new Error('Voice tag must be 0.15–15 seconds long.');
    tagBuffer = decoded; tagFileName = file.name;
    $('voice-status').textContent = `${tagFileName} · ${decoded.duration.toFixed(2)} s · ready`;
  }
  $('refresh').onclick = updateSource;
  $('new-id').onclick = () => {
    $('track-id').value = makeId(); clearOutput();
    setStatus('New delivery ID created. Use a different ID for each recipient.');
  };
  $('generate-secret').onclick = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    $('secret').value = [...bytes].map(n => n.toString(16).padStart(2, '0')).join('');
    setStatus('Generated a strong private passphrase. Save it separately; the tool cannot recover it.');
  };
  $('show-secret').onclick = () => {
    const isVisible = $('secret').type === 'password';
    $('secret').type = isVisible ? 'text' : 'password'; $('show-secret').textContent = isVisible ? 'Hide' : 'Show';
    $('show-secret').setAttribute('aria-pressed', String(isVisible));
  };
  $('add-voice').onchange = () => { $('voice-fields').hidden = !$('add-voice').checked; };
  $('volume').oninput = () => { $('volume-label').textContent = `${$('volume').value}%`; };
  $('duck').oninput = () => { $('duck-label').textContent = `${$('duck').value}%`; };
  $('strength').oninput = () => { $('strength-label').textContent = ({ '6':'Subtle', '13':'Balanced', '20':'Strong' })[$('strength').value] || `${$('strength').value}%`; };
  $('protect-tab').onclick = () => {
    $('protect-tab').classList.add('active'); $('verify-tab').classList.remove('active');
    $('protect-tab').setAttribute('aria-selected','true'); $('verify-tab').setAttribute('aria-selected','false');
    $('protect-panel').hidden = false; $('verify-panel').hidden = true;
  };
  $('verify-tab').onclick = () => {
    $('protect-tab').classList.remove('active'); $('verify-tab').classList.add('active');
    $('protect-tab').setAttribute('aria-selected','false'); $('verify-tab').setAttribute('aria-selected','true');
    $('protect-panel').hidden = true; $('verify-panel').hidden = false;
  };
  $('record').onclick = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Mic recording is not supported in this browser.');
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } });
      chunks = []; recorder = new MediaRecorder(stream);
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = async () => {
        try {
          const file = new File(chunks, 'recorded-producer-tag.webm', { type: recorder.mimeType });
          await chooseVoice(file); setStatus('Recording captured locally.');
        } catch (error) { setStatus(error.message, true); }
        finally { stream?.getTracks().forEach(track => track.stop()); stream = null; $('stop-record').hidden = true; $('record').hidden = false; }
      };
      recorder.start(); $('record').hidden = true; $('stop-record').hidden = false;
      $('voice-status').textContent = 'Recording… speak your producer tag.';
    } catch (error) { stream?.getTracks().forEach(track => track.stop()); stream = null; setStatus(error.message, true); }
  };
  $('stop-record').onclick = () => { if (recorder?.state === 'recording') recorder.stop(); };
  $('cancel').onclick = () => { controller?.abort(); setStatus('Operation cancelled.'); };
  $('process').onclick = async () => {
    if (busy) return;
    try {
      const data = source(), id = identity();
      const voiceEnabled = $('add-voice').checked;
      if (voiceEnabled && !tagBuffer) throw new Error('Record a producer tag, or disable audible tagging.');
      controller = new AbortController(); working(true, 'Preparing source'); clearOutput();
      const ownerInfo = {
        title: $('title').value.trim() || data.file?.name?.replace(/\.[^.]+$/, '') || 'Untitled beat',
        recipient: $('recipient').value.trim(),
        contact: $('contact').value.trim(),
        isrc: $('isrc').value.toUpperCase().trim()
      };
      if (ownerInfo.isrc && !/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(ownerInfo.isrc)) throw new Error('ISRC must contain 12 characters (CCXXXYYNNNNN).');
      const preview = Number($('preview-length').value);
      const sourceBuffer = await resampleBuffer(data.buffer);
      if (controller.signal.aborted) return;
      let audio = cutPublicPreview(channelsOf(sourceBuffer), WATERMARK_RATE, preview);
      const estimate = audio[0].length * audio.length * 3;
      if (estimate > 300 * 1024 * 1024) throw new Error('Protected WAV would exceed 300 MB. Select a 60/90-second public preview.');
      let tagPositions = [];
      if (voiceEnabled) {
        tagPositions = findSmartTagPositions(audio, WATERMARK_RATE, tagBuffer.duration, $('placement').value);
        audio = mixProducerTag({ channels: audio, sampleRate: WATERMARK_RATE,
          tagChannels: channelsOf(tagBuffer), tagSampleRate: tagBuffer.sampleRate, positions: tagPositions,
          volume: Number($('volume').value) / 100, duck: Number($('duck').value) / 100, effect: $('effect').value });
      }
      const markMode = $('periodic').value;
      if (markMode !== 'off') audio = addPeriodicMark(audio, WATERMARK_RATE, { mode: markMode, interval: 28, volume: .055 });
      const embedded = await embedWatermark({ channels: audio, sampleRate: WATERMARK_RATE,
        ...id, strength: Number($('strength').value) / 100, signal: controller.signal,
        onProgress: v => progress(v, 'Embedding hidden ID') });
      if (controller.signal.aborted) return;
      const generatedAt = new Date().toISOString();
      const wav = encodeWav24(embedded.channels, embedded.sampleRate, {
        ...ownerInfo, owner: id.owner, deliveryId: id.assetId, generatedAt,
        copyright: `Copyright ${new Date(generatedAt).getUTCFullYear()} ${id.owner}. All rights reserved.`,
        description: `${ownerInfo.title} / PULSE protected copy`
      });
      const receiptData = {
        product: 'PULSE Audio Protection', version: 'pulse-wm-1', owner: id.owner, deliveryId: id.assetId,
        assetId: id.assetId, ...ownerInfo, generatedAt, // local device clock; not certified
        originalFilename: data.file?.name || null,
        uploadedFileSha256: data.file ? await sha256File(data.file) : null, // SHA of initial upload, not necessarily the current edited workspace buffer
        protectedWavSha256: await sha256File(wav),
        sampleRate: embedded.sampleRate, channels: embedded.channels.length,
        durationSeconds: embedded.channels[0].length / embedded.sampleRate,
        previewSeconds: preview || null, audibleMark: markMode,
        hasAudibleTag: voiceEnabled, audibleTagName: voiceEnabled ? tagFileName : null,
        audibleTagPositions: tagPositions,
        warning: 'Self-declared metadata and local timestamps do not prove authorship. The watermark is experimental and can be lost after edits. Keep private key separately. Uploaded file SHA does not cover subsequent workspace edits.'
      };
      if (controller.signal.aborted) return;
      resultBlob = wav; receipt = receiptData;
      resultUrl = URL.createObjectURL(wav); $('player').src = resultUrl;
      $('result').hidden = false;
      $('result-info').textContent = `${id.assetId} · ${(wav.size / 1048576).toFixed(1)} MB · WAV 24-bit`;
      setStatus('Protected WAV ready. Store the receipt and private passphrase in separate places.');
    } catch (error) { setStatus(error.name === 'AbortError' ? 'Operation cancelled.' : error.message, error.name !== 'AbortError'); }
    finally { working(false); }
  };
  $('download-wav').onclick = () => { if (resultBlob && receipt) download(resultBlob, `${cleanName(receipt.originalFilename || receipt.assetId)}-protected.wav`); };
  $('download-receipt').onclick = () => { if (receipt) downloadJson(receipt, `${cleanName(receipt.assetId)}-receipt.json`); };
  $('check').onclick = async () => {
    if (busy) return;
    try {
      const id = identity();
      const audio = resultBlob && $('check-generated').checked ? await readAudio(resultBlob) : await resampleBuffer(source().buffer);
      controller = new AbortController(); working(true, 'Checking hidden watermark');
      const outcome = await verifyWatermark({ channels: channelsOf(audio), sampleRate: audio.sampleRate,
        ...id, signal: controller.signal, onProgress: v => progress(v, 'Analysing audio') });
      $('check-result').hidden = false;
      $('check-result').classList.toggle('ap-found', outcome.detected);
      const heading = outcome.detected ? 'WATERMARK FOUND' : 'NO RELIABLE MATCH';
      $('check-result').textContent = `${heading} · ${outcome.matchedBits}/${outcome.totalBits} matching bits · score ${outcome.score}. ${outcome.reason}`;
      setStatus(outcome.detected ? 'The tested audio matches the supplied private key and track ID.' : 'No reliable watermark match. This does not prove the track is unprotected.');
    } catch (error) { setStatus(error.name === 'AbortError' ? 'Operation cancelled.' : error.message, error.name !== 'AbortError'); }
    finally { working(false); }
  };
  updateSource();
  return {
    refresh: updateSource,
    destroy() {
      controller?.abort();
      if (recorder?.state === 'recording') recorder.stop();
      stream?.getTracks().forEach(track => track.stop());
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      root.replaceChildren();
    }
  };
}
