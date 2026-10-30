// Advanced effects for the existing PULSE single-file build.
const fxLimit=(n,a,b)=>Math.min(b,Math.max(a,Number(n)||0));
export function nearestScaleNote(frequency,key=0,scale='major'){
  if(!Number.isFinite(frequency)||frequency<=0)return null;
  const allowed=scale==='minor'?[0,2,3,5,7,8,10]:[0,2,4,5,7,9,11];
  const midi=69+12*Math.log2(frequency/440);
  let best=0,error=Infinity;
  for(let n=Math.round(midi)-4;n<=Math.round(midi)+4;n++)
    if(allowed.includes(((n-key)%12+12)%12)&&Math.abs(n-midi)<error){best=n;error=Math.abs(n-midi);}
  return best;
}
export function detectMonophonicPitch(samples,rate,start){
  const at=Math.max(0,Math.floor(start)),length=Math.min(4096,samples.length-at);
  if(length<1024)return null;
  const min=Math.max(8,Math.floor(rate/950)),max=Math.min(Math.floor(rate/80),Math.floor(length/2));
  let best=0,score=0;
  for(let lag=min;lag<=max;lag++){
    let dot=0,a=0,b=0;
    for(let i=0;i<length-lag;i+=3){
      const x=samples[at+i],y=samples[at+i+lag];dot+=x*y;a+=x*x;b+=y*y;
    }
    const current=dot/Math.sqrt(Math.max(1e-12,a*b));
    if(current>score){best=lag;score=current;}
  }
  return score>.82&&best?{frequency:rate/best,confidence:score}:null;
}
// Granular overlap-add correction. Experimental monophonic processor, NOT polyphonic Auto-Tune.
export function pitchCorrect(channels,rate,{key=0,scale='major',strength=.8,hard=false}={}){
  if(!channels?.length||!Number.isFinite(rate))throw Error('Invalid audio.');
  const length=channels[0].length;
  if(length/rate>45)throw Error('Monophonic correction is limited to 45 seconds.');
  const grain=Math.max(2048,Math.round(rate*.06)),hop=Math.floor(grain/4);
  const out=channels.map(()=>new Float32Array(length)),weights=new Float32Array(length);
  let ratio=1,notes=0;
  for(let start=0;start<length;start+=hop){
    const note=detectMonophonicPitch(channels[0],rate,Math.max(0,start-grain/2));
    let targetRatio=1;
    if(note){
      const target=nearestScaleNote(note.frequency,key,scale),midi=69+12*Math.log2(note.frequency/440);
      targetRatio=2**(fxLimit((target-midi)*strength,-3,3)/12);notes++;
    }
    ratio=hard?targetRatio:ratio*.7+targetRatio*.3;
    for(let k=0;k<grain;k++){
      const i=start+k-grain/2|0;if(i<0||i>=length)continue;
      const weight=.5-.5*Math.cos(2*Math.PI*k/(grain-1));weights[i]+=weight;
      const p=i+(k-grain/2)*(ratio-1),s=Math.floor(p),frac=p-s;
      for(let ch=0;ch<channels.length;ch++){
        const input=channels[ch],lo=input[Math.max(0,Math.min(length-1,s))];
        const hi=input[Math.max(0,Math.min(length-1,s+1))];
        out[ch][i]+=(lo+(hi-lo)*frac)*weight;
      }
    }
  }
  if(!notes)throw Error('Stable monophonic pitch not detected; try a clean vocal or 808.');
  out.forEach((data,ch)=>{for(let i=0;i<length;i++)data[i]=fxLimit(weights[i]>.001?data[i]/weights[i]:channels[ch][i],-1,1);});
  return out;
}
export function transientProcess(channels,rate,{attack=0,sustain=0}={}){
  const fast=Math.exp(-1/(rate*.004)),slow=Math.exp(-1/(rate*.07));
  return channels.map(input=>{
    let a=0,b=0;const out=new Float32Array(input.length);
    for(let i=0;i<input.length;i++){
      const x=input[i],v=Math.abs(x);a=a*fast+v*(1-fast);b=b*slow+v*(1-slow);
      const edge=fxLimit((a-b)/Math.max(.03,b),0,1);
      const gain=fxLimit(1+attack/100*edge*1.6+sustain/100*(1-edge)*.65,0,2.5);
      out[i]=fxLimit(x*gain,-1,1);
    }
    return out;
  });
}
export function deEssProcess(channels,rate,{frequency=5500,threshold=-25,amount=1}={}){
  const alpha=Math.exp(-2*Math.PI*fxLimit(frequency,2500,12000)/rate);
  const attack=Math.exp(-1/(rate*.004)),release=Math.exp(-1/(rate*.09));
  const target=10**(fxLimit(threshold,-55,-6)/20);
  return channels.map(input=>{
    let low=0,level=0;const out=new Float32Array(input.length);
    for(let i=0;i<input.length;i++){
      const x=input[i];low=low*alpha+x*(1-alpha);
      const high=x-low,abs=Math.abs(high),coeff=abs>level?attack:release;
      level=level*coeff+abs*(1-coeff);
      const reduction=level>target?Math.pow(target/level,.75):1;
      out[i]=fxLimit(low+high*(1-fxLimit(amount,0,1)*(1-reduction)),-1,1);
    }
    return out;
  });
}
export function peakNormalize(channels,target=-1){
  let peak=0;for(const ch of channels)for(const v of ch)peak=Math.max(peak,Math.abs(v));
  if(peak<1e-8)throw Error('Cannot normalize silence.');
  const gain=10**(fxLimit(target,-30,0)/20)/peak;
  return channels.map(ch=>Float32Array.from(ch,v=>fxLimit(v*gain,-1,1)));
}
export function modulationNode(context,source,type,{rate=.6,depth=.5,mix=.4}={}){
  const output=context.createGain(),dry=context.createGain(),wet=context.createGain();
  dry.gain.value=1-fxLimit(mix,0,1);wet.gain.value=fxLimit(mix,0,1);
  source.connect(dry).connect(output);wet.connect(output);
  const osc=context.createOscillator();osc.type='sine';osc.frequency.value=fxLimit(rate,.05,12);
  if(type==='phaser'){
    let last=source;
    for(let i=0;i<4;i++){
      const all=context.createBiquadFilter();all.type='allpass';all.frequency.value=350+i*600;all.Q.value=.9;
      const mod=context.createGain();mod.gain.value=depth*(100+i*220);
      osc.connect(mod).connect(all.frequency);last.connect(all);last=all;
    }
    last.connect(wet);
  }else{
    const delay=context.createDelay(.12),lfoGain=context.createGain();
    delay.delayTime.value=type==='flanger'?.005:.021;
    lfoGain.gain.value=depth*(type==='flanger'?.004:.015);
    osc.connect(lfoGain).connect(delay.delayTime);
    source.connect(delay);delay.connect(wet);
    if(type==='flanger'){
      const feedback=context.createGain();feedback.gain.value=.35;
      delay.connect(feedback).connect(delay);
    }
  }
  osc.start(0);return output;
}
export async function renderModulation(input,type,options){
  if(!['chorus','phaser','flanger'].includes(type))throw Error('Unknown modulation type.');
  const Offline=globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext;
  if(!Offline)throw Error('OfflineAudioContext unavailable.');
  const offline=new Offline(input.numberOfChannels,input.length,input.sampleRate);
  const source=offline.createBufferSource();source.buffer=input;
  modulationNode(offline,source,type,options).connect(offline.destination);source.start(0);
  return offline.startRendering();
}
export function initAdvancedFX(project,encodeWav){
  const get=id=>document.getElementById(id),host=get('panel-equalizer');
  if(!host)return;
  const card=document.createElement('details');card.className='pulse-advanced-fx';
  card.innerHTML='<summary>ADVANCED FX · MODULATION / PITCH / DYNAMICS</summary>'+
   '<div class="tool-fields"><label>Processor<select id="fx-type">'+
   '<option value="chorus">Chorus</option><option value="phaser">Phaser</option><option value="flanger">Flanger</option>'+
   '<option value="deesser">De-Esser</option><option value="transient">Transient Shaper</option>'+
   '<option value="pitch">Auto-Tune · monophonic beta</option><option value="peak">Peak normalizer</option>'+
   '<option value="plugin">Registered Web Audio plug-in</option></select></label>'+
   '<label id="fx-param-a">Parameter 1 <output id="fx-label-a"></output><input type="range" min="0" max="100" id="fx-a" value="50"></label>'+
   '<label id="fx-param-b">Parameter 2 <output id="fx-label-b"></output><input type="range" min="0" max="100" id="fx-b" value="50"></label>'+
   '<label id="fx-param-c">Mix <output id="fx-label-c"></output><input type="range" min="0" max="100" id="fx-c" value="50"></label>'+
   '<label id="fx-key-row" hidden>Key <select id="fx-key"><option>C</option><option>C#</option><option>D</option><option>D#</option><option>E</option><option>F</option><option>F#</option><option>G</option><option>G#</option><option>A</option><option>A#</option><option>B</option></select></label>'+
   '<label id="fx-scale-row" hidden>Scale<select id="fx-scale"><option>major</option><option>minor</option></select></label>'+
   '<label id="fx-plugin-row" hidden>Module<select id="fx-plugin"></select></label></div>'+
   '<p class="tool-footnote" id="fx-status" role="status">Effects render locally; preview before applying.</p>'+
   '<div class="quick-actions"><button type="button" id="fx-preview">▶ Preview</button><button type="button" id="fx-apply">Apply to Workspace</button><button type="button" id="fx-export">Export WAV ↗</button></div>';
  host.append(card);
  const style=document.createElement('style');
  style.textContent='.pulse-advanced-fx{border:1px solid #272727;padding:16px;margin-top:24px;background:rgba(0,0,0,.08)}.pulse-advanced-fx summary{font:400 13px Arial,sans-serif;cursor:pointer;letter-spacing:.02em}.pulse-advanced-fx .tool-fields{margin:18px 0}.pulse-advanced-fx .quick-actions{display:flex;gap:8px;flex-wrap:wrap}.pulse-advanced-fx button:focus-visible{outline:2px solid white;outline-offset:2px}';
  document.head.append(style);
  const registry=new Map(),select=get('fx-type'),a=get('fx-a'),b=get('fx-b'),c=get('fx-c');
  const pluginApi=Object.freeze({register(id,factory){
    if(!/^[a-z][a-z0-9-]{1,40}$/.test(id)||typeof factory!=='function'||registry.has(id))throw Error('Invalid or duplicate plugin.');
    registry.set(id,factory);const opt=document.createElement('option');opt.value=id;opt.textContent=id;get('fx-plugin').append(opt);
  },list:()=>[...registry.keys()]});
  // Trusted, preloaded JS modules register factories. No remote URL/script execution.
  window.PulseFX=pluginApi;
  let result=null,sourceRef=null,busy=false,preview=null,previewCtx=null;
  function state(){
    result=null;
    get('fx-key-row').hidden=get('fx-scale-row').hidden=select.value!=='pitch';
    get('fx-plugin-row').hidden=select.value!=='plugin';
    get('fx-param-b').hidden=select.value==='peak'||select.value==='plugin';
    get('fx-param-c').hidden=['peak','pitch','transient'].includes(select.value);
    get('fx-label-a').textContent=a.value;get('fx-label-b').textContent=b.value;get('fx-label-c').textContent=c.value+'%';
  }
  for(const control of [select,a,b,c,get('fx-key'),get('fx-scale'),get('fx-plugin')])control.addEventListener('input',state);
  select.addEventListener('change',state);state();
  const working=()=>project.snapshot().working;
  const data=buffer=>Array.from({length:Math.min(2,buffer.numberOfChannels)},(_,i)=>buffer.getChannelData(i).slice());
  function audioBuffer(channels,rate){
    const Audio=window.AudioContext||window.webkitAudioContext;
    const context=new Audio(),buffer=context.createBuffer(channels.length,channels[0].length,rate);
    channels.forEach((channel,i)=>buffer.copyToChannel(channel,i));void context.close();return buffer;
  }
  async function render(){
    const original=working();
    if(!original)throw Error('Load audio into the main workspace first.');
    if(result&&original===sourceRef)return result;
    if(busy)throw Error('Another effect is rendering.');
    if(original.duration>180)throw Error('Advanced FX supports clips up to 3 minutes.');
    busy=true;get('fx-status').textContent='Rendering '+select.value+'…';
    try{
      const x=Number(a.value),y=Number(b.value),z=Number(c.value);
      const opts={rate:.1+x/12,depth:y/100,mix:z/100};
      let processed;
      if(['chorus','phaser','flanger'].includes(select.value))processed=await renderModulation(original,select.value,opts);
      else if(select.value==='plugin'){
        const factory=registry.get(get('fx-plugin').value);
        if(!factory)throw Error('Register a trusted AudioNode factory first.');
        const Offline=window.OfflineAudioContext||window.webkitOfflineAudioContext;
        const offline=new Offline(original.numberOfChannels,original.length,original.sampleRate),src=offline.createBufferSource();src.buffer=original;
        const node=factory({context:offline,input:src,parameters:opts});
        if(!node||typeof node.connect!=='function')throw Error('Plugin must return an AudioNode.');
        node.connect(offline.destination);src.start(0);processed=await offline.startRendering();
      }else{
        const channels=data(original),rate=original.sampleRate;
        const out=select.value==='deesser'?deEssProcess(channels,rate,{frequency:2500+x*80,threshold:-50+y*.4,amount:z/100}):
          select.value==='transient'?transientProcess(channels,rate,{attack:(x-50)*2,sustain:(y-50)*2}):
          select.value==='pitch'?pitchCorrect(channels,rate,{key:get('fx-key').selectedIndex,scale:get('fx-scale').value,strength:x/100,hard:y>65}):
          peakNormalize(channels,-x*.2);
        processed=audioBuffer(out,rate);
      }
      if(working()!==original)throw Error('Workspace changed during render.');
      sourceRef=original;result=processed;
      get('fx-status').textContent='Ready · '+processed.duration.toFixed(2)+' s. Preview before applying.';
      return processed;
    }finally{busy=false;}
  }
  async function stopPreview(){
    try{preview?.stop();preview?.disconnect();}catch(e){}
    preview=null;if(previewCtx){await previewCtx.close().catch(()=>{});previewCtx=null;}
  }
  async function action(which){
    for(const id of ['fx-preview','fx-apply','fx-export'])get(id).disabled=true;
    try{
      await stopPreview();const buffer=await render();
      if(which==='preview'){
        const Audio=window.AudioContext||window.webkitAudioContext;
        previewCtx=new Audio();preview=previewCtx.createBufferSource();preview.buffer=buffer;
        preview.connect(previewCtx.destination);preview.start(0);
      }else if(which==='apply'){
        project.workspace.apply(buffer);window.dispatchEvent(new Event('pulse:advanced-applied'));
        result=null;get('fx-status').textContent='Applied · workspace undo is available.';
      }else{
        const blob=encodeWav(data(buffer),buffer.sampleRate,24),url=URL.createObjectURL(blob),link=document.createElement('a');
        link.href=url;link.download='pulse-'+select.value+'.wav';document.body.append(link);link.click();link.remove();
        setTimeout(()=>URL.revokeObjectURL(url),30000);
      }
    }catch(e){get('fx-status').textContent=e.message||'FX rendering failed.';}
    finally{for(const id of ['fx-preview','fx-apply','fx-export'])get(id).disabled=false;}
  }
  for(const which of ['preview','apply','export'])get('fx-'+which).onclick=()=>void action(which);
  window.addEventListener('pagehide',()=>void stopPreview());
  return pluginApi;
}