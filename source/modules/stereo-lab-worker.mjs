import {fromChannels} from './dsp.mjs';
import {renderStereoLab,renderVocalDoubler} from './stereo-lab-dsp.mjs';
self.onmessage=({data})=>{
 const {id,action,channels,sampleRate,options}=data||{};
 try{
  if(!['stereo','doubler'].includes(action)||!Number.isInteger(sampleRate)||
    !Array.isArray(channels)||channels.length<1||channels.length>2)
   throw Error('Invalid stereo job.');
  const input=fromChannels(channels.map(x=>new Float32Array(x)),sampleRate);
  const output=action==='stereo'?renderStereoLab(input,options):renderVocalDoubler(input,options);
  const samples=[output.buffer.getChannelData(0),output.buffer.getChannelData(1)];
  self.postMessage({id,ok:true,channels:samples,sampleRate,stats:{
   before:output.before,after:output.after,protectionDb:output.protectionDb
  }},samples.map(s=>s.buffer));
 }catch(error){self.postMessage({id,ok:false,error:error?.message||'Audio processing failed.'});}
};