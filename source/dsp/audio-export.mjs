// Browser-only lossless FLAC and optional AAC/M4A export. Never uploads audio.
const assertAudio=(channels,rate)=>{
  if(!Array.isArray(channels)||channels.length<1||channels.length>2
    ||channels.some(ch=>!(ch instanceof Float32Array)||ch.length!==channels[0].length)
    ||!channels[0].length||!Number.isInteger(rate)||rate<8000||rate>192000)
    throw new Error('Invalid audio for export.');
};
const u16=(bytes,offset,value)=>{bytes[offset]=value>>>8&255;bytes[offset+1]=value&255;};
function crc8(data,length){
  let crc=0;for(let i=0;i<length;i++){crc^=data[i];for(let n=0;n<8;n++)crc=crc&128?((crc<<1)^7)&255:(crc<<1)&255;}return crc;
}
function crc16(data,length){
  let crc=0;for(let i=0;i<length;i++){crc^=data[i]<<8;for(let n=0;n<8;n++)crc=crc&0x8000?((crc<<1)^0x8005)&65535:(crc<<1)&65535;}return crc;
}
function utf8FrameNumber(num){
  if(num<0x80)return [num];
  let width=num<0x800?2:num<0x10000?3:num<0x200000?4:num<0x4000000?5:6;
  const parts=new Array(width);let rest=num;
  for(let i=width-1;i>0;i--){parts[i]=0x80|(rest&63);rest=Math.floor(rest/64);}
  parts[0]=(0xff<<(8-width))|(rest&((1<<(7-width))-1));
  return parts;
}
function pcm16(sample){
  const clamped=Math.max(-1,Math.min(1,Number.isFinite(sample)?sample:0));
  return clamped<0?Math.round(clamped*32768):Math.round(clamped*32767);
}
export function encodeFlac16(channels,sampleRate){
  assertAudio(channels,sampleRate);
  const blockSize=4096,total=channels[0].length,metadata=new Uint8Array(42);
  metadata.set([0x66,0x4c,0x61,0x43,0x80,0,0,34]);
  u16(metadata,8,blockSize);u16(metadata,10,blockSize);
  const packed=(BigInt(sampleRate)<<44n)|(BigInt(channels.length-1)<<41n)|(15n<<36n)|BigInt(total);
  for(let i=0;i<8;i++)metadata[18+i]=Number(packed>>BigInt(56-i*8)&255n);
  // STREAMINFO MD5 is all zero: permitted when the original PCM hash is unknown.
  const parts=[metadata];
  for(let start=0,frameNumber=0;start<total;start+=blockSize,frameNumber++){
    const length=Math.min(blockSize,total-start),isFull=length===blockSize;
    const number=utf8FrameNumber(frameNumber);
    const header=new Uint8Array(4+number.length+(isFull?0:2)+1);
    header.set([255,248,isFull?0xc0:0x70,((channels.length-1)<<4)|8]);
    header.set(number,4);
    if(!isFull)u16(header,4+number.length,length-1);
    header[header.length-1]=crc8(header,header.length-1);
    const body=new Uint8Array(header.length+channels.length*(1+length*2)+2);
    body.set(header);
    let pointer=header.length;
    for(const channel of channels){
      body[pointer++]=2; // Verbatim subframe, 16 bits per sample.
      for(let i=0;i<length;i++){
        const n=pcm16(channel[start+i]);body[pointer++]=n>>8&255;body[pointer++]=n&255;
      }
    }
    u16(body,body.length-2,crc16(body,body.length-2));
    parts.push(body);
  }
  return new Blob(parts,{type:'audio/flac'});
}
const AAC_MIME=['audio/mp4;codecs=mp4a.40.2','audio/mp4'];
export function isAacM4aSupported(){
  return typeof MediaRecorder!=='undefined'&&AAC_MIME.some(type=>MediaRecorder.isTypeSupported(type));
}
export async function encodeM4aWithMediaRecorder(audioBuffer,bitrate=192000,onProgress=()=>{}){
  if(!isAacM4aSupported())throw new Error('This browser cannot record AAC/M4A locally. Choose WAV, FLAC or MP3.');
  if(!audioBuffer||!audioBuffer.duration)throw new Error('Load processed audio first.');
  const mimeType=AAC_MIME.find(type=>MediaRecorder.isTypeSupported(type));
  const Context=window.AudioContext||window.webkitAudioContext;
  if(!Context)throw new Error('Web Audio API unavailable.');
  const context=new Context({sampleRate:audioBuffer.sampleRate});
  const destination=context.createMediaStreamDestination();
  const source=context.createBufferSource();source.buffer=audioBuffer;source.connect(destination);
  const recorder=new MediaRecorder(destination.stream,{mimeType,audioBitsPerSecond:bitrate});
  const chunks=[];
  const done=new Promise((resolve,reject)=>{
    recorder.ondataavailable=event=>{if(event.data?.size)chunks.push(event.data);};
    recorder.onerror=event=>reject(event.error||new Error('AAC encoder failed.'));
    recorder.onstop=()=>{
      const blob=new Blob(chunks,{type:mimeType});
      blob.size?resolve(blob):reject(new Error('AAC encoder returned an empty file.'));
    };
  });
  let interval;
  try{
    await context.resume();
    recorder.start(1000);
    source.start();
    interval=setInterval(()=>onProgress(Math.min(99,Math.round(context.currentTime/audioBuffer.duration*100))),1500);
    source.onended=()=>{if(recorder.state==='recording')recorder.stop();};
    return await done;
  }finally{
    clearInterval(interval);
    try{source.stop();}catch{}
    if(recorder.state==='recording')recorder.stop();
    for(const track of destination.stream.getTracks())track.stop();
    await context.close();
  }
}
