/** A transparent local multi-track summing mixer with RMS-assisted suggestions. */
import {fromChannels, audioMetrics} from './dsp.mjs';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function suggestGainDb(buffer,targetRmsDb=-20){
  const rms=audioMetrics(buffer).rmsDb;
  if(!Number.isFinite(rms)||rms<-75)return 0;
  return Math.round(clamp(targetRmsDb-rms,-10,10)*10)/10;
}
export function renderMultitrack(tracks,{sampleRate,maxSeconds=300}={}){
  if(!Array.isArray(tracks)||!tracks.length||tracks.length>8)throw Error('Choose between 1 and 8 audio tracks.');
  const rate=sampleRate||tracks[0].buffer?.sampleRate;
  if(!Number.isFinite(rate)||rate<8000||rate>192000)throw Error('Unsupported output sample rate.');
  const longest=Math.max(...tracks.map(t=>t.buffer?.duration||0));
  if(!longest||longest>maxSeconds)throw Error('The mixer supports up to 5 minutes of audio.');
  const size=Math.ceil(longest*rate);
  if(size>16_000_000)throw Error('Mix is too long for available memory.');
  const left=new Float32Array(size),right=new Float32Array(size);
  for(const track of tracks){
    const b=track.buffer;
    if(!b||!b.length)throw Error('A track is empty.');
    const gain=10**(clamp(Number(track.gainDb)||0,-36,18)/20);
    const pan=clamp(Number(track.pan)||0,-1,1);
    const isMono=b.numberOfChannels===1;
    const ll=isMono?Math.cos((pan+1)*Math.PI/4):pan>0?1-pan:1;
    const rr=isMono?Math.sin((pan+1)*Math.PI/4):pan<0?1+pan:1;
    const l=b.getChannelData(0),r=b.getChannelData(isMono?0:1),ratio=b.sampleRate/rate;
    const trackSize=Math.min(size,Math.round(b.length/ratio));
    for(let i=0;i<trackSize;i++){
      const pos=Math.min(b.length-1,i*ratio),a=Math.floor(pos),z=Math.min(b.length-1,a+1),f=pos-a;
      left[i]+=gain*ll*(l[a]*(1-f)+l[z]*f);
      right[i]+=gain*rr*(r[a]*(1-f)+r[z]*f);
    }
  }
  let peak=0;
  for(let i=0;i<size;i++)peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));
  const scale=peak>0.99?0.99/peak:1;
  if(scale!==1)for(let i=0;i<size;i++){left[i]*=scale;right[i]*=scale;}
  return {buffer:fromChannels([left,right],rate),attenuationDb:20*Math.log10(scale)};
}
