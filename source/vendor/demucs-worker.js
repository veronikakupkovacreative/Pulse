// Demucs inference worker. Model (~170 MB) is downloaded only after explicit consent.
// MIT source attribution: https://github.com/joverval/sdemux
importScripts('/vendor/onnx/ort.min.js');
ort.env.wasm.wasmPaths='/vendor/onnx/';
ort.env.wasm.numThreads=1;
let session=null,active=false;
self.onmessage=async ({data})=>{
  if(data?.type!=='separate'||active)return;
  active=true;
  try{
    if(!(data.left instanceof Float32Array)||!(data.right instanceof Float32Array)||
      data.left.length!==data.right.length||data.left.length<22050||
      data.left.length>44100*45)throw Error('Choose 0.5–45 seconds of audio for local stem separation.');
    if(!session){
      self.postMessage({type:'progress',message:'Loading Demucs model (~170 MB). First run needs a large download.'});
      session=await loadDemucsModel(update=>{
        const percent=Number.isFinite(update.percent)?' '+update.percent+'%':'';
        self.postMessage({type:'progress',message:'Demucs '+update.stage+percent});
      });
    }
    const left=data.left,right=data.right;
    const input={numberOfChannels:2,length:left.length,
      getChannelData:index=>index===0?left:right};
    const result=await separateStems(session,input,44100,update=>{
      self.postMessage({type:'progress',message:'Separating four stems · '+update.percent+'%'});
    });
    const names=['drums','bass','other','vocals'],tracks=[],transfer=[];
    for(let i=0;i<names.length;i++){
      const channels=result.stemData[i].map(ch=>ch.slice(0,left.length));
      for(const ch of channels)transfer.push(ch.buffer);
      tracks.push({name:names[i],channels});
    }
    self.postMessage({type:'done',tracks,sampleRate:44100},transfer);
  }catch(error){
    self.postMessage({type:'error',message:error?.message||'Demucs inference failed. Verify network, memory and model availability.'});
  }finally{active=false;}
};
