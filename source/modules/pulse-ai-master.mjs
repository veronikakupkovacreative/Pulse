/**
 * PULSE AI MASTER 1.0 - four integrated audio tools for the existing PULSE shell.
 * 1. AI Voice Cleaner: ElevenLabs neural voice isolation + explicitly labelled local DSP fallback.
 * 2. Speech Enhancer: transparent offline DSP chain, optionally preceded by neural isolation.
 * 7. Voice Cloning: ElevenLabs IVC + text-to-speech through a protected same-origin API.
 * Advanced visualizer implementation retained for a future release; not registered.
 *
 * Copy to source/modules/pulse-ai-master.mjs and register pulseAiModules in features.mjs.
 * Cloud actions REQUIRE a server-side ElevenLabs key AND a separate PULSE_AI_GATE_TOKEN.
 * Never include either secret in this file or in public build assets.
 */
import {workspace as w} from './workspace.mjs';

const API = '/api/pulse-ai';
const MAX_CLOUD_BYTES = 2_400_000; // conservative Vercel JSON request size (<4.5 MB including base64)
const esc = value => String(value ?? '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const number = (root, key, fallback) => {
  const n = Number(root.querySelector(`[data-setting="${key}"]`)?.value);
  return Number.isFinite(n) ? n : fallback;
};
const status = (root, message, bad = false) => {
  const area = root.querySelector('[data-ai-status]');
  if (area) { area.textContent = message; area.dataset.error = String(bad); }
};
const setBusy = (root, busy) => {
  root.querySelectorAll('[data-ai-action]').forEach(el => { el.disabled = busy; });
  root.setAttribute('aria-busy', String(busy));
};
const row = (key, label, min, max, value, step = 1, suffix = '') => `
  <label class="pulse-ai-control">${esc(label)} <output data-value="${key}">${value}${suffix}</output>
    <input data-setting="${key}" type="range" min="${min}" max="${max}" value="${value}" step="${step}" />
  </label>`;
const secureField = () => `
  <label class="pulse-ai-control">CLOUD ACCESS TOKEN
    <input data-ai-token type="password" autocomplete="off" placeholder="Owner access token" />
  </label><p class="pulse-ai-muted">Neural operations send your selected audio to ElevenLabs. The token is held in this tab only.</p>`;
const header = (label, title, description, tag = 'PULSE / AUDIO') => `
  <div class="tool-view-header"><span>${esc(label)}</span><span>${esc(tag)}</span></div>
  <h3>${title}</h3><p class="tool-description">${esc(description)}</p>`;
const buttons = (items) => items.map(([id,label,checked],i) =>
  `<button data-option="${esc(id)}" type="button" aria-pressed="${checked ? 'true' : 'false'}">${esc(label)}</button>`).join('');
const download = (blob, fileName) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};
const safeName = name => (name || 'pulse').replace(/[^a-zA-Z0-9_-]+/g,'-').slice(0,56);

