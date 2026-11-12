/**
 * PULSE / SOURCE AUDIO waveform renderer.
 * Two independent stereo lanes (or one mono lane), with translucent true
 * sample peaks and a vivid RMS core. No animation or fabricated amplitude.
 * Wave envelopes are cached by AudioBuffer + viewport to avoid expensive
 * full-track rescans during playback. All drawing stays local in the browser.
 */
const cache=new WeakMap();
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
function markerPixels(markers,duration,width,minSpacing){
 const positions=[];let last=-Infinity;
 for(const time of markers){
  if(!Number.isFinite(time)||time<0||time>duration)continue;
  const x=Math.round(time/duration*(width-1));
  if(x-last<minSpacing)continue;
  positions.push(x);last=x;
 }
 return positions;
}
function envelope(buffer,channel,width,start,end){
 let entries=cache.get(buffer);
 if(!entries){entries=new Map();cache.set(buffer,entries);}
 const key=[channel,width,start.toFixed(3),end.toFixed(3)].join('/');
 if(entries.has(key))return entries.get(key);
 const samples=buffer.getChannelData(channel),rate=buffer.sampleRate;
 const from=clamp(Math.floor(start*rate),0,samples.length),to=clamp(Math.ceil(end*rate),from+1,samples.length);
 const peaks=new Float32Array(width*3);
 for(let x=0;x<width;x++){
  const a=from+Math.floor((to-from)*x/width);
  const z=Math.min(to,Math.max(a+1,from+Math.floor((to-from)*(x+1)/width)));
  const step=Math.max(1,Math.floor((z-a)/180));
  let lo=1,hi=-1,energy=0,n=0;
  for(let i=a;i<z;i+=step){const v=samples[i];if(v<lo)lo=v;if(v>hi)hi=v;energy+=v*v;n++;}
  peaks[x*3]=lo===1?0:lo;
  peaks[x*3+1]=hi===-1?0:hi;
  peaks[x*3+2]=n?Math.sqrt(energy/n):0;
 }
 if(entries.size>4)entries.clear();
 entries.set(key,peaks);
 return peaks;
}
export function renderSourceWaveform(canvas,{buffer=null,position=0,selection=null,markers=[],view=null}={}){
 if(!canvas)return;
 const bounds=canvas.getBoundingClientRect();
 const dpr=Math.min(globalThis.window?.devicePixelRatio||1,2);
 const width=Math.max(1,Math.round(bounds.width*dpr));
 const height=Math.max(1,Math.round(bounds.height*dpr));
 if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
 const ctx=canvas.getContext('2d');if(!ctx)return;
 const paint=(fill,x,y,w,h)=>{ctx.fillStyle=fill;ctx.fillRect(x,y,w,h);};
 paint('#101010',0,0,width,height);
 const ch=buffer?Math.min(2,Math.max(1,buffer.numberOfChannels)):2;
 const paddingY=Math.round(18*dpr);
 const header=Math.round(6*dpr);
 const laneHeight=(height-paddingY*2-header*(ch-1))/ch;
 for(let t=0;t<=12;t++){
  const px=Math.round(t*width/12);
  paint(t%3===0?'#343434':'#202020',px,0,1,height);
 }
 for(let lane=0;lane<ch;lane++){
  const mid=paddingY+lane*(laneHeight+header)+laneHeight/2;
  paint('#373737',0,Math.round(mid),width,1);
  if(ch===2&&lane===0)paint('#252525',0,Math.round(mid+laneHeight/2+header/2),width,1);
  if(typeof ctx.fillText==='function'){
   ctx.font=Math.round(9*dpr)+'px Arial';
   ctx.fillStyle='#777777';
   ctx.fillText(ch===1?'MONO':lane===0?'L':'R',Math.round(7*dpr),Math.round(mid-laneHeight*.43));
  }
 }
 if(!buffer)return;
 const duration=buffer.duration||buffer.length/buffer.sampleRate;
 const start=clamp(Number(view?.start)||0,0,Math.max(0,duration-.05));
 const end=clamp(Number(view?.end)||duration,start+.001,duration);
 const span=Math.max(.001,end-start);
 for(let lane=0;lane<ch;lane++){
  const mid=paddingY+lane*(laneHeight+header)+laneHeight/2;
  const amplitude=laneHeight*.42;
  const env=envelope(buffer,Math.min(lane,buffer.numberOfChannels-1),width,start,end);
  for(let x=0;x<width;x++){
   const lo=env[x*3],hi=env[x*3+1],rms=env[x*3+2];
   const peakTop=Math.round(mid-hi*amplitude),peakBottom=Math.round(mid-lo*amplitude);
   const rmsHeight=Math.max(1,Math.round(rms*amplitude*.83));
   if(peakBottom>peakTop)paint('#9a302d',x,peakTop,1,Math.max(1,peakBottom-peakTop));
   if(rms>.008)paint('#ff2b20',x,Math.round(mid-rmsHeight),1,rmsHeight*2+1);
   if(rms>.15)paint('#ff625a',x,Math.round(mid-rmsHeight*.4),1,Math.max(1,Math.round(rmsHeight*.8)));
  }
 }
 if(selection){
  const a=clamp((selection.start-start)/span,0,1)*width;
  const z=clamp((selection.end-start)/span,0,1)*width;
  if(z>a){paint('#ffffff26',a,0,z-a,height);}
  ctx.strokeStyle='#f5f4f0';ctx.lineWidth=Math.max(1,dpr);
  for(const x of [a,z]){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,height);ctx.stroke();}
 }
 const ticks=Array.isArray(markers)?markers.filter(t=>Number.isFinite(t)&&t>=start&&t<=end).map(t=>t-start):[];
 for(const x of markerPixels(ticks,span,width,Math.ceil(6*dpr))){
  paint('#f5f4f0aa',x,0,Math.max(1,Math.round(dpr)),Math.min(height,Math.round(7*dpr)));
 }
 const x=(position-start)/span*width;
 if(x>=0&&x<=width){
  ctx.strokeStyle='#ffffff';ctx.lineWidth=Math.max(1,Math.round(1.5*dpr));
  ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,height);ctx.stroke();
  paint('#ffffff',Math.round(x)-Math.round(3*dpr),0,Math.round(6*dpr),Math.round(5*dpr));
 }
}
