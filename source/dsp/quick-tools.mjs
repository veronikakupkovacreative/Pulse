// Pulse Studio DSP - client-side only. All operations return fresh channel arrays.
const check = (channels, sampleRate) => {
  if(!Array.isArray(channels)||channels.length<1||channels.length>2||!channels[0]?.length ||
     channels.some(c=>!(c instanceof Float32Array)||c.length!==channels[0].length))
    throw new Error('Zvuk musí mít jeden nebo dva platné kanály.');
  if(!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>192000)throw new Error('Neplatná sample rate.');
};
export function reverseAudio(channels,sampleRate){
  check(channels,sampleRate);
  return channels.map(ch=>Float32Array.from(ch).reverse());
}
export function bpmDurations(bpm){
  if(!Number.isFinite(bpm)||bpm<20||bpm>400)throw new Error('BPM musí být mezi 20 a 400.');
  const beat=60000/bpm;
  return [
    ['Whole',4],['Half',2],['Quarter',1],['Eighth',.5],['Sixteenth',.25],
  ].map(([name,factor])=>({name,straight:beat*factor,dotted:beat*factor*1.5,triplet:beat*factor*2/3}));
}
export function detectSilenceBounds(channels,sampleRate,thresholdDb=-48,paddingMs=12){
  check(channels,sampleRate);
  if(!Number.isFinite(thresholdDb)||thresholdDb<-100||thresholdDb>0)throw new Error('Neplatný threshold.');
  if(!Number.isFinite(paddingMs)||paddingMs<0||paddingMs>500)throw new Error('Padding musí být 0–500 ms.');
  const length=channels[0].length,frame=Math.max(1,Math.round(sampleRate*.005));
  const threshold=10**(thresholdDb/20);
  let first=-1,last=-1;
  for(let a=0;a<length;a+=frame){
    const end=Math.min(length,a+frame);let power=0;
    for(let c=0;c<channels.length;c++){
      const ch=channels[c];let channelPower=0;
      for(let j=a;j<end;j++)channelPower+=ch[j]*ch[j];
      power=Math.max(power,channelPower/(end-a));
    }
    if(Math.sqrt(power)>=threshold){if(first===-1)first=a;last=end;}
  }
  if(first===-1)throw new Error('Vstup je pod nastaveným thresholdem. Zkus nižší hodnotu.');
  const pad=Math.round(sampleRate*paddingMs/1000);
  const start=Math.max(0,first-pad),end=Math.min(length,last+pad);
  return {start,end,startSeconds:start/sampleRate,endSeconds:end/sampleRate,removedSeconds:(start+length-end)/sampleRate};
}
export function trimAudio(channels,bounds){
  if(!Number.isInteger(bounds.start)||!Number.isInteger(bounds.end)||bounds.start<0||bounds.end>channels[0]?.length||bounds.end<=bounds.start)
    throw new Error('Neplatné hranice střihu.');
  return channels.map(c=>c.slice(bounds.start,bounds.end));
}
export function peakLevel(channels){
  let peak=0;
  for(const c of channels)for(let i=0;i<c.length;i++)peak=Math.max(peak,Math.abs(c[i]));
  return peak;
}
export function peakDb(channels){const p=peakLevel(channels);return p?20*Math.log10(p):-Infinity;}
// K-weighting for ITU-R BS.1770: high-shelf and RLB high-pass, coefficient
// design parameters from the ITU reference, converted for arbitrary sample rates.
function highShelf(rate){
  const f=1681.974450955533, gain=3.999843853973347, q=0.7071752369554196;
  const A=10**(gain/40),w=2*Math.PI*f/rate,cs=Math.cos(w),sn=Math.sin(w);
  const alpha=sn/2*Math.sqrt((A+1/A)*(1/q-1)+2),root=2*Math.sqrt(A)*alpha;
  const b0=A*((A+1)+(A-1)*cs+root),b1=-2*A*((A-1)+(A+1)*cs),b2=A*((A+1)+(A-1)*cs-root);
  const a0=(A+1)-(A-1)*cs+root,a1=2*((A-1)-(A+1)*cs),a2=(A+1)-(A-1)*cs-root;
  return [b0/a0,b1/a0,b2/a0,a1/a0,a2/a0];
}
function highPass(rate){
  const f=38.13547087602444,q=.5003270373238773,w=2*Math.PI*f/rate,cs=Math.cos(w),alpha=Math.sin(w)/(2*q);
  const a0=1+alpha;
  return [((1+cs)/2)/a0,-(1+cs)/a0,((1+cs)/2)/a0,-2*cs/a0,(1-alpha)/a0];
}
function filteredEnergySegments(channels,rate){
  const segLen=Math.max(1,Math.round(rate*.1)),n=channels[0].length,count=Math.ceil(n/segLen);
  const segments=new Float64Array(count);
  for(const channel of channels){
    let x1=0,x2=0,y1=0,y2=0,z1=0,z2=0,v1=0,v2=0;
    const [a,b,c,d,e]=highShelf(rate),[h,i,j,k,l]=highPass(rate);
    for(let t=0;t<n;t++){
      const x=channel[t];
      const y=a*x+b*x1+c*x2-d*y1-e*y2;
      x2=x1;x1=x;y2=y1;y1=y;
      const z=h*y+i*z1+j*z2-k*v1-l*v2;
      z2=z1;z1=y;v2=v1;v1=z;
      segments[Math.floor(t/segLen)]+=z*z;
    }
  }
  return {segments,segLen};
}
export function integratedLoudness(channels,sampleRate){
  check(channels,sampleRate);
  const length=channels[0].length;
  if(length<sampleRate*.4)throw new Error('Pro měření LUFS potřebujeme alespoň 400 ms audia.');
  const {segments,segLen}=filteredEnergySegments(channels,sampleRate);
  const blocks=[];
  // 400 ms windows, 75% overlap, with exact sample count in the final window.
  const energyPrefix=new Float64Array(segments.length+1);
  for(let j=0;j<segments.length;j++)energyPrefix[j+1]=energyPrefix[j]+segments[j];
  for(let start=0;start+4<=segments.length;start++){
    const samples=Math.min(length,(start+4)*segLen)-start*segLen;
    const e=(energyPrefix[start+4]-energyPrefix[start])/samples;
    if(e>0)blocks.push(e);
  }
  if(!blocks.length)return -Infinity;
  const toLufs=e=>-0.691+10*Math.log10(e);
  const absolute=blocks.filter(e=>toLufs(e)>=-70);
  if(!absolute.length)return -Infinity;
  const ungated=absolute.reduce((a,b)=>a+b,0)/absolute.length;
  const relativeGate=toLufs(ungated)-10;
  const gated=absolute.filter(e=>toLufs(e)>=relativeGate);
  if(!gated.length)return -Infinity;
  return toLufs(gated.reduce((a,b)=>a+b,0)/gated.length);
}
export function normalizeAudio(channels,sampleRate,{mode='peak',targetPeak=-1,targetLufs=-14,ceiling=-1}={}){
  check(channels,sampleRate);
  if(!['peak','lufs'].includes(mode))throw new Error('Neznámý režim normalizace.');
  if(!Number.isFinite(ceiling)||ceiling>0||ceiling<-30)throw new Error('Neplatný peak ceiling.');
  const peak=peakLevel(channels);if(peak<1e-10)throw new Error('Ticho nelze normalizovat.');
  let sourceLufs=null,desiredGain=1;
  if(mode==='peak'){
    if(!Number.isFinite(targetPeak)||targetPeak>0||targetPeak<-40)throw new Error('Cílový peak musí být -40 až 0 dBFS.');
    desiredGain=10**(targetPeak/20)/peak;
  }else{
    if(!Number.isFinite(targetLufs)||targetLufs>0||targetLufs<-45)throw new Error('Cílové LUFS musí být -45 až 0.');
    sourceLufs=integratedLoudness(channels,sampleRate);
    if(!Number.isFinite(sourceLufs))throw new Error('LUFS nelze u tohoto souboru spolehlivě změřit.');
    desiredGain=10**((targetLufs-sourceLufs)/20);
  }
  const maxGain=10**(ceiling/20)/peak;
  // Gain-only normalization: never claim limiter/compression or fabricate target results.
  const gain=Math.min(desiredGain,maxGain);
  const result=channels.map(ch=>Float32Array.from(ch,x=>x*gain));
  return {channels:result,gain,gainDb:20*Math.log10(gain),inputPeakDb:20*Math.log10(peak),outputPeakDb:peakDb(result),
    inputLufs:sourceLufs,outputLufs:sourceLufs===null?null:sourceLufs+20*Math.log10(gain),
    limited:gain<desiredGain-1e-9,mode};
}
