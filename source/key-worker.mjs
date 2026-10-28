import {detectKey} from './studio-audio.mjs';
self.onmessage=({data})=>{
  try{self.postMessage({result:detectKey(data.samples,data.sampleRate)});}
  catch(error){self.postMessage({error:error.message});}
};
