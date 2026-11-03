/** AI Noise Remover: a genuine local spectral denoiser, not an AI neural model. */
import {workspace as w} from './workspace.mjs';
import {encodeWav,audioMetrics} from './dsp.mjs';

const presets=Object.freeze({
 balanced:{highpass:70,lowpass:16000,intensity:70},
 music:{highpass:40,lowpass:18000,intensity:55},
 voice:{highpass:100,lowpass:12000,intensity:75},
 strong:{highpass:120,lowpass:8500,intensity:90}
});
const controls=[
 ['highpass','HIGH-PASS / RUMBLE',20,500,70,10,'Hz'],
 ['lowpass','LOW-PASS / HISS',1000,20000,16000,100,'Hz'],
 ['intensity','REDUCTION AMOUNT',10,100,70,5,'%']
];
const slider=([key,label,min,max,value,step,unit])=>`<label class="pulse-noise-field"><span>${label}</span><input type="number" data-noise-param="${key}" aria-label="${label}" min="${min}" max="${max}" step="${step}" value="${value}" data-unit="${unit}"><small>${unit}</small></label>`;
const action=(value,title)=>`<button type="button" data-noise-action="${value}">${title}</button>`;
const db=value=>Number.isFinite(value)?value.toFixed(1)+' dBFS':'--';
function mountNoiseRemover({host}){
 host.innerHTML=`<section class="tool-view module-work pulse-noise-module">
  <div class="tool-view-header"><span>04 / AI STUDIO</span><span>LOCAL SPECTRAL DSP</span></div>
  <h3>Remove noise.<br><span>Preserve detail.</span></h3>
  <p class="tool-description">Reduce steady hiss, hum and rumble using a spectral noise profile. Processing stays in your browser. This is real local DSP, not a trained neural AI model.</p>
  <p class="pulse-detail-label">CLEANUP PRESETS</p>
  <div class="pulse-noise-presets" role="group" aria-label="Noise reduction presets">
   ${Object.keys(presets).map((key,i)=>`<button type="button" data-noise-preset="${key}" aria-pressed="${i===0}">${key.toUpperCase()}</button>`).join('')}
  </div>
  <p class="pulse-detail-label">NOISE REDUCTION PARAMETERS</p>
  <div class="pulse-noise-fields">${controls.map(slider).join('')}</div>
  <div class="pulse-noise-profile">
    <div class="pulse-noise-profile-heading"><span>NOISE PROFILE</span><strong data-noise-profile-label>AUTO / QUIET FRAMES</strong></div>
    <p>Automatic mode learns from quiet parts of the track. For better results, Shift + drag a noise-only region on the SOURCE AUDIO waveform, then select USE SELECTION.</p>
    <div class="pulse-noise-profile-actions">
     <button type="button" data-noise-profile="auto" aria-pressed="true">AUTO PROFILE</button>
     <button type="button" data-noise-profile="selected" aria-pressed="false">USE SELECTION</button>
    </div>
  </div>
  <div class="pulse-noise-actions">${action('render','RENDER NOISE REDUCTION <span aria-hidden="true">&#8599;</span>')}${action('cancel','CANCEL')}</div>
  <div class="pulse-noise-progress-wrap" hidden><label for="pulse-noise-progress">PROCESSING AUDIO <output data-noise-progress>0%</output></label><progress id="pulse-noise-progress" max="100" value="0"></progress></div>
  <div class="pulse-noise-report" aria-label="Original and processed peak levels"><div><span>ORIGINAL PEAK</span><strong data-noise-metric="before">--</strong></div><div><span>CLEANED PEAK</span><strong data-noise-metric="after">--</strong></div></div>
  <div class="pulse-noise-ab"><div role="group" aria-label="Original or processed audio"><button type="button" data-noise-ab="a" aria-pressed="true">A / ORIGINAL</button><button type="button" data-noise-ab="b" aria-pressed="false">B / CLEANED</button></div>${action('listen','PLAY PREVIEW')}</div>
  <div class="pulse-noise-output">${action('apply','APPLY TO WORKSPACE')}${action('export','EXPORT 24-BIT WAV')}</div>
  <p class="pulse-noise-status" role="status" aria-live="polite">Load a track in SOURCE AUDIO, adjust the controls and render.</p>
  <p class="pulse-noise-notice">Best for stationary noise. Severe background voices, wind, and variable sound need a specialized model. Strong settings can reduce musical detail.</p>
 </section>`;
 const $=selector=>host.querySelector(selector),$$=selector=>[...host.querySelectorAll(selector)];
 const status=$('.pulse-noise-status'),progressWrap=$('.pulse-noise-progress-wrap'),progress=$('#pulse-noise-progress');
 const renderButton=$('[data-noise-action="render"]'),cancelButton=$('[data-noise-action="cancel"]');
 const applyButton=$('[data-noise-action="apply"]'),exportButton=$('[data-noise-action="export"]');
 const previewButton=$('[data-noise-action="listen"]');
 let worker=null,sourceRef=null,prepared=null,busy=false,disposed=false,preview=null,selected='a',noiseRange=null;
 const message=(text,error=false)=>{if(disposed)return;status.textContent=text;status.dataset.error=String(error);};
 const invalidate=()=>{
  if(preview)stopPreview();
  sourceRef=null;prepared=null;
  applyButton.disabled=true;exportButton.disabled=true;
  $('[data-noise-metric="after"]').textContent='--';
 };
 const setBusy=value=>{
  busy=value;
  renderButton.disabled=value;cancelButton.hidden=!value;
  for(const input of $$('[data-noise-param], [data-noise-preset], [data-noise-profile]'))input.disabled=value;
  progressWrap.hidden=!value;
  if(value){progress.value=0;$('[data-noise-progress]').textContent='0%';}
 };
 const stopPreview=()=>{
  if(!preview)return;
  const old=preview;preview=null;old.onended=null;
  try{old.stop();old.disconnect();}catch{}
  previewButton.textContent='PLAY PREVIEW';
 };
 const cancel=()=>{
  worker?.terminate();worker=null;
  setBusy(false);
  message('Noise reduction cancelled. The source audio is unchanged.');
 };
 const getSettings=()=>{
  const values={};
  for(const [key,,min,max] of controls){
   const input=$('[data-noise-param="'+key+'"]');
   const value=Number(input?.value);
   if(!Number.isFinite(value)||value<min||value>max)throw Error('Invalid '+key+' parameter.');
   values[key]=value;
  }
  return {highpass:values.highpass,lowpass:values.lowpass,intensity:values.intensity/100,noiseRange};
 };
 const setPreset=key=>{
  const values=presets[key];if(!values||busy)return;
  invalidate();
  for(const [parameter,value] of Object.entries(values)){
   const input=$('[data-noise-param="'+parameter+'"]');
   input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));
  }
  $$('[data-noise-preset]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.noisePreset===key)));
  message(key.toUpperCase()+' preset selected. Render to hear the result.');
 };
 const render=()=>{
  if(busy)return;
  let input,settings;
  try{
   input=w.ensureAudio();settings=getSettings();
   if(input.numberOfChannels>2)throw Error('Noise reduction currently supports mono and stereo audio.');
   if(input.duration>480)throw Error('Noise reduction accepts tracks up to 8 minutes. For longer audio, split the track first.');
   if(typeof Worker==='undefined')throw Error('This browser does not support background audio processing.');
   // Copy source channels before transferring so Undo/Redo and original preview stay intact.
   const channels=Array.from({length:input.numberOfChannels},(_,c)=>new Float32Array(input.getChannelData(c)));
   invalidate();sourceRef=input;setBusy(true);
   $('[data-noise-metric="before"]').textContent=db(audioMetrics(input).peakDb);
   message('Analyzing noise profile and reducing stationary noise...');
   worker=new Worker(new URL('./noise-worker.mjs',import.meta.url),{type:'module'});
   worker.onmessage=event=>{
    if(disposed)return;
    const data=event.data;
    if(data?.type==='progress'){
     progress.value=data.percent;$('[data-noise-progress]').textContent=data.percent+'%';return;
    }
    worker?.terminate();worker=null;setBusy(false);
    if(data?.type==='error'){invalidate();message(data.message||'Noise reduction failed.',true);return;}
    if(data?.type!=='result')return;
    if(w.buffer!==input){invalidate();message('Source audio changed during processing. Render again.',true);return;}
    try{
     const context=w.context,buffer=context.createBuffer(data.channels.length,input.length,input.sampleRate);
     for(let c=0;c<data.channels.length;c++)buffer.copyToChannel(data.channels[c],c);
     prepared=buffer;
     $('[data-noise-metric="after"]').textContent=db(audioMetrics(buffer).peakDb);
     applyButton.disabled=false;exportButton.disabled=false;
     message('Noise reduction rendered. Use A/B to compare, then Apply or Export. Profile: '+data.info.profile+'.');
    }catch(error){invalidate();message(error.message||'Unable to prepare processed audio.',true);}
   };
   worker.onerror=()=>{worker?.terminate();worker=null;setBusy(false);invalidate();message('Audio worker failed. No changes were applied.',true);};
   worker.postMessage({channels,sampleRate:input.sampleRate,settings},channels.map(c=>c.buffer));
  }catch(error){if(worker){worker.terminate();worker=null;}setBusy(false);invalidate();message(error.message||'Cannot process audio.',true);}
 };
 const play=async()=>{
  if(preview){stopPreview();return;}
  try{
   const original=w.ensureAudio();
   if(selected==='b'&&(!prepared||w.buffer!==sourceRef))throw Error('Render cleaned audio before playing B.');
   w.stop();
   const context=await w.ensureContext();
   if(disposed)return;
   const node=context.createBufferSource();node.buffer=selected==='b'?prepared:original;
   node.connect(context.destination);node.onended=()=>{if(preview===node){preview=null;previewButton.textContent='PLAY PREVIEW';}};
   preview=node;node.start(0);previewButton.textContent='STOP PREVIEW';
   message('Playing '+(selected==='b'?'cleaned':'original')+' audio.');
  }catch(error){message(error.message,true);}
 };
 const apply=()=>{
  try{
   if(!prepared||w.buffer!==sourceRef)throw Error('Render again before applying.');
   stopPreview();w.commit(prepared,'Noise reduction applied. Use Undo to restore original audio.');
   invalidate();message('Cleaned audio applied. Undo/Redo are available.');
  }catch(error){message(error.message,true);}
 };
 const save=()=>{
  try{
   if(!prepared||w.buffer!==sourceRef)throw Error('Render again before exporting.');
   const blob=encodeWav(prepared,24),url=URL.createObjectURL(blob),a=document.createElement('a');
   a.href=url;a.download=(w.name||'pulse-audio')+'-noise-removed-24bit.wav';
   a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
   message('Cleaned audio exported as 24-bit WAV.');
  }catch(error){message(error.message,true);}
 };
 $$('[data-noise-param]').forEach(input=>input.addEventListener('input',()=>{
  if(busy)return;
  invalidate();$$('[data-noise-preset]').forEach(b=>b.setAttribute('aria-pressed','false'));
 }));
 $$('[data-noise-preset]').forEach(button=>button.addEventListener('click',()=>setPreset(button.dataset.noisePreset)));
 $$('[data-noise-profile]').forEach(button=>button.addEventListener('click',()=>{
  if(busy)return;
  if(button.dataset.noiseProfile==='selected'){
   const selection=w.selection,b=w.buffer;
   if(!b||!selection||selection.end-selection.start<.15){message('Shift + drag at least 150 ms of noise-only audio on the SOURCE AUDIO waveform.',true);return;}
   noiseRange={start:Math.max(0,selection.start),end:Math.min(b.duration,selection.end)};
   $('[data-noise-profile-label]').textContent=noiseRange.start.toFixed(2)+' - '+noiseRange.end.toFixed(2)+' s';
  }else{noiseRange=null;$('[data-noise-profile-label]').textContent='AUTO / QUIET FRAMES';}
  $$('[data-noise-profile]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  invalidate();message(noiseRange?'Selected noise profile captured. Render to process.':'Automatic noise learning selected.');
 }));
 $$('[data-noise-ab]').forEach(button=>button.addEventListener('click',()=>{
  stopPreview();selected=button.dataset.noiseAb;
  $$('[data-noise-ab]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
 }));
 renderButton.addEventListener('click',render);
 cancelButton.addEventListener('click',cancel);
 previewButton.addEventListener('click',()=>void play());
 applyButton.addEventListener('click',apply);
 exportButton.addEventListener('click',save);
 cancelButton.hidden=true;applyButton.disabled=true;exportButton.disabled=true;
 return ()=>{disposed=true;worker?.terminate();worker=null;stopPreview();prepared=null;sourceRef=null;};
}
export const noiseRemoverModule=Object.freeze({id:'noise-remover',category:'ai',label:'AI Noise Remover',mount:mountNoiseRemover});
