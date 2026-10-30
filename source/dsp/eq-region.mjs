import {renderEqualizer} from './parametric-eq.mjs';

/**
 * EQ a selected time region without changing clip length or samples outside it.
 * Prefetch 120ms of context for IIR warm-up, and crossfade the edit at its edges.
 * No selection means process the full track.
 */
export function renderEqRegion(channels,rate,bands,outputGainDb=0,selection=null){
  if(!selection)return renderEqualizer(channels,rate,bands,outputGainDb);
  if(!Array.isArray(channels)||!channels.length||channels.length>2||
    channels.some(ch=>!(ch instanceof Float32Array)||ch.length!==channels[0].length)||
    !Number.isFinite(rate)||rate<8000||rate>192000)
    throw Error('Invalid audio for EQ region.');
  const n=channels[0].length,duration=n/rate;
  const from=Number(selection.from),to=Number(selection.to);
  if(!Number.isFinite(from)||!Number.isFinite(to)||from<0||to>duration+1/rate||to-from<.02)
    throw Error('Select at least 20 ms inside the waveform.');
  const first=Math.min(n,Math.max(0,Math.floor(from*rate)));
  const last=Math.min(n,Math.max(first+1,Math.ceil(to*rate)));
  const preroll=Math.round(rate*.12),start=Math.max(0,first-preroll);
  const processed=renderEqualizer(channels.map(ch=>ch.subarray(start,last)),rate,bands,outputGainDb);
  const length=last-first,fade=Math.min(Math.round(rate*.007),Math.floor(length/3));
  return channels.map((ch,c)=>{
    const out=ch.slice(),wet=processed[c];
    for(let i=first;i<last;i++){
      const onset=fade?Math.min(1,(i-first+1)/fade):1;
      const offset=fade?Math.min(1,(last-i)/fade):1;
      const wetMix=Math.min(onset,offset);
      out[i]=ch[i]*(1-wetMix)+wet[i-start]*wetMix;
    }
    return out;
  });
}
