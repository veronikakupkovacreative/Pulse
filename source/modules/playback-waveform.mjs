/** Draw a real-time oscilloscope trace from the currently playing AudioBufferSourceNode.
 * The static file waveform remains underneath; this live layer changes with the audio signal.
 */
export function drawLiveWaveform(ctx,analyser,samples,width,height,dpr=1){
 if(!ctx||!analyser||!samples||samples.length<8||width<1||height<1)return false;
 try{analyser.getByteTimeDomainData(samples);}catch{return false;}
 const count=samples.length,center=height*.5,amplitude=height*.32;
 ctx.save();
 ctx.beginPath();
 for(let i=0;i<count;i++){
  const x=i/(count-1)*width;
  const y=center-((samples[i]-128)/128)*amplitude;
  if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
 }
 ctx.lineJoin='round';ctx.lineCap='round';ctx.strokeStyle='rgba(255,43,32,.82)';ctx.lineWidth=Math.max(2,2.4*dpr);ctx.shadowColor='#ff2b20';ctx.shadowBlur=5*dpr;ctx.stroke();
 ctx.shadowBlur=0;ctx.strokeStyle='rgba(245,244,240,.94)';ctx.lineWidth=Math.max(1,1.05*dpr);ctx.stroke();
 ctx.restore();
 return true;
}
