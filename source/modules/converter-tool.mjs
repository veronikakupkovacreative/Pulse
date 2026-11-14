import {workspace as w} from './workspace.mjs';
import {AUDIO_FORMATS,BITRATES,conversionOptions,convertBuffer,downloadConversion} from './converter.mjs';

const field=(id,label,items)=>'<div class="fieldblock"><label for="'+id+'">'+label+'</label><select id="'+id+'">'+items.map(([value,name])=>'<option value="'+value+'">'+name+'</option>').join('')+'</select></div>';
const report=(node,message,error=false)=>{node.textContent=message;node.dataset.error=String(error);};

function mountAudioConverter({host}){
 host.innerHTML='<section class="pulse-converter block">'+
  '<div class="row row--between"><div><p class="eyebrow">03 / CONVERT</p><h2>Export format</h2></div><span class="tag tag--local">Local</span></div>'+
  '<p class="note">Convert the current SOURCE AUDIO track in your browser. No second upload and no remote audio transfer.</p>'+
  '<div class="fields fields--2">'+
   field('format','Output format',AUDIO_FORMATS.map(f=>[f.id,f.name+' · '+f.description]))+
   field('sampleRate','Sample rate',[['auto','AUTO · 44.1 kHz'],['original','Original'],...['22050','32000','44100','48000','88200','96000'].map(v=>[v,(Number(v)/1000)+' kHz'])])+
  '</div>'+
  '<div class="fields fields--2 converter-options">'+
   '<div data-converter="bitrate">'+field('bitrate','Bitrate',[['auto','AUTO · recommended'],...BITRATES.map(v=>[String(v),v+' kbps'])])+'</div>'+
   '<div data-converter="depth">'+field('bitDepth','WAV bit depth',[['auto','AUTO · 24-bit PCM'],['16','16-bit PCM'],['24','24-bit PCM']])+'</div>'+
   '<div data-converter="ogg">'+field('oggQuality','OGG Vorbis quality',[['auto','AUTO · Q6'],...Array.from({length:11},(_,i)=>[String(i),'Q'+i])])+'</div>'+
   '<div data-converter="flac">'+field('flacLevel','FLAC compression',[['auto','AUTO · Level 5'],...Array.from({length:9},(_,i)=>[String(i),'Level '+i])])+'</div>'+
  '</div>'+
  '<p class="note" id="converter-codec-note">WAV uses native PCM encoding. Compressed formats load the local FFmpeg codec on first use.</p>'+
  '<div class="converter-progress" role="progressbar" aria-label="Encoding progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></div>'+
  '<div class="row row--between"><p class="converter-status" role="status" aria-live="polite" data-converter-status>Load SOURCE AUDIO to begin.</p><button class="btn btn--primary" type="button" data-converter-run>Convert &amp; download ↗</button></div>'+
 '</section>';
 const format=host.querySelector('#format'),sampleRate=host.querySelector('#sampleRate');
 const button=host.querySelector('[data-converter-run]'),out=host.querySelector('[data-converter-status]');
 const progress=host.querySelector('.converter-progress'),bar=progress.querySelector('span');
 let busy=false;
 const update=()=>{
  const value=format.value;
  for(const [name,active] of [['bitrate',['mp3','aac','m4a','wma'].includes(value)],['depth',value==='wav'],['ogg',value==='ogg'],['flac',value==='flac']]){
   host.querySelector('[data-converter="'+name+'"]').hidden=!active;
  }
  host.querySelector('#converter-codec-note').textContent=value==='wav'&&sampleRate.value==='original'
   ?'Native PCM WAV conversion · original sample rate.'
   :'Local FFmpeg WebAssembly processing · first use downloads the codec. Audio remains on this device.';
 };
 const onChange=()=>update();format.addEventListener('change',onChange);sampleRate.addEventListener('change',onChange);update();
 const run=async()=>{
  if(busy)return;busy=true;button.disabled=true;progress.setAttribute('aria-valuenow','0');bar.style.width='0%';
  try{
   const source=w.ensureAudio();
   const options=conversionOptions({format:format.value,sampleRate:sampleRate.value,bitrate:host.querySelector('#bitrate').value,
    bitDepth:host.querySelector('#bitDepth').value,oggQuality:host.querySelector('#oggQuality').value,flacLevel:host.querySelector('#flacLevel').value});
   report(out,'Preparing '+options.format.toUpperCase()+' conversion…');
   const blob=await convertBuffer(source,options,message=>report(out,message),percent=>{
    const value=Math.max(0,Math.min(100,Number(percent)||0));progress.setAttribute('aria-valuenow',String(value));bar.style.width=value+'%';
   });
   if(w.buffer!==source)throw Error('SOURCE AUDIO changed during conversion. Run it again.');
   downloadConversion(blob,w.name,options.format);
   report(out,'Exported '+options.format.toUpperCase()+' · '+(blob.size/1048576).toFixed(2)+' MB.');
  }catch(error){report(out,error.message||'Conversion failed.',true)}
  finally{busy=false;button.disabled=false;}
 };
 button.addEventListener('click',run);
 return()=>{format.removeEventListener('change',onChange);sampleRate.removeEventListener('change',onChange);button.removeEventListener('click',run);};
}
export const converterModule=Object.freeze({id:'wav',category:'prepare',label:'Audio Converter',mount:mountAudioConverter});
