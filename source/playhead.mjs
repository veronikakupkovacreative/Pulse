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
