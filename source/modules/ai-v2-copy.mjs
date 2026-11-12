/** Independent editorial copy for the eight AI Studio V2 modules. */
const data=Object.freeze({
 'ai2-mastering':{
  title:['Master the track','Finish the sound'],
  summary:'Automatically recommend gentle 3-band EQ, linked compression and stereo width using spectral balance, crest factor and correlation. Choose Trap, Hip-Hop, EDM, Pop or Streaming. Local DSP, with LUFS estimates, limiter, level-matched A/B and WAV export.',
  steps:['Load audio into SOURCE AUDIO.','Choose Trap, Hip-Hop, EDM, Pop or Streaming. Keep Auto Analyze enabled for track-dependent settings, or adjust manually.','Render in a Web Worker, compare level-matched A/B, then apply or export the mastered WAV.'],
  benefits:[['ADAPTIVE LOCAL DSP','Track-dependent 3-band EQ recommendations, linked compression and stereo controls.'],['GENRE PRESETS','Trap, Hip-Hop, EDM, Pop and Streaming with measured loudness and peak estimates.'],['FAIR A/B + EXPORT','Level-matched audition before committing, plus 24-bit WAV export.']]},
 'ai2-stereo':{
  title:['Shape the stereo','Keep the bass solid'],
  summary:'Control stereo width, Mid/Side balance, low-frequency mono, panning and output gain. Fully local DSP in a Web Worker; no neural isolation or stem splitting.',
  steps:['Load your stereo track in SOURCE AUDIO.','Choose Natural, Wide Mix or Mono Low and refine width, bass crossover and pan.','Analyze phase correlation, apply the result and use Undo to compare.'],
  benefits:[['MID/SIDE CONTROL','Control stereo width while monitoring correlation and mono compatibility.'],['BASS MONO','Centre low frequencies below an adjustable crossover.'],['REAL LOCAL DSP','Offline audio processing in a Worker with peak protection.']]},
 'ai2-vocals':{
  title:['Refine the voice','Create natural doubles'],
  summary:'Choose local Vocal Enhance, local Vocal Doubler, or optional MusicGPT AI Voice Changer. Only AI Voice Changer uploads a short authorized vocal excerpt after explicit consent; local DSP remains private.',
  steps:['Load a vocal into SOURCE AUDIO or choose an optional short file.','Choose local ENHANCE/DOUBLER, or MusicGPT AI VOICE CHANGER with an authorized voice ID and consent.','Process the vocal, listen to the result and download it. Local DSP is reversible with Undo.'],
  benefits:[['VOCAL-TUNED DSP','Body, presence, sibilance smoothing and linked compression.'],['STEREO DOUBLER','Natural-sounding micro-delay doubling with adjustable movement and blend.'],['LOCAL OR CLOUD','Enhance and Doubler are local. MusicGPT AI Voice Changer is owner-authorized cloud processing.'] ]},
 'ai2-beat':{
  title:['Read the rhythm','Find the groove'],
  summary:'Estimate tempo and beat markers without freezing the UI, create a four-bar region and export a ready-to-use loop.',
  steps:['Load your song and analyze rhythm.','Verify BPM and use the playback cursor to choose a loop start.','Select four bars and export the WAV loop.'],
  benefits:[['BEAT MARKERS','Beat positions appear in the shared waveform.'],['BACKGROUND ANALYSIS','Signal processing runs in a dedicated Worker.'],['PRECISE LOOP EXPORT','Export the selected range as 24-bit WAV.']]},
 'ai2-mix':{
  title:['Balance the tracks','Build a mix'],
  summary:'Import stems or recordings, get RMS-based gain suggestions and render a stereo mix. The suggestions are DSP heuristics rather than a trained AI model.',
  steps:['Add your SOURCE AUDIO and extra track files.','Adjust gain and pan, optionally apply RMS balance suggestions.','Render the stereo mix and compare it with Undo.'],
  benefits:[['MULTITRACK IMPORT','Mix up to eight mono or stereo sources.'],['GAIN ASSISTANCE','Use RMS estimates to reach a consistent starting balance.'],['PEAK PROTECTION','Render with basic stereo summing protection.']]},
 'ai2-repair':{
  title:['Remove the noise','Preserve the detail'],
  summary:'Use the existing spectral noise reduction tool for hiss, rumble and stationary background noise. Neural repair for complex artifacts is not included.',
  steps:['Load a noisy track.','Choose a cleanup preset or learn a noise-only selection.','Render, compare A/B and apply or export WAV.'],
  benefits:[['SPECTRAL CLEANUP','Reduce stationary noise with a learned profile.'],['CONTROLLED STRENGTH','Dial in frequencies and reduction amount.'],['AUDITION FIRST','Listen before committing cleaned audio.']]},
 'ai2-pitch':{
  title:['Transform the tempo','Keep the pitch'],
  summary:'Change tempo independently from musical pitch using Web Worker DSP. Limited to two-minute clips and moderate shifts to reduce audible artifacts.',
  steps:['Load a clip of two minutes or less.','Choose a tempo multiplier and semitone offset.','Process the audio and compare with Undo.'],
  benefits:[['INDEPENDENT CONTROLS','Tempo change does not inherently transpose the notes.'],['WORKER PROCESSING','The UI stays responsive during rendering.'],['LOCAL BY DEFAULT','No sound files are sent to a server.']]},
 'ai2-fx':{
  title:['Build an FX chain','Shape the energy'],
  summary:'Use real local processing for FX racks, sidechain compression, chorus, flanger and phaser. Preset choices are not generated by a neural model.',
  steps:['Load a track into SOURCE AUDIO.','Choose an effects rack, sidechain or modulation mode.','Adjust settings, apply and use Undo to compare.'],
  benefits:[['EFFECT RACKS','Reusable chains of local effects.'],['GROOVE AND MOTION','Sidechain and modulation processors.'],['SOUND DESIGN CONTROL','Edit parameters before destructive application.']]}
});
export const isAiV2 = module => !!module && Object.hasOwn(data,module.id);
export function renderAiV2Copy(module,root=document){
 const info=data[module.id];if(!info)throw Error('Unknown AI Studio V2 module.');
 const title=root.querySelector('#toolkit-title'),summary=root.querySelector('#pulse-tool-summary'),steps=root.querySelector('#pulse-tool-steps');
 const create=name=>root.createElement?root.createElement(name):document.createElement(name);
 if(title){const br=create('br'),span=create('span');span.textContent=info.title[1]+'.';title.replaceChildren(info.title[0]+'.',br,span);title.classList.toggle('is-long',info.title.some(x=>x.length>14));}
 if(summary)summary.textContent=info.summary;
 if(steps)steps.replaceChildren(...info.steps.map(label=>{const li=create('li');li.textContent=label;return li;}));
 const grid=root.querySelector('#pulse-benefits-grid');if(!grid)return;
 grid.replaceChildren(...info.benefits.map(([name,description],i)=>{
  const card=create('article');card.className='pulse-benefit-card';
  const top=create('div');top.className='pulse-benefit-top';
  const num=create('span');num.textContent=String(i+1).padStart(2,'0');top.append(num);
  const heading=create('h3');heading.textContent=name;
  const p=create('p');p.textContent=description;
  card.append(top,heading,p);return card;
 }));
}
