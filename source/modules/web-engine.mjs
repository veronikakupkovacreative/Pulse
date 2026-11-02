/**
 * Compatibility API for the user-supplied Web audio engine.
 * Uses the existing PULSE DSP and visualizer rather than replacing them.
 * "AI" method names describe deterministic processing, not neural inference.
 */
import {ThePulseStudioEngine} from './pulse-engine.mjs';
import {fromChannels,cloneBuffer,reverseBuffer,estimateBpm} from './dsp.mjs';
import {stripSilence,separateCenter,resampleBuffer,exportWav as writeWav} from './legacy-dsp.mjs';
import {decodeUnsupportedAudio,EXTENSIONS} from './converter.mjs';

const finite=(value,min,max,name)=>{
 const n=Number(value);
 if(!Number.isFinite(n)||n<min||n>max)throw Error('Invalid '+name+' ('+min+'–'+max+').');
 return n;
};
const validateBuffer=buffer=>{
 if(!buffer||!Number.isInteger(buffer.numberOfChannels)||buffer.numberOfChannels<1||
    !Number.isInteger(buffer.length)||buffer.length<1||
    !Number.isFinite(buffer.sampleRate)||buffer.sampleRate<8000||
    typeof buffer.getChannelData!=='function')throw Error('Valid audio buffer required.');
 return buffer;
};
const amplitude=db=>10**(db/20);

