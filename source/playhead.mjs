// Reusable clip-relative playhead math. NaN and zero-duration buffers stay safe.
export function clampPlayhead(time,duration){
  if(!Number.isFinite(duration)||duration<=0)return 0;
  return Math.min(duration,Math.max(0,Number.isFinite(time)?time:0));
}
export function pointerToTime(clientX,left,width,duration){
  if(!Number.isFinite(width)||width<=0)return 0;
  return clampPlayhead(((clientX-left)/width)*duration,duration);
}
export function nudgePlayhead(time,duration,delta){
  return clampPlayhead(time+delta,duration);
}

// Zoom and beat mapping are deterministic and independent from audio transport.
export function viewportRange(duration,zoom=1,start=0){
  if(!Number.isFinite(duration)||duration<=0)return {start:0,end:0,span:0};
  const factor=Math.min(8,Math.max(1,Number.isFinite(zoom)?zoom:1));
  const span=duration/factor;
  const left=Math.min(duration-span,Math.max(0,Number.isFinite(start)?start:0));
  return {start:left,end:left+span,span};
}
export function viewportTime(clientX,left,width,duration,zoom=1,start=0){
  const range=viewportRange(duration,zoom,start);
  return clampPlayhead(range.start+(Number.isFinite(width)&&width>0?(clientX-left)/width:0)*range.span,duration);
}
export function viewportPercent(time,duration,zoom=1,start=0){
  const range=viewportRange(duration,zoom,start);
  return range.span>0?(time-range.start)/range.span*100:0;
}
export function snapBeat(time,bpm,duration){
  if(!Number.isFinite(bpm)||bpm<20||bpm>400)return clampPlayhead(time,duration);
  const secondsPerBeat=60/bpm;
  return clampPlayhead(Math.round(time/secondsPerBeat)*secondsPerBeat,duration);
}

// Position of a native Web Audio loop. Continuous modulo timing avoids resetting the
// displayed playhead on each cycle. Used only for valid [start,end] loop regions.
export function loopTime(from,start,end,elapsed){
  if(![from,start,end,elapsed].every(Number.isFinite)||end-start<=0)return Math.max(0,Number.isFinite(from)?from:0);
  const span=end-start,initial=Math.max(start,Math.min(end,from));
  return start+(((initial-start+Math.max(0,elapsed))%span)+span)%span;
}