function mountStyles() {
  if (typeof document === 'undefined' || document.querySelector('#pulse-ai-master-css')) return;
  const style = document.createElement('style'); style.id = 'pulse-ai-master-css';
  style.textContent = `
    .pulse-ai-master{font:400 12px/1.6 Arial,Helvetica,sans-serif;color:#191919;display:flex;flex-direction:column;gap:13px;min-height:515px;min-width:0}
    .pulse-ai-master *{box-sizing:border-box}
    .pulse-ai-master .tool-view-header{display:flex;justify-content:space-between;gap:15px;font:700 9px/1.4 Arial,sans-serif;letter-spacing:.11em;margin:0 0 29px}
    .pulse-ai-master h3{font:400 clamp(33px,3.3vw,46px)/1.04 Arial,sans-serif;margin:0 0 16px;letter-spacing:-.047em}
    .pulse-ai-master h3 span{opacity:.55}
    .pulse-ai-master .tool-description{font-size:12px;line-height:1.64;margin:0 0 23px;max-width:395px}
    .pulse-ai-control{display:grid;gap:7px;font:400 11px/1.4 Arial,sans-serif;letter-spacing:.02em;min-width:0}
    .pulse-ai-control output{float:right;font-variant-numeric:tabular-nums;font-size:11px}
    .pulse-ai-control input[type=range]{width:100%;accent-color:#ff0000;cursor:pointer}
    .pulse-ai-control input:not([type=range]),.pulse-ai-control select,.pulse-ai-control textarea{border:1px solid #19191988;background:transparent;padding:10px 11px;width:100%;min-width:0;min-height:43px;color:#191919;font:400 13px Arial,sans-serif;border-radius:0}
    .pulse-ai-control textarea{min-height:94px;resize:vertical;line-height:1.5}
    .pulse-ai-control input:focus-visible,.pulse-ai-control textarea:focus-visible,.pulse-ai-control select:focus-visible,.pulse-ai-master button:focus-visible{outline:2px solid #ff0000;outline-offset:3px}
    .pulse-ai-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}
    .pulse-ai-mode{display:flex;gap:5px;flex-wrap:wrap}
    .pulse-ai-mode button{font:400 11px Arial,sans-serif;min-height:35px;white-space:nowrap;padding:8px 10px;color:#191919;background:transparent;border:1px solid #999;cursor:pointer}
    .pulse-ai-mode button[aria-pressed=true]{background:#191919;color:#fff;border-color:#191919}
    .pulse-ai-action{display:flex;align-items:center;justify-content:space-between;width:100%;border:0;background:#191919;color:#fff;text-align:left;font:600 13px Arial,sans-serif;padding:14px 19px;cursor:pointer;min-height:52px;margin-top:auto}
    .pulse-ai-action:hover{background:#333}
    .pulse-ai-action:disabled,.pulse-ai-mode button:disabled{opacity:.48;cursor:wait}
    .pulse-ai-out{min-height:35px;padding:10px 0;border-top:1px solid #888;overflow-wrap:anywhere;white-space:pre-wrap;font:400 12px/1.5 Arial,sans-serif}
    .pulse-ai-out[data-error=true]{color:#a50000}
    .pulse-ai-muted{color:#666;font:400 11px/1.5 Arial,sans-serif;margin:0}
    .pulse-ai-tick{display:flex;align-items:flex-start;gap:9px;font:400 12px/1.5 Arial,sans-serif}
    .pulse-ai-tick input{accent-color:#ff0000;margin:3px 0 0}
    .pulse-ai-preview{min-height:36px}.pulse-ai-preview audio{width:100%;max-width:500px}
    .pulse-ai-chip{padding:5px 8px;border:1px solid #aaa;font:400 10px Arial,sans-serif;letter-spacing:.04em;display:inline-flex;width:fit-content}
    .pulse-ai-visual-stage{display:grid;min-width:0;max-width:100%;gap:11px;border:1px solid #444;background:#101010;padding:13px;margin-top:14px;color:#fefefe;width:100%}
    .pulse-ai-visual-stage canvas{width:100%;min-width:0;height:auto;display:block;background:#080808;aspect-ratio:16/9}
    .pulse-ai-visual-stage .pulse-ai-stage-top{display:flex;align-items:center;justify-content:space-between;font:400 10px Arial,sans-serif;letter-spacing:.09em}
    .pulse-ai-visual-stage .pulse-ai-stage-top i{display:inline-block;width:7px;height:7px;border-radius:50%;background:#ff0000;margin-right:6px}
    .pulse-ai-visual-stage .pulse-ai-stage-actions{display:flex;gap:7px;flex-wrap:wrap}
    .pulse-ai-visual-stage .pulse-ai-stage-actions button{background:transparent;color:#fff;font:400 11px Arial,sans-serif;border:1px solid #ffffff90;padding:10px 12px;cursor:pointer}
    .pulse-ai-visual-stage .pulse-ai-stage-actions button:disabled{opacity:.45;cursor:wait}
    .pulse-ai-visual-stage p{font:400 10px/1.45 Arial,sans-serif;color:#aaa;margin:0}
    .pulse-ai-master .pulse-ai-subhead{font:700 10px Arial,sans-serif;letter-spacing:.08em;margin:5px 0 1px}
    .pulse-ai-control input[type=file]::file-selector-button{border:1px solid #191919;background:transparent;color:#191919;font:400 11px Arial,sans-serif;padding:10px 12px;cursor:pointer;margin-right:12px}
    .pulse-ai-visual-stage .pulse-ai-stage-actions button:hover:not(:disabled){background:#ffffff18}
    .pulse-ai-master :is(input[type=range],input[type=checkbox]){accent-color:#191919}
    .pulse-ai-master audio{color-scheme:dark;background:#191919}
    .pulse-ai-master [hidden],.pulse-ai-visual-stage [hidden]{display:none!important}
    .pulse-ai-mode button:hover:not([aria-pressed=true]){background:#19191914}
    .pulse-ai-master .pulse-ai-preview{min-width:0}
    @media(max-width:760px){.pulse-ai-grid{grid-template-columns:1fr}.pulse-ai-master h3{font-size:34px}.pulse-ai-visual-stage{padding:7px}}
    @media(prefers-reduced-motion:reduce){.pulse-ai-master *, .pulse-ai-visual-stage *{transition:none!important}}
  `;
  document.head.append(style);
}

/** Read file only once and do not expose credentials in URLs, browser storage or logs. */
async function toBase64(file) {
  if (!file || !(file instanceof Blob)) throw Error('Choose a supported audio file.');
  if (file.size > MAX_CLOUD_BYTES) throw Error('Cloud upload limit for this starter backend is 2.4 MB. Use a compressed 1–2 minute MP3 sample.');
  if (!file.size) throw Error('The selected file is empty.');
  const binary = new Uint8Array(await file.arrayBuffer());
  let pieces = '';
  for (let offset=0; offset<binary.length; offset+=0x4000) {
    pieces += String.fromCharCode(...binary.subarray(offset, offset+0x4000));
  }
  return btoa(pieces);
}
function selectedCloudFile(root) {
  return root.querySelector('[data-cloud-file]')?.files?.[0] || document.querySelector('#audio-file')?.files?.[0] || null;
}
async function callCloud(root, action, params={}, {signal, binary=false}={}) {
  const accessToken = root.querySelector('[data-ai-token]')?.value.trim();
  if (!accessToken) throw Error('Enter your private cloud access token first.');
  const response = await fetch(API, {
    method:'POST',
    headers:{'Content-Type':'application/json','X-Pulse-Access':accessToken},
    body:JSON.stringify({action,...params}), signal
  });
  if (!response.ok) {
    let reason='Remote processing failed ('+response.status+').';
    try { reason=(await response.json()).error||reason; } catch {}
    throw Error(reason);
  }
  return binary ? await response.blob() : await response.json();
}
async function neuralIsolation(root, signal) {
  const file=selectedCloudFile(root);
  if(!file)throw Error('Choose a short voice recording in this panel (or in SOURCE AUDIO).');
  const audioBase64=await toBase64(file);
  const blob=await callCloud(root,'isolate',{audioBase64, filename:file.name, mime:file.type || 'audio/mpeg'}, {signal,binary:true});
  if(!blob.size)throw Error('Voice isolation returned an empty audio file.');
  const ctx=await w.ensureContext();
  try{return await ctx.decodeAudioData(await blob.arrayBuffer());}
  catch{throw Error('Your browser cannot decode the isolated audio returned by the provider.');}
}
async function loadForLocal(root) {
  if (w.buffer) return w.buffer;
  const file=selectedCloudFile(root);
  if(!file)throw Error('Upload audio to SOURCE AUDIO, or select a sample in this tool.');
  await w.load(file);
  return w.ensureAudio();
}

