// Pure, offline browser DSP. Only allocates output audio when an operation is applied.
import {fromChannels,applySmartMaster} from './dsp.mjs';
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const finite=(n,low,high,name)=>{const v=Number(n);if(!Number.isFinite(v)||v<low||v>high)throw Error('Invalid '+name);return v;};
const channels=b=>Array.from({length:b.numberOfChannels},(_,i)=>b.getChannelData(i));
const result=(data,rate)=>fromChannels(data,rate);

export function clipBalance(buffer,{gainDb=0,pan=0,start=0,end=buffer.duration}={}){
  const db=finite(gainDb,-36,18,'gain'),p=finite(pan,-1,1,'pan');
  const from=clamp(Math.floor(finite(start,0,buffer.duration,'start')*buffer.sampleRate),0,buffer.length);
  const to=clamp(Math.ceil(finite(end,0,buffer.duration,'end')*buffer.sampleRate),0,buffer.length);
  if(to<=from)throw Error('Select a non-empty region.');
  const source=channels(buffer),out=[new Float32Array(buffer.length),new Float32Array(buffer.length)];
  const gain=Math.pow(10,db/20),left=buffer.numberOfChannels===1?Math.cos((p+1)*Math.PI/4):Math.min(1,1-p);
  const right=buffer.numberOfChannels===1?Math.sin((p+1)*Math.PI/4):Math.min(1,1+p);
  const fade=Math.max(1,Math.round(.005*buffer.sampleRate));
  for(let i=0;i<buffer.length;i++){
    const ramp=i>=from&&i<to?Math.min(1,(i-from)/fade,(to-i-1)/fade):0;
    const wet=ramp*gain,dry=1-ramp;
    const l=source[0][i],r=source[1]?.[i]??l;
    out[0][i]=clamp(l*dry+l*wet*left,-1,1);
    out[1][i]=clamp(r*dry+r*wet*right,-1,1);
  }
  return result(out,buffer.sampleRate);
}
export function sidechainCompress(buffer,sideBuffer,{threshold=-24,ratio=5,attack=5,release=180,amount=85,mode='external',bpm=120}={}){
  finite(threshold,-60,-3,'threshold');finite(ratio,1,20,'ratio');
  finite(attack,1,100,'attack');finite(release,20,1000,'release');
  finite(amount,0,100,'amount');finite(bpm,60,200,'BPM');
  const rate=buffer.sampleRate,src=channels(buffer),side=sideBuffer?channels(sideBuffer):null;
  if(mode==='external'&&!side)throw Error('Load a kick/trigger audio file, or select the 4/4 pump preset.');
  const thresholdAmp=10**(threshold/20),attackCoef=Math.exp(-1/(rate*(attack/1000))),releaseCoef=Math.exp(-1/(rate*(release/1000)));
  const beatPeriod=rate*60/bpm,fadeLength=Math.max(1,Math.round(rate*.015)),duckLength=Math.min(beatPeriod*.8,rate*.18);
  const outputs=src.map(()=>new Float32Array(buffer.length));let env=0;
  for(let i=0;i<buffer.length;i++){
    let detector=0;
    if(mode==='internal'){
      const phase=i%beatPeriod;
      detector=phase<duckLength?1:0;
    }else{
      // Audio from a sidechain source is looped if it is shorter than the target.
      const j=Math.floor(i*sideBuffer.sampleRate/rate)%sideBuffer.length;
      for(const ch of side)detector=Math.max(detector,Math.abs(ch[j]));
    }
    const coef=detector>env?attackCoef:releaseCoef;
    env=detector+(env-detector)*coef;
    let reduction=env<=thresholdAmp?1:Math.pow(env/thresholdAmp,1/ratio-1);
    reduction=clamp(reduction,0,1);
    const gain=1-(1-reduction)*amount/100;
    for(let c=0;c<src.length;c++)outputs[c][i]=src[c][i]*gain;
  }
  return result(outputs,rate);
}
export function modulationEffect(buffer,{type='chorus',rate=0.7,depth=50,mix=35,feedback=20}={}){
  if(!['chorus','flanger','phaser'].includes(type))throw Error('Unknown modulation effect');
  finite(rate,.05,8,'LFO rate');finite(depth,0,100,'depth');finite(mix,0,100,'mix');finite(feedback,0,80,'feedback');
  const sr=buffer.sampleRate,wet=mix/100,fb=feedback/100,channelsOut=[];
  for(let c=0;c<buffer.numberOfChannels;c++){
    const x=buffer.getChannelData(c),y=new Float32Array(x.length);
    const delay=new Float32Array(Math.ceil(sr*.05)+4);
    let pointer=0,phaseOffset=c*.47;
    const allpassState=Array.from({length:4},()=>({z:0,previous:0}));
    for(let i=0;i<x.length;i++){
      const lfo=Math.sin(2*Math.PI*rate*i/sr+phaseOffset);
      let processed;
      if(type==='phaser'){
        const freq=350+(lfo+1)*.5*(depth/100)*2400;
        const t=Math.tan(Math.PI*freq/sr),a=(t-1)/(t+1);
        processed=x[i];
        for(const stage of allpassState){const out=a*processed+stage.z-a*stage.previous;stage.z=processed;stage.previous=out;processed=out;}
      }else{
        const base=type==='chorus'?.018:.004;
        const sweep=(type==='chorus'?.008:.003)*depth/100;
        const samples=(base+sweep*lfo)*sr,at=(pointer-samples+delay.length)%delay.length;
        const lo=Math.floor(at),frac=at-lo;
        processed=delay[lo]*(1-frac)+delay[(lo+1)%delay.length]*frac;
        delay[pointer]=clamp(x[i]+processed*fb,-1,1);
        pointer=(pointer+1)%delay.length;
      }
      y[i]=clamp(x[i]*(1-wet)+processed*wet,-1,1);
    }
    channelsOut.push(y);
  }
  return result(channelsOut,sr);
}
const rackTypes=['drive','gate','compressor','width','chorus','flanger'];
export const RACK_PRESETS=Object.freeze({
  warm:{label:'WARM CONSOLE',plugins:[{type:'drive',amount:20},{type:'compressor',amount:38}]},
  punch:{label:'PUNCH BUS',plugins:[{type:'compressor',amount:65},{type:'drive',amount:12}]},
  air:{label:'WIDE AIR',plugins:[{type:'width',amount:72},{type:'chorus',amount:18}]},
  grit:{label:'LO-FI EDGE',plugins:[{type:'drive',amount:72},{type:'gate',amount:18}]},
});
export function validateRack(plugins){
  if(!Array.isArray(plugins)||plugins.length<1||plugins.length>6)throw Error('Rack needs 1–6 effects.');
  return plugins.map(p=>{
    if(!p||!rackTypes.includes(p.type))throw Error('Unsupported effect in rack.');
    return {type:p.type,amount:finite(p.amount,0,100,'effect amount')};
  });
}
export function runRack(buffer,plugins){
  const steps=validateRack(plugins);
  let audio=buffer;
  for(const p of steps){
    const amount=p.amount/100;
    if(p.type==='chorus'||p.type==='flanger'){audio=modulationEffect(audio,{type:p.type,rate:p.type==='chorus'?.45:.8,depth:60,mix:p.amount*.6,feedback:16});continue;}
    if(p.type==='compressor'){audio=applySmartMaster(audio,{threshold:-10-amount*18,ratio:1+amount*4,ceiling:-.5});continue;}
    const inCh=channels(audio),out=inCh.map(src=>new Float32Array(src.length));
    for(let c=0;c<out.length;c++)for(let i=0;i<out[c].length;i++){
      const v=inCh[c][i];
      if(p.type==='drive'){const drive=1+amount*12;out[c][i]=Math.tanh(v*drive)/Math.tanh(drive);}
      if(p.type==='gate')out[c][i]=Math.abs(v)<amount*.075?0:v;
      if(p.type==='width'){
        const a=inCh[0][i],b=(inCh[1]||inCh[0])[i],mid=(a+b)*.5,side=(a-b)*.5*(.5+1.5*amount);
        out[c][i]=clamp(mid+(c===0?side:-side),-1,1);
      }
    }
    audio=result(out,audio.sampleRate);
  }
  return audio;
}
