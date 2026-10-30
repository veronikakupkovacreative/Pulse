import {integratedLoudness,peakDb,peakLevel} from './quick-tools.mjs';
import {truePeakDb} from './true-peak.mjs';

export function validatePcm(channels,rate){
  if(!Array.isArray(channels)||channels.length<1||channels.length>2||!channels[0]?.length||!Number.isFinite(rate)||rate<8000||rate>192000||channels.some(c=>!(c instanceof Float32Array)||c.length!==channels[0].length))throw Error('Expected mono or stereo PCM audio.');
  for(const c of channels)for(const x of c)if(!Number.isFinite(x))throw Error('Audio contains non-finite samples.');
}
export function splitClip(clip,time,newId){
  const left=time-clip.start;
  if(left<.02||clip.duration-left<.02)throw Error('Place the playhead inside the clip, at least 20 ms from either end.');
  return [{...clip,duration:left},{...clip,id:newId,start:time,offset:clip.offset+left,duration:clip.duration-left}];
}
export function clipSamples(clip){
  const rate=clip.buffer.sampleRate,start=Math.round(clip.offset*rate),end=Math.min(clip.buffer.length,start+Math.round(clip.duration*rate));
  return Array.from({length:clip.buffer.numberOfChannels},(_,c)=>clip.buffer.getChannelData(c).slice(start,end));
}
export function sidechainEnvelope(detector,rate,{threshold=-24,ratio=4,attack=5,release=150}={}){
  validatePcm(detector,rate);
  if(!Number.isFinite(threshold)||threshold< -60||threshold>0||!Number.isFinite(ratio)||ratio<1||ratio>20||!Number.isFinite(attack)||attack<.1||attack>200||!Number.isFinite(release)||release<10||release>2000)throw Error('Invalid sidechain settings.');
  const a=Math.exp(-1/(rate*attack/1000)),r=Math.exp(-1/(rate*release/1000)),out=new Float32Array(detector[0].length);
  let reduction=0;
  for(let i=0;i<out.length;i++){
    let level=0;for(const ch of detector)level=Math.max(level,Math.abs(ch[i]));
    const desired=Math.max(0,20*Math.log10(Math.max(1e-12,level))-threshold)*(1-1/ratio);
    const coefficient=desired>reduction?a:r;reduction=coefficient*reduction+(1-coefficient)*desired;
    out[i]=10**(-reduction/20);
  }
  return out;
}
export function normalizeExport(channels,rate,{mode='off',targetPeak=-1,targetLufs=-14,ceiling=-1}={}){
  validatePcm(channels,rate);
  if(!['off','peak','lufs'].includes(mode)||!Number.isFinite(targetPeak)||targetPeak>0||targetPeak< -40||!Number.isFinite(targetLufs)||targetLufs> -5||targetLufs< -40||!Number.isFinite(ceiling)||ceiling>0||ceiling< -12)throw Error('Invalid normalization settings.');
  const peak=peakLevel(channels),tp=truePeakDb(channels),lufs=channels[0].length>=rate*.4?integratedLoudness(channels,rate):null;
  let gainDb=0,constrained=false;
  if(mode!=='off'){
    if(peak<1e-10)throw Error('Cannot normalize silence.');
    if(mode==='lufs'&&!Number.isFinite(lufs))throw Error('LUFS requires at least 400 ms of audible audio.');
    const desired=mode==='peak'?targetPeak-20*Math.log10(peak):targetLufs-lufs;
    gainDb=Math.min(desired,ceiling-tp-.001);constrained=gainDb<desired-.01;
  }
  const gain=10**(gainDb/20),output=channels.map(ch=>Float32Array.from(ch,x=>x*gain));
  return {channels:output,gainDb,constrained,peakDb:peakDb(output),truePeakDb:tp+gainDb,lufs:Number.isFinite(lufs)?lufs+gainDb:null};
}

