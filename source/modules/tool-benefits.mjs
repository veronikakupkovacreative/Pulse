/** Three truthful, tool-specific reasons, updated from the active PULSE module. */
export const TOOL_BENEFITS=Object.freeze({
  'song-analyzer':[['COMPLETE TRACK CONTEXT','View estimated BPM, key, Camelot and a basic chord timeline in one inspector.'],['ONE SHARED WORKSPACE','Beat positions appear in the same audio waveform used by the editor.'],['LOCAL ANALYSIS','Signal analysis runs in the browser; estimates should be checked by ear.']],
  'music-tagger':[['LOCAL ACOUSTIC PROFILE','Inspect measured spectral balance, transients, levels and stereo width without uploading your audio.'],['ON-DEVICE CLAP AI','Infer genres, moods and instruments with an open licensed model in your browser. First use downloads model weights.'],['LOCAL JSON REPORT','Export measured audio descriptors and on-device AI tag predictions. No cloud service.']],
  rhythm:[['TEMPO + BEAT GRID','Estimate BPM and place beat markers in the same analysis pass.'],['HALF / DOUBLE CONTEXT','Review rhythmic interpretations before applying tempo to the workspace.'],['BACKGROUND PROCESSING','Run the analysis in a Web Worker while the main interface stays responsive.']],
  key:[['HARMONIC START','Estimate the track key without exporting it to another application.'],['CAMELOT REFERENCE','Use the wheel notation to plan a harmonically compatible transition.'],['QUICK CROSS-CHECK','See a confidence indicator and verify complex chords by ear.']],
  tap:[['NO FILE REQUIRED','Tap along with any playing beat to estimate tempo.'],['INSTANT FEEDBACK','Read the calculated BPM as your tapping becomes more consistent.'],['MANUAL CONTROL','Confirm a difficult rhythm without automatic onset detection.']],
  editor:[['PRECISE SELECTION','Choose exactly which range to trim or remove on the timeline.'],['CLEAN EDGES','Short boundary fades help reduce clicks after editing.'],['UNDO FRIENDLY','Restore the previous track through the shared edit history.']],
  reverse:[['REVERSE PLAYBACK','Flip sample order while preserving the original track length.'],['SOUND DESIGN','Build reverse transitions and intentional backwards effects.'],['ONE-STEP UNDO','Compare reversed audio with the unprocessed source.']],
  equalizer:[['THREE EQ DEPTHS','Work with 3, 10 or 20 active filter bands.'],['INTERACTIVE RESPONSE','Drag filter handles and see the EQ curve update immediately.'],['PRESETS OR CUSTOM','Start from a genre voicing, then refine every band yourself.']],
  volume:[['GAIN CONTROL','Change the overall track level in decibels.'],['EXACT AMPLITUDE','Set a predictable amount rather than an arbitrary volume percentage.'],['REVERSIBLE EDIT','Use the workspace Undo history to compare levels.']],
  eq5:[['DETAILED TONE','Sculpt frequency bands using true local DSP filters.'],['VISUAL CONTROL','Hear and see the shape of your frequency adjustments.'],['GENRE START POINTS','Pick a ready-made voicing before creating a custom curve.']],
  'silence-trim':[['CLEAN STARTS','Identify unwanted quiet material before the first useful sound.'],['CLEAN ENDINGS','Remove trailing silence while retaining a safety margin.'],['USER THRESHOLD','Choose how quiet a region must be before it is trimmed.']],
  fade:[['SMOOTH ENTRANCES','Fade in a sound without editing each sample manually.'],['CONTROLLED OUTROS','Fade out a clip over a selected duration.'],['CLICK REDUCTION','Keep transitions gentler at the beginning or end.']],
  tone:[['LOW-END SHAPE','Add bass presence with a controlled shelf filter.'],['RUMBLE CLEANUP','Cut unwanted sub-bass from recordings and speech.'],['PRESERVE WORKFLOW','Apply and audition the filtered track in the same editor.']],
  'center-separate':[['CENTER INFORMATION','Inspect content common to the left and right stereo channels.'],['NO MODEL DOWNLOAD','Use channel arithmetic instead of a large separation model.'],['REALISTIC LIMITS','This extracts center content; it does not create clean AI stems.']],
  'merge-files':[['ONE TIMELINE','Combine recordings into a continuous audio sequence.'],['FORMAT ALIGNMENT','Match sample rates and channel layout before joining.'],['FASTER EXPORT','Export a combined track without leaving the browser.']],
  'speed-change':[['QUICK VARISPEED','Make audio play faster or slower in one step.'],['CREATIVE PITCH','Change pitch together with playback rate for familiar effects.'],['DURATION CONTROL','Hear the timing difference immediately after processing.']],
  sidechain:[['RHYTHMIC DUCKING','Shape the musical pump around an internal or external trigger.'],['TIMING CONTROL','Refine attack and release to fit the groove.'],['PARALLEL AMOUNT','Choose how much compression affects the original signal.']],
  modulation:[['MOVEMENT','Add audible motion using chorus, flanger or phaser.'],['STEREO TEXTURE','Create evolving depth and atmosphere in a track.'],['CONTROLLED BLEND','Balance the wet effect against the original audio.']],
  'clip-pan':[['TARGETED GAIN','Change the volume of a selected passage or full track.'],['STEREO POSITION','Place audio between the left and right channels.'],['SMOOTH BOUNDARIES','Use short fades around a processed selection.']],
  'pitch-correction':[['PLANNED PITCH TRACKING','A future engine could detect a vocal melody note by note.'],['PLANNED SCALE CONTROL','Automatic correction needs musical key and scale constraints.'],['NOT YET AVAILABLE','This build does not include a pitch-resynthesis processor.']],
  'time-stretch':[['PLANNED TEMPO MATCH','Stretch duration without changing pitch when an engine is added.'],['PLANNED BEAT SYNC','Match loops to a target tempo independently of pitch.'],['NOT YET AVAILABLE','This requires a dedicated time-stretch algorithm.']],
  wav:[['MULTIPLE FORMATS','Convert between supported audio formats in one workspace.'],['QUALITY OPTIONS','Choose compression, bit depth and sample rate as needed.'],['LOCAL ENCODING','Run the compatible encoder in your browser.']],
  loop:[['SELECTION EXPORT','Save only the part of a track that you actually need.'],['PRODUCER WORKFLOW','Create short loops from longer audio files.'],['WAV DOWNLOAD','Keep the selected section available for later sessions.']],
  resample:[['SAMPLE-RATE CHOICE','Export at practical rates such as 44.1 or 48 kHz.'],['PCM WAV','Save uncompressed audio after conversion.'],['NO CLOUD UPLOAD','Process compatible source audio locally.']],
  'file-size':[['SIZE FORECAST','Estimate export size before compressing a recording.'],['BITRATE COMPARISON','See how different MP3 quality settings affect storage.'],['PLANNING TOOL','Prepare files for transfer and platform limits.']],
  health:[['PEAK VISIBILITY','Check the highest sample level in a mix.'],['DYNAMICS CHECK','Compare RMS and crest factor to spot excessive compression.'],['CLIP COUNT','Locate a potential reason to lower your output level.']],
  master:[['LOUDNESS REPORT','Compare estimated LUFS-I and sample levels before and after.'],['LINKED DYNAMICS','Compress a stereo track without independent channel pumping.'],['SAFE OUTPUT','Apply lookahead limiting with a controlled estimated peak ceiling.']],
  quickfix:[['FAST CORRECTION','Apply a restrained default level-and-dynamics adjustment.'],['ONE-CLICK FLOW','Work without configuring a full mastering chain.'],['UNDO COMPARISON','Return to the original track whenever you need.']],
  'voice-cleaner':[['SPEECH FILTERS','Reduce low rumble with a high-pass stage.'],['PRESENCE BOOST','Bring out useful consonant frequencies with EQ.'],['VOICE CONTROL','Even out spoken volume with compression.']],
  dynamics:[['THRESHOLD CONTROL','Choose when the compressor begins reducing gain.'],['TRANSIENT TIMING','Use attack and release to shape musical dynamics.'],['CONSISTENT LEVELS','Prevent large level differences from dominating the mix.']],
  enhancer:[['SOURCE PRESETS','Select a processing character suited to different material.'],['EQ AND DYNAMICS','Balance tonal changes with level control.'],['SIMPLE WORKFLOW','Improve a recording with one local processing chain.']],
  rack:[['CUSTOM CHAIN','Combine supported built-in effects in a chosen order.'],['PRESET SHARING','Export and import your rack configuration as JSON.'],['CHARACTER OPTIONS','Build warm, punchy or experimental signal chains.']],
  'mix-master':[['BUS CHARACTER','Shape tone, saturation and stereo width before mastering.'],['MEASURED DYNAMICS','View integrated loudness, stereo correlation and reduction.'],['A/B MASTERING','Audition and export a master without overwriting the source.']],
  stems:[['PLANNED FOUR STEMS','A neural model could isolate vocals, drums, bass and other parts.'],['PLANNED REBALANCING','Separate channels would allow independent part levels.'],['NOT YET AVAILABLE','No trained stem-separation model is enabled in this build.']],
  normalize:[['TARGET PEAK','Set a predictable sample-peak target in dBFS.'],['ORIGINAL VS NORMALIZED','Compare results with a quick A/B preview.'],['24-BIT EXPORT','Save the normalized signal as a WAV file.']],
  'ai-voice-cleaner':[['NEURAL ISOLATION','Use a configured cloud model to isolate spoken voice.'],['PRIVATE ALTERNATIVE','Choose local gating and EQ when cloud processing is unsuitable.'],['CLEARER SPEECH','Reduce competing sounds before further editing.']],
  'ai-speech-enhancer':[['VOICE PROFILES','Switch between warm, crisp and broadcast-style tones.'],['SIBILANCE CONTROL','Shape upper speech frequencies to keep words intelligible.'],['OPTIONAL PRE-CLEAN','Isolate the voice first when a supported cloud service is configured.']],
  'ai-voice-cloning':[['AUTHORIZED VOICE','Create a voice profile only with explicit permission.'],['TEXT-TO-SPEECH','Generate a spoken take from approved text.'],['CONTROLLED ACCESS','Keep provider credentials behind the protected API.']],
  'reference-matcher':[['REFERENCE TONALITY','Compare two recordings and derive per-band EQ corrections from measured spectra.'],['ADJUSTABLE STRENGTH','Control the maximum EQ change before applying a non-neural match.'],['NON-DESTRUCTIVE CHOICE','Analyze first, then apply the match with Undo available in the workspace.']],
  'room-tail-reducer':[['ROOM-TAIL ATTENUATION','Reduce low-level decay tails without a cloud upload or training model.'],['LINKED STEREO RESPONSE','Use the same envelope for both channels to preserve stereo balance.'],['REVERSIBLE PROCESSING','Fine-tune strength and threshold, then compare with Undo.']],
  'key-chords':[['FFT HARMONIC ANALYSIS','Analyze spectral pitch classes instead of guessing from a sample value.'],['CHORD TIMELINE','Display estimated major and minor chord changes with timestamps.'],['HONEST CONFIDENCE','Show estimation confidence and flag that complex harmony needs a listening check.']],
  'noise-remover':[['LEARN THE NOISE','Automatically profile quiet passages or select a noise-only portion of the waveform.'],['PRECISE THREE-STAGE CLEANUP','Combine rumble filtering, hiss filtering and frequency-dependent spectral attenuation.'],['A/B WITHOUT COMMITTING','Audition before and after, then apply with Undo or export the cleaned 24-bit WAV.']],
  'ai2-musicai':[['PROMPT OR LYRICS','Create music from an original description or lyrics.'],['TWO TRACKS','Check and download either generated variation.'],['CREDIT PROTECTION','Explicit consent and owner authorization are required.']],
  'ai2-extraction':[['VOCALS AND INSTRUMENTS','Extract chosen vocals, instrumentals, drums, bass and other supported stems with MusicGPT v2.'],['OPTIONAL PREPROCESSING','Apply Denoise, Deecho or Dereverb before extraction if the input requires cleanup.'],['CONTROLLED CLOUD TASK','Only an authorized and consented request spends credits. Resume polling without submitting another job.']],
  'ai2-watermark':[['METADATA INSPECTION','Identify and remove supported WAV, MP3, FLAC and M4A metadata while keeping compressed audio frames untouched.'],['TEXT MARKER CLEANUP','Remove selected invisible characters and optionally normalize mixed-script lookalikes and typography while preserving meaningful joiners.'],['NO UPLOAD REQUIRED','Processing runs on your device without API tokens, cloud access or changing the original file.']],
  'ai2-lyrics':[['SONGWRITING DIRECTION','Guide original lyrics with theme, genre, mood, language and a chosen song structure.'],['EDITABLE LYRICS','Refine the generated words directly in PULSE before copying or exporting a TXT file.'],['EXPLICIT CLOUD REQUEST','Only the approved text prompt is sent to MusicGPT using owner-protected API credentials and credits; no audio is uploaded.']],
  visualizer:[['LIVE AUDIO SHAPES','Watch waveform and spectrum patterns react to sound.'],['STYLE VARIETY','Switch among multiple visual modes without generating video.'],['SIGNAL SETTINGS','Adjust bar count and sensitivity for your recording.']]
});
export function renderToolBenefits(tool,root=document){
  const benefits=TOOL_BENEFITS[tool?.id];
  if(!benefits||benefits.length!==3)throw Error('Missing three benefits for '+String(tool?.id));
  const host=root.querySelector('#pulse-benefits-grid');
  if(!host)return;
  const create=name=>root.createElement?root.createElement(name):document.createElement(name);
  const icons=[
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8h10a3 3 0 1 0-2.7-4.3"/><path d="M2 12h16a3 3 0 1 1-2.8 4.1"/><path d="M4 17h7a2.5 2.5 0 1 1-2.4 3.3"/></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3v18M12 3v18M19 3v18"/><path d="M2 8h6M9 14h6M16 9h6"/><rect x="3" y="6" width="4" height="4" rx="1"/><rect x="10" y="12" width="4" height="4" rx="1"/><rect x="17" y="7" width="4" height="4" rx="1"/></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M6 11v2a6 6 0 0 0 12 0v-2M12 19v3M8 22h8"/></svg>'
  ];
  host.replaceChildren(...benefits.map(([heading,description],i)=>{
    const card=create('article');card.className='pulse-benefit-card';
    const top=create('div');top.className='pulse-benefit-top';
    const icon=create('span');icon.className='pulse-benefit-icon';icon.setAttribute('aria-hidden','true');icon.innerHTML=icons[i];
    const number=create('span');number.textContent=String(i+1).padStart(2,'0');
    top.append(icon,number);
    const title=create('h3');title.textContent=heading;
    const body=create('p');body.textContent=description;
    card.append(top,title,body);return card;
  }));
}
