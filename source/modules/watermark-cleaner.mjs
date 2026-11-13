import {inspectAudioMetadata,inspectTextMarkers,MAX_AUDIO_BYTES} from './watermark-cleaner-core.mjs';

const MARKUP=[
 '<section class="tool-view ai2-panel pulse-watermarks" aria-label="Watermark Cleaner">',
 '<div class="tool-view-header"><span>04 / AI STUDIO / WATERMARK CLEANER</span><span>LOCAL / NO UPLOAD</span></div>',
 '<h3>Inspect the marks.<br><span>Keep your sound.</span></h3>',
 '<p class="tool-description">Inspect and clear supported container metadata from WAV, MP3, FLAC and M4A without altering encoded audio. This does not detect or remove acoustic AI watermarks embedded in the sound.</p>',
 '<div class="pulse-wm-tabs" role="group" aria-label="Choose cleaner type">',
 '<button type="button" data-wm-tab="audio" aria-pressed="true">AUDIO METADATA</button>',
 '<button type="button" data-wm-tab="text" aria-pressed="false">TEXT MARKERS</button></div>',
 '<div class="pulse-wm-section" data-wm-panel="audio">',
 '<label class="pulse-wm-file">CHOOSE YOUR OWN AUDIO FILE <input data-wm-file type="file" accept=".wav,.mp3,.flac,.m4a,audio/wav,audio/mpeg,audio/flac,audio/mp4,audio/x-m4a"></label>',
 '<p class="pulse-wm-hint">WAV: INFO/BEXT/XMP chunks. MP3: ID3v1/v2. FLAC: Vorbis tags, images and application blocks. M4A: iTunes tags and keys (same-size metadata neutralization). Maximum 128 MB.</p>',
 '<div class="pulse-wm-report" data-wm-audio-report hidden><strong data-wm-audio-heading>METADATA CHECK</strong><ul data-wm-audio-findings></ul><p data-wm-audio-detail></p></div>',
 '<button class="pulse-wm-action" type="button" data-wm-download-audio disabled>DOWNLOAD CLEAN COPY <span aria-hidden="true">↗</span></button>',
 '</div>',
 '<div class="pulse-wm-section" data-wm-panel="text" hidden>',
 '<label class="pulse-wm-label" for="pulse-wm-source">SOURCE TEXT</label>',
 '<textarea id="pulse-wm-source" data-wm-text-input rows="6" maxlength="200000" placeholder="Paste text to inspect for invisible Unicode characters..."></textarea>',
 '<fieldset class="pulse-wm-options"><legend>OPTIONAL TEXT NORMALIZATION</legend>',
 '<label><input type="checkbox" data-wm-option="homoglyphs"> Repair mixed-script lookalikes (Latin / Cyrillic / Greek)</label>',
 '<label><input type="checkbox" data-wm-option="typography"> Replace smart punctuation with ASCII equivalents</label>',
 '<label><input type="checkbox" data-wm-option="spaces"> Replace unusual Unicode spaces with normal spaces</label>',
 '<label><input type="checkbox" data-wm-option="nfkc"> Apply Unicode NFKC compatibility normalization</label>',
 '</fieldset>',
 '<p class="pulse-wm-hint">Always removes selected invisible controls. Optional character and typography normalization can alter visible content. Emoji and script joiners are preserved; statistical text watermarks are not detected.</p>',
 '<button class="pulse-wm-action" type="button" data-wm-scan-text>INSPECT & CLEAN TEXT <span aria-hidden="true">↗</span></button>',
 '<div class="pulse-wm-text-result" data-wm-text-report hidden>',
 '<p data-wm-text-count></p><label class="pulse-wm-label" for="pulse-wm-output">CLEANED TEXT</label>',
 '<textarea id="pulse-wm-output" data-wm-text-output rows="6" readonly></textarea>',
 '<div class="pulse-wm-downloads"><button type="button" data-wm-copy-text>COPY TEXT</button><button type="button" data-wm-save-text>DOWNLOAD TXT</button></div></div>',
 '</div>',
 '<p class="pulse-wm-status" data-wm-status role="status" aria-live="polite">Select WAV, MP3, FLAC or M4A, or switch to text cleaning. Your files never leave this browser.</p>',
 '<p class="pulse-wm-legal">Only clean content you have permission to modify. No acoustic watermark removal is guaranteed. Metadata-only approach informed by the MIT-licensed watermarks-remover and watermark-remover-plus projects.</p>',
 '</section>'
].join('');

const $=(root,selector)=>root.querySelector(selector);
const safeName=name=>String(name||'audio').replace(/\.[^/.]+$/,'').replace(/[^a-z0-9_-]/gi,'-').slice(0,90)||'audio';

