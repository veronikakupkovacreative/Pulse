/** Actual source audio waveform beneath the EQ frequency response (not a spectrum).
 * Adapted from PULSE historical drawEqOverview(), Git commit 745ea77a.
 */
export const EQ_GRAPH_WIDTH=640,EQ_GRAPH_HEIGHT=232,EQ_PLOT_START=36,EQ_PLOT_END=612,EQ_PLOT_CENTER=110;
export function getEqWaveformPeaks(buffer,columns=288){
 if(!buffer)return [];
 if(!Number.isInteger(columns)||columns<32||columns>1024)throw Error('Invalid waveform resolution.');
 if(!Number.isInteger(buffer.length)||buffer.length<=0||typeof buffer.getChannelData!=='function')return [];
 return Array.from({length:Math.min(2,buffer.numberOfChannels||0)},(_,channel)=>{
  const samples=buffer.getChannelData(channel);
  return Array.from({length:columns},(_,i)=>{
   const from=Math.floor(i*samples.length/columns),to=Math.max(from+1,Math.floor((i+1)*samples.length/columns));
   const step=Math.max(1,Math.floor((to-from)/90));let low=1,high=-1;
   for(let p=from;p<Math.min(to,samples.length);p+=step){
    const value=samples[p];if(!Number.isFinite(value))continue;
    low=Math.min(low,value);high=Math.max(high,value);
   }
   return low<=high?{low:Math.max(-1,low),high:Math.min(1,high)}:{low:0,high:0};
  });
 });
}
export function paintEqWaveform(canvas,buffer){
 if(!canvas||typeof canvas.getContext!=='function')return false;
 if(canvas.width!==EQ_GRAPH_WIDTH)canvas.width=EQ_GRAPH_WIDTH;
 if(canvas.height!==EQ_GRAPH_HEIGHT)canvas.height=EQ_GRAPH_HEIGHT;
 const ctx=canvas.getContext('2d');
 if(!ctx)return false;
 ctx.clearRect(0,0,EQ_GRAPH_WIDTH,EQ_GRAPH_HEIGHT);
 const channels=getEqWaveformPeaks(buffer);
 if(!channels.length)return false;
 const step=(EQ_PLOT_END-EQ_PLOT_START)/channels[0].length;
 const draw=(peaks,color,scale)=>{
  ctx.fillStyle=color;
  for(let i=0;i<peaks.length;i++){
   const {low,high}=peaks[i];
   if(high===0&&low===0)continue;
   ctx.fillRect(EQ_PLOT_START+i*step,EQ_PLOT_CENTER-high*scale,Math.max(1,step*.72),Math.max(1,(high-low)*scale));
  }
 };
 draw(channels[0],'rgba(255,0,0,0.70)',68);
 if(channels[1])draw(channels[1],'rgba(255,255,255,0.32)',61);
 return true;
}
