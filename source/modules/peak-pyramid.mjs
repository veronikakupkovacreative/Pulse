/** Streaming min/max peak pyramid. Audio samples never leave browser memory. */
export function createPeakState(totalFrames,{blockSize=256}={}){
  if(!Number.isInteger(totalFrames)||totalFrames<1||!Number.isInteger(blockSize)||blockSize<16||blockSize>8192||(blockSize&(blockSize-1))!==0)throw new RangeError('Invalid peak dimensions');
  const blocks=Math.ceil(totalFrames/blockSize);
  const min=new Float32Array(blocks),max=new Float32Array(blocks);
  min.fill(Infinity);max.fill(-Infinity);
  return {totalFrames,blockSize,min,max};
}
export function appendPeakChunk(state,channels,offset){
  if(!state||!Array.isArray(channels)||!channels.length||!channels.every(ch=>ch instanceof Float32Array&&ch.length===channels[0].length)||!Number.isInteger(offset)||offset<0||offset+channels[0].length>state.totalFrames)throw new TypeError('Invalid peak chunk');
  const {min,max,blockSize}=state;
  for(let frame=0;frame<channels[0].length;frame++){
    const b=Math.floor((offset+frame)/blockSize);
    for(const channel of channels){const v=channel[frame];if(!Number.isFinite(v))continue;if(v<min[b])min[b]=v;if(v>max[b])max[b]=v;}
  }
}
export function finishPeakPyramid(state){
  let min=state.min,max=state.max,blockSize=state.blockSize;
  for(let i=0;i<min.length;i++){if(!Number.isFinite(min[i]))min[i]=0;if(!Number.isFinite(max[i]))max[i]=0;}
  const levels=[{blockSize,min,max}];
  while(min.length>1){
    const count=Math.ceil(min.length/2),nextMin=new Float32Array(count),nextMax=new Float32Array(count);
    for(let i=0;i<count;i++){const a=i*2,b=Math.min(a+1,min.length-1);nextMin[i]=Math.min(min[a],min[b]);nextMax[i]=Math.max(max[a],max[b]);}
    blockSize*=2;min=nextMin;max=nextMax;levels.push({blockSize,min,max});
  }
  return levels;
}
export function buildPeakPyramid(channels,{blockSize=256}={}){
  if(!Array.isArray(channels)||!channels.length||!(channels[0] instanceof Float32Array))throw new TypeError('PCM channels required');
  const state=createPeakState(channels[0].length,{blockSize});appendPeakChunk(state,channels,0);return finishPeakPyramid(state);
}
export function pickPeakLevel(levels,samplesPerPixel){
  if(!Array.isArray(levels)||!levels.length)return null;
  let level=levels[0];
  for(const candidate of levels){if(candidate.blockSize<=Math.max(level.blockSize,samplesPerPixel))level=candidate;else break;}
  return level;
}
export function samplePeakRange(level,startFrame,endFrame){
  if(!level)return [0,0];
  const a=Math.max(0,Math.min(level.min.length-1,Math.floor(startFrame/level.blockSize)));
  const b=Math.max(a,Math.min(level.min.length-1,Math.floor((Math.max(startFrame+1,endFrame)-1)/level.blockSize)));
  let low=Infinity,high=-Infinity;
  for(let i=a;i<=b;i++){if(level.min[i]<low)low=level.min[i];if(level.max[i]>high)high=level.max[i];}
  return [Number.isFinite(low)?low:0,Number.isFinite(high)?high:0];
}
