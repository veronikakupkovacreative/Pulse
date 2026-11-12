import {workspace as w} from './workspace.mjs';
import {fromChannels} from './dsp.mjs';
import {downloadConversion} from './converter.mjs';
import {Web} from './web-engine.mjs';

const header=(number,category,title,copy)=>'<div class="tool-view-header"><span>'+number+' / '+category+'</span><span>LOCAL AUDIO PROCESSING</span></div><h3>'+title+'</h3><p class="tool-description">'+copy+'</p>';
const action=(text)=>'<button type="button" class="tool-action tool-action-dark pulse-web-run">'+text+' <span>↗</span></button>';
const status=(text)=>'<p class="tool-footnote pulse-web-status" role="status" aria-live="polite">'+text+'</p>';
const output=(host,message)=>{host.querySelector('.pulse-web-status').textContent=message;};
const runAsync=(host,task)=>{
 const button=host.querySelector('.pulse-web-run');
 button.onclick=async()=>{
  button.disabled=true;output(host,'Processing locally…');
  try{await task();}catch(error){output(host,error?.message||'Processing failed.');}
  finally{button.disabled=false;}
 };
};
function matchChannels(buffer,target){
 if(buffer.numberOfChannels===target)return buffer;
 if(target!==1&&target!==2)throw Error('Merge supports mono or stereo workspace audio.');
 const samples=Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i));
 if(target===2&&samples.length===1)return fromChannels([samples[0].slice(),samples[0].slice()],buffer.sampleRate);
 if(target===1&&samples.length===2){
  const mono=new Float32Array(buffer.length);
  for(let i=0;i<mono.length;i++)mono[i]=(samples[0][i]+samples[1][i])*.5;
  return fromChannels([mono],buffer.sampleRate);
 }
 throw Error('Cannot merge more than two input channels.');
}
export const webModules=Object.freeze([
 {id:'merge-files',category:'edit',label:'Merge Audio Files',mount({host}){
  host.innerHTML='<div class="tool-view module-work pulse-web-tool">'+header('02','EDIT','Merge<br><span>audio files.</span>','Append selected audio files to the track already loaded in SOURCE AUDIO. Sample rates and mono/stereo layouts are matched automatically. A short transition fade prevents clicks.')+
   '<div class="pulse-fx-controls"><label class="pulse-fx-file-label">AUDIO FILES TO APPEND<input class="pulse-web-files" type="file" accept="audio/*,.wav,.mp3,.m4a,.aac,.flac,.ogg" multiple></label></div>'+
   action('Merge into SOURCE AUDIO')+status('Load your original track, then select one or more files to append.')+'</div>';
  const input=host.querySelector('.pulse-web-files');
  input.onchange=()=>output(host,(input.files?.length||0)+' additional file(s) selected.');
  runAsync(host,async()=>{
   const base=w.ensureAudio(),files=[...(input.files||[])];
   if(!files.length)throw Error('Select at least one file to append.');
   if(files.length>8)throw Error('Merge supports up to eight additional files.');
   const engine=new Web(w.context),buffers=[base];
   for(let i=0;i<files.length;i++){
    output(host,'Decoding '+(i+1)+' of '+files.length+'…');
    let b=await engine.importAudio(files[i]);
    if(b.sampleRate!==base.sampleRate)b=await engine.bitrateConverter(b,base.sampleRate);
    buffers.push(matchChannels(b,base.numberOfChannels));
   }
   const merged=engine.mergeAudioFiles(buffers);
   w.commit(merged,'Merged '+files.length+' audio file(s).');
   output(host,'Files merged into SOURCE AUDIO. Undo is available.');
  });
 }},
 {id:'speed-change',category:'edit',label:'Audio Speed',mount({host}){
  host.innerHTML='<div class="tool-view module-work pulse-web-tool">'+header('02','EDIT','Change<br><span>audio speed.</span>','Change playback speed and pitch together. This is a varispeed process, not independent time-stretch or Auto-Tune.')+
  '<div class="pulse-fx-controls"><label class="pulse-fx-field">SPEED MULTIPLIER<select class="pulse-web-speed"><option value=".5">0.5× / half speed</option><option value=".75">0.75×</option><option value="1" selected>1.0× / original</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2.0× / double speed</option></select></label></div>'+
  action('Apply speed change')+status('Load audio in SOURCE AUDIO first.')+'</div>';
  runAsync(host,async()=>{
   const base=w.ensureAudio(),rate=Number(host.querySelector('.pulse-web-speed').value),engine=new Web(w.context);
   if(rate===1)throw Error('Choose a speed other than 1.0×.');
   const result=await engine.changeSpeedBuffer(base,rate);
   w.commit(result,'Playback speed set to '+rate+'×.');
   output(host,'Applied '+rate+'× varispeed. Duration and pitch changed; Undo is available.');
  });
 }},
 {id:'file-size',category:'export',label:'File Size Calculator',mount({host}){
  host.innerHTML='<div class="tool-view module-work pulse-web-tool">'+header('03','EXPORT','Estimate<br><span>file size.</span>','Estimate a constant-bitrate compressed file and compare it with 16-bit PCM WAV. Actual codec size varies with encoder and container overhead.')+
   '<div class="pulse-fx-controls"><label class="pulse-fx-field">TARGET BITRATE<select class="pulse-web-bitrate"><option value="auto" selected>AUTO · 320 kbps (music)</option><option value="64">64 kbps</option><option value="96">96 kbps</option><option value="128">128 kbps</option><option value="160">160 kbps</option><option value="192" selected>192 kbps</option><option value="256">256 kbps</option><option value="320">320 kbps</option></select></label></div>'+
   action('Calculate file size')+status('Load audio to estimate output size.')+'</div>';
  runAsync(host,async()=>{
   const b=w.ensureAudio(),engine=new Web(w.context),kbps=host.querySelector('.pulse-web-bitrate').value==='auto'?320:Number(host.querySelector('.pulse-web-bitrate').value),size=engine.fileSizeCalculator(b,kbps);
   const wavBytes=44+b.length*b.numberOfChannels*2;
   output(host,b.duration.toFixed(1)+' s · '+kbps+' kbps ≈ '+size.megabytes+' compressed (estimated); 16-bit WAV ≈ '+(wavBytes/1048576).toFixed(2)+' MB.');
  });
 }},
 ]);
