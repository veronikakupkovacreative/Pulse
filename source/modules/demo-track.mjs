/** Original 120 BPM demo created in-browser. No network request or licensed audio asset. */
export async function createDemoTrack({bars=8,bpm=120,sampleRate=22050,onProgress}={}){
 if(!Number.isInteger(bars)||bars<1||bars>16||!Number.isFinite(bpm)||bpm<60||bpm>200)throw new RangeError('Invalid demo parameters.');
 const duration=bars*4*60/bpm,samples=Math.round(duration*sampleRate),bytes=44+samples*4;
 const buffer=new ArrayBuffer(bytes),view=new DataView(buffer);
 const write=(offset,text)=>{for(let i=0;i<text.length;i++)view.setUint8(offset+i,text.charCodeAt(i));};
 write(0,'RIFF');view.setUint32(4,bytes-8,true);write(8,'WAVE');write(12,'fmt ');
 view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,2,true);view.setUint32(24,sampleRate,true);
 view.setUint32(28,sampleRate*4,true);view.setUint16(32,4,true);view.setUint16(34,16,true);
 write(36,'data');view.setUint32(40,samples*4,true);
 let seed=0x9e3779b9;
 const chords=[[130.8128,155.5635,196],[146.8324,174.6141,220],[155.5635,196,233.0819],[130.8128,155.5635,196]];
 const beatDuration=60/bpm,hatDuration=beatDuration/2;
 for(let offset=0;offset<samples;offset+=16384){
  const end=Math.min(samples,offset+16384);
  for(let i=offset;i<end;i++){
   const t=i/sampleRate,beat=t/beatDuration,beatProgress=(t%beatDuration),halfProgress=t%hatDuration;
   const chord=chords[Math.floor(beat/4)%chords.length];
   let pad=0;for(const freq of chord)pad+=Math.sin(2*Math.PI*freq*t)/chord.length;
   const padAmp=.09*(1-Math.exp(-t*4))*Math.min(1,(duration-t)*2);
   const kick=beatProgress<.16?Math.sin(2*Math.PI*(65*beatProgress+30*beatProgress*Math.exp(-beatProgress*35)))*Math.exp(-beatProgress*28)*.62:0;
   const clap=beatProgress<.085&&Math.floor(beat)%4%2===1?Math.exp(-beatProgress*42)*.26:0;
   const hat=halfProgress<.045?Math.exp(-halfProgress*110)*.11:0;
   seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;const noise=(seed>>>0)/4294967295*2-1;
   const lead=Math.sin(2*Math.PI*(chord[1]*2)*t)*.032*Math.max(0,Math.sin(Math.PI*beatProgress/beatDuration));
   const left=Math.max(-.95,Math.min(.95,pad*padAmp+kick+noise*(clap+hat)+lead));
   const right=Math.max(-.95,Math.min(.95,pad*padAmp*.93+kick+noise*(clap*.82+hat*.65)-lead*.4));
   view.setInt16(44+i*4,Math.round(left*32767),true);view.setInt16(46+i*4,Math.round(right*32767),true);
  }
  onProgress?.(Math.round(end/samples*100));
  if(end<samples)await new Promise(resolve=>setTimeout(resolve,0));
 }
 return new File([buffer],'PULSE-DEMO-120BPM.wav',{type:'audio/wav'});
}