// A portable, declarative plugin format. No eval, scripts, URLs or network access.
export function validatePlugin(manifest){
  if(!manifest||manifest.version!==1||typeof manifest.name!=='string'||!manifest.name.trim()||manifest.name.length>64||!Array.isArray(manifest.nodes)||!manifest.nodes.length||manifest.nodes.length>16)throw Error('Plugin needs version 1, a name, and 1–16 nodes.');
  const specs={gain:{gainDb:[-60,12]},pan:{pan:[-1,1]},filter:{frequency:[20,20000],Q:[.1,20],gain:[-24,24]},delay:{seconds:[0,1]}};
  const nodes=manifest.nodes.map(node=>{
    const spec=specs[node?.type];if(!spec)throw Error('Supported plugin nodes: gain, pan, filter, delay.');
    const clean={type:node.type};
    for(const [key,range] of Object.entries(spec))if(node[key]!==undefined){if(!Number.isFinite(node[key])||node[key]<range[0]||node[key]>range[1])throw Error('Invalid plugin parameter: '+key);clean[key]=node[key];}
    if(node.type==='filter'){
      if(!['lowpass','highpass','bandpass','lowshelf','highshelf','peaking','notch','allpass'].includes(node.mode))throw Error('Invalid filter mode.');clean.mode=node.mode;
    }
    return clean;
  });
  return {version:1,name:manifest.name.trim(),nodes};
}
export function connectPlugin(context,input,manifest){
  let last=input;
  for(const spec of validatePlugin(manifest).nodes){
    let node;
    if(spec.type==='gain'){node=context.createGain();node.gain.value=10**((spec.gainDb??0)/20);}
    if(spec.type==='pan'){node=context.createStereoPanner();node.pan.value=spec.pan??0;}
    if(spec.type==='delay'){node=context.createDelay(1);node.delayTime.value=spec.seconds??0;}
    if(spec.type==='filter'){node=context.createBiquadFilter();node.type=spec.mode;node.frequency.value=Math.min(spec.frequency??1000,context.sampleRate*.49);node.Q.value=spec.Q??.707;node.gain.value=spec.gain??0;}
    last.connect(node);last=node;
  }
  return last;
}
export function makeBuffer(context,channels,rate){
  const buffer=context.createBuffer(channels.length,channels[0].length,rate);channels.forEach((c,i)=>buffer.copyToChannel(c,i));return buffer;
}
export async function renderClips(clips,{rate=44100,sidechain=null,plugins=[],factories=[]}={}){
  if(!clips.length||clips.length>32)throw Error('Add 1–32 clips to the timeline.');
  const duration=Math.max(...clips.map(c=>c.start+c.duration));
  if(!Number.isFinite(duration)||duration<=0||duration>180)throw Error('Timeline supports up to 3 minutes.');
  for(const clip of clips)if(!clip.buffer||clip.start<0||clip.offset<0||clip.duration<=0||clip.offset+clip.duration>clip.buffer.duration+.001||![clip.start,clip.offset,clip.duration,clip.gainDb,clip.pan].every(Number.isFinite)||Math.abs(clip.pan)>1||clip.gainDb>12||clip.gainDb< -60)throw Error('Invalid timeline clip.');
  const Offline=globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext;
  if(!Offline)throw Error('This browser does not support offline audio rendering.');
  const length=Math.ceil(duration*rate);
  let envelope=null;
  if(sidechain?.enabled){
    const detector=clips.find(c=>c.id===sidechain.source),target=clips.find(c=>c.id===sidechain.target);
    if(!detector||!target||detector.id===target.id)throw Error('Choose different sidechain source and target clips.');
    const ctx=new Offline(2,length,rate),src=ctx.createBufferSource(),gain=ctx.createGain();src.buffer=detector.buffer;gain.gain.value=10**(detector.gainDb/20);
    src.connect(gain).connect(ctx.destination);src.start(detector.start,detector.offset,detector.duration);
    const signal=await ctx.startRendering();
    envelope=sidechainEnvelope([signal.getChannelData(0),signal.getChannelData(1)],rate,sidechain);
  }
  const context=new Offline(2,length,rate),bus=context.createGain(),solo=clips.some(c=>c.solo);
  for(const clip of clips){
    if(clip.mute||(solo&&!clip.solo))continue;
    const src=context.createBufferSource(),gain=context.createGain(),pan=context.createStereoPanner();
    let data=clipSamples(clip);
    if(envelope&&clip.id===sidechain.target)data=data.map(ch=>Float32Array.from(ch,(x,i)=>x*(envelope[Math.min(length-1,Math.round((clip.start+i/clip.buffer.sampleRate)*rate))]??1)));
    // Bake 3 ms boundary fades into clip copies; keep per-clip gain and pan as nodes.
    const fade=Math.max(1,Math.min(Math.round(.003*clip.buffer.sampleRate),Math.floor(data[0].length/4)));
    for(const channel of data)for(let i=0;i<fade;i++){channel[i]*=i/fade;channel[channel.length-1-i]*=i/fade;}
    src.buffer=makeBuffer(context,data,clip.buffer.sampleRate);pan.pan.value=clip.pan;gain.gain.value=10**(clip.gainDb/20);
    src.connect(gain).connect(pan).connect(bus);src.start(clip.start);
  }
  let last=bus;for(const plugin of plugins)last=connectPlugin(context,last,plugin);
  for(const factory of factories){const node=factory({context,input:last,parameters:{}});if(!node||node.context!==context||typeof node.connect!=='function')throw Error('Plugin factory must return an AudioNode from the supplied context.');last=node;}
  last.connect(context.destination);return context.startRendering();
}
