// PULSE Studio / local seven-format audio converter.
// All codecs run in the browser through a same-origin, single-thread FFmpeg WASM core.
// No media data is transmitted to a server.
import {encodeWav} from './dsp.mjs';

export const AUDIO_FORMATS=Object.freeze([
  {id:'mp3',name:'MP3',description:'Lossy · widely compatible',mime:'audio/mpeg'},
  {id:'wav',name:'WAV',description:'Uncompressed PCM',mime:'audio/wav'},
  {id:'flac',name:'FLAC',description:'Lossless compression',mime:'audio/flac'},
  {id:'aac',name:'AAC',description:'AAC / ADTS stream',mime:'audio/aac'},
  {id:'m4a',name:'M4A',description:'AAC in MP4 container',mime:'audio/mp4'},
  {id:'ogg',name:'OGG',description:'Ogg Vorbis',mime:'audio/ogg'},
  {id:'wma',name:'WMA',description:'Windows Media Audio (ASF)',mime:'audio/x-ms-wma'}
]);
export const KNOWN_FORMATS=new Set(AUDIO_FORMATS.map(f=>f.id));
export const BITRATES=Object.freeze([64,96,128,160,192,256,320]);
export const EXTENSIONS=Object.freeze(['wav','wave','mp3','flac','aac','m4a','ogg','oga','wma','asf','aif','aiff','mp4','mov']);
export function inferFormat(filename=''){
  const ext=String(filename).toLowerCase().split('.').pop();
  return ({wave:'wav',oga:'ogg',asf:'wma'}[ext]??(KNOWN_FORMATS.has(ext)?ext:'unknown'));
}
/** Common music-export defaults; transparent, deterministic AUTO rather than model inference. */
export function recommendedAudioSettings(format) {
  if (!KNOWN_FORMATS.has(format)) throw Error('Unsupported audio format.');
  const bitrate = format==='mp3'?320:format==='aac'||format==='m4a'?256:format==='wma'?192:192;
  return {sampleRate:44100,bitrate,bitDepth:24,oggQuality:6,flacLevel:5};
}
export function conversionOptions({format,bitrate='auto',bitDepth='auto',oggQuality='auto',flacLevel='auto',sampleRate='auto'}={}) {
  const auto=recommendedAudioSettings(format);
  const rate=sampleRate==='auto'?auto.sampleRate:sampleRate==='original'||sampleRate===null?null:Number(sampleRate);
  if (rate!==null&&![22050,32000,44100,48000,88200,96000].includes(rate))throw Error('Unsupported sample rate.');
  const n=bitrate==='auto'?auto.bitrate:Number(bitrate);
  const depth=bitDepth==='auto'?auto.bitDepth:Number(bitDepth);
  const quality=oggQuality==='auto'?auto.oggQuality:Number(oggQuality);
  const flac=flacLevel==='auto'?auto.flacLevel:Number(flacLevel);
  if(!BITRATES.includes(n))throw Error('Invalid bitrate.');
  if(![16,24].includes(depth))throw Error('Only 16-bit and 24-bit WAV are supported.');
  if(!Number.isInteger(quality)||quality<0||quality>10)throw Error('OGG quality must be between 0 and 10.');
  if(!Number.isInteger(flac)||flac<0||flac>8)throw Error('FLAC compression must be between 0 and 8.');
  return {format,bitrate:n,bitDepth:depth,oggQuality:quality,flacLevel:flac,sampleRate:rate};
}
export function buildConversionArgs(input,output,options){
  const o=conversionOptions(options);
  // Explicit codecs and containers prevent mislabeled files.
  const args=['-hide_banner','-loglevel','error','-i',input,'-vn','-map','0:a:0'];
  if(o.sampleRate)args.push('-ar',String(o.sampleRate));
  switch(o.format){
    case 'mp3': args.push('-c:a','libmp3lame','-b:a',o.bitrate+'k','-id3v2_version','3','-f','mp3');break;
    case 'wav': args.push('-c:a',o.bitDepth===24?'pcm_s24le':'pcm_s16le','-f','wav');break;
    case 'flac': args.push('-c:a','flac','-compression_level',String(o.flacLevel),'-f','flac');break;
    case 'aac': args.push('-c:a','aac','-b:a',o.bitrate+'k','-f','adts');break;
    case 'm4a': args.push('-c:a','aac','-b:a',o.bitrate+'k','-f','ipod');break;
    case 'ogg': args.push('-c:a','libvorbis','-q:a',String(o.oggQuality),'-f','ogg');break;
    case 'wma': args.push('-c:a','wmav2','-b:a',o.bitrate+'k','-f','asf');break;
  }
  return [...args,output];
}

