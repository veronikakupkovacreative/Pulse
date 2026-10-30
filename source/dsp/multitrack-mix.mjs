const mixBound=(x,a,b)=>Math.max(a,Math.min(b,x));
export function stemMeasurements(channels){
  let energy=0,peak=0,count=0;
  for(const channel of channels)for(let i=0;i<channel.length;i++){
    const s=channel[i];energy+=s*s;peak=Math.max(peak,Math.abs(s));count++;
  }
  const rms=count?Math.sqrt(energy/count):0;
  return {rmsDb:rms>1e-10?20*Math.log10(rms):-120,
    peakDb:peak>1e-10?20*Math.log10(peak):-120};
}
export function suggestedGainDb(channels){
  const {rmsDb,peakDb}=stemMeasurements(channels);
  if(rmsDb< -80)return 0;
  // Conservative per-stem starting point, not a trained AI mix decision.
  return Math.round(mixBound(Math.min(-22-rmsDb,-6-peakDb),-15,6)*10)/10;
}
export function automationGainAt(points,time){
  if(!Array.isArray(points)||!points.length)return 1;
  let a=points[0],b=points[points.length-1];
  if(time<=a.time)return 10**(a.gainDb/20);
  if(time>=b.time)return 10**(b.gainDb/20);
  for(let i=1;i<points.length;i++){
    if(time<=points[i].time){
      a=points[i-1];b=points[i];
      const t=(time-a.time)/Math.max(1e-9,b.time-a.time);
      return 10**((a.gainDb+(b.gainDb-a.gainDb)*t)/20);
    }
  }
  return 1;
}
export function generateDuckingAutomation(voiceChannels,rate,{depthDb=-11,stepMs=100}={}){
  if(!voiceChannels?.length||!Number.isFinite(rate)||rate<8000||
    !Number.isFinite(depthDb)||depthDb>0||depthDb< -24)throw Error('Invalid ducking source.');
  const n=voiceChannels[0].length,step=Math.max(64,Math.round(rate*stepMs/1000));
  let total=0;for(const ch of voiceChannels)for(let i=0;i<n;i+=128)total+=ch[i]*ch[i];
  const rms=Math.sqrt(total/Math.max(1,voiceChannels.length*Math.ceil(n/128)));
  const threshold=Math.max(.002,rms*.66),points=[],envelope=[];
  let active=0;
  for(let i=0;i<n;i+=step){
    let energy=0,count=0;
    for(const ch of voiceChannels)for(let j=i;j<Math.min(i+step,n);j+=8){energy+=ch[j]*ch[j];count++;}
    const level=Math.sqrt(energy/Math.max(1,count));
    const desired=level>threshold?1:0;
    active=desired>active?Math.min(1,active+.7):Math.max(0,active-.12);
    envelope.push(active);
    points.push({time:i/rate,gainDb:Math.round(depthDb*active*10)/10});
  }
  if(points.length<2)points.push({time:n/rate,gainDb:0});
  else points.push({time:n/rate,gainDb:points[points.length-1].gainDb});
  return points;
}
export function mixStems(stems,{ceilingDb=-1}={}){
  if(!Array.isArray(stems)||stems.length<2||stems.length>8)throw Error('Load between 2 and 8 stems.');
  const rate=stems[0].rate,duration=Math.max(...stems.map(s=>s.channels[0].length));
  if(!Number.isFinite(rate)||rate<8000||rate>192000||duration<=0||
    stems.some(s=>s.rate!==rate||s.channels.length<1||s.channels.length>2||
      s.channels.some(c=>c.length!==s.channels[0].length)))
    throw Error('Stems need matching sample rates and aligned channels.');
  if(duration*2>25_000_000)throw Error('Mix exceeds browser memory budget.');
  if(!Number.isFinite(ceilingDb)||ceilingDb>0||ceilingDb< -12)throw Error('Invalid mix ceiling.');
  const anySolo=stems.some(s=>s.solo);
  const output=[new Float32Array(duration),new Float32Array(duration)];
  for(const stem of stems){
    if(stem.mute||(anySolo&&!stem.solo))continue;
    const pan=mixBound(Number(stem.pan)||0,-1,1),gainDb=mixBound(Number(stem.gainDb)||0,-24,12);
    const scalar=10**(gainDb/20),left=Math.cos((pan+1)*Math.PI/4),right=Math.sin((pan+1)*Math.PI/4);
    const source=stem.channels,mono=source.length===1;
    // Mono: constant-power panning. Stereo: preserve L/R unity at centered pan.
    const lg=scalar*left*(mono?1:Math.SQRT2),rg=scalar*right*(mono?1:Math.SQRT2);
    const automation=Array.isArray(stem.automation)?stem.automation.slice().sort((a,b)=>a.time-b.time):[];
    if(automation.some(p=>!Number.isFinite(p.time)||!Number.isFinite(p.gainDb)||p.gainDb<-36||p.gainDb>12))
      throw Error('Invalid volume automation.');
    let keyIndex=0;
    for(let i=0;i<source[0].length;i++){
      let automationGain=1;
      if(automation.length){
        const time=i/rate;
        while(keyIndex+1<automation.length&&automation[keyIndex+1].time<time)keyIndex++;
        const a=automation[keyIndex],b=automation[Math.min(keyIndex+1,automation.length-1)];
        const fraction=b.time>a.time?mixBound((time-a.time)/(b.time-a.time),0,1):0;
        const gainAt=a.gainDb+(b.gainDb-a.gainDb)*fraction;
        automationGain=10**(gainAt/20);
      }
      output[0][i]+=source[0][i]*lg*automationGain;
      output[1][i]+=(mono?source[0][i]:source[1][i])*rg*automationGain;
    }
  }
  let peak=0;
  for(const c of output)for(const v of c)peak=Math.max(peak,Math.abs(v));
  const ceiling=10**(ceilingDb/20),attenuation=peak>ceiling?ceiling/peak:1;
  if(attenuation<1)for(const c of output)for(let i=0;i<c.length;i++)c[i]*=attenuation;
  return {channels:output,rate,attenuationDb:20*Math.log10(attenuation),
    peakDb:peak>0?20*Math.log10(peak*attenuation):-Infinity};
}
