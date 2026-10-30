self.onmessage=event=>{
  const {id,type,channels,sampleRate,from,to,profile,options}=event.data||{};
  try{
    if(type==='learn'){
      const selected=channels.length>1?channels:channels;
      const profiles=selected.map(channel=>captureSpectralProfile([channel],sampleRate,from,to));
      self.postMessage({id,type:'profile',profiles},profiles.map(p=>p.buffer));return;
    }
    if(type==='render'){
      if(!profile||(Array.isArray(profile)?profile.some(p=>p.length!==HALF+1):profile.length!==HALF+1))throw Error('Learn a noise profile first.');
      if(!channels?.length||channels.length>2)throw Error('Only mono or stereo audio is supported.');
      const output=[];
      for(let c=0;c<channels.length;c++){
        output.push(renderSpectralDenoise(channels[c],Array.isArray(profile)?profile[Math.min(c,profile.length-1)]:profile,{...options,sampleRate}));
        self.postMessage({id,type:'progress',value:(c+1)/channels.length});
      }
      self.postMessage({id,type:'done',channels:output},output.map(a=>a.buffer));return;
    }
    throw Error('Unknown spectral action.');
  }catch(error){self.postMessage({id,type:'error',message:error?.message||'Spectral processing failed.'});}
};