export function mountWatermarkCleaner({host}={}){
 if(!host)throw Error('Watermark Cleaner requires a host element.');
 host.innerHTML=MARKUP;
 const get=s=>$(host,s);
 let disposed=false,reading=0,audioResult=null,audioName='audio',downloadUrl=null;
 const status=(message,error=false)=>{
  if(disposed)return;
  const element=get('[data-wm-status]');
  element.textContent=message;
  element.dataset.error=String(error);
 };
 const revoke=()=>{
  if(downloadUrl&&typeof URL!=='undefined'&&URL.revokeObjectURL)URL.revokeObjectURL(downloadUrl);
  downloadUrl=null;
 };
 const download=(bytes,type,filename)=>{
  if(typeof URL==='undefined'||!URL.createObjectURL||typeof Blob==='undefined'){
   status('This browser does not support local downloads.',true);return;
  }
  revoke();
  downloadUrl=URL.createObjectURL(new Blob([bytes],{type}));
  const link=document.createElement('a');
  link.href=downloadUrl;link.download=filename;link.hidden=true;
  host.append(link);link.click();link.remove();
 };
 const report=get('[data-wm-audio-report]');
 const dl=get('[data-wm-download-audio]');
 for(const tab of host.querySelectorAll('[data-wm-tab]')){
  tab.addEventListener('click',()=>{
   if(disposed)return;
   const selected=tab.dataset.wmTab;
   host.querySelectorAll('[data-wm-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b===tab)));
   host.querySelectorAll('[data-wm-panel]').forEach(panel=>panel.hidden=panel.dataset.wmPanel!==selected);
   status(selected==='audio'?'Select a WAV, MP3, FLAC or M4A file to inspect its metadata.':'Paste text to inspect invisible Unicode markers.');
  });
 }
 get('[data-wm-file]').addEventListener('change',async event=>{
  const file=event.target.files?.[0];const current=++reading;
  audioResult=null;report.hidden=true;dl.disabled=true;revoke();
  if(!file){status('Choose a WAV, MP3, FLAC or M4A file.');return;}
  if(file.size>MAX_AUDIO_BYTES){status('Maximum supported audio file size is 128 MB.',true);return;}
  status('Inspecting '+file.name+' locally...');
  try{
   const bytes=await file.arrayBuffer();
   if(disposed||current!==reading)return;
   const result=inspectAudioMetadata(bytes);
   audioResult=result;audioName=file.name;
   const list=get('[data-wm-audio-findings]');
   list.replaceChildren();
   if(result.findings.length){
    for(const finding of result.findings){
     const li=document.createElement('li');
     li.textContent=finding.name+' / '+finding.bytes.toLocaleString()+' bytes';
     list.append(li);
    }
   }else{
    const li=document.createElement('li');li.textContent='No supported metadata tags were detected.';list.append(li);
   }
   get('[data-wm-audio-heading]').textContent=result.format.toUpperCase()+' / '+(result.changed?'METADATA FOUND':'NO SUPPORTED METADATA');
   get('[data-wm-audio-detail]').textContent=result.changed?
    (result.format==='m4a'?
     result.neutralizedBytes.toLocaleString()+' metadata bytes cleared inside same-size M4A atoms; encoded audio and sample offsets are preserved.':
     result.metadataBytesRemoved.toLocaleString()+' metadata bytes removed; encoded audio data is preserved.'):
    'No supported metadata was found. This check cannot detect embedded acoustic watermarks.';
   report.hidden=false;dl.disabled=!result.changed;
   status(result.changed?'Review the detected tags, then download a separate cleaned copy.':'Inspection complete. The file contains no tags supported by this cleaner.');
  }catch(error){
   if(!disposed&&current===reading)status(error?.message||'Could not inspect this audio file.',true);
  }
 });
 dl.addEventListener('click',()=>{
  if(disposed||!audioResult?.changed)return;
  download(audioResult.bytes,audioResult.mime,safeName(audioName)+'-clean.'+audioResult.extension);
  status('Cleaned audio copy prepared. Original file was not modified.');
 });
 get('[data-wm-scan-text]').addEventListener('click',()=>{
  if(disposed)return;
  const source=get('[data-wm-text-input]').value;
  if(!source.trim()){status('Enter text before running inspection.',true);return;}
  const options=Object.fromEntries(['homoglyphs','typography','spaces','nfkc'].map(name=>[name,Boolean(get('[data-wm-option="'+name+'"]').checked)]));
  const result=inspectTextMarkers(source,options);
  get('[data-wm-text-output]').value=result.cleaned;
  const changed=Object.entries(result.normalizations).filter(([,n])=>n>0).map(([name,n])=>name+': '+n);
  get('[data-wm-text-count]').textContent=result.removed+
   ' invisible marker(s) removed; '+result.preservedJoiners+' meaningful joiner(s) preserved.'+
   (changed.length?' Optional changes: '+changed.join(', ')+'.':'');
  get('[data-wm-text-report]').hidden=false;
  status('Text inspection complete. You can copy or download the cleaned text.');
 });
 get('[data-wm-copy-text]').addEventListener('click',async()=>{
  try{
   if(!navigator?.clipboard?.writeText)throw Error('Clipboard unavailable');
   await navigator.clipboard.writeText(get('[data-wm-text-output]').value);
   if(!disposed)status('Cleaned text copied.');
  }catch{status('Clipboard not available. Select the cleaned text and copy it manually.',true);}
 });
 get('[data-wm-save-text]').addEventListener('click',()=>{
  download(new TextEncoder().encode(get('[data-wm-text-output]').value),'text/plain;charset=utf-8','cleaned-text.txt');
  status('Cleaned text download prepared.');
 });
 return()=>{disposed=true;reading++;revoke();host.replaceChildren();};
}
