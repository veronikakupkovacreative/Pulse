import {eqFilters} from './eq-engine.mjs';

export const EQ_FFT_SIZE = 8192;
const X_LEFT=36,X_RIGHT=612,Y_TOP=20,Y_BOTTOM=200;
const F_MIN=20,F_MAX=20000;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));

/** 20 Hz–20 kHz log axis, matching both EQ response curves. */
export function fftPosition(hz){
  if(!Number.isFinite(hz)||hz<F_MIN||hz>F_MAX)return null;
  return X_LEFT+Math.log(hz/F_MIN)/Math.log(F_MAX/F_MIN)*(X_RIGHT-X_LEFT);
}

/** One real-time FFT frame. Repaint only while a SOURCE AUDIO node is active. */
export function paintEqFft(canvas,analyser,sampleRate){
  if(!canvas||!analyser||!Number.isFinite(sampleRate)||sampleRate<=0)return false;
  const ctx=canvas.getContext?.('2d');
  if(!ctx)return false;
  if(canvas.width!==640)canvas.width=640;
  if(canvas.height!==232)canvas.height=232;
  const bins=new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatFrequencyData(bins);
  ctx.clearRect(0,0,640,232);
  const nyquist=Math.min(F_MAX,sampleRate/2);
  ctx.beginPath();
  let firstX=null,lastX=null,points=0;
  for(let i=1;i<bins.length;i++){
    const hz=i*sampleRate/analyser.fftSize;
    if(hz<F_MIN||hz>nyquist)continue;
    const x=fftPosition(hz);
    if(x===null)continue;
    const db=Number.isFinite(bins[i])?bins[i]:-115;
    const y=clamp(Y_BOTTOM-(db+115)/107*(Y_BOTTOM-Y_TOP),Y_TOP,Y_BOTTOM);
    if(firstX===null){ctx.moveTo(x,y);firstX=x;}else ctx.lineTo(x,y);
    lastX=x;points++;
  }
  if(points<2)return false;
  ctx.strokeStyle='rgba(255,83,71,0.92)';
  ctx.lineWidth=1.5;
  ctx.stroke();
  // Red fill sits above the original waveform but below the white EQ curve.
  ctx.lineTo(lastX,Y_BOTTOM);
  ctx.lineTo(firstX,Y_BOTTOM);
  ctx.closePath();
  ctx.fillStyle='rgba(255,0,0,0.12)';
  ctx.fill();
  return true;
}

/**
 * An isolated post-EQ monitoring branch: SOURCE AUDIO -> EQ filters ->
 * FFT analyser -> silent sink. The existing dry player and export DSP are not
 * altered. It reports the spectrum AFTER the current filter settings.
 */
export function createEqFftMonitor({canvas,getCount,getGains,onState=()=>{}}){
  let enabled=false,source=null,nodes=[],analyser=null,sink=null,raf=0,disposed=false;
  let state='off';
  const status=next=>{if(state===next)return;state=next;onState(next);};
  const clear=()=>{
    const ctx=canvas?.getContext?.('2d');
    if(ctx)ctx.clearRect(0,0,canvas.width,canvas.height);
  };
  const stopFrames=()=>{if(raf){cancelAnimationFrame(raf);raf=0;}};
  function detach(){
    stopFrames();
    if(source&&nodes[0]){try{source.disconnect(nodes[0]);}catch{}}
    for(const node of nodes){try{node.disconnect();}catch{}}
    if(analyser){try{analyser.disconnect();}catch{}}
    if(sink){try{sink.disconnect();}catch{}}
    source=null;nodes=[];analyser=null;sink=null;
    clear();
  }
  const frame=()=>{
    raf=0;
    if(disposed||!enabled||!analyser||!source)return;
    paintEqFft(canvas,analyser,source.context.sampleRate);
    raf=requestAnimationFrame(frame);
  };
  function attach(next,force=false){
    if(disposed)return;
    if(!enabled){detach();status('off');return;}
    if(!next||!next.context||typeof next.connect!=='function'){
      detach();status('waiting');return;
    }
    if(next===source&&!force){sync();return;}
    detach();
    const context=next.context;
    try{
      const specs=eqFilters(getCount(),getGains());
      if(!specs.length)throw Error('No active EQ bands.');
      nodes=specs.map(spec=>{
        const node=context.createBiquadFilter();
        node.type=spec.type;node.frequency.value=Math.min(spec.frequency,context.sampleRate*.48);
        node.Q.value=spec.q;node.gain.value=spec.gain;
        return node;
      });
      analyser=context.createAnalyser();
      analyser.fftSize=EQ_FFT_SIZE;
      analyser.minDecibels=-115;
      analyser.maxDecibels=-8;
      analyser.smoothingTimeConstant=.78;
      sink=context.createGain();sink.gain.value=0;
      next.connect(nodes[0]);
      for(let i=1;i<nodes.length;i++)nodes[i-1].connect(nodes[i]);
      nodes.at(-1).connect(analyser);
      analyser.connect(sink);
      sink.connect(context.destination);
      source=next;
      status('live');
      raf=requestAnimationFrame(frame);
    }catch(error){detach();status('unavailable');}
  }
  function sync(){
    if(disposed||!enabled||!source)return;
    let specs;
    try{specs=eqFilters(getCount(),getGains());}
    catch{status('unavailable');return;}
    if(specs.length!==nodes.length){attach(source,true);return;}
    for(let i=0;i<specs.length;i++){
      const spec=specs[i],node=nodes[i];
      node.type=spec.type;
      node.frequency.value=Math.min(spec.frequency,source.context.sampleRate*.48);
      node.Q.value=spec.q;node.gain.value=spec.gain;
    }
  }
  function setEnabled(value,activeSource=null){
    if(disposed)return;
    enabled=Boolean(value);
    if(enabled)attach(activeSource);
    else{detach();status('off');}
  }
  return {attach,sync,setEnabled,cleanup(){disposed=true;detach();status('off');}};
}
