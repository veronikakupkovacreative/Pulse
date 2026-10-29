// Decode original-quality audio once; analysis DSP must downsample its own copy.
// AudioContext.decodeAudioData normally resamples to the hardware context rate.
// A native-rate OfflineAudioContext prevents that for standard PCM WAV inputs.
export function wavSampleRate(bytes){
  if(!(bytes instanceof ArrayBuffer)||bytes.byteLength<44)return null;
  const view=new DataView(bytes);
  const tag=offset=>String.fromCharCode(view.getUint8(offset),view.getUint8(offset+1),view.getUint8(offset+2),view.getUint8(offset+3));
  if(tag(0)!=='RIFF'||tag(8)!=='WAVE')return null;
  let at=12;
  while(at+8<=bytes.byteLength&&at<1024*1024){
    const size=view.getUint32(at+4,true);
    if(tag(at)==='fmt '&&size>=16&&at+24<=bytes.byteLength){
      const rate=view.getUint32(at+12,true);
      return rate>=8000&&rate<=192000?rate:null;
    }
    at+=8+size+(size&1);
  }
  return null;
}

export async function decodeSourceAudio(file,{context=null}={}){
  if(!file||typeof file.arrayBuffer!=='function')throw new Error('READ_FILE');
  let bytes;
  try{bytes=await file.arrayBuffer();}catch{throw new Error('READ_FILE');}
  const nativeRate=wavSampleRate(bytes);
  const AudioCtx=window.AudioContext||window.webkitAudioContext;
  const OfflineCtx=window.OfflineAudioContext||window.webkitOfflineAudioContext;
  if(!AudioCtx&&!OfflineCtx)throw new Error('Web Audio API is unavailable in this browser.');
  let buffer=null;
  if(nativeRate&&OfflineCtx){
    try {
      const decoder=new OfflineCtx(1,1,nativeRate);
      buffer=await decoder.decodeAudioData(bytes.slice(0));
    } catch {
      // Safari has device-specific limits on OfflineAudioContext decoding.
    }
  }
  if(!buffer){
    try{
      const decoder=context||(AudioCtx?new AudioCtx():new OfflineCtx(1,1,22050));
      buffer=await decoder.decodeAudioData(bytes);
      // The decoder/context can remain available for playback; never close a caller-owned context.
      if(!context&&AudioCtx&&decoder.close)await decoder.close().catch(()=>{});
    }catch{throw new Error('DECODE');}
  }
  if(!buffer?.length||!buffer.numberOfChannels)throw new Error('DECODE');
  return {buffer,metadata:{
    sampleRate:buffer.sampleRate,
    sourceSampleRate:nativeRate,
    channels:buffer.numberOfChannels,
    duration:buffer.duration,
    codec:(file.name||'').split('.').pop().toUpperCase()||file.type||'UNKNOWN',
    ratePreserved:!nativeRate||nativeRate===buffer.sampleRate
  }};
}
