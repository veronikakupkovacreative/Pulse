/** Per-tool editorial copy. The heading, description and HOW TO USE update on every tool mount. */
const describe = (title, summary, ...steps) => Object.freeze({title, summary, steps});
export const TOOL_EDITORIAL = Object.freeze({
  'song-analyzer':describe(['Song','Analyzer'],'Measure BPM, key, Camelot and chords, then optionally compare an independent estimate.','Upload a track into SOURCE AUDIO.','Press Analyze Track, then optionally COMPARE WITH AUDO.','Compare the two estimates and verify tempo by listening.'),
  'audio-protection':describe(['Audio','Protection'],'Create a protected preview using the track in SOURCE AUDIO. Export an audible producer tag, a private watermark and optional recipient-specific verification data locally.','Load the original track in 01 / SOURCE AUDIO.','Choose an optional audible producer tag and recipient identifier.','Export the protected preview, keep the original file, then verify the watermark using the matching key.'),
  'release-preflight':describe(['Release','Preflight'],'Measure integrated LUFS, true peak, clipping, noise floor and output format before releasing a finished master.','Choose a master file under 2.4 MB or provide a public HTTPS audio URL.','Confirm cloud processing and run Analyze Release.','Review the full measurement report and download JSON.'),
  'vocal-session-mapper':describe(['Vocal Session','Mapper'],'Transcribe vocals, synchronize existing lyrics with audio, or translate the resulting transcript with timing.','Choose a vocal recording, SOURCE AUDIO selection or public HTTPS audio URL.','Pick Transcribe, Align Lyrics or Translate; for alignment paste the exact original lyrics.','Confirm cloud processing, review the timed result and download subtitles.'),
  'smart-sample-finder':describe(['Smart Sample','Finder'],'Find likely standout moments in a recording and cut the selected highlight into a reusable sample.','Choose a recording or public HTTPS audio URL.','Set the highlight count, approve processing and run Find Highlights.','Review the suggested ranges and export only the samples you need.'),
  'sample-pack-lab':describe(['Sample Pack','Lab'],'Process a batch of short samples with silence removal, cutting, loudness matching and format conversion.','Select one to five small samples and choose the required processing steps.','Confirm cloud processing, then run the steps for each sample.','Download the organized package and check for any step-specific warnings.'),
  'stem-delivery-studio':describe(['Stem Delivery','Studio'],'Align file durations, set sample rate and PCM bit depth, and package finished stems locally for hand-off.','Select one to ten stems from the same session.','Choose 44.1 or 48 kHz, 16 or 24-bit PCM, and optional BPM and key.','Create the ZIP with standardized WAVs and the delivery manifest.'),
  'music-tagger':describe(['Music','Tagger'],'Measure acoustic descriptors and estimate likely genres, moods and instruments locally.','Load a track into SOURCE AUDIO; optionally select a section on the waveform.','Click MEASURE ACOUSTICS for a private spectral profile, without uploading audio.','Click GENERATE AI TAGS, review the predictions and export JSON.'),
  editor: describe(['Audio','Editor'], 'Trim, cut, merge, fade, adjust gain or apply a 3/10/20-band parametric EQ in one integrated editor.', 'Upload audio into SOURCE AUDIO; Shift + drag on the waveform to select a range for Trim or Cut.', 'Choose Trim, Cut, Merge, Fade, Gain or EQ inside the Audio Editor.', 'Apply the operation, preview and use Undo or Redo when needed.'),
  visualizer: describe(['Audiogram','Visualizer'], 'Visualize audio playback as a live waveform, spectrum or producer-friendly audiogram, entirely in your browser.', 'Upload a track and press Play in SOURCE AUDIO.', 'Choose a visual character and display mode.', 'Adjust bars and sensitivity for your signal.'),
  'wav': describe(['Audio','Converter'], 'Convert the shared SOURCE AUDIO track to WAV, MP3, FLAC, AAC, M4A, OGG or WMA in your browser.', 'Load or select the track in SOURCE AUDIO.', 'Choose the output format and format-specific quality settings.', 'Convert and download the finished file.').
});

/** Keep text and HTML elements separate; every registered tool gets correct editorial copy. */
export function renderToolEditorial(tool, root = document) {
  const data = TOOL_EDITORIAL[tool?.id];
  if (!tool || !data) throw Error('Missing editorial copy for '+String(tool?.id ?? 'unknown'));
  const heading = root.querySelector('#toolkit-title');
  const summary = root.querySelector('#pulse-tool-summary');
  const steps = root.querySelector('#pulse-tool-steps');
  if (!heading || !summary || !steps) return;
  const [first, second] = data.title;
  const span = root.createElement ? root.createElement('span') : document.createElement('span');
  span.textContent = second.endsWith('.') ? second : second + '.';
  const br = root.createElement ? root.createElement('br') : document.createElement('br');
  heading.replaceChildren(first, br, span);
  heading.classList.toggle('is-long', first.length > 12 || second.length > 13);
  summary.textContent = data.summary;
  steps.replaceChildren(...data.steps.map(item => {
    const li = root.createElement ? root.createElement('li') : document.createElement('li');
    li.textContent = item;
    return li;
  }));
}