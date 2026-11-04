import {analyzeTempo} from './original-bpm.mjs';
let job=null;
function fail(id,error){self.postMessage({type:'error',id,error:error?.message||'RHYTHM_ANALYSIS_FAILED'});job=null;}
self.onmessage=({data})=>{
 try{
  if(data?.type==='start'){
   if(!Number.isFinite(data.inputRate)||!Number.isFinite(data.targetRate)||!Number.isInteger(data.totalSamples)||data.totalSamples<1)throw Error('INVALID_RHYTHM_JOB');
   job={id:data.id,inputRate:data.inputRate,targetRate:data.targetRate,totalSamples:data.totalSamples,samples:new Float32Array(data.totalSamples),received:0,nextTarget:0};return;
  }
  if(!job||data?.id!==job.id)return;
  if(data.type==='cancel'){job=null;return;}
  if(data.type==='chunk'){
   const channels=data.channels.map(buffer=>new Float32Array(buffer));
   if(!channels.length||!Number.isInteger(data.targetStart)||!Number.isInteger(data.targetCount)||!Number.isInteger(data.sourceStart)||data.targetStart!==job.nextTarget||data.targetCount<1||channels.some(channel=>channel.length!==channels[0].length))throw Error('INVALID_RHYTHM_CHUNK');
   const ratio=job.inputRate/job.targetRate;
   for(let i=0;i<data.targetCount;i++){
    const globalIndex=data.targetStart+i,sourceFrom=Math.floor(globalIndex*ratio),sourceTo=Math.max(sourceFrom+1,Math.floor((globalIndex+1)*ratio)),localFrom=sourceFrom-data.sourceStart;
    let sum=0,count=0;
    for(const channel of channels)for(let sample=localFrom;sample<sourceTo-data.sourceStart&&sample<channel.length;sample++){sum+=channel[sample];count++;}
    job.samples[globalIndex]=sum/Math.max(1,count);
   }
   job.nextTarget=data.targetStart+data.targetCount;job.received=job.nextTarget;
   self.postMessage({type:'progress',id:job.id,progress:Math.round(job.received/job.totalSamples*95)});return;
  }
  if(data.type==='finish'){
   if(job.received<job.totalSamples)throw Error('RHYTHM_AUDIO_INCOMPLETE');
   const result=analyzeTempo(job.samples,job.targetRate);self.postMessage({type:'progress',id:job.id,progress:100});self.postMessage({type:'done',id:job.id,result});job=null;
  }
 }catch(error){fail(data?.id||job?.id,error);}
};