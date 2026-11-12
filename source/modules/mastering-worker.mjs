/** Browser worker for offline PULSE mastering: no audio upload or UI blocking. */
import {fromChannels} from './dsp.mjs';
import {measureMasteringAudio,recommendMasteringSettings,renderMasteringAudio} from './mastering-engine.mjs';

self.onmessage=({data})=>{
 const {id,action,sampleRate,channels,settings,preset}=data||{};
 if(!id||!['analyze','render'].includes(action))return;
 try{
  if(!Array.isArray(channels)||!channels.length||channels.length>8)throw Error('Invalid audio channels.');
  const audio=fromChannels(channels.map(channel=>new Float32Array(channel)),sampleRate);
  if(action==='analyze'){
   const result=recommendMasteringSettings(audio,preset||'streaming');
   self.postMessage({id,type:'done',result});
  }else{
   const result=renderMasteringAudio(audio,settings);
   const output=Array.from({length:result.buffer.numberOfChannels},(_,i)=>result.buffer.getChannelData(i).buffer);
   self.postMessage({id,type:'done',result:{...result,buffer:{sampleRate:result.buffer.sampleRate,channels:output}}},output);
  }
 }catch(error){self.postMessage({id,type:'error',error:error?.message||'Mastering worker failed.'});}
};
