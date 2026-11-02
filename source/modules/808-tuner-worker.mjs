import {detectFundamental,processPitchTime} from './808-tuner-dsp.mjs';
self.onmessage=({data})=>{
 const {id,kind,channels,rate,options={}}=data||{};
 try{
  if(!Number.isFinite(rate)||!Array.isArray(channels))throw Error('Invalid audio input.');
  if(kind==='analyze'){
   const result=detectFundamental(channels,rate,{minHz:28,maxHz:260});
   self.postMessage({id,ok:true,result});
  }else if(kind==='tune'){
   const result=processPitchTime(channels,rate,{originalBpm:120,targetBpm:120,
    preservePitch:true,semitones:options.semitones,cents:options.cents});
   self.postMessage({id,ok:true,result},result.map(channel=>channel.buffer));
  }else throw Error('Unknown 808 operation.');
 }catch(error){self.postMessage({id,ok:false,error:error?.message||'808 processing failed.'});}
};