function copyBufferInto(context, source) {
  const target=context.createBuffer(source.numberOfChannels,source.length,source.sampleRate);
  for(let c=0;c<source.numberOfChannels;c++)target.copyToChannel(source.getChannelData(c),c);
  return target;
}
function preprocessGate(context, input, thresholdDb, strength) {
  // Transparent level-sensitive gate. This is NOT a neural noise separation model.
  const output=copyBufferInto(context,input);
  const channels=Array.from({length:output.numberOfChannels},(_,c)=>output.getChannelData(c));
  const threshold=10**(thresholdDb/20), attenuation=1-strength*.95;
  const attack=Math.exp(-1/(output.sampleRate*.012)),release=Math.exp(-1/(output.sampleRate*.14));
  let envelope=0,gain=1;
  for(let i=0;i<output.length;i++) {
    let level=0;
    for(let c=0;c<channels.length;c++)level=Math.max(level,Math.abs(channels[c][i]));
    envelope=(level>envelope?attack:release)*envelope+(1-(level>envelope?attack:release))*level;
    const ratio=clamp((envelope-threshold*.65)/(threshold*.8),0,1);
    const target=attenuation+(1-attenuation)*ratio;
    const smooth=target>gain?attack:release;
    gain=smooth*gain+(1-smooth)*target;
    for(let c=0;c<channels.length;c++)channels[c][i]*=gain;
  }
  return output;
}

/** Real offline audio processing with peak safety; no fake AI inference claims. */
export async function processSpeechDSP(buffer, options={}) {
  if(!buffer?.length || !buffer.numberOfChannels)throw Error('No audio to process.');
  const Offline=globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext;
  if(!Offline)throw Error('This browser does not support OfflineAudioContext.');
  const isCleaner=options.type==='clean';
  const amount=clamp(Number(options.amount??75)/100,0,1);
  const preset=options.preset||'podcast';
  const hp=clamp(Number(options.highpass??(isCleaner?95:75)),40,230);
  const presence=clamp(Number(options.presence??(isCleaner?1.7:2.7)),-4,7);
  const deess=clamp(Number(options.deess??2.5),0,8);
  const ctx=new Offline(buffer.numberOfChannels,buffer.length,buffer.sampleRate);
  const src=ctx.createBufferSource();
  src.buffer=isCleaner ? preprocessGate(ctx,buffer,-43,amount) : copyBufferInto(ctx,buffer);
  const filter=(kind,f,g=0,q=.707)=>{const node=ctx.createBiquadFilter();node.type=kind;node.frequency.value=f;node.gain.value=g;node.Q.value=q;return node;};
  const highpass=filter('highpass',hp);
  const mud=filter('peaking',360, isCleaner?-1.1:-1.8,1.15);
  const warmth=filter('lowshelf',170, preset==='warm'?1.5:preset==='intimate'?2.0:-.9);
  const intelligibility=filter('peaking',preset==='vocal'?3800:preset==='broadcast'?3400:2900,presence+(preset==='broadcast'?.6:preset==='intimate'?-.4:0),.9);
  const deesser=filter('peaking',6700,-deess,1.8); // static de-essing EQ, not a frequency-selective neural de-esser
  const air=filter('highshelf',9300,preset==='bright'?1.2:-.2);
  const compressor=ctx.createDynamicsCompressor();
  compressor.threshold.value=isCleaner?-24:(preset==='vocal'?-19:preset==='broadcast'?-18:preset==='intimate'?-28:-25);
  compressor.knee.value=9; compressor.ratio.value=isCleaner?1.8:(preset==='vocal'?2.4:preset==='broadcast'?3.8:preset==='intimate'?2.1:3.0);
  compressor.attack.value=.007; compressor.release.value=.19;
  const wet=ctx.createGain(),dry=ctx.createGain(),out=ctx.createGain();
  wet.gain.value=amount; dry.gain.value=1-amount; out.gain.value=10**(-.6/20);
  src.connect(highpass);highpass.connect(mud);mud.connect(warmth);warmth.connect(intelligibility);
  intelligibility.connect(deesser);deesser.connect(air);air.connect(compressor);
  compressor.connect(wet);wet.connect(out);src.connect(dry);dry.connect(out);out.connect(ctx.destination);
  src.start(0);
  const rendered=await ctx.startRendering();
  let peak=0;
  for(let c=0;c<rendered.numberOfChannels;c++) {
    const arr=rendered.getChannelData(c);
    for(let i=0;i<arr.length;i++)peak=Math.max(peak,Math.abs(arr[i]));
  }
  if (peak>0.98) {
    const gain=.98/peak;
    for(let c=0;c<rendered.numberOfChannels;c++) {
      const arr=rendered.getChannelData(c);
      for(let i=0;i<arr.length;i++)arr[i]*=gain;
    }
  }
  return rendered;
}

