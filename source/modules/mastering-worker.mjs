/** Browser worker for offline PULSE mastering: no audio upload or UI blocking. */
import {fromChannels} from './dsp.mjs';
import {measureMasteringAudio,recommendMasteringSettings,renderMasteringAudio} from './mastering-engine.mjs';
import {planReferenceMastering,spectrumForBuffer} from './mastering-advanced.mjs';

self.onmessage=({data})=>{
 const {id,action,sampleRate,channels,settings,preset,referenceChannels,referenceSampleRate}=data||{};
 if(!id||!['analyze','render','reference'].includes(action))return;
 try{
  if(!Array.isArray(channels)||!channels.length||channels.length>8)throw Error('Invalid audio channels.');
  const audio=fromChannels(channels.map(channel=>new Float32Array(channel)),sampleRate);
  if(action==='analyze'){
   const result=recommendMasteringSettings(audio,preset||'streaming');
   self.postMessage({id,type:'done',result:{...result,spectrum:{input:spectrumForBuffer(audio)}}});
  }else if(action==='reference'){
   if(!Array.isArray(referenceChannels)||!referenceChannels.length||referenceChannels.length>8)throw Error('Load a reference track first.');
   const reference=fromChannels(referenceChannels.map(raw=>new Float32Array(raw)),referenceSampleRate);
   const result=planReferenceMastering(audio,reference,settings);
   self.postMessage({id,type:'done',result});
  }else{
   const result=renderMasteringAudio(audio,settings);
   const spectrum={input:spectrumForBuffer(audio),master:spectrumForBuffer(result.buffer)};
   const output=Array.from({length:result.buffer.numberOfChannels},(_,i)=>result.buffer.getChannelData(i).buffer);
   self.postMessage({id,type:'done',result:{...result,spectrum,buffer:{sampleRate:result.buffer.sampleRate,channels:output}}},output);
  }
 }catch(error){self.postMessage({id,type:'error',error:error?.message||'Mastering worker failed.'});}
};
