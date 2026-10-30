// PULSE AI-assisted DSP: measurable audio parameters, model-conditioned recommendations.
// No neural inference runs in this module. Call recommendAiSettings only with a
// validated result returned by a trained YAMNet worker.
const clampAi=(x,a,b)=>Math.min(b,Math.max(a,Number(x)||0));
export function analyzeAudioForAssist(channels,rate){
  if(!Array.isArray(channels)||!channels.length||!Number.isFinite(rate)||rate<8000)
    throw Error('Valid audio channels and sample rate are required.');
  const n=channels[0].length;
  if(!n||channels.some(ch=>ch.length!==n))throw Error('Audio channels must be aligned.');
  const stride=Math.max(1,Math.floor(rate/11025)),count=Math.ceil(n/stride);
  let energy=0,peak=0,crossings=0,previous=0;
  const blockSize=Math.max(1,Math.floor(rate*.02)),blocks=[];
  let blockEnergy=0,blockCount=0;
  for(let i=0;i<n;i+=stride){
    let v=0;for(const ch of channels)v+=(ch[i]||0)/channels.length;
    energy+=v*v;peak=Math.max(peak,Math.abs(v));
    if(i&&((v>=0)!==(previous>=0)))crossings++;previous=v;
    blockEnergy+=v*v;blockCount++;
    if(blockCount*stride>=blockSize){
      blocks.push(Math.sqrt(blockEnergy/blockCount));blockEnergy=0;blockCount=0;
    }
  }
  if(blockCount)blocks.push(Math.sqrt(blockEnergy/blockCount));
  const rms=Math.sqrt(energy/Math.max(1,count));
  const average=blocks.reduce((a,b)=>a+b,0)/Math.max(1,blocks.length);
  const transients=blocks.reduce((acc,x,i)=>acc+(i&&x>Math.max(.015,blocks[i-1]*2.1)?1:0),0);
  return {duration:n/rate,rmsDb:20*Math.log10(Math.max(rms,1e-9)),
    peakDb:20*Math.log10(Math.max(peak,1e-9)),crestDb:20*Math.log10(Math.max(peak,1e-9)/Math.max(rms,1e-9)),
    zeroCrossingRate:crossings/Math.max(1,count),transientDensity:transients/Math.max(.1,n/rate),
    dynamicVariation:Math.sqrt(blocks.reduce((sum,x)=>sum+(x-average)**2,0)/Math.max(1,blocks.length))};
}
export function recommendAiSettings(classifications,features,effect){
  if(!Array.isArray(classifications)||!classifications.length||
      classifications.some(x=>!x||typeof x.label!=='string'||!Number.isFinite(x.score)||x.score<0||x.score>1))
    throw Error('AI recommendations require a real model classification result.');
  if(!features||!Number.isFinite(features.crestDb)||!Number.isFinite(features.rmsDb))
    throw Error('Audio measurements are unavailable.');
  const tags=classifications.map(x=>({label:x.label.toLowerCase(),score:x.score}));
  const confidenceOf=(pattern)=>tags.reduce((a,x)=>pattern.test(x.label)?Math.max(a,x.score):a,0);
  const drums=confidenceOf(/drum|percussion|snare|hi-hat|cymbal|beat|tap|thump/);
  const vocals=confidenceOf(/sing|vocal|speech|voice|whisper|choir|rap/);
  const bass=confidenceOf(/bass|low frequency|electronic music|synthesizer/);
  const instrument=confidenceOf(/guitar|keyboard|piano|string|violin|organ|music|melody/);
  const transient=clampAi(features.transientDensity/9,0,1),crest=clampAi(features.crestDb/18,0,1);
  const strongest=classifications.slice().sort((a,b)=>b.score-a.score)[0];
  let settings;
  switch(effect){
    case 'chorus': case 'phaser': case 'flanger':
      settings={rate:clampAi(.35+drums*.85+transient*.32, .1,3.8),
        depth:Math.round(clampAi(35+instrument*25-drums*12,12,80)),
        mix:Math.round(clampAi(24+instrument*21-vocals*9,8,65))};
      break;
    case 'sidechain':
      settings={threshold:Math.round(clampAi(-29+features.rmsDb*.3,-45,-12)),
        ratio:Math.round(clampAi(3+bass*3+drums*1.5,2,10)*10)/10,
        attack:Math.round(clampAi(7-drums*4,2,16)),
        release:Math.round(clampAi(160+80*crest+50*bass,65,350))};
      break;
    case 'transient':
      settings={attack:Math.round(clampAi(25+drums*38+transient*20,0,90)),
        sustain:Math.round(clampAi(-12-drums*23+instrument*18,-50,45))};
      break;
    case 'deesser':
      settings={frequency:Math.round(clampAi(5400+vocals*1100,3500,9000)/100)*100,
        threshold:Math.round(clampAi(features.rmsDb+3-vocals*5,-48,-12)),
        amount:Math.round(clampAi(45+vocals*40,20,95))};
      break;
    case 'normalize':
      settings={mode:'lufs',targetLufs:vocals>drums&&vocals>.18?-16:drums>.2?-12:-14,
        ceiling:-1};
      break;
    default:throw Error('Unsupported AI-assisted effect.');
  }
  return {effect,settings,model:'YAMNet · AudioSet 521',label:strongest.label,confidence:strongest.score,
    // The model predicts sound classes, not optimal mastering settings. DSP
    // parameter mapping is an explicitly labeled heuristic recommendation.
    method:'Model-conditioned DSP suggestion (not a learned parameter optimizer)'};
}
export function sidechainProcess(channels,keyChannels,rate,{threshold=-26,ratio=4,attack=6,release=170}={}){
  if(!Array.isArray(channels)||!channels.length||!Array.isArray(keyChannels)||!keyChannels.length||
    !Number.isFinite(rate)||rate<8000||channels.some(c=>c.length!==channels[0].length))
    throw Error('Invalid sidechain source or trigger.');
  const n=channels[0].length;
  if(!keyChannels[0].length||keyChannels.some(c=>c.length!==keyChannels[0].length))
    throw Error('Sidechain trigger has invalid channel alignment.');
  threshold=clampAi(threshold,-60,0);ratio=clampAi(ratio,1,20);
  attack=clampAi(attack,1,100);release=clampAi(release,10,1000);
  const att=Math.exp(-1/(rate*attack/1000)),rel=Math.exp(-1/(rate*release/1000));
  const out=channels.map(()=>new Float32Array(n)),keyLength=keyChannels[0].length;
  let envelope=0,gain=1,maxReductionDb=0;
  for(let i=0;i<n;i++){
    // A genuine external detector path: the key never enters the output bus.
    let detected=0;
    if(i<keyLength)for(const key of keyChannels)detected+=Math.abs(key[i])/keyChannels.length;
    envelope=(detected>envelope?att:rel)*envelope+(1-(detected>envelope?att:rel))*detected;
    const levelDb=20*Math.log10(Math.max(1e-8,envelope));
    const reductionDb=levelDb>threshold?(levelDb-threshold)*(1-1/ratio):0;
    const desired=Math.pow(10,-reductionDb/20),timeCoeff=desired<gain?att:rel;
    gain=timeCoeff*gain+(1-timeCoeff)*desired;
    maxReductionDb=Math.max(maxReductionDb,-20*Math.log10(Math.max(1e-8,gain)));
    for(let c=0;c<channels.length;c++)out[c][i]=Math.max(-1,Math.min(1,channels[c][i]*gain));
  }
  return {channels:out,maxReductionDb,keyDuration:keyLength/rate};
}
