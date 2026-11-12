/**
 * PULSE local AI Music Tagger (CLAP zero-shot audio classification).
 * INFERENCE RUNS IN THIS BROWSER WEB WORKER. No audio is uploaded anywhere.
 * First use downloads quantized ONNX weights from Hugging Face; browser cache reuses them.
 * Reference: https://huggingface.co/Xenova/clap-htsat-unfused (Apache-2.0 base model).
 */
export const MODEL_ID='Xenova/clap-htsat-unfused';
export const MODEL_SAMPLE_RATE=48000;
export const MAX_SECONDS=10;
export const GROUPS=Object.freeze({
 genres:[
  ['Trap','a trap music song with heavy 808 bass and hip hop drums'],
  ['Hip-Hop','a hip hop rap music track'],
  ['House','a house dance music track'],
  ['Tech House','a tech house electronic dance music track'],
  ['Techno','a techno electronic dance music track'],
  ['Drum & Bass','a drum and bass electronic track'],
  ['UK Garage','a UK garage dance music track'],
  ['Dubstep','a dubstep electronic dance music track'],
  ['Ambient','an ambient atmospheric music piece'],
  ['Lo-Fi','a lo fi hip hop chill beat'],
  ['Pop','a catchy pop song'],
  ['Rock','a rock music song'],
  ['Metal','a heavy metal music song'],
  ['Jazz','a jazz music performance'],
  ['Classical','a classical orchestral music composition'],
  ['R&B','an R and B soul music track'],
  ['Funk','a funk groove with syncopated bass'],
  ['Disco','a disco dance track'],
  ['Reggaeton','a reggaeton latin dance track'],
  ['Acoustic','an acoustic folk song']
 ],
 moods:[
  ['Energetic','an energetic high energy piece of music'],
  ['Dark','a dark ominous piece of music'],
  ['Melancholic','a melancholic sad piece of music'],
  ['Happy','a happy cheerful piece of music'],
  ['Euphoric','a euphoric uplifting piece of music'],
  ['Dreamy','a dreamy ethereal piece of music'],
  ['Calm','a calm soothing relaxing piece of music'],
  ['Aggressive','an aggressive intense piece of music'],
  ['Chill','a chilled laid back mellow piece of music'],
  ['Dramatic','a dramatic cinematic piece of music'],
  ['Tense','a tense suspenseful piece of music'],
  ['Romantic','a romantic sentimental piece of music'],
  ['Mysterious','a mysterious haunting piece of music'],
  ['Playful','a playful whimsical piece of music']
 ],
 instruments:[
  ['Singing Voice','a song with clearly audible lead singing vocals'],
  ['Rap Vocals','a song featuring a rapper rapping'],
  ['Drum Kit','music with acoustic drum kit'],
  ['Drum Machine','music with an electronic drum machine'],
  ['808 Bass','music with deep 808 sub bass'],
  ['Bass Guitar','music with electric bass guitar'],
  ['Synthesizer','music with electronic synthesizer'],
  ['Piano','music with piano'],
  ['Electric Guitar','music with electric guitar'],
  ['Acoustic Guitar','music with acoustic guitar'],
  ['Strings','music with orchestral string instruments'],
  ['Violin','music with violin'],
  ['Brass','music with brass instruments'],
  ['Saxophone','music with saxophone'],
  ['Flute','music with flute'],
  ['Percussion','music with hand percussion'],
  ['Organ','music with organ keyboard'],
  ['Harp','music with harp'],
  ['Trumpet','music with trumpet'],
  ['Choir','music with choral vocal harmonies']
 ]
});
const LIMITS=Object.freeze({genres:3,moods:4,instruments:5});
export function sortModelTags(outputs,group){
 const candidates=GROUPS[group];
 if(!candidates)throw Error('Unsupported tag group');
 const map=new Map(candidates.map(([label,prompt])=>[prompt,label]));
 if(!Array.isArray(outputs))throw Error('Invalid model output');
 return outputs
  .filter(item=>item&&map.has(item.label)&&Number.isFinite(item.score))
  .map(item=>({label:map.get(item.label),score:Math.max(0,Math.min(1,item.score))}))
  .sort((a,b)=>b.score-a.score)
  .slice(0,LIMITS[group]);
}
export function checkSignal(samples,sampleRate=MODEL_SAMPLE_RATE){
 if(!(samples instanceof Float32Array)||samples.length<sampleRate*2||samples.length>sampleRate*(MAX_SECONDS+.1))
  throw Error('Choose a 2–10 second audio excerpt for local CLAP inference.');
 let peak=0,sum=0;
 for(const n of samples){
  if(!Number.isFinite(n))throw Error('Invalid waveform sample.');
  peak=Math.max(peak,Math.abs(n));sum+=n*n;
 }
 if(peak<.0001||Math.sqrt(sum/samples.length)<.00003)throw Error('Selected audio is silent.');
 return {durationSeconds:samples.length/sampleRate,peak,rms:Math.sqrt(sum/samples.length)};
}
let modelPromise=null;
async function model(progress){
 if(!modelPromise){
  modelPromise=(async()=>{
   progress('runtime','Loading local inference runtime…');
   const {pipeline,env}=await import('/vendor/clap/transformers.min.js');
   env.allowRemoteModels=true;
   env.allowLocalModels=false;
   env.useBrowserCache=true;
   env.backends.onnx.wasm.wasmPaths=new URL('/vendor/clap/',self.location.origin).href;
   env.backends.onnx.wasm.numThreads=1; // avoid COOP/COEP requirements
   return pipeline('zero-shot-audio-classification',MODEL_ID,{
    quantized:true,
    progress_callback:info=>{
     const value=Number(info?.progress);
     const detail=typeof info?.file==='string'?info.file.split('/').at(-1):'model';
     if(info?.status==='progress'&&Number.isFinite(value))
      progress('downloading','Downloading '+detail+' · '+Math.round(value)+'%',Math.round(value));
     else if(info?.status==='initiate')progress('downloading','Preparing '+detail+'…',0);
    }
   });
  })().catch(error=>{modelPromise=null;throw error;});
 }
 return modelPromise;
}
export async function classifyAudio(audio,classifier,{onProgress=()=>{}}={}){
 checkSignal(audio);
 if(typeof classifier!=='function')throw Error('CLAP model is not initialized.');
 const result={};
 for(const group of ['genres','moods','instruments']){
  onProgress(group,'Analyzing '+group+' locally…');
  const candidates=GROUPS[group].map(([,prompt])=>prompt);
  const predictions=await classifier(audio,candidates,{hypothesis_template:'This is a sound of {}.'});
  result[group]=sortModelTags(predictions,group);
  if(result[group].length===0)throw Error('CLAP returned no valid '+group+' predictions.');
 }
 return {model:MODEL_ID,engine:'local-onnx-wasm',genre:result.genres,moods:result.moods,
  instruments:result.instruments,disclaimer:'Relative zero-shot similarity among candidate labels, not calibrated probabilities or stem-level isolation.'};
}
if(typeof self!=='undefined'&&typeof self.postMessage==='function'){
 self.onmessage=async({data})=>{
  if(data?.type!=='classify'||typeof data.id!=='string')return;
  const {id}=data,post=(stage,message,percent)=>self.postMessage({id,type:'progress',stage,message,percent});
  try{
   const audio=new Float32Array(data.samples);
   checkSignal(audio,data.sampleRate);
   if(data.sampleRate!==MODEL_SAMPLE_RATE)throw Error('CLAP expects 48000 Hz mono audio.');
   post('model','Initializing the local CLAP model…');
   const classifier=await model(post);
   const result=await classifyAudio(audio,classifier,{onProgress:(stage,message)=>post(stage,message)});
   self.postMessage({id,type:'complete',result});
  }catch(error){self.postMessage({id,type:'error',error:String(error?.message||error).slice(0,450)});}
 };
}