let engine=null,engineLoad=null,activeConversion=false,serial=0;
async function getEngine(onState=()=>{}){
  if(engine?.loaded)return engine;
  if(engineLoad)return engineLoad;
  engineLoad=(async()=>{
    onState('Loading audio encoder (first use downloads a large WebAssembly engine)…');
    // These assets are bundled by scripts/build.mjs from pinned npm versions.
    const {FFmpeg}=await import('/vendor/ffmpeg/index.js');
    const instance=new FFmpeg();
    try{
      await instance.load({
        coreURL:'/vendor/ffmpeg-core/ffmpeg-core.js',
        wasmURL:'/vendor/ffmpeg-core/ffmpeg-core.wasm'
      });
      engine=instance;
      return instance;
    }catch(error){
      instance.terminate();
      throw Error('Cannot load local FFmpeg encoder. Check your network and browser memory. '+(error?.message||''));
    }
  })();
  try{return await engineLoad}finally{engineLoad=null}
}
function bytes(source){return source instanceof Uint8Array?source:new Uint8Array(source)}
async function run(source,sourceName,opts,onState=()=>{},onProgress=()=>{}){
  if(activeConversion)throw Error('A conversion is already running.');
  activeConversion=true;let instance,prevProgress;
  let inputPath,outputPath;
  try{
    instance=await getEngine(onState);
    const id=++serial;
    const ext=String(sourceName||'wav').split('.').pop().replace(/[^a-zA-Z0-9]/g,'').toLowerCase()||'wav';
    inputPath='pulse-'+id+'.'+ext;
    outputPath='pulse-'+id+'-output.'+opts.format;
    const data=source instanceof Uint8Array?source:bytes(await source.arrayBuffer());
    if(data.byteLength>240*1024*1024)throw Error('File is too large for in-browser transcoding.');
    onState('Preparing audio in browser memory…');
    await instance.writeFile(inputPath,data);
    prevProgress=({progress})=>{
      if(Number.isFinite(progress))onProgress(Math.round(Math.max(0,Math.min(1,progress))*100));
    };
    instance.on('progress',prevProgress);
    onState('Encoding '+opts.format.toUpperCase()+' locally…');
    const code=await instance.exec(buildConversionArgs(inputPath,outputPath,opts));
    if(code!==0)throw Error('FFmpeg could not encode '+opts.format.toUpperCase()+'. Your browser may not have sufficient memory or the codec may be unavailable.');
    const result=await instance.readFile(outputPath);
    if(typeof result==='string'||!result.length)throw Error('Encoder returned no audio data.');
    onProgress(100);
    return new Blob([new Uint8Array(result)],{type:AUDIO_FORMATS.find(f=>f.id===opts.format).mime});
  }finally{
    if(instance&&prevProgress)instance.off('progress',prevProgress);
    for(const path of [inputPath,outputPath])if(instance&&path){try{await instance.deleteFile(path)}catch{}}
    activeConversion=false;
  }
}
export async function convertBuffer(audioBuffer,settings={},onState=()=>{},onProgress=()=>{}){
  const opts=conversionOptions(settings);
  if(!audioBuffer||!audioBuffer.length)throw Error('Upload audio first.');
  // A WAV export needs no WASM or external download unless resampling was requested.
  if(opts.format==='wav'&&(!opts.sampleRate||opts.sampleRate===audioBuffer.sampleRate)){
    onState('Rendering local PCM WAV…');
    const blob=encodeWav(audioBuffer,opts.bitDepth);
    onProgress(100);
    return blob;
  }
  const input=encodeWav(audioBuffer,16);
  return run(input,'workspace.wav',opts,onState,onProgress);
}
export async function decodeUnsupportedAudio(file,onState=()=>{}){
  if(!file||file.size>100*1024*1024)throw Error('Maximum source file size: 100 MB.');
  const ext=String(file.name).split('.').pop().toLowerCase();
  if(!EXTENSIONS.includes(ext))throw Error('Unsupported source file format.');
  const opts={format:'wav',bitDepth:16,bitrate:192,oggQuality:5,flacLevel:5,sampleRate:'original'};
  onState('This format requires FFmpeg decoding…');
  return run(file,file.name,opts,onState);
}
export function downloadConversion(blob,name,format){
  if(!(blob instanceof Blob)||!blob.size)throw Error('No converted audio to download.');
  const clean=String(name||'pulse-audio').replace(/[^a-z0-9 _-]/gi,'-').slice(0,80)||'pulse-audio';
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;
  link.download=clean+'.'+format;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