export class Web extends ThePulseStudioEngine{
 constructor(audioContext=null){super();this.audioContext=audioContext;}
 context(){
  if(this.audioContext)return this.audioContext;
  const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;
  if(!Audio)throw Error('Web Audio API is not available in this browser.');
  this.audioContext=new Audio();
  return this.audioContext;
 }
 async importAudio(file){
  if(!file||typeof file.arrayBuffer!=='function')throw Error('Select an audio file.');
  if(file.size>100*1024*1024)throw Error('Maximum source size is 100 MB.');
  const context=this.context();
  let decoded,initialError;
  try{decoded=await context.decodeAudioData(await file.arrayBuffer());}
  catch(error){initialError=error;}
  if(!decoded){
   const ext=String(file.name||'').toLowerCase().split('.').pop();
   if(!EXTENSIONS.includes(ext))throw Error('Unsupported audio format: '+ext+'.');
   try{
    const wav=await decodeUnsupportedAudio(file);
    decoded=await context.decodeAudioData(await wav.arrayBuffer());
   }catch(error){
    throw Error('Could not decode audio locally: '+(error?.message||initialError?.message||'unknown codec'));
   }
  }
  if(decoded.duration>1200||decoded.length*decoded.numberOfChannels*4>240*1024*1024)
   throw Error('Maximum decoded audio is 20 minutes / 240 MB.');
  return decoded;
 }
 async extractAudioFromVideo(file){
  if(!file||!/\.(mp4|mov)$/i.test(String(file.name||'')))
   throw Error('Choose an MP4 or MOV file with an audio track.');
  return this.importAudio(file);
 }
 cutAudio(buffer,startTimeSec,endTimeSec){
  const b=validateBuffer(buffer);
  const start=finite(startTimeSec,0,b.duration,'start time');
  const end=finite(endTimeSec,0,b.duration,'end time');
  const a=Math.floor(start*b.sampleRate),z=Math.min(b.length,Math.ceil(end*b.sampleRate));
  if(z<=a)throw Error('Select a non-empty audio range.');
  return fromChannels(Array.from({length:b.numberOfChannels},(_,c)=>b.getChannelData(c).slice(a,z)),b.sampleRate);
 }
 normalizeAudio(buffer,targetPeakDB=-0.1){
  const b=validateBuffer(buffer),ceiling=finite(targetPeakDB,-60,0,'peak target');
  let peak=0;
  for(let c=0;c<b.numberOfChannels;c++)for(const v of b.getChannelData(c))peak=Math.max(peak,Math.abs(v));
  if(peak<1e-10)return cloneBuffer(b);
  const gain=amplitude(ceiling)/peak;
  return fromChannels(Array.from({length:b.numberOfChannels},(_,c)=>Float32Array.from(b.getChannelData(c),x=>x*gain)),b.sampleRate);
 }
 removeSilence(buffer,thresholdDB=-40){
  validateBuffer(buffer);
  return stripSilence(buffer,finite(thresholdDB,-90,-1,'silence threshold'));
 }
 reverseAudio(buffer){return reverseBuffer(validateBuffer(buffer));}
 mergeAudioFiles(buffers){
  if(!Array.isArray(buffers)||!buffers.length)throw Error('Provide audio files to merge.');
  buffers.forEach(validateBuffer);
  const rate=buffers[0].sampleRate,channels=buffers[0].numberOfChannels;
  if(buffers.some(b=>b.sampleRate!==rate||b.numberOfChannels!==channels))
   throw Error('Merge requires matching sample rates and channel counts. Resample first.');
  const frames=buffers.reduce((sum,b)=>sum+b.length,0);
  if(frames*channels*4>320*1024*1024)throw Error('Merged audio exceeds the 320 MB memory limit.');
  const out=Array.from({length:channels},()=>new Float32Array(frames));
  let offset=0;
  for(const b of buffers){
   for(let c=0;c<channels;c++)out[c].set(b.getChannelData(c),offset);
   // 5 ms micro-fades on both sides of a join prevent clicks without overlap.
   if(offset>0){
    const fade=Math.min(Math.round(rate*.005),Math.floor(offset/2),Math.floor(b.length/2));
    for(let c=0;c<channels;c++)for(let i=0;i<fade;i++){
     out[c][offset-fade+i]*=1-i/Math.max(1,fade);
     out[c][offset+i]*=i/Math.max(1,fade);
    }
   }
   offset+=b.length;
  }
  return fromChannels(out,rate);
 }
 async bitrateConverter(buffer,targetSampleRate=44100){
  validateBuffer(buffer);
  return resampleBuffer(buffer,finite(targetSampleRate,8000,192000,'sample rate'));
 }
 async resampleAudio(buffer,targetSampleRate){return this.bitrateConverter(buffer,targetSampleRate);}
 fileSizeCalculator(buffer,bitrateKbps=128){
  const b=validateBuffer(buffer),kbps=finite(bitrateKbps,8,10000,'bitrate');
  // Decimal kilobits per second; codec and container overhead are not included.
  const bytes=Math.round(kbps*1000*b.duration/8);
  return {bytes,megabytes:(bytes/1048576).toFixed(2)+' MB',estimated:true};
 }
 async exportWavBlob(buffer,targetSampleRate=null){
  validateBuffer(buffer);
  return writeWav(buffer,targetSampleRate===null?null:finite(targetSampleRate,8000,192000,'sample rate'));
 }
 adjustVolume(volume=1){
  const ctx=this.context(),node=ctx.createGain();
  node.gain.setValueAtTime(finite(volume,0,16,'linear volume'),ctx.currentTime);
  return node;
 }
 changeAudioSpeed(sourceNode,rate=1){
  if(!sourceNode?.playbackRate?.setValueAtTime)throw Error('BufferSourceNode required.');
  const ctx=sourceNode.context||this.context();
  sourceNode.playbackRate.setValueAtTime(finite(rate,.25,4,'playback rate'),ctx.currentTime);
  return sourceNode;
 }
 async changeSpeedBuffer(buffer,rate=1){
  const b=validateBuffer(buffer),speed=finite(rate,.25,4,'playback rate');
  const Offline=globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext;
  if(!Offline)throw Error('Offline Web Audio is not supported.');
  const ctx=new Offline(b.numberOfChannels,Math.max(1,Math.ceil(b.length/speed)),b.sampleRate);
  const src=ctx.createBufferSource(),native=ctx.createBuffer(b.numberOfChannels,b.length,b.sampleRate);
  for(let c=0;c<b.numberOfChannels;c++)native.copyToChannel(b.getChannelData(c),c);
  src.buffer=native;src.playbackRate.value=speed;
  src.connect(ctx.destination);src.start(0);
  return ctx.startRendering(); // Speed and pitch both change; NOT pitch-preserving stretch.
 }
 bassBooster(boostDB=8){
  const ctx=this.context(),node=ctx.createBiquadFilter();node.type='lowshelf';
  node.frequency.value=150;node.gain.value=finite(boostDB,-24,24,'bass boost');
  return node;
 }
 reduceBackgroundNoise(cutoffFreq=80){
  const ctx=this.context(),node=ctx.createBiquadFilter();node.type='highpass';
  node.frequency.value=finite(cutoffFreq,20,5000,'high-pass frequency');node.Q.value=.707;
  return node; // Rumble filter, not broadband spectral noise reduction.
 }
 audioCompressor(threshold=-24,ratio=4,attack=.003,release=.25){
  const ctx=this.context(),node=ctx.createDynamicsCompressor();
  node.threshold.value=finite(threshold,-100,0,'threshold');node.ratio.value=finite(ratio,1,20,'ratio');
  node.attack.value=finite(attack,0,1,'attack');node.release.value=finite(release,0,1,'release');
  return node;
 }
 audioFadeInOut(gainNode,duration=2,isFadeIn=true,startTime=0){
  if(!gainNode?.gain?.linearRampToValueAtTime)throw Error('GainNode required.');
  const ctx=gainNode.context||this.context();
  const start=ctx.currentTime+finite(startTime,0,3600,'fade start');
  const length=finite(duration,.001,3600,'fade length');
  gainNode.gain.setValueAtTime(isFadeIn?0:1,start);
  gainNode.gain.linearRampToValueAtTime(isFadeIn?1:0,start+length);
  return gainNode;
 }
 audioEqualizer(bandsCount=3){
  if(bandsCount!==3&&bandsCount!==5)throw Error('Equalizer supports 3 or 5 bands.');
  const ctx=this.context(),input=ctx.createGain(),output=ctx.createGain();
  const specs=bandsCount===3?
   [['low','lowshelf',100],['mid','peaking',1000],['high','highshelf',10000]]:
   [['sub','lowshelf',60],['bass','peaking',230],['mid','peaking',1000],['highMid','peaking',4000],['brilliance','highshelf',12000]];
  const bands={};let last=input;
  for(const [id,type,frequency] of specs){
   const node=ctx.createBiquadFilter();node.type=type;node.frequency.value=frequency;node.gain.value=0;
   node.Q.value=type==='peaking'?1.2:.707;last.connect(node);last=node;bands[id]=node;
  }
  last.connect(output);
  const applyPreset=name=>{
   const presets=bandsCount===3?{
    edm:[4.5,-1.5,3],vocals:[-2,3.5,2],flat:[0,0,0]
   }:{
    edm:[4,2,-1,3,5],vocals:[-3,1,3,4,2],flat:[0,0,0,0,0]
   };
   const values=presets[String(name).toLowerCase()]||presets.flat;
   specs.forEach(([id],i)=>{bands[id].gain.value=values[i]});
  };
  return {input,output,bands,applyPreset};
 }
 aiMixer(){
  const ctx=this.context(),input=ctx.createGain(),output=ctx.createGain();
  const eq=ctx.createBiquadFilter();eq.type='peaking';eq.frequency.value=2000;eq.gain.value=1.5;
  const compressor=this.audioCompressor(-18,2.5,.01,.2);
  input.connect(eq);eq.connect(compressor);compressor.connect(output);
  return {input,output,compressor,eq,method:'DSP'};
 }
 aiMaster(){
  const ctx=this.context(),input=ctx.createGain(),output=ctx.createGain();
  const limiter=this.audioCompressor(-1,20,.002,.12),makeup=ctx.createGain();
  makeup.gain.value=1;input.connect(limiter);limiter.connect(makeup);makeup.connect(output);
  return {input,output,limiter,makeup,method:'DSP (not true peak)'};
 }
 voiceCleaner(){
  const ctx=this.context(),input=ctx.createGain(),output=ctx.createGain();
  const highpass=ctx.createBiquadFilter();highpass.type='highpass';highpass.frequency.value=100;
  const presence=ctx.createBiquadFilter();presence.type='peaking';presence.frequency.value=3000;presence.gain.value=4;
  const compressor=this.audioCompressor(-24,4);
  input.connect(highpass);highpass.connect(presence);presence.connect(compressor);compressor.connect(output);
  return {input,output,highpass,presence,compressor};
 }
 audioEnhancer(mode='studio_sound'){
  return this.createAIAudioEnhancer(mode).createLiveChain(this.context());
 }
 async detectBPM(buffer){
  const result=estimateBpm(validateBuffer(buffer));
  return {bpm:result.bpm,confidence:result.confidence,onsets:result.onsets};
 }
 separateStems(buffer){
  const {vocals,instrumental}=separateCenter(validateBuffer(buffer));
  return {vocals,instrumental,method:'stereo center extraction (not AI stems)'};
 }
}
export default Web;
