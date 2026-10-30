const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
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
  return Math.round(clamp(Math.min(-22-rmsDb,-6-peakDb),-15,6)*10)/10;
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
    const pan=clamp(Number(stem.pan)||0,-1,1),gainDb=clamp(Number(stem.gainDb)||0,-24,12);
    const scalar=10**(gainDb/20),left=Math.cos((pan+1)*Math.PI/4),right=Math.sin((pan+1)*Math.PI/4);
    const source=stem.channels,mono=source.length===1;
    // Mono: constant-power panning. Stereo: preserve L/R unity at centered pan.
    const lg=scalar*left*(mono?1:Math.SQRT2),rg=scalar*right*(mono?1:Math.SQRT2);
    for(let i=0;i<source[0].length;i++){
      output[0][i]+=source[0][i]*lg;
      output[1][i]+=(mono?source[0][i]:source[1][i])*rg;
    }
  }
  let peak=0;
  for(const c of output)for(const v of c)peak=Math.max(peak,Math.abs(v));
  const ceiling=10**(ceilingDb/20),attenuation=peak>ceiling?ceiling/peak:1;
  if(attenuation<1)for(const c of output)for(let i=0;i<c.length;i++)c[i]*=attenuation;
  return {channels:output,rate,attenuationDb:20*Math.log10(attenuation),
    peakDb:peak>0?20*Math.log10(peak*attenuation):-Infinity};
}
