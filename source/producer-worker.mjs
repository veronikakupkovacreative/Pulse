import {processPitchTime} from './dsp/production-tools.mjs';
import {pitchCorrect,deEssProcess,transientProcess} from './advanced-fx.mjs';
import {normalizeExport,validatePcm} from './dsp/clip-engine.mjs';
self.onmessage=({data})=>{
  try{
    const {kind,channels,rate,options}=data;validatePcm(channels,rate);
    if(channels[0].length/rate>180)throw Error('Processing supports clips up to 3 minutes.');
    let out,stats;
    if(kind==='stretch')out=processPitchTime(channels,rate,{...options,preservePitch:true});
    else if(kind==='pitch')out=pitchCorrect(channels,rate,options);
    else if(kind==='deesser')out=deEssProcess(channels,rate,options);
    else if(kind==='transient')out=transientProcess(channels,rate,options);
    else if(kind==='normalize'){stats=normalizeExport(channels,rate,options);out=stats.channels;delete stats.channels;}
    else throw Error('Unknown audio processor.');
    validatePcm(out,rate);self.postMessage({channels:out,stats},out.map(c=>c.buffer));
  }catch(error){self.postMessage({error:error.message});}
};
