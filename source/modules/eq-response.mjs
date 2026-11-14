import {bandLayout, eqFilters, formatEqFrequency} from './eq-engine.mjs';

const NS = 'http://www.w3.org/2000/svg';
const create = (name, properties = {}, parent) => {
  const element=document.createElementNS(NS,name);
  for(const [key,value] of Object.entries(properties))element.setAttribute(key,String(value));
  if(parent)parent.append(element);
  return element;
};
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const X0=36,X1=612,Y0=20,Y1=200,YMID=110;
const gainY=gain=>clamp(YMID - gain * 5,Y0,Y1);
const frequencyX=hz=>X0 + Math.log(clamp(hz,20,20000)/20)/Math.log(1000)*(X1-X0);

/**
 * Mount an interactive frequency response under SOURCE AUDIO waveform.
 * The curve uses BiquadFilterNode.getFrequencyResponse, matching the actual
 * filters used by both EQ processing paths. The host owns user inputs.
 */
export function mountEqResponse({host, count = () => 3, gains, changeGain, changeCount = null, bandOptions = [3,10,20]}) {
  const player=document.querySelector('.audio-source-area');
  if(!player) return {refresh(){},cleanup(){}};
  const stage=document.createElement('section');
  stage.className='pulse-eq-left pulse-eq-live';
  stage.setAttribute('aria-label','Interactive parametric equalizer frequency response');
  const bandSwitch=changeCount
    ? '<div class="eq-band-switch" role="group" aria-label="Equalizer number of bands">' + bandOptions.map(n =>
        '<button type="button" data-eq-bands="'+n+'" aria-pressed="'+String(n===count())+'">'+n+' BANDS</button>'
      ).join('') + '</div>'
    : '';
  stage.innerHTML=`<div class="eq-left-heading"><strong>PARAMETRIC EQ &middot; LIVE RESPONSE</strong><span>20 Hz - 20 kHz</span></div>
    ${bandSwitch}
    <div class="pulse-eq-stage"><svg class="pulse-eq-graph" viewBox="0 0 640 232" role="group" aria-label="Live equalizer response; drag handles or use arrow keys to set gain.">
    <g class="eq-graph-grid"></g><path class="eq-zero-axis"></path><path class="eq-graph-curve"></path><g class="eq-graph-handles"></g></svg></div>
    <div class="pulse-eq-feedback"><span data-eq-readout>FLAT RESPONSE</span><span data-eq-count>${count()} ACTIVE BANDS</span></div>
    <p class="pulse-eq-editor-note">Drag a point or use arrow keys. The curve updates immediately; Apply renders the change to audio.</p>`;
  player.append(stage);
  const svg=stage.querySelector('svg'),grid=stage.querySelector('.eq-graph-grid');
  const curve=stage.querySelector('.eq-graph-curve'),zero=stage.querySelector('.eq-zero-axis'),handles=stage.querySelector('.eq-graph-handles');
  for(let i=0;i<=6;i++) {
    const y=Y0+i*30;
    create('line',{x1:X0,y1:y,x2:X1,y2:y},grid);
    const label=create('text',{x:X0-7,y:y+4,'text-anchor':'end'},grid);
    label.textContent=`${18-i*6}`;
  }
  for(const hz of [20,50,100,200,500,1000,2000,5000,10000,20000]){
    const x=frequencyX(hz);
    create('line',{x1:x,y1:Y0,x2:x,y2:Y1},grid);
    const label=create('text',{x, y:218,'text-anchor':'middle'},grid);
    if([20,100,1000,5000,20000].includes(hz))label.textContent=hz===1000?'1k':hz>=1000?`${hz/1000}k`:String(hz);
  }
  zero.setAttribute('d',`M ${X0} ${YMID} L ${X1} ${YMID}`);
  let nodes=[],filterContext=null,filterNodes=[],freq=null,mags=null,phase=null;
  let pointerIndex=-1,frame=0,closed=false,selectedIndex=-1;
  const bandButtons=[...stage.querySelectorAll('[data-eq-bands]')];
  function graphFilters(){
    try {
      const Offline=window.OfflineAudioContext||window.webkitOfflineAudioContext;
      if(!Offline)return false;
      const sampleRate=Math.max(44100,Math.min(192000,window.__pulseEqSampleRate||44100));
      filterContext=new Offline(1,256,sampleRate);
      filterNodes=bandLayout(count()).map(spec=>{
        const node=filterContext.createBiquadFilter();node.type=spec.type;node.frequency.value=Math.min(spec.frequency,sampleRate*.48);
        node.Q.value=spec.q;return node;
      });
      freq=new Float32Array(288);
      mags=new Float32Array(288);
      phase=new Float32Array(288);
      for(let i=0;i<freq.length;i++)freq[i]=20*Math.exp(Math.log(1000)*i/(freq.length-1));
      return true;
    } catch {filterNodes=[];return false;}
  }
  function read(){const values=gains();if(values.length!==bandLayout(count()).length)return [];return values.map(value=>Number(value)||0);}
  function draw(){
    if(closed)return;
    const bands=bandLayout(count()),values=read();if(!values.length)return;
    if(nodes.length!==bands.length){
      handles.replaceChildren();nodes=bands.map((band,index)=>{
        const node=create('circle',{r:bandLayout(count()).length>10?6.5:8.5,'data-eq-index':index,role:'slider',tabindex:0,'aria-valuemin':-18,'aria-valuemax':18,'aria-orientation':'vertical'},handles);
        return node;
      });
      graphFilters();
    }
    for(let i=0;i<bands.length;i++){
      const band=bands[i],dot=nodes[i],value=values[i];
      dot.setAttribute('cx',frequencyX(band.frequency));dot.setAttribute('cy',gainY(value));
      dot.setAttribute('aria-valuenow',value);
      dot.setAttribute('aria-label',`${band.label} ${formatEqFrequency(band.frequency)}`);
      dot.setAttribute('aria-valuetext',`${value>0?'+':''}${value.toFixed(1)} decibels`);
      dot.classList.toggle('is-current',selectedIndex===i);
    }
    const points=[];
    if(filterNodes.length===bands.length && filterContext){
      const sums=new Float64Array(freq.length);
      let valid=true;
      for(let i=0;i<filterNodes.length;i++){
        const node=filterNodes[i];node.gain.value=values[i];
        try {node.getFrequencyResponse(freq,mags,phase);}catch{valid=false;break;}
        for(let j=0;j<mags.length;j++)sums[j]+=20*Math.log10(Math.max(1e-8,mags[j]));
      }
      if(valid)for(let i=0;i<freq.length;i++)points.push(`${i?'L':'M'} ${frequencyX(freq[i]).toFixed(2)} ${gainY(sums[i]).toFixed(2)}`);
    }
    if(!points.length){
      // Browser fallback: smooth local response approximation, no fake audio processing.
      for(let p=0;p<=288;p++){
        const f=20*Math.exp(Math.log(1000)*p/288);
        let db=0;
        for(let i=0;i<bands.length;i++){
          const distance=Math.log2(f/bands[i].frequency);
          const shape=bands[i].type==='lowshelf'?1/(1+Math.exp(distance*2.8)):
            bands[i].type==='highshelf'?1/(1+Math.exp(-distance*2.8)):
            Math.exp(-.5*(distance*(bands[i].q||1))**2);
          db+=values[i]*shape;
        }
        points.push(`${p?'L':'M'} ${frequencyX(f).toFixed(2)} ${gainY(db).toFixed(2)}`);
      }
    }
    curve.setAttribute('d',points.join(' '));
    stage.querySelector('[data-eq-count]').textContent=`${bands.length} ACTIVE BANDS`;
    const active=selectedIndex>=0?bands[selectedIndex]:null;
    stage.querySelector('[data-eq-readout]').textContent=active?`${formatEqFrequency(active.frequency)}  /  ${values[selectedIndex]>0?'+':''}${values[selectedIndex].toFixed(1)} dB`:'LIVE FILTER RESPONSE';
    for(const b of bandButtons)b.setAttribute('aria-pressed',String(Number(b.dataset.eqBands)===bands.length));
  }
  function refresh(){if(frame||closed)return;frame=requestAnimationFrame(()=>{frame=0;draw();});}
  function update(index,number){const value=clamp(Math.round(number*2)/2,-18,18);selectedIndex=index;changeGain(index,value);refresh();}
  function drag(e){if(pointerIndex<0)return;const rect=svg.getBoundingClientRect(),y=(e.clientY-rect.top)*232/rect.height;update(pointerIndex,(YMID-y)/5);}
  function down(e){const dot=e.target.closest('[data-eq-index]');if(!dot)return;pointerIndex=Number(dot.dataset.eqIndex);selectedIndex=pointerIndex;try{svg.setPointerCapture(e.pointerId);}catch{}drag(e);e.preventDefault();}
  function end(){pointerIndex=-1;}
  function keydown(e){const dot=e.target.closest('[data-eq-index]');if(!dot)return;
    const index=Number(dot.dataset.eqIndex),value=read()[index];let next=value;
    if(e.key==='ArrowUp'||e.key==='ArrowRight')next+=.5;
    else if(e.key==='ArrowDown'||e.key==='ArrowLeft')next-=.5;
    else if(e.key==='PageUp')next+=3;
    else if(e.key==='PageDown')next-=3;
    else if(e.key==='Home')next=-18;
    else if(e.key==='End')next=18;
    else return;
    e.preventDefault();update(index,next);dot.focus();
  }
  const onInput=()=>refresh();host.addEventListener('input',onInput);
  svg.addEventListener('pointerdown',down);svg.addEventListener('pointermove',drag);
  svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',end);
  svg.addEventListener('lostpointercapture',end);svg.addEventListener('keydown',keydown);
  for(const b of bandButtons)b.addEventListener('click',()=>{
    const next=Number(b.dataset.eqBands);if(next===count())return;
    selectedIndex=-1;filterNodes=[];nodes=[];changeCount(next);refresh();
  });
  graphFilters();draw();
  const cleanup=()=>{
    closed=true;host.removeEventListener('input',onInput);if(frame)cancelAnimationFrame(frame);
    svg.removeEventListener('pointerdown',down);svg.removeEventListener('pointermove',drag);
    svg.removeEventListener('pointerup',end);svg.removeEventListener('pointercancel',end);
    svg.removeEventListener('lostpointercapture',end);svg.removeEventListener('keydown',keydown);
    filterNodes=[];filterContext=null;stage.remove();
  };
  return {refresh,cleanup};
}