function mountVoiceCleaner({host}) {
  mountStyles();let active=true;const ctl=new AbortController();
  host.innerHTML=`<section class="pulse-ai-master">
    ${header('04 / AI VOICE CLEANER','Clean the voice.<br><span>Not the feeling.</span>',
    'Remove background sound using neural voice isolation, or use a lightweight local DSP cleanup on your recording.','NEURAL / LOCAL DSP')}
    <div class="pulse-ai-mode" role="group" aria-label="Cleaning mode">${buttons([['local','LOCAL DSP',true],['neural','NEURAL ISOLATION',false]])}</div>
    <label class="pulse-ai-control">OPTIONAL SAMPLE FOR CLOUD PROCESSING (MP3 ≤ 2.4 MB)
      <input data-cloud-file type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac" />
    </label>
    ${row('amount','LOCAL GATE AMOUNT',0,100,65,1,'%')}
    ${row('highpass','LOW CUT',50,220,95,5,' Hz')}
    <div data-cloud-credentials>${secureField()}</div>
    <button class="pulse-ai-action" data-ai-action="clean" type="button">PROCESS VOICE ↗</button>
    <p class="pulse-ai-out" data-ai-status role="status" aria-live="polite">Neural isolation removes competing audio; local mode offers high-pass, gate and tone control.</p>
  </section>`;
  const root=host.querySelector('.pulse-ai-master');let mode='local';
  const update=()=>{
    root.querySelector('[data-cloud-credentials]').hidden=mode!=='neural';
    root.querySelectorAll('[data-setting]').forEach(el=>el.closest('.pulse-ai-control').hidden=mode==='neural');
    root.querySelectorAll('[data-option]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.option===mode)));
  };
  root.querySelectorAll('[data-option]').forEach(b=>b.onclick=()=>{mode=b.dataset.option;update()});
  root.querySelectorAll('input[type=range]').forEach(i=>i.oninput=()=>{root.querySelector(`[data-value="${i.dataset.setting}"]`).textContent=i.value+(i.dataset.setting==='highpass'?' Hz':'%')});
  root.querySelector('[data-ai-action]').onclick=async()=>{
    setBusy(root,true);status(root,'Processing voice…');
    try {
      const processed=mode==='neural'?await neuralIsolation(root,ctl.signal):await processSpeechDSP(await loadForLocal(root),{
        type:'clean',amount:number(root,'amount',65),highpass:number(root,'highpass',95)});
      if(!active)return;
      if(!w.buffer){const source=selectedCloudFile(root);if(!source)throw Error('Load SOURCE AUDIO before applying.');await w.load(source);}
      w.commit(processed,mode==='neural'?'Neural voice isolation complete.':'Local DSP cleanup complete.');
      status(root,mode==='neural'?'Neural isolation applied. Use Undo to compare.':'Local cleanup applied. This is DSP, not neural noise removal.');
    }catch(error){if(active && error.name!=='AbortError')status(root,error.message,true)}
    finally{if(active)setBusy(root,false)};
  };
  update();return()=>{active=false;ctl.abort()};
}

function mountSpeechEnhancer({host}) {
  mountStyles();let active=true;const ctl=new AbortController();
  host.innerHTML=`<section class="pulse-ai-master">
    ${header('04 / SPEECH ENHANCER','Give speech<br><span>its presence.</span>',
      'Level, shape and clarify voice with an offline EQ, compressor and gentle de-essing. Optionally run neural isolation first.','LOCAL DSP + OPTIONAL NEURAL')}
    <div class="pulse-ai-subhead">VOICE CHARACTER</div>
    <div class="pulse-ai-mode" role="group" aria-label="Speech preset">${buttons([['podcast','PODCAST',true],['warm','WARM',false],['vocal','VOCAL',false],['bright','BRIGHT',false],['broadcast','BROADCAST',false],['intimate','INTIMATE',false]])}</div>
    <div class="pulse-ai-grid">${row('amount','PROCESSING MIX',0,100,85,1,'%')}${row('presence','PRESENCE',-4,7,2.8,.1,' dB')}</div>
    <div class="pulse-ai-grid">${row('deess','SIBILANCE CONTROL',0,8,2.8,.1,' dB')}${row('highpass','LOW CUT',40,220,85,5,' Hz')}</div>
    <label class="pulse-ai-tick"><input data-pre-clean type="checkbox" /> Start with neural voice isolation (uploads a selected clip)</label>
    <label class="pulse-ai-control">OPTIONAL FILE FOR NEURAL ISOLATION
      <input data-cloud-file type="file" accept="audio/*,.mp3,.wav,.m4a" /></label>
    <div data-cloud-credentials hidden>${secureField()}</div>
    <button class="pulse-ai-action" type="button" data-ai-action="enhance">ENHANCE SPEECH ↗</button>
    <p class="pulse-ai-out" data-ai-status role="status" aria-live="polite">Local processing is private. Neural isolation requires the configured API backend.</p>
  </section>`;
  const root=host.querySelector('.pulse-ai-master');let preset='podcast';
  root.querySelectorAll('[data-option]').forEach(b=>b.onclick=()=>{preset=b.dataset.option;root.querySelectorAll('[data-option]').forEach(item=>item.setAttribute('aria-pressed',String(item===b)))});
  root.querySelectorAll('input[type=range]').forEach(i=>i.oninput=()=>{root.querySelector(`[data-value="${i.dataset.setting}"]`).textContent=i.value+(i.dataset.setting==='amount'?'%':i.dataset.setting==='highpass'?' Hz':' dB')});
  root.querySelector('[data-pre-clean]').onchange=e=>root.querySelector('[data-cloud-credentials]').hidden=!e.target.checked;
  root.querySelector('[data-ai-action]').onclick=async()=>{
    setBusy(root,true);status(root,'Rendering speech processing chain…');
    try{
      const neural=root.querySelector('[data-pre-clean]').checked;
      const audio=neural?await neuralIsolation(root,ctl.signal):await loadForLocal(root);
      const result=await processSpeechDSP(audio,{type:'enhance',preset,amount:number(root,'amount',85),presence:number(root,'presence',2.8),deess:number(root,'deess',2.8),highpass:number(root,'highpass',85)});
      if(!active)return;
      if(!w.buffer){const file=selectedCloudFile(root);if(file)await w.load(file)}
      w.commit(result, 'Speech enhancer applied.');
      status(root,(neural?'Neural isolation + ':'')+'offline speech processing complete. Compare using Undo.');
    }catch(error){if(active&&error.name!=='AbortError')status(root,error.message,true)}
    finally{if(active)setBusy(root,false)}
  };
  return()=>{active=false;ctl.abort()};
}

function mountVoiceClone({host}) {
  mountStyles();let active=true,voiceId='',outputUrl='',currentAudio=null;
  const controller=new AbortController();
  host.innerHTML=`<section class="pulse-ai-master">
    ${header('04 / VOICE CLONING','Make your<br><span>own voice.</span>',
      'Create an Instant Voice Clone from your own authorized recording, then synthesize a new voiceover using text. Cloud processing uses ElevenLabs.','NEURAL / OWNER ACCESS')}
    <span class="pulse-ai-chip">YOUR OWN VOICE / EXPLICIT PERMISSION ONLY</span>
    <label class="pulse-ai-control">VOICE NAME <input data-clone-name maxlength="70" placeholder="My Studio Voice" autocomplete="off" /></label>
    <label class="pulse-ai-control">CLEAN VOICE SAMPLE (1–2 MIN MP3 RECOMMENDED)
      <input data-cloud-file type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg" /></label>
    <label class="pulse-ai-tick"><input data-clone-consent type="checkbox" /> I own this voice or have the speaker's explicit authorization, and understand that this sample is sent to ElevenLabs.</label>
    ${secureField()}
    <button class="pulse-ai-action" data-ai-action="clone" type="button">CREATE VOICE CLONE ↗</button>
    <label class="pulse-ai-control">VOICE ID (GENERATED OR EXISTING IN YOUR ACCOUNT)
      <input data-voice-id type="text" placeholder="Available after voice creation" spellcheck="false" /></label>
    <label class="pulse-ai-control">TEXT TO SPEAK
      <textarea data-clone-text maxlength="2000" placeholder="Write the spoken text here…"></textarea></label>
    <button class="pulse-ai-action" data-ai-action="speak" type="button">GENERATE SPEECH ↗</button>
    <div data-clone-preview class="pulse-ai-preview"></div>
    <div class="pulse-ai-grid">
      <button class="pulse-ai-action" data-ai-action="import" type="button" disabled>IMPORT TO WORKSPACE ↗</button>
      <button class="pulse-ai-action" data-ai-action="delete" type="button">DELETE VOICE CLONE ↗</button>
    </div>
    <p class="pulse-ai-out" data-ai-status role="status" aria-live="polite">The generated voice stays in your ElevenLabs account until you delete it. Never use someone else's voice without authorization.</p>
  </section>`;
  const root=host.querySelector('.pulse-ai-master');
  const markVoiceId=id=>{voiceId=id;root.querySelector('[data-voice-id]').value=id};
  const downloadAudio=(blob)=>{
    if(outputUrl)URL.revokeObjectURL(outputUrl);
    currentAudio=blob;outputUrl=URL.createObjectURL(blob);
    const preview=root.querySelector('[data-clone-preview]');preview.replaceChildren();
    const player=document.createElement('audio');player.controls=true;player.src=outputUrl;
    const link=document.createElement('button');link.type='button';link.className='pulse-ai-action';link.textContent='DOWNLOAD GENERATED MP3 ↗';
    link.onclick=()=>download(blob,'pulse-cloned-voice.mp3');preview.append(player,link);
    root.querySelector('[data-ai-action="import"]').disabled=false;
  };
  async function runAction(action){
    setBusy(root,true);status(root,'Working with neural voice service…');
    try {
      if (action==='clone') {
        const file=root.querySelector('[data-cloud-file]').files?.[0] || selectedCloudFile(root);
        const name=root.querySelector('[data-clone-name]').value.trim();
        if(name.length<2)throw Error('Enter a name for your voice.');
        if(!root.querySelector('[data-clone-consent]').checked)throw Error('Confirm authorization to clone this voice.');
        const audioBase64=await toBase64(file);
        const reply=await callCloud(root,'clone',{name,filename:file.name,mime:file.type||'audio/mpeg',audioBase64,consent:true},{signal:controller.signal});
        if(!active)return;
        if(!reply.voice_id)throw Error('Provider returned no voice ID.');
        markVoiceId(reply.voice_id);
        status(root,reply.requires_verification?'Voice created, but the provider requires verification before use.':'Voice clone created. Enter your text and generate speech.');
      } else if (action==='speak') {
        const id=root.querySelector('[data-voice-id]').value.trim();
        const text=root.querySelector('[data-clone-text]').value.trim();
        if(!/^[a-zA-Z0-9_-]{10,128}$/.test(id))throw Error('Enter a valid Voice ID from your account.');
        if(!text || text.length>2000)throw Error('Enter 1–2000 characters of spoken text.');
        const blob=await callCloud(root,'speak',{voiceId:id,text},{signal:controller.signal,binary:true});
        if(!active)return;
        if(!blob.size)throw Error('Provider returned empty speech audio.');
        voiceId=id;downloadAudio(blob);status(root,'Speech generated. Preview, download or import into the audio workspace.');
      } else if (action==='import') {
        if(!currentAudio)throw Error('Generate a speech clip first.');
        const ctx=await w.ensureContext();
        const b=await ctx.decodeAudioData(await currentAudio.arrayBuffer());
        if(!active)return;
        if(!w.buffer){const file=new File([currentAudio],'voice-clone.mp3',{type:'audio/mpeg'});await w.load(file)}
        w.commit(b,'Cloned speech imported to workspace.');
        status(root,'Generated speech imported into SOURCE AUDIO.');
      } else if (action==='delete') {
        const id=root.querySelector('[data-voice-id]').value.trim();
        if(!/^[a-zA-Z0-9_-]{10,128}$/.test(id))throw Error('Enter the Voice ID to delete.');
        if(!window.confirm('Permanently delete this voice from your ElevenLabs account?'))return;
        await callCloud(root,'delete',{voiceId:id},{signal:controller.signal});
        if(!active)return;
        markVoiceId('');status(root,'Voice deleted from the ElevenLabs account.');
      }
    } catch(error) {if(active&&error.name!=='AbortError')status(root,error.message,true)}
    finally{if(active){setBusy(root,false);root.querySelector('[data-ai-action="import"]').disabled=!currentAudio;}}
  }
  root.querySelectorAll('[data-ai-action]').forEach(b=>b.onclick=()=>runAction(b.dataset.aiAction));
  return()=>{active=false;controller.abort();if(outputUrl)URL.revokeObjectURL(outputUrl)};
}

const VISUAL_MODES = Object.freeze({
  radial:'RADIAL FFT', spectrum:'SPECTRUM', mirror:'MIRROR BARS',
  oscilloscope:'OSCILLOSCOPE', vectorscope:'STEREO SCOPE', particles:'PARTICLES'
});
const VISUAL_PRESETS = Object.freeze({
  pulse:{accent:'#ff0000',background:'#0a0a0a',secondary:'#ffffff'},
  mono:{accent:'#ffffff',background:'#111111',secondary:'#aaaaaa'},
  contrast:{accent:'#ff0000',background:'#ffffff',secondary:'#191919'},
  night:{accent:'#ffffff',background:'#000000',secondary:'#ff0000'},
  studio:{accent:'#ff0000',background:'#191919',secondary:'#f5f4f0'},
  charcoal:{accent:'#f5f4f0',background:'#191919',secondary:'#ff0000'}
});

/** Pure canvas drawing routine; exportable for test and future use. */
export function renderPulseFrame(canvas, options, data={}) {
  const g=canvas.getContext('2d');if(!g)return;
  const width=canvas.width,height=canvas.height;
  const {mode='radial',accent='#ff0000',background='#080808',secondary='#ffffff',sensitivity=1,
    bars=64,stroke=3,low=45,high=14000,time=0,sampleRate=44100,fftSize=2048}=options;
  const minAxis=Math.min(width,height);
  g.fillStyle=background;g.fillRect(0,0,width,height);
  g.save();g.lineWidth=Math.max(2,stroke*width/1080);g.lineCap='round';g.lineJoin='round';
  const freq=data.freq||new Uint8Array(fftSize/2);
  const wave=data.wave||new Uint8Array(fftSize).fill(128);
  const hzToIndex=hz=>clamp(Math.floor(hz*fftSize/sampleRate),0,freq.length-1);
  const amp=i=>{
    const ratio=i/Math.max(1,bars-1),f=low*(high/low)**ratio;
    return clamp((freq[hzToIndex(f)]||0)/255*sensitivity,0,1);
  };
  g.strokeStyle=secondary;g.globalAlpha=.17;g.beginPath();g.moveTo(width*.06,height*.5);g.lineTo(width*.94,height*.5);g.stroke();
  g.globalAlpha=1;g.strokeStyle=accent;g.fillStyle=accent;
  if(mode==='spectrum'||mode==='mirror'){
    const margin=width*.06,span=(width-margin*2)/bars;
    for(let i=0;i<bars;i++){
      const x=margin+span*i,level=amp(i),h=level*height*(mode==='mirror'?.37:.78),bar=Math.max(2,span*.64);
      if(mode==='mirror'){
        g.fillRect(x,height/2-h,bar,h);g.fillRect(x,height/2,bar,h);
      }else{g.fillRect(x,height*.88-h,bar,h)}
    }
  } else if(mode==='radial'){
    const cx=width/2,cy=height/2,r=minAxis*.24,outer=minAxis*.43;
    g.beginPath();g.arc(cx,cy,r,0,Math.PI*2);g.stroke();
    const count=Math.max(48,bars*2);
    for(let i=0;i<count;i++){
      const t=i/count*Math.PI*2-Math.PI/2,level=amp(Math.floor(i/count*bars));
      const length=Math.max(1,level*(outer-r));
      g.beginPath();g.moveTo(cx+r*Math.cos(t),cy+r*Math.sin(t));
      g.lineTo(cx+(r+length)*Math.cos(t),cy+(r+length)*Math.sin(t));g.stroke();
    }
  } else if(mode==='oscilloscope'){
    g.beginPath();for(let i=0;i<wave.length;i++){
      const x=width*.06+(i/Math.max(1,wave.length-1))*width*.88;
      const y=height*.5+(wave[i]-128)/128*height*.39*sensitivity;
      i?g.lineTo(x,y):g.moveTo(x,y);
    }g.stroke();
  } else if(mode==='vectorscope'){
    const l=data.left||wave,r=data.right||l;
    const n=Math.min(l.length,r.length);g.globalAlpha=.55;
    g.beginPath();for(let i=0;i<n;i+=2){
      const a=(l[i]-128)/128,b=(r[i]-128)/128;
      // Mid/side coordinates: mono is vertical; wide stereo forms the horizontal axis.
      const x=width/2+(a-b)*width*.23*sensitivity;
      const y=height/2-(a+b)*height*.22*sensitivity;
      g.moveTo(x,y);g.lineTo(x+Math.max(1,width/400),y);
    }g.stroke();g.globalAlpha=1;
  } else if(mode==='particles'){
    for(let i=0;i<bars;i++){
      const strength=amp(i),angle=i*2.39996+time*.11;
      const radius=minAxis*(.1+strength*.37),x=width/2+Math.cos(angle)*radius,y=height/2+Math.sin(angle)*radius;
      const size=1.5+strength*width*.011;g.beginPath();g.arc(x,y,size,0,Math.PI*2);g.fill();
    }
  }
  g.globalAlpha=1;
  const font=Math.max(12,width*.016);
  g.fillStyle=secondary;g.font=`400 ${font}px Arial, sans-serif`;g.textAlign='left';
  g.fillText('PULSE STUDIO  /  SIGNAL',width*.045,height*.06);
  g.font=`400 ${Math.max(10,width*.011)}px Arial, sans-serif`;
  g.fillText(VISUAL_MODES[mode]||'AUDIO',width*.045,height*.95);
  g.textAlign='right';g.fillText('LIVE AUDIO / 2026',width*.95,height*.95);
  g.restore();
}

class AdvancedVisualizer {
  constructor(canvas,host) {
    this.canvas=canvas;this.host=host;this.state={mode:'radial',bars:64,sensitivity:1.1,smoothing:.78,
      stroke:3,low:45,high:14000,fftSize:2048,...VISUAL_PRESETS.pulse};
    this.graph=null;this.recording=null;this.running=false;this.frame=0;this.frameIndex=0;
    this.sourceListener=e=>{if(!this.recording)this.attach(e.detail?.source||null)};
    document.addEventListener('pulse:audio-source',this.sourceListener);
    this.attach(w.source);this.draw=this.draw.bind(this);this.start();
  }
  attach(node) {
    if(this.graph){const {node:prev,analyser,splitter,left,right}=this.graph;
      try{prev.disconnect(analyser)}catch{}
      try{prev.disconnect(splitter)}catch{}
      for(const part of [analyser,splitter,left,right]){try{part.disconnect()}catch{}}
      this.graph=null;
    }
    if(!node)return;
    const ctx=node.context,analyser=ctx.createAnalyser(),splitter=ctx.createChannelSplitter(2),left=ctx.createAnalyser(),right=ctx.createAnalyser();
    for(const part of [analyser,left,right]){part.fftSize=this.state.fftSize;part.smoothingTimeConstant=this.state.smoothing}
    node.connect(analyser);node.connect(splitter);splitter.connect(left,0);splitter.connect(right,1);
    this.graph={node,analyser,splitter,left,right};
  }
  set(key,value) {
    this.state[key]=value;
    if(this.graph&&['fftSize','smoothing'].includes(key)){
      for(const n of [this.graph.analyser,this.graph.left,this.graph.right]){
        n.fftSize=this.state.fftSize;n.smoothingTimeConstant=this.state.smoothing;
      }
    }
  }
  capture() {
    const analyzer=this.graph?.analyser,fftSize=this.state.fftSize;
    const freq=new Uint8Array(fftSize/2),wave=new Uint8Array(fftSize).fill(128);
    if(analyzer){analyzer.getByteFrequencyData(freq);analyzer.getByteTimeDomainData(wave)}
    const left=new Uint8Array(fftSize).fill(128),right=new Uint8Array(fftSize).fill(128);
    if(this.state.mode==='vectorscope'&&this.graph){
      this.graph.left.getByteTimeDomainData(left);
      if(w.buffer?.numberOfChannels===1)right.set(left);else this.graph.right.getByteTimeDomainData(right);
    }
    return{freq,wave,left,right};
  }
  draw(){
    if(!this.running)return;
    renderPulseFrame(this.canvas,{...this.state,time:this.frameIndex/30,sampleRate:w.buffer?.sampleRate||44100},this.capture());
    this.frameIndex++;this.frame=requestAnimationFrame(this.draw);
  }
  start(){if(this.running)return;this.running=true;this.draw()}
  async record(seconds) {
    if(this.recording)throw Error('A video export is already running.');
    const buffer=w.ensureAudio();
    if(typeof MediaRecorder==='undefined'||!this.canvas.captureStream)throw Error('Video recording is unavailable in this browser. PNG export remains available.');
    const start=clamp(w.selection?.start||0,0,buffer.duration);
    const duration=Math.min(seconds,120,buffer.duration-start);
    if(duration<.2)throw Error('Select or load an audio segment at least 0.2 seconds long.');
    w.stop();
    const ctx=await w.ensureContext();
    const node=ctx.createBufferSource();node.buffer=buffer;
    const destination=ctx.createMediaStreamDestination();node.connect(destination);
    this.attach(node);
    const video=this.canvas.captureStream(30);
    const stream=new MediaStream([...video.getVideoTracks(),...destination.stream.getAudioTracks()]);
    const types=['video/webm;codecs=vp8,opus','video/webm','video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/webm;codecs=vp9,opus'];
    const mime=types.find(t=>MediaRecorder.isTypeSupported(t));
    if(!mime){this.attach(null);stream.getTracks().forEach(t=>t.stop());throw Error('No supported browser video recording codec.');}
    const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:3_000_000});
    this.recording={node,recorder,stream};
    const chunks=[];
    const promise=new Promise((resolve,reject)=>{
      recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
      recorder.onerror=e=>reject(e.error||new Error('Recording failed.'));
      recorder.onstop=()=>resolve(new Blob(chunks,{type:mime.split(';')[0]}));
    });
    try{
      recorder.start(200);
      node.start(0,start,duration);
      node.onended=()=>{if(recorder.state!=='inactive')recorder.stop()};
      const blob=await promise;
      if(!blob.size)throw Error('Recording produced an empty video.');
      return{blob,extension:mime.startsWith('video/mp4')?'mp4':'webm',duration};
    }finally{
      try{node.stop()}catch{}
      try{node.disconnect()}catch{}
      if(recorder.state!=='inactive')recorder.stop();
      stream.getTracks().forEach(t=>t.stop());this.recording=null;this.attach(w.source);
    }
  }
  dispose(){
    this.running=false;cancelAnimationFrame(this.frame);
    document.removeEventListener('pulse:audio-source',this.sourceListener);
    if(this.recording){try{this.recording.node.stop()}catch{}
      try{this.recording.recorder.stop()}catch{}
      this.recording.stream.getTracks().forEach(t=>t.stop());this.recording=null;}
    this.attach(null);
  }
}

