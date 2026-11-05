import {createPeakState,appendPeakChunk,finishPeakPyramid,pickPeakLevel,samplePeakRange} from './peak-pyramid.mjs';

const clip=(n,a,b)=>Math.max(a,Math.min(b,n));
const nextFrame=()=>new Promise(resolve=>setTimeout(resolve,0));
/** One waveform renderer shared across tools. Keeps only the compact peak pyramid. */
export class WaveformRenderer{
 constructor({onReady=()=>{},workerFactory}={}){
  this.onReady=onReady;
  this.workerFactory=workerFactory||(()=>new Worker(new URL('./peak-worker.mjs',import.meta.url),{type:'module'}));
  this.worker=null;this.buffer=null;this.levels=null;this.generation=0;this.zoom=1;this.start=0;this.building=false;
 }
 reset(){this.generation++;this.worker?.terminate();this.worker=null;this.buffer=null;this.levels=null;this.zoom=1;this.start=0;this.building=false;}
 setBuffer(buffer,{keepViewport=false}={}){
  const zoom=keepViewport?this.zoom:1,start=keepViewport?this.start:0;
  this.reset();this.buffer=buffer;this.zoom=zoom;this.start=start;
  if(!buffer||buffer.length<1)return;
  const generation=this.generation,totalFrames=buffer.length,blockSize=256;
  this.building=true;
  // Transfer only small copies of PCM; the real AudioBuffer remains owned by AudioSession.
  let worker;
  try{if(typeof Worker!=='undefined')worker=this.workerFactory();}catch{worker=null;}
  const channels=Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i));
  if(worker){
   this.worker=worker;
   worker.onmessage=({data})=>{if(generation!==this.generation)return;if(data.id!==generation)return;if(data.type==='done'){this.levels=data.levels;this.building=false;worker.terminate();if(this.worker===worker)this.worker=null;this.onReady();}else if(data.type==='error'){worker.terminate();if(this.worker===worker)this.worker=null;this.building=false;this.onReady();}};
   worker.onerror=()=>{if(generation!==this.generation)return;worker.terminate();if(this.worker===worker)this.worker=null;this.building=false;this.onReady();};
   worker.postMessage({type:'start',id:generation,totalFrames,blockSize});
  }
  const state=worker?null:createPeakState(totalFrames,{blockSize});
  const feed=async()=>{
   const chunkSize=262144;
   for(let offset=0;offset<totalFrames;offset+=chunkSize){
    if(generation!==this.generation)return;
    const end=Math.min(offset+chunkSize,totalFrames);
    const slices=channels.map(channel=>channel.slice(offset,end));
    if(worker){const transfer=slices.map(arr=>arr.buffer);worker.postMessage({type:'chunk',id:generation,offset,channels:transfer},transfer);}
    else appendPeakChunk(state,slices,offset);
    await nextFrame();
   }
   if(generation!==this.generation)return;
   if(worker)worker.postMessage({type:'finish',id:generation});
   else{this.levels=finishPeakPyramid(state);this.building=false;this.onReady();}
  };
  void feed().catch(error=>{if(generation!==this.generation)return;this.building=false;this.worker?.terminate();this.worker=null;this.onReady();console.error('Peak pyramid:',error);});
 }
 setViewport(zoom,start){
  const duration=this.buffer?.duration||0;
  const z=clip(Number(zoom)||1,1,16),span=duration/z;
  this.zoom=z;this.start=clip(Number(start)||0,0,Math.max(0,duration-span));
  return {zoom:this.zoom,start:this.start,end:Math.min(duration,this.start+span)};
 }
 getViewport(){const duration=this.buffer?.duration||0;return {zoom:this.zoom,start:this.start,end:Math.min(duration,this.start+duration/this.zoom)};}
 atFraction(fraction){const range=this.getViewport();return range.start+clip(fraction,0,1)*(range.end-range.start);}
 render(canvas,buffer,{markers=[],selection=null,position=0}={}){
  if(!canvas)return;
  const rect=canvas.getBoundingClientRect(),dpr=Math.min(typeof window==='undefined'?1:window.devicePixelRatio||1,2);
  const width=Math.max(1,Math.round((rect.width||canvas.clientWidth||400)*dpr)),height=Math.max(1,Math.round((rect.height||canvas.clientHeight||180)*dpr));
  if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
  const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.fillStyle='#101010';ctx.fillRect(0,0,width,height);
  ctx.strokeStyle='#383838';ctx.lineWidth=Math.max(1,dpr);
  ctx.beginPath();ctx.moveTo(0,height/2);ctx.lineTo(width,height/2);ctx.stroke();
  if(!buffer||!buffer.duration)return;
  const {start,end}=this.buffer?this.getViewport():{start:0,end:buffer.duration},duration=Math.max(.000001,end-start),viewStart=Math.floor(start*buffer.sampleRate),viewEnd=Math.ceil(end*buffer.sampleRate),perPixel=(viewEnd-viewStart)/width;
  if(this.levels?.length){
   const level=pickPeakLevel(this.levels,perPixel);
   ctx.strokeStyle='#ff2b20';ctx.lineWidth=Math.max(1,dpr);
   for(let x=0;x<width;x++){
    const a=viewStart+x*perPixel,z=viewStart+(x+1)*perPixel;
    const [low,high]=samplePeakRange(level,a,z);
    const top=height/2-clip(high,-1.1,1.1)*height*.43,bottom=height/2-clip(low,-1.1,1.1)*height*.43;
    ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,Math.max(top+.6,bottom));ctx.stroke();
   }
  }else{
   ctx.fillStyle='#7c7c7c';ctx.font=`${Math.round(10*dpr)}px Arial, sans-serif`;
   ctx.fillText?.(this.building?'PREPARING WAVEFORM…':'DROP AN AUDIO FILE TO BEGIN',12*dpr,height/2+22*dpr);
  }
  if(selection){
   const a=clip((selection.start-start)/duration*width,0,width),z=clip((selection.end-start)/duration*width,0,width);
   if(z>a){ctx.fillStyle='#ffffff22';ctx.fillRect(a,0,z-a,height);ctx.strokeStyle='#f5f4f0';ctx.lineWidth=Math.max(1,dpr);for(const x of [a,z]){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,height);ctx.stroke();}}
  }
  ctx.fillStyle='#f5f4f0aa';let last=-Infinity;for(const second of markers){if(second<start||second>end)continue;const px=Math.round((second-start)/duration*(width-1));if(px-last<Math.ceil(6*dpr))continue;ctx.fillRect(px,0,Math.max(1,Math.round(dpr)),Math.min(height,Math.round(7*dpr)));last=px;}
  const playhead=(position-start)/duration*width;
  if(playhead>=0&&playhead<=width){ctx.strokeStyle='#fff';ctx.lineWidth=2*dpr;ctx.beginPath();ctx.moveTo(playhead,0);ctx.lineTo(playhead,height);ctx.stroke();}
 }
}
