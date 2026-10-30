// Decode once at native WAV sample rate when Web Audio permits it.
// Analysis buffers are separate and never replace the source channels.
export function wavMetadata(bytes){
  if(!(bytes instanceof ArrayBuffer)||bytes.byteLength<44)return null;
  const v=new DataView(bytes),tag=p=>String.fromCharCode(v.getUint8(p),v.getUint8(p+1),v.getUint8(p+2),v.getUint8(p+3));
  if(tag(0)!=='RIFF'||tag(8)!=='WAVE')return null;
  for(let pos=12;pos+8<=bytes.byteLength&&pos<1024*1024;){
    const size=v.getUint32(pos+4,true);
    if(tag(pos)==='fmt '&&size>=16&&pos+24<=bytes.byteLength){
      const channels=v.getUint16(pos+10,true),rate=v.getUint32(pos+12,true),bits=v.getUint16(pos+22,true);
      if(rate>=8000&&rate<=192000&&channels>=1&&channels<=8)return {sampleRate:rate,channels,bitDepth:bits};
      return null;
    }
    if(size>bytes.byteLength-pos-8)break;
    pos+=8+size+(size%2);
  }
  return null;
}
export function decodedAudioBytes(buffer){
  return buffer?.length*buffer?.numberOfChannels*4||0;
}
export function analysisMono(buffer,targetRate=22050){
  if(!buffer?.length||!buffer?.sampleRate)throw Error('No audio buffer for BPM analysis.');
  const step=Math.max(1,Math.ceil(buffer.sampleRate/targetRate));
  const rate=buffer.sampleRate/step,count=Math.ceil(buffer.length/step);
  let selected=buffer.getChannelData(0),highest=-1;
  for(let c=0;c<Math.min(buffer.numberOfChannels,2);c++){
    const channel=buffer.getChannelData(c);let energy=0;
    for(let j=0;j<channel.length;j+=Math.max(32,step))energy+=channel[j]*channel[j];
    if(energy>highest){highest=energy;selected=channel;}
  }
  const samples=new Float32Array(count);
  for(let i=0;i<count;i++){
    const start=i*step,end=Math.min(selected.length,start+step);
    let sum=0;for(let j=start;j<end;j++)sum+=selected[j];
    samples[i]=sum/(end-start);
  }
  return {samples,sampleRate:rate};
}
export async function decodeLocalAudio(file,{context,OfflineContext}={}){
  if(!file?.arrayBuffer)throw Error('No readable audio file.');
  let bytes;try{bytes=await file.arrayBuffer();}catch{throw Error('READ_FILE');}
  const meta=wavMetadata(bytes);
  const candidate=meta?.sampleRate;
  if(candidate&&OfflineContext){
    try{
      const decoder=new OfflineContext(1,1,candidate);
      const buffer=await decoder.decodeAudioData(bytes.slice(0));
      if(buffer?.sampleRate===candidate)return {buffer,metadata:meta,nativeRatePreserved:true};
    }catch{ /* Some mobile browsers cannot decode using OfflineAudioContext. */ }
  }
  if(!context)throw Error('DECODE');
  try{
    const buffer=await context.decodeAudioData(bytes);
    return {buffer,metadata:meta,nativeRatePreserved:!candidate||buffer.sampleRate===candidate};
  }catch{throw Error('DECODE');}
}
