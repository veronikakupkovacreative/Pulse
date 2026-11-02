// Tap Tempo is intentionally standalone: no audio upload and no external service.
const MIN_INTERVAL_MS = 200;       // 300 BPM maximum
const MAX_INTERVAL_MS = 2000;      // 30 BPM minimum
const SESSION_BREAK_MS = 3000;
const MAX_TAPS = 10;

export class TapTempoEngine {
  constructor(){this.reset();}
  reset(){this.times=[];this.bpm=null;return this.state();}
  tap(now){
    if(!Number.isFinite(now))throw Error('Invalid tap time.');
    const last=this.times.at(-1);
    if(last!==undefined){
      const delta=now-last;
      if(delta < MIN_INTERVAL_MS)return this.state(); // ignore double clicks / keyboard repeats
      if(delta > SESSION_BREAK_MS || delta < 0 || delta > MAX_INTERVAL_MS) this.times=[];
    }
    this.times.push(now);
    if(this.times.length > MAX_TAPS) this.times.shift();
    const count=this.times.length;
    if(count>=4){
      const intervals=this.times.slice(1).map((t,i)=>t-this.times[i]);
      const sorted=[...intervals].sort((a,b)=>a-b);
      const median=sorted[Math.floor(sorted.length/2)];
      const inliers=intervals.filter(v=>Math.abs(v-median)<=median*.22);
      const usable=inliers.length>=2?inliers:intervals;
      const average=usable.reduce((sum,x)=>sum+x,0)/usable.length;
      this.bpm=Math.round(600000/average)/10;
    } else this.bpm=null;
    return this.state();
  }
  state(){return {count:this.times.length,bpm:this.bpm,remaining:Math.max(0,4-this.times.length)};}
}

function markup(){
  return '<div class="tap-tool-view">'+
    '<div class="tool-view-header"><span>01 / TAP TEMPO</span><span>MANUAL RHYTHM</span></div>'+
    '<h3>Feel the beat.<br><span>Find the tempo.</span></h3>'+
    '<p class="tool-description">Find BPM by tapping the beat. No audio upload required. Tap at least four times for a stable estimate.</p>'+
    '<div class="pulse-result-block"><p class="pulse-detail-label">YOUR TEMPO</p><div class="pulse-large-readout" id="tap-panel-bpm">— BPM</div></div>'+
    '<button type="button" class="tool-action tool-action-dark tap-launch"><span>Open Tap Tempo</span><b aria-hidden="true">↗</b></button>'+
    '<p class="tool-footnote" id="tap-panel-status" role="status">Click the button to begin tapping.</p>'+
  '</div>';
}

function dialogMarkup(){
  return '<div class="tap-dialog-layout">'+
    '<button class="tap-dialog-close" type="button" aria-label="Close Tap Tempo">×</button>'+
    '<p class="tap-dialog-eyebrow">FEEL THE BEAT.</p>'+
    '<h2 id="tap-dialog-title">Your hands.<br>Your tempo.</h2>'+
    '<button type="button" class="tap-dialog-pad" id="tap-dialog-pad" aria-describedby="tap-dialog-instruction" aria-label="Tap to measure BPM">'+
      '<span id="tap-dialog-value">TAP</span><small id="tap-dialog-hint">3×</small>'+
    '</button>'+
    '<p class="tap-dialog-instruction" id="tap-dialog-instruction">Tap four times or press Space.</p>'+
    '<div class="tap-dialog-actions"><span id="tap-dialog-count">0 taps</span><button type="button" id="tap-dialog-reset">Reset ↶</button></div>'+
    '<div class="tap-dialog-result" id="tap-dialog-result" hidden><span id="tap-dialog-result-label">AVERAGE TEMPO</span><strong id="tap-dialog-bpm">— BPM</strong><button type="button" id="tap-dialog-copy">Copy BPM ↗</button></div>'+
  '</div>';
}

export function mountTapTempo({host}){
  const engine=new TapTempoEngine();
  host.innerHTML=markup();
  const dialog=document.createElement('dialog');
  dialog.className='tap-tempo-dialog';
  dialog.setAttribute('aria-labelledby','tap-dialog-title');
  dialog.innerHTML=dialogMarkup();
  document.body.append(dialog);
  const launch=host.querySelector('.tap-launch');
  const pad=dialog.querySelector('#tap-dialog-pad');
  const value=dialog.querySelector('#tap-dialog-value');
  const hint=dialog.querySelector('#tap-dialog-hint');
  const countLabel=dialog.querySelector('#tap-dialog-count');
  const result=dialog.querySelector('#tap-dialog-result');
  const resultBpm=dialog.querySelector('#tap-dialog-bpm');
  const panelBpm=host.querySelector('#tap-panel-bpm');
  const panelStatus=host.querySelector('#tap-panel-status');

  function render(){
    const {count,bpm,remaining}=engine.state();
    countLabel.textContent=count+' '+(count===1?'tap':'taps');
    value.textContent=bpm===null?'TAP':bpm.toFixed(1);
    hint.textContent=bpm===null?remaining+'×':'BPM';
    panelBpm.textContent=bpm===null?'— BPM':bpm.toFixed(1)+' BPM';
    panelStatus.textContent=bpm===null?(count?remaining+' more taps to estimate BPM.':'Click the button to begin tapping.'):'Measured '+bpm.toFixed(1)+' BPM from '+count+' taps.';
    result.hidden=bpm===null;
    if(bpm!==null)resultBpm.textContent=bpm.toFixed(1)+' BPM';
  }

  function recordTap(){
    if(!dialog.open)return;
    const countBefore=engine.state().count;
    engine.tap(performance.now());
    if(engine.state().count!==countBefore){
      pad.classList.remove('tap-pressed');
      void pad.offsetWidth;
      pad.classList.add('tap-pressed');
      render();
    }
  }
  const onKeydown=event=>{
    if(!dialog.open || event.key!==' ' || event.repeat || event.altKey || event.ctrlKey || event.metaKey)return;
    if(event.target.closest('input,select,textarea,[contenteditable="true"]'))return;
    event.preventDefault(); // also prevents a focused TAP button's native Space click
    recordTap();
  };
  const onDialogClose=()=>{launch.focus({preventScroll:true});};
  const onBackdropClick=event=>{if(event.target===dialog)dialog.close();};
  launch.addEventListener('click',()=>{if(!dialog.open){dialog.showModal();pad.focus({preventScroll:true});}});
  pad.addEventListener('click',recordTap);
  dialog.querySelector('.tap-dialog-close').addEventListener('click',()=>dialog.close());
  dialog.querySelector('#tap-dialog-reset').addEventListener('click',()=>{engine.reset();render();pad.focus();});
  dialog.querySelector('#tap-dialog-copy').addEventListener('click',async()=>{
    if(engine.bpm===null)return;
    try{await navigator.clipboard.writeText(engine.bpm.toFixed(1));dialog.querySelector('#tap-dialog-copy').textContent='Copied ✓';}
    catch{dialog.querySelector('#tap-dialog-copy').textContent='Copy unavailable';}
  });
  dialog.addEventListener('keydown',onKeydown);
  dialog.addEventListener('close',onDialogClose);
  dialog.addEventListener('click',onBackdropClick);
  render();
  // Opening the tool from ANALYZE reproduces the screenshot's modal workflow.
  dialog.showModal();
  pad.focus({preventScroll:true});
  return ()=>{if(dialog.open)dialog.close();dialog.remove();};
}

export const tapTempoModule=Object.freeze({id:'tap',category:'analyze',label:'Tap Tempo',mount:mountTapTempo});
