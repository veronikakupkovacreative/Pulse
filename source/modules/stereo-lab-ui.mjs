/** Local Stereo Lab and Vocal Doubler controls for the PULSE AI Studio workspace. */
import {workspace as w} from './workspace.mjs';
import {analyzeStereo} from './stereo-lab-dsp.mjs';
import {processStereoInWorker} from './stereo-lab-client.mjs';

const field=(key,label,min,max,step,value,unit='')=>
 '<label class="ai2-field"><span>'+label+(unit?' · '+unit:'')+'</span>'+
 '<input type="number" data-stereo-param="'+key+'" min="'+min+'" max="'+max+'" step="'+step+'" value="'+value+'"></label>';
const action=(key,label)=>'<button class="ai2-action" type="button" data-stereo-action="'+key+'">'+label+'<span aria-hidden="true">↗</span></button>';
const fmt=n=>Number.isFinite(n)?n.toFixed(2):'—';
function mountTool({host},mode){
 const stereo=mode==='stereo';
 const title=stereo?'STEREO LAB':'VOCAL DOUBLER';
 const description=stereo?'Control width, stereo position and bass mono below a selected crossover. This is local Mid/Side signal processing — no stem isolation or neural services.'
  :'Add natural-sounding stereo doubles using two gently modulated delays. Use a dry vocal for best results. This is not voice cloning, vocal extraction or pitch correction.';
 const params=stereo?[
  ['width','Stereo width',0,200,5,110,'%'],
  ['bassMonoHz','Bass mono below',40,280,5,120,'Hz'],
  ['pan','Stereo balance',-100,100,5,0,'L / R'],
  ['outputGainDb','Output trim',-12,6,.5,0,'dB']
 ]:[
  ['delayMs','Micro delay',12,45,1,22,'ms'],
  ['depthMs','Modulation depth',0,3.5,.1,1.4,'ms'],
  ['modulationHz','Modulation rate',.12,1.8,.05,.62,'Hz'],
  ['width','Double width',0,200,5,100,'%'],
  ['mix','Effect amount',0,75,5,35,'%']
 ];
 const presets=stereo?[
  ['natural','NATURAL', {width:100,bassMonoHz:120,pan:0,outputGainDb:0}],
  ['wide','WIDE MIX',{width:140,bassMonoHz:140,pan:0,outputGainDb:-1}],
  ['mono-bass','MONO LOW',{width:100,bassMonoHz:220,pan:0,outputGainDb:0}]
 ]:[
  ['natural','NATURAL',{delayMs:24,depthMs:.7,modulationHz:.37,width:85,mix:25}],
  ['wide','WIDE VOCALS',{delayMs:29,depthMs:1.6,modulationHz:.62,width:150,mix:48}],
  ['tight','TIGHT DOUBLE',{delayMs:16,depthMs:.45,modulationHz:.42,width:95,mix:34}]
 ];
 host.innerHTML='<section class="tool-view ai2-panel ai2-local-stereo">'+
  '<div class="tool-view-header"><span>04 / '+title+'</span><span>LOCAL DSP / WEB WORKER</span></div>'+
  (stereo?'<h3>Shape the space.<br><span>Control the low end.</span></h3>':
   '<h3>Double the voice.<br><span>Keep it human.</span></h3>')+
  '<p class="tool-description">'+description+'</p>'+
  '<div class="ai2-switch-buttons ai2-local-presets" role="group" aria-label="'+title+' presets">'+
    presets.map(([id,label],i)=>'<button type="button" data-stereo-preset="'+id+'" aria-pressed="'+(i===0)+'">'+label+'</button>').join('')+'</div>'+
  '<div class="ai2-fields">'+params.map(([key,label,min,max,step,value,unit])=>field(key,label,min,max,step,value,unit)).join('')+'</div>'+
  '<div class="ai2-metrics">'+
   '<div>STEREO CORRELATION<strong data-stereo-corr>—</strong></div>'+
   '<div>SIDE / MID<strong data-stereo-side>—</strong></div>'+
   '<div>OUTPUT PEAK<strong data-stereo-peak>—</strong></div>'+
  '</div>'+
  '<div class="ai2-actions">'+action('analyze','ANALYZE STEREO')+
    action('render',stereo?'PROCESS STEREO':'APPLY VOCAL DOUBLER')+'</div>'+
  '<p class="ai2-note">Local processing. Changes are committed to SOURCE AUDIO and can be reverted with Undo. Listen for mono compatibility and unintended artifacts.</p>'+
  '<p class="ai2-status" role="status" aria-live="polite" data-stereo-status>Upload audio in SOURCE AUDIO to begin.</p>'+
 '</section>';
 let disposed=false,controller=null,busy=false;
 const $=selector=>host.querySelector(selector);
 const buttons=[...host.querySelectorAll('button')];
 const message=(value,error=false)=>{if(disposed)return;const s=$('[data-stereo-status]');s.textContent=value;s.dataset.error=String(error);};
 function display(stats){
  $('[data-stereo-corr]').textContent=stats.correlation===null?'MONO':fmt(stats.correlation);
  $('[data-stereo-side]').textContent=fmt(stats.sideToMidDb)+' dB';
  $('[data-stereo-peak]').textContent=fmt(stats.peakDb)+' dBFS';
 }
 function setBusy(value){busy=value;for(const b of buttons)b.disabled=value;for(const el of host.querySelectorAll('input'))el.disabled=value;}
 const settings=()=>Object.fromEntries(params.map(([key,label,min,max])=>{
  const value=Number($('[data-stereo-param="'+key+'"]').value);
  if(!Number.isFinite(value)||value<min||value>max)throw Error('Invalid '+label.toLowerCase()+'.');
  return [key,value];
 }));
 for(const [id,,preset] of presets){
  const button=$('[data-stereo-preset="'+id+'"]');
  button.onclick=()=>{
   if(busy)return;
   for(const [key,value] of Object.entries(preset))$('[data-stereo-param="'+key+'"]').value=String(value);
   for(const b of host.querySelectorAll('[data-stereo-preset]'))
    b.setAttribute('aria-pressed',String(b===button));
   message('Preset loaded. Apply to hear changes.');
  };
 }
 for(const el of host.querySelectorAll('[data-stereo-param]')){
  el.addEventListener('change',()=>{
   for(const b of host.querySelectorAll('[data-stereo-preset]'))b.setAttribute('aria-pressed','false');
  });
 }
 $('[data-stereo-action="analyze"]').onclick=()=>{
  try{
   display(analyzeStereo(w.ensureAudio()));
   message('Stereo balance measured. Correlation near +1 is mono-compatible; negative values may cancel in mono.');
  }catch(error){message(error.message,true);}
 };
 $('[data-stereo-action="render"]').onclick=async()=>{
  if(busy||disposed)return;
  const abort=new AbortController();controller=abort;
  try{
   const source=w.ensureAudio(),config=settings();
   setBusy(true);message(stereo?'Rendering Mid/Side stereo processing…':'Rendering stereo vocal doubles…');
   const result=await processStereoInWorker(stereo?'stereo':'doubler',source,config,abort.signal);
   if(disposed||abort.signal.aborted||w.buffer!==source)return;
   w.commit(result.buffer,stereo?'Stereo Lab applied.':'Vocal Doubler applied.');
   display(result.after);
   message((stereo?'Stereo Lab':'Vocal Doubler')+' applied. Peak protection '+result.protectionDb.toFixed(1)+' dB. Compare with Undo.');
  }catch(error){if(!disposed&&error.name!=='AbortError')message(error.message,true);}
  finally{if(!disposed)setBusy(false);if(controller===abort)controller=null;}
 };
 return()=>{disposed=true;controller?.abort();};
}
export const mountStereoLab=args=>mountTool(args,'stereo');
export const mountVocalDoubler=args=>mountTool(args,'doubler');
