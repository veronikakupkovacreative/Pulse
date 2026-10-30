import {processPitchTime,detectTransients,detectFundamental} from './dsp/production-tools.mjs';
import {analyzeTempo} from './analyzer.mjs';
import {processMaster} from './dsp/mastering.mjs';
import {integratedLoudness} from './dsp/quick-tools.mjs';
// Bundled with production DSP in the main app build. Runs off the UI thread.
self.onmessage=event=>{
  const {id,kind,channels,rate,options}=event.data;
  try{
    let result;
    if(kind==='master')result=processMaster(channels,rate,options);
    else if(kind==='pitch')result=processPitchTime(channels,rate,options);
    else if(kind==='transients')result=detectTransients(channels,rate,options);
    else if(kind==='tuner')result=detectFundamental(channels,rate,options);
    else if(kind==='bpm')result=analyzeTempo(channels[0],rate);
    else throw Error('Unknown operation.');
    self.postMessage({id,ok:true,result});
  }catch(e){self.postMessage({id,ok:false,error:e.message||'Processing error.'});}
};
