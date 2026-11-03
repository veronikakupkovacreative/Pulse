import {removeNoiseChannels} from './noise-dsp.mjs';

// One self-contained render per worker. Parent terminates worker on cancel/unmount.
self.onmessage=event=>{
 const {channels,sampleRate,settings}=event.data||{};
 try{
  let last=-1;
  const result=removeNoiseChannels(channels,sampleRate,settings,{
   onProgress:fraction=>{
    const percent=Math.round(fraction*100);
    if(percent-last>=3||percent===100){last=percent;self.postMessage({type:'progress',percent});}
   }
  });
  self.postMessage({type:'result',...result},result.channels.map(channel=>channel.buffer));
 }catch(error){self.postMessage({type:'error',message:error?.message||'Noise processing failed.'});}
};
