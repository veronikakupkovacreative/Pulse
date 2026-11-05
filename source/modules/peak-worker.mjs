import {createPeakState,appendPeakChunk,finishPeakPyramid} from './peak-pyramid.mjs';
let current=null;
self.onmessage=({data})=>{
 try{
  if(data?.type==='reset'){current=null;return;}
  if(data?.type==='start'){
   current={id:data.id,state:createPeakState(data.totalFrames,{blockSize:data.blockSize||256}),received:0};
   return;
  }
  if(!current||data.id!==current.id)return;
  if(data.type==='chunk'){
   const channels=data.channels.map(x=>new Float32Array(x));
   if(data.offset!==current.received)throw new Error('Out-of-order waveform chunk');
   appendPeakChunk(current.state,channels,data.offset);
   current.received+=channels[0].length;
   return;
  }
  if(data.type==='finish'){
   if(current.received!==current.state.totalFrames)throw new Error('Incomplete waveform');
   const levels=finishPeakPyramid(current.state);
   const transfers=levels.flatMap(level=>[level.min.buffer,level.max.buffer]);
   self.postMessage({type:'done',id:current.id,levels},transfers);
   current=null;
  }
 }catch(error){self.postMessage({type:'error',id:data?.id,error:error.message||'Waveform failed'});current=null;}
};
