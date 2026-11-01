// Audio utilities used by the production toolkit. No remote processing.
export function encodeWav(channels, sampleRate, bitDepth=16, {dither=false, random=Math.random}={}) {
  if(!Array.isArray(channels)||!channels.length||channels.length>2)throw new Error('Only mono or stereo audio is supported.');
  if(![16,24,32].includes(bitDepth))throw new Error('Unsupported bit depth.');
  if(!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>192000)throw new Error('Invalid sample rate.');
  const length=channels[0].length;
  if(channels.some(ch=>ch.length!==length))throw new Error('Audio channels must have the same length.');
  const bytes=bitDepth/8, blockAlign=channels.length*bytes, dataBytes=length*blockAlign, floatWav=bitDepth===32,headerSize=floatWav?56:44;
  if(dataBytes+headerSize>0xffffffff)throw new Error('WAV exceeds standard RIFF limits.');
  const array=new ArrayBuffer(headerSize+dataBytes), view=new DataView(array);
  const str=(p,s)=>[...s].forEach((c,i)=>view.setUint8(p+i,c.charCodeAt(0)));
  str(0,'RIFF');view.setUint32(4,headerSize+dataBytes-8,true);str(8,'WAVE');str(12,'fmt ');
  view.setUint32(16,16,true);view.setUint16(20,floatWav?3:1,true);view.setUint16(22,channels.length,true);
  view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*blockAlign,true);
  view.setUint16(32,blockAlign,true);view.setUint16(34,bitDepth,true);
  if(floatWav){str(36,'fact');view.setUint32(40,4,true);view.setUint32(44,length,true);str(48,'data');view.setUint32(52,dataBytes,true);}
  else{str(36,'data');view.setUint32(40,dataBytes,true);}
  let position=headerSize;
  for(let i=0;i<length;i++)for(let c=0;c<channels.length;c++){
    // TPDF dither is optional for 16-bit delivery; avoid extra noise on 24-bit masters.
    const raw=Number.isFinite(channels[c][i])?channels[c][i]:0;
    if(floatWav){view.setFloat32(position,raw,true);position+=4;continue;}
    const sample=Math.min(1,Math.max(-1,raw+(dither&&bitDepth===16?(random()+random()-1)/32768:0)));
    if(bitDepth===16){view.setInt16(position,sample<0?Math.round(sample*32768):Math.round(sample*32767),true);position+=2;}
    else {let v=sample<0?Math.round(sample*8388608):Math.round(sample*8388607);if(v<0)v+=0x1000000;view.setUint8(position++,v&255);view.setUint8(position++,(v>>>8)&255);view.setUint8(position++,(v>>>16)&255);}
  }
  return new Blob([array],{type:'audio/wav'});
}
export function extractSegment(channels, sampleRate, from, to, fadeMs=5) {
  if(!channels.length||!Number.isFinite(from)||!Number.isFinite(to)||to<=from)throw new Error('Select a longer audio region.');
  const length=channels[0].length;
  const first=Math.min(length,Math.max(0,Math.round(from*sampleRate)));
  const last=Math.min(length,Math.max(first+1,Math.round(to*sampleRate)));
  const fade=Math.min(Math.round(sampleRate*fadeMs/1000),Math.floor((last-first)/2));
  return channels.map(source=>{
    const out=source.slice(first,last);
    for(let i=0;i<fade;i++){const factor=(i+1)/Math.max(1,fade);out[i]*=factor;out[out.length-i-1]*=factor;}
    return out;
  });
}
export function getAudioPeaks(samples,count=240) {
  const peaks=new Float32Array(count);
  for(let i=0;i<count;i++){
    let sum=0,n=0;const a=Math.floor(i*samples.length/count),b=Math.floor((i+1)*samples.length/count);
    const step=Math.max(1,Math.floor((b-a)/70));
    for(let j=a;j<b;j+=step){sum+=samples[j]*samples[j];n++;}
    peaks[i]=Math.sqrt(sum/(n||1));
  }
  const max=Math.max(...peaks)||1;
  return Array.from(peaks,x=>x/max);
}
const NOTE_NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const MAJOR=[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
const MINOR=[6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
const MAJOR_CAM=['8B','3B','10B','5B','12B','7B','2B','9B','4B','11B','6B','1B'];
const MINOR_CAM=['5A','12A','7A','2A','9A','4A','11A','6A','1A','8A','3A','10A'];
function fft(real,imag){
  const n=real.length;
  for(let i=1,j=0;i<n;i++){
    let bit=n>>1;
    for(;j&bit;bit>>=1)j^=bit;
    j^=bit;
    if(i<j){[real[i],real[j]]=[real[j],real[i]];[imag[i],imag[j]]=[imag[j],imag[i]];}
  }
  for(let size=2;size<=n;size*=2){
    const half=size/2,angle=-2*Math.PI/size,cos=Math.cos(angle),sin=Math.sin(angle);
    for(let start=0;start<n;start+=size){let wr=1,wi=0;
      for(let i=0;i<half;i++){
        const a=start+i,b=a+half,rr=wr*real[b]-wi*imag[b],ii=wr*imag[b]+wi*real[b];
        real[b]=real[a]-rr;imag[b]=imag[a]-ii;real[a]+=rr;imag[a]+=ii;
        const nr=wr*cos-wi*sin;wi=wr*sin+wi*cos;wr=nr;
      }
    }
  }
}
function correlation(a,b){
  const am=a.reduce((x,y)=>x+y,0)/12,bm=b.reduce((x,y)=>x+y,0)/12;
  let numerator=0,aa=0,bb=0;
  for(let i=0;i<12;i++){const x=a[i]-am,y=b[i]-bm;numerator+=x*y;aa+=x*x;bb+=y*y;}
  return numerator/(Math.sqrt(aa*bb)||1);
}
// Chroma-based key estimation: approximate, especially for short or percussive material.
export function detectKey(samples,sampleRate){
  if(samples.length<sampleRate*2)throw new Error('Key detection requires at least 2 seconds of audio.');
  const size=4096,hop=4096,real=new Float64Array(size),imag=new Float64Array(size),chroma=new Float64Array(12);
  if(samples.length<size)throw new Error('File is too short.');
  const count=Math.min(145,Math.floor((samples.length-size)/hop)+1);
  const step=Math.max(1,Math.floor((samples.length-size)/Math.max(1,count-1)));
  let total=0,frames=0;
  for(let frame=0;frame<count;frame++){
    const start=Math.min(samples.length-size,frame*step);
    let rms=0;
    for(let i=0;i<size;i++){const x=samples[start+i];real[i]=x*(0.5-0.5*Math.cos(2*Math.PI*i/(size-1)));imag[i]=0;rms+=x*x;}
    if(rms/size<0.0000002)continue;
    fft(real,imag);
    const magnitudes=new Float64Array(size/2);
    for(let bin=0;bin<magnitudes.length;bin++)magnitudes[bin]=Math.hypot(real[bin],imag[bin]);
    for(let bin=2;bin<magnitudes.length-1;bin++){
      const hz=bin*sampleRate/size;
      if(hz<65||hz>1700)continue;
      const v=magnitudes[bin];
      if(v<magnitudes[bin-1]||v<magnitudes[bin+1])continue;
      const midi=69+12*Math.log2(hz/440),rounded=Math.round(midi);
      if(Math.abs(midi-rounded)>.32)continue;
      const pc=((rounded%12)+12)%12;
      const weight=Math.sqrt(v)*Math.pow(110/Math.max(hz,110),0.2);
      chroma[pc]+=weight;total+=weight;
    }
    frames++;
  }
  if(total<1||frames<2)throw new Error('Key could not be detected. Select a melodic or harmonic region.');
  const candidates=[];
  for(let root=0;root<12;root++)for(const [mode,profile,camelot] of [['major',MAJOR,MAJOR_CAM],['minor',MINOR,MINOR_CAM]]){
    const rotated=Array.from({length:12},(_,pc)=>profile[((pc-root+12)%12)]);
    const score=correlation(chroma,rotated);
    candidates.push({name:NOTE_NAMES[root],mode,display:NOTE_NAMES[root]+(mode==='minor'?'m':''),camelot:camelot[root],score});
  }
  candidates.sort((a,b)=>b.score-a.score);
  const [top,second]=candidates;
  return {primary:top,alternatives:candidates.slice(1,4),chroma:Array.from(chroma,v=>v/Math.max(...chroma)),confidence:top.score>.75&&top.score-second.score>.13?'higher':top.score>.45?'moderate':'low'};
}


export function samplePeakDbfs(channels){
  let peak=0;
  for(const channel of channels||[]){
    for(let i=0;i<channel.length;i++){
      const sample=channel[i];
      if(Number.isFinite(sample))peak=Math.max(peak,Math.abs(sample));
    }
  }
  return peak>0?20*Math.log10(peak):-Infinity;
}


/**
 * Browser-only audio converter. Reuses the project's WAV encoder to support
 * 16/24-bit PCM and 32-bit float without allocating an interleaved float copy.
 * Codec decoding still depends on the browser's AudioContext implementation.
 */
export class AudioConverterTool {
  constructor(audioContext=null,{OfflineContext=null}={}){
    this.audioContext=audioContext;
    this.OfflineContext=OfflineContext;
  }

  async loadAudioFile(file){
    if(!file||typeof file.arrayBuffer!=='function')throw new Error('Select a readable audio file.');
    if(!this.audioContext){
      const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
      if(!Context)throw new Error('Audio decoding is unavailable in this browser.');
      this.audioContext=new Context();
    }
    const bytes=await file.arrayBuffer();
    return this.audioContext.decodeAudioData(bytes);
  }

  async resampleBuffer(audioBuffer,targetSampleRate){
    if(!audioBuffer||!Number.isFinite(audioBuffer.sampleRate)||!Number.isFinite(audioBuffer.length)||
      !Number.isInteger(audioBuffer.numberOfChannels)||audioBuffer.numberOfChannels<1)
      throw new Error('Invalid audio buffer.');
    if(!Number.isInteger(targetSampleRate)||targetSampleRate<8000||targetSampleRate>192000)
      throw new Error('Sample rate must be between 8 and 192 kHz.');
    if(audioBuffer.sampleRate===targetSampleRate)return audioBuffer;

    const Offline=this.OfflineContext||globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext;
    if(!Offline)throw new Error('Offline resampling is not supported in this browser.');
    // The toolkit exports mono or stereo, not multichannel/surround.
    const channelCount=Math.min(audioBuffer.numberOfChannels,2);
    const frameCount=Math.max(1,Math.round(audioBuffer.length*targetSampleRate/audioBuffer.sampleRate));
    const context=new Offline(channelCount,frameCount,targetSampleRate);
    const source=context.createBufferSource();
    source.buffer=audioBuffer;
    source.connect(context.destination);
    source.start(0);
    return context.startRendering();
  }

  async convertToWavBlob(audioBuffer,targetSampleRate=null,{bitDepth=16,dither=false}={}){
    if(!audioBuffer||!Number.isFinite(audioBuffer.sampleRate)||!Number.isFinite(audioBuffer.length)||
      !Number.isInteger(audioBuffer.numberOfChannels)||audioBuffer.numberOfChannels<1)
      throw new Error('Invalid audio buffer.');
    if(audioBuffer.numberOfChannels>2)throw new Error('WAV export currently supports mono and stereo files only.');
    if(![16,24,32].includes(bitDepth))throw new Error('Choose 16, 24 or 32-bit WAV.');
    const rate=targetSampleRate??audioBuffer.sampleRate;
    if(!Number.isInteger(rate)||rate<8000||rate>192000)throw new Error('Invalid target sample rate.');
    const frames=Math.max(1,Math.round(audioBuffer.length*rate/audioBuffer.sampleRate));
    const headerBytes=bitDepth===32?56:44;
    if(headerBytes+frames*audioBuffer.numberOfChannels*(bitDepth/8)>300*1024*1024)
      throw new Error('WAV would exceed 300 MB. Reduce sample rate or duration.');
    const result=await this.resampleBuffer(audioBuffer,rate);
    const channels=Array.from({length:result.numberOfChannels},(_,channel)=>result.getChannelData(channel));
    return encodeWav(channels,result.sampleRate,bitDepth,{dither});
  }

  // Kept as a compatible helper for consumers that need interleaved PCM samples.
  interleaveChannels(audioBuffer){
    if(!audioBuffer||!audioBuffer.getChannelData||!Number.isInteger(audioBuffer.numberOfChannels)||
      audioBuffer.numberOfChannels<1||!Number.isInteger(audioBuffer.length)||audioBuffer.length<0)
      throw new Error('Invalid audio buffer.');
    const samples=new Float32Array(audioBuffer.length*audioBuffer.numberOfChannels);
    const channels=Array.from({length:audioBuffer.numberOfChannels},(_,c)=>audioBuffer.getChannelData(c));
    for(let i=0;i<audioBuffer.length;i++)
      for(let c=0;c<channels.length;c++)samples[i*channels.length+c]=channels[c][i];
    return samples;
  }

  writeString(view,offset,value){
    for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i));
  }
}
