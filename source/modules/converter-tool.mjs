import {workspace as w} from './workspace.mjs';
import {AUDIO_FORMATS,BITRATES,conversionOptions,convertBuffer,downloadConversion} from './converter.mjs';

const dropdown=(id,label,items)=>'<label class="pulse-field" for="'+id+'"><span>'+label+'</span><select id="'+id+'">'+items.map(([value,name])=>'<option value="'+value+'">'+name+'</option>').join('')+'</select></label>';
const setStatus=(node,message,error=false)=>{node.textContent=message;node.dataset.kind=error?'error':'success';};

function mountAudioConverter({host}){
 host.innerHTML='<section class="tool-view module-work pulse-converter">'+
  '<div class="tool-view-header"><span>03 / AUDIO CONVERTER</span><span>LOCAL / FFMPEG WEBASSEMBLY</span></div>'+
  '<h3>Change the format.<br><span>Keep creating.</span></h3>'+
  '<p class="tool-description">Convert the track from SOURCE AUDIO in your browser. No second upload and no remote audio transfer.</p>'+
  '<div class="tool-fields">'+
   dropdown('format','Output format',AUDIO_FORMATS.map(f=>[f.id,f.name+' · '+f.description]))+
   dropdown('sampleRate','Sample rate',[['auto','AUTO · 44.1 kHz'],['original','Original'],...['22050','32000','44100','48000','88200','96000'].map(v=>[v,(Number(v)/1000)+' kHz'])])+
  '</div>'+
  '<div class="tool-fields converter-options">'+
   '<div data-converter="bitrate">'+dropdown('bitrate','Bitrate',[['auto','AUTO · recommended'],...BITRATES.map(v=>[String(v),v+' kbps'])])+'</div>'+
   '<div data-converter="depth">'+dropdown('bitDepth','WAV bit depth',[['auto','AUTO · 24-bit PCM'],['16','16-bit PCM'],['24','24-bit PCM']])+'</div>'+
   '<div data-converter="ogg">'+dropdown('oggQuality','OGG Vorbis quality',[['auto','AUTO · Q6'],...Array.from({length:11},(_,i)=>[String(i),'Q'+i])])+'</div>'+
   '<div data-converter="flac">'+dropdown('flacLevel','FLAC compression',[['auto','AUTO · Level 5'],...Array.from({length:9},(_,i)=>[String(i),'Level '+i])])+'</div>'+
  '</div>'+
  '<p class="converter-codec-note" id="converter-codec-note">WAV uses native PCM encoding. Compressed formats load the local FFmpeg codec on first use.</p>'+
  '<div class="converter-progress" role="progressbar" aria-label="Encoding progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>'+
  '<div class="pulse-module-actions"><button type="button" class="tool-action tool-action-dark module-action" data-converter-run><span>Convert &amp; download</span><b aria-hidden="true">↗</b></button></div>'+
  '<p class="tool-footnote module-result" role="status" aria-live="polite">Load SOURCE AUDIO to begin.</p>'+
 '</section>';
 const format=host.querySelector('#format'),sampleRate=host.querySelector('#sampleRate');
 const button=host.querySelector('[data-converter-run]'),out=host.querySelector('.module-result');
 const progress=host.querySelector('.converter-progress'),bar=progress.querySelector('i');
 let busy=false;
 const update=()=>{
  const value=format.value;
  for(const [name,active] of [['bitrate',['mp3','aac','m4a','wma'].includes(value)],['depth',value==='wav'],['ogg',value==='ogg'],['flac',value==='flac']]){
   const field=host.querySelector('[data-converter="'+name+'"]');field.hidden=!active;
  }
  host.querySelector('#converter-codec-note').textContent=value==='wav'&&sampleRate.value==='original'
   ?'Native PCM WAV conversion · original sample rate.'
   :'Local FFmpeg WebAssembly processing · first use downloads the codec. Audio remains on this device.';
 };
 const onFormat=()=>update();format.addEventListener('change',onFormat);sampleRate.addEventListener('change',onFormat);update();
 const run=async()=>{
  if(busy)return;busy=true;button.disabled=true;progress.setAttribute('aria-valuenow','0');bar.style.width='0%';
  try{
   const source=w.ensureAudio();
   const options=conversionOptions({format:format.value,sampleRate:sampleRate.value,bitrate:host.querySelector('#bitrate').value,
    bitDepth:host.querySelector('#bitDepth').value,oggQuality:host.querySelector('#oggQuality').value,flacLevel:host.querySelector('#flacLevel').value});
   setStatus(out,'Preparing '+options.format.toUpperCase()+' conversion…');
   const blob=await convertBuffer(source,options,message=>setStatus(out,message),percent=>{
    const value=Math.max(0,Math.min(100,Number(percent)||0));progress.setAttribute('aria-valuenow',String(value));bar.style.width=value+'%';
   });
   if(w.buffer!==source)throw Error('SOURCE AUDIO changed during conversion. Run it again.');
   downloadConversion(blob,w.name,options.format);
   setStatus(out,'Exported '+options.format.toUpperCase()+' · '+(blob.size/1048576).toFixed(2)+' MB.');
  }catch(error){setStatus(out,error.message||'Conversion failed.',true)}
  finally{busy=false;button.disabled=false;}
 };
 button.addEventListener('click',run);
 return()=>{format.removeEventListener('change',onFormat);sampleRate.removeEventListener('change',onFormat);button.removeEventListener('click',run);};
}
export const converterModule=Object.freeze({id:'wav',category:'prepare',label:'Audio Converter',mount:mountAudioConverter});