export function mountAdvancedVisualizer({host}) {
  mountStyles();
  host.innerHTML=`<section class="pulse-ai-master">
    ${header('05 / ADVANCED MUSIC VISUALIZER','See the<br><span>frequencies.</span>',
      'Real-time audio visualization with FFT, stereo scope, adjustable colors, presets and audio-reactive MP4/WebM recording. No video editing.','LOCAL / WEB AUDIO')}
    <p class="pulse-ai-subhead">VISUALIZATION MODE</p>
    <div class="pulse-ai-mode" role="group" aria-label="Visual mode">${buttons(Object.entries(VISUAL_MODES).map(([id,label],i)=>[id,label,i===0]))}</div>
    <label class="pulse-ai-control">VISUAL PRESET<select data-preset><option value="pulse">Pulse Red</option><option value="mono">Mono</option><option value="contrast">Red / White</option><option value="night">Night</option><option value="studio">Studio</option><option value="charcoal">Charcoal</option><option value="custom">Custom</option></select></label>
    <div class="pulse-ai-grid">
      <label class="pulse-ai-control">SIGNAL COLOR<input data-color="accent" type="color" value="#ff0000" /></label>
      <label class="pulse-ai-control">BACKGROUND<input data-color="background" type="color" value="#0a0a0a" /></label>
    </div>
    <div class="pulse-ai-grid">${row('bars','BAR DENSITY',12,128,64,1,'')}${row('sensitivity','SENSITIVITY',25,300,110,5,'%')}</div>
    <div class="pulse-ai-grid">${row('smoothing','SMOOTHING',0,98,78,1,'%')}${row('stroke','LINE WIDTH',1,10,3,.5,' px')}</div>
    <div class="pulse-ai-grid">${row('low','LOW FREQUENCY',20,1000,45,5,' Hz')}${row('high','HIGH FREQUENCY',2000,20000,14000,100,' Hz')}</div>
    <div class="pulse-ai-grid">
      <label class="pulse-ai-control">FFT RESOLUTION<select data-fft><option value="auto" selected>AUTO · 2048 FFT</option><option value="1024">1024</option><option value="2048">2048</option><option value="4096">4096</option><option value="8192">8192</option></select></label>
      <label class="pulse-ai-control">CANVAS FORMAT<select data-resolution><option value="1920x1080" selected>AUTO · 16:9 / 1920 × 1080</option><option value="1920x1080">16:9 / 1920 × 1080</option><option value="1080x1080">1:1 / 1080 × 1080</option><option value="1080x1920">9:16 / 1080 × 1920</option></select></label>
    </div>
    <label class="pulse-ai-control">MAX VIDEO EXPORT DURATION (SECONDS)<input data-seconds type="number" min="1" max="120" step="1" value="15" /></label>
    <p class="pulse-ai-out" data-ai-status role="status" aria-live="polite">Upload audio, press PLAY in SOURCE AUDIO, or start a preview using the visualizer controls. Export uses a browser-supported MP4 or WebM codec.</p>
  </section>`;
  const root=host.querySelector('.pulse-ai-master');
  const stage=document.createElement('section');stage.className='pulse-ai-visual-stage';
  stage.setAttribute('aria-label','Advanced audio visualization');
  stage.innerHTML='<div class="pulse-ai-stage-top"><span><i></i> ADVANCED SIGNAL VIEW</span><span>PULSE / LOCAL</span></div><canvas width="1920" height="1080" aria-label="Audio responsive visualizer"></canvas><div class="pulse-ai-stage-actions"><button type="button" data-stage="play">PLAY / PAUSE</button><button type="button" data-stage="png">EXPORT PNG</button><button type="button" data-stage="video">EXPORT VIDEO + AUDIO</button></div><p>Video capture runs in real time; max 120 seconds. The audio track is included in the recording.</p>';
  const left=document.querySelector('.audio-source-area');
  (left||host).append(stage);
  const canvas=stage.querySelector('canvas');
  const visual=new AdvancedVisualizer(canvas,host);
  let alive=true;
  const setState=(key,val)=>visual.set(key,val);
  root.querySelectorAll('[data-option]').forEach(button=>button.onclick=()=>{
    setState('mode',button.dataset.option);
    root.querySelectorAll('[data-option]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  });
  root.querySelector('[data-preset]').onchange=e=>{
    const p=VISUAL_PRESETS[e.target.value];if(!p)return;
    Object.entries(p).forEach(([key,v])=>setState(key,v));
    root.querySelector('[data-color="accent"]').value=p.accent;
    root.querySelector('[data-color="background"]').value=p.background;
  };
  root.querySelectorAll('[data-color]').forEach(el=>el.oninput=()=>{
    setState(el.dataset.color,el.value);root.querySelector('[data-preset]').value='custom';
  });
  root.querySelectorAll('[data-setting]').forEach(el=>el.oninput=()=>{
    const key=el.dataset.setting,value=Number(el.value),scaled=['sensitivity','smoothing'].includes(key)?value/100:value;
    setState(key,scaled);
    root.querySelector(`[data-value="${key}"]`).textContent=value+(['sensitivity','smoothing'].includes(key)?'%':key==='stroke'?' px':['low','high'].includes(key)?' Hz':'');
  });
  root.querySelector('[data-fft]').onchange=e=>setState('fftSize',e.target.value==='auto'?2048:Number(e.target.value));
  root.querySelector('[data-resolution]').onchange=e=>{
    const [width,height]=e.target.value.split('x').map(Number);canvas.width=width;canvas.height=height;
    canvas.style.aspectRatio=`${width} / ${height}`;
  };
  const playback=async()=>{try{await w.togglePlay()}catch(e){status(root,e.message,true)}};
  const png=async()=>{
    try{
      const blob=await new Promise((resolve,reject)=>canvas.toBlob(x=>x?resolve(x):reject(Error('Canvas image export failed.')),'image/png'));
      download(blob,`${safeName(w.name)}-pulse-visual.png`);status(root,'PNG visualization exported.');
    }catch(e){status(root,e.message,true)}
  };
  const video=async()=>{
    const btn=stage.querySelector('[data-stage="video"]');btn.disabled=true;
    status(root,'Recording video and original audio in real time…');
    try{
      const seconds=clamp(Number(root.querySelector('[data-seconds]').value)||15,1,120);
      const rendered=await visual.record(seconds);
      if(!alive)return;
      download(rendered.blob,`${safeName(w.name)}-pulse-visual.${rendered.extension}`);
      status(root,`Exported ${rendered.duration.toFixed(1)} seconds with audio as ${rendered.extension.toUpperCase()}.`);
    }catch(e){if(alive)status(root,e.message,true)}
    finally{if(alive)btn.disabled=false}
  };
  stage.querySelector('[data-stage="play"]').onclick=playback;
  stage.querySelector('[data-stage="png"]').onclick=png;
  stage.querySelector('[data-stage="video"]').onclick=video;
  return()=>{alive=false;visual.dispose();stage.remove()};
}

export const pulseAiModules = Object.freeze([
  {id:'ai-voice-cleaner',category:'ai',label:'AI Voice Cleaner',mount:mountVoiceCleaner},
  {id:'ai-speech-enhancer',category:'ai',label:'Speech Enhancer',mount:mountSpeechEnhancer},
  {id:'ai-voice-cloning',category:'ai',label:'Voice Cloning',mount:mountVoiceClone}
]);