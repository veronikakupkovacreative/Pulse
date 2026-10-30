function initSpectralDenoise({el,tools,channels,asAudioBuffer,playBuffer,stopPreview,workspace,workingChanged,download,filename,status,encodeWav}){
  let profile=null,profileInput=null,result=null,worker=null,serial=0;
  const say=(message)=>status('denoise-status',message);
  function invalidate(keepProfile=false){
    serial++;
    if(worker){worker.terminate();worker=null;}
    result=null;
    if(!keepProfile){profile=null;profileInput=null;status('denoise-profile-status','Set IN / OUT around isolated noise. Minimum 120 ms.');}
    for(const id of ['denoise-preview','denoise-apply','denoise-export'])el(id).disabled=true;
    el('denoise-result').hidden=true;
    el('denoise-process').disabled=!profile||profileInput!==tools.buffer;
    el('denoise-learn').disabled=!tools.buffer;
    el('denoise-live').disabled=!profile||profileInput!==tools.buffer;
  }
  const options=()=>({
    amount:Number(el('denoise-amount').value),
    smoothing:Number(el('denoise-smoothing').value),
    floor:Number(el('denoise-floor').value)
  });
  for(const [key,label] of [['amount','denoise-amount-value'],['smoothing','denoise-smoothing-value'],['floor','denoise-floor-value']]){
    el('denoise-'+key).oninput=()=>{
      status(label,el('denoise-'+key).value+'%');
      if(result){result=null;el('denoise-result').hidden=true;for(const id of ['denoise-preview','denoise-apply','denoise-export'])el(id).disabled=true;say('Settings changed. Process audio again.');}
    };
  }
  function run(type,payload){
    if(worker)worker.terminate();
    const current=++serial;
    worker=createSpectralWorker();
    return new Promise((resolve,reject)=>{
      worker.onmessage=event=>{
        if(current!==serial)return;
        const data=event.data||{};
        if(data.type==='progress'){say('Spectral processing · '+Math.round(data.value*100)+'%');return;}
        worker.terminate();worker=null;
        if(data.type==='error')reject(Error(data.message));else resolve(data);
      };
      worker.onerror=event=>{if(current!==serial)return;event.preventDefault();worker.terminate();worker=null;reject(Error('Spectral worker failed.'));};
      worker.postMessage({id:current,type,...payload});
    });
  }
  el('denoise-learn').onclick=async()=>{
    const input=tools.buffer;if(!input){say('Load audio first.');return;}
    const from=tools.loopFrom,to=tools.loopTo;
    if(!tools.loopEnabled||to-from<.12||to-from>20){say('Enable LOOP and set IN / OUT around 0.12–20 seconds of isolated noise.');return;}
    if(to>input.duration){say('Noise selection exceeds the source.');return;}
    invalidate();el('denoise-learn').disabled=true;say('Analyzing selected noise fingerprint…');
    try{
      const data=await run('learn',{channels:channels(input).map(c=>c.slice()),sampleRate:input.sampleRate,from,to});
      if(tools.buffer!==input)return;
      profile=data.profile;profileInput=input;
      status('denoise-profile-status','Noise captured · '+(to-from).toFixed(2)+' s · '+profile.length+' frequency bands.');
      say('Profile ready. Adjust reduction and select Process Audio.');
      el('denoise-process').disabled=false;
      el('denoise-live').disabled=false;
    }catch(error){say(error.message);}
    finally{el('denoise-learn').disabled=!tools.buffer;}
  };
  el('denoise-process').onclick=async()=>{
    const input=tools.buffer;if(!input||!profile||profileInput!==input){say('Learn a noise profile from this track first.');return;}
    if(input.duration>180){say('For browser processing, use a track under 3 minutes or trim a shorter clip.');return;}
    const bytes=input.length*input.numberOfChannels*4;
    if(bytes>120*1024*1024){say('The audio exceeds the current device memory budget.');return;}
    const currentOptions=options();result=null;
    el('denoise-process').disabled=true;say('Performing spectral subtraction in dedicated audio worker…');
    try{
      const data=await run('render',{channels:channels(input).map(c=>c.slice()),sampleRate:input.sampleRate,profile:profile.slice(),options:currentOptions});
      if(tools.buffer!==input)return;
      result={input,buffer:asAudioBuffer(data.channels,input.sampleRate)};
      for(const id of ['denoise-preview','denoise-apply','denoise-export'])el(id).disabled=false;
      el('denoise-result').hidden=false;say('Cleaned audio is ready. Compare by ear before applying.');
    }catch(error){say(error.message);}
    finally{el('denoise-process').disabled=!profile||profileInput!==tools.buffer;}
  };
  el('denoise-live').onclick=()=>{
    if(!profile||profileInput!==tools.buffer)return;
    void playBuffer(tools.buffer,tools.playhead,tools.buffer.duration,1,{allowLoop:false,spectralProfile:profile.slice(),spectralOptions:options()}).then(()=>say('Live spectral processing active. Preview latency is approximately 2048 samples.')).catch(e=>say(e.message));
  };
  el('denoise-preview').onclick=()=>{if(result?.input===tools.buffer)void playBuffer(result.buffer,tools.playhead,result.buffer.duration,1,{allowLoop:false}).catch(e=>say(e.message));};
  el('denoise-apply').onclick=()=>{
    if(!result||result.input!==tools.buffer)return;
    stopPreview();workspace.apply(result.buffer);workingChanged();say('Spectral denoise applied. Undo restores the previous audio.');
  };
  el('denoise-export').onclick=()=>{
    if(!result||result.input!==tools.buffer)return;
    const blob=encodeWav(channels(result.buffer),result.buffer.sampleRate,24);download(blob,filename('spectral-clean.wav'));say('Clean audio exported as 24-bit WAV.');
  };
  invalidate();
  return {invalidate};
}
