/**
 * PULSE Slider UI v1.0 — presentation-only enhancement for mounted tool parameters.
 * Retains existing numeric input nodes and all original <select> elements so DSP,
 * presets, conversion options and event listeners keep their current contracts.
 */
const numericOption = /^(?:auto|original|[+-]?(?:\d+(?:\.\d*)?|\.\d+))$/i;
const measurements = [
  [/\b(?:dBFS|dbfs)\b/i, 'dBFS'],
  [/\b(?:dB|decibels?)\b/i, 'dB'],
  [/\b(?:milliseconds?|\(ms\))\b/i, 'ms'],
  [/\b(?:seconds?|\(s\))\b/i, 's'],
  [/\b(?:Hz)\b/i, 'Hz'],
  [/\b(?:BPM)\b/i, 'BPM'],
  [/(?:\(%\)|percent|amount|wet\s*mix|sensitivity|smoothing)/i, '%'],
  [/\bratio\b/i, ':1']
];
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const validNumber=value=>Number.isFinite(Number(value));

function labelText(label, control){
  const firstSpan=[...label.children].find(node=>node.tagName==='SPAN');
  const directText=[...label.childNodes].filter(node=>node.nodeType===3).map(node=>node.textContent.trim()).filter(Boolean).join(' ');
  return (firstSpan?.textContent?.trim()||directText||control.getAttribute('aria-label')||control.name||control.id||'Control').replace(/\s+/g,' ');
}
function unitFor(label,control,title){
  const explicit=label.querySelector('small')?.textContent?.trim()||control.dataset.unit;
  if(explicit)return explicit;
  const existing=label.querySelector('output')?.textContent?.trim()||'';
  const suffix=existing.match(/(?:\d)(\s*(?:dBFS|dB|ms|Hz|BPM|%|s|:1))$/i)?.[1]?.trim();
  if(suffix)return suffix;
  if(/^(?:pn-target)$/i.test(control.id))return 'dBFS';
  for(const [pattern,unit] of measurements)if(pattern.test(title))return unit;
  return '';
}
function precision(step){
  const v=String(step);
  if(v.includes('e-'))return Math.min(4,Number(v.split('e-')[1])||0);
  return Math.min(4,v.includes('.')?v.split('.')[1].length:0);
}
function inferredStep(input,min,max){
  if(input.step&&input.step!=='any'&&Number(input.step)>0)return Number(input.step);
  const range=max-min;
  if(range<=.25)return .001;
  if(range<=30)return .01;
  if(range<=100)return .1;
  if(range<=1500)return 1;
  return 100;
}
function formatValue(input,unit){
  const value=Number(input.value),decimals=precision(input.step||1);
  const formatted=Number.isFinite(value)?value.toFixed(decimals):input.value;
  if(unit===':1')return formatted+':1';
  if(unit==='%')return formatted+'%';
  return formatted+(unit?' '+unit:'');
}
function makeHeader(label,title,output){
  const head=document.createElement('div');head.className='pulse-slider-head';
  const name=document.createElement('span');name.className='pulse-slider-title';name.textContent=title;
  output.classList.add('pulse-slider-value');head.append(name,output);
  label.classList.add('pulse-slider-card');
  return head;
}
function decorateRange(input, refreshers){
  if(input.dataset.pulseSliderReady==='true')return;
  const label=input.closest('label');if(!label)return;
  const title=labelText(label,input),unit=unitFor(label,input,title);
  const output=label.querySelector('output')||document.createElement('output');
  const head=makeHeader(label,title,output);
  input.dataset.pulseSliderReady='true';input.classList.add('pulse-slider-input');
  label.replaceChildren(head,input);
  const refresh=()=>{
    const next=formatValue(input,unit);
    output.textContent=next;
    input.setAttribute('aria-valuetext',next);
    input.style.setProperty('--pulse-slider-progress',String(clamp((Number(input.value)-Number(input.min))/(Number(input.max)-Number(input.min)||1)*100,0,100))+'%');
  };
  input.addEventListener('input',refresh);
  input.addEventListener('change',refresh);
  refreshers.add(refresh);refresh();
}
function decorateNumber(input,refreshers){
  if(input.dataset.pulseSliderReady==='true')return;
  const label=input.closest('label');if(!label||!label.contains(input))return;
  const min=Number(input.min),max=Number(input.max);
  if(input.min===''||input.max===''||!Number.isFinite(min)||!Number.isFinite(max)||max<=min)return;
  if(input.dataset.field==='direction')return decorateDirection(input,refreshers);
  const current=input.value,step=inferredStep(input,min,max);
  input.step=String(step);input.type='range';input.value=current;
  decorateRange(input,refreshers);
}
function decorateDirection(input,refreshers){
  const label=input.closest('label');if(!label)return;
  const title='FADE DIRECTION',output=document.createElement('output');
  const head=makeHeader(label,title,output);
  const buttons=document.createElement('div');buttons.className='pulse-slider-pills';
  input.type='hidden';input.dataset.pulseSliderReady='true';
  const choices=[['0','FADE IN'],['1','FADE OUT']];
  const refresh=()=>{
    const chosen=choices.find(item=>item[0]===input.value)||choices[0];
    output.textContent=chosen[1];
    buttons.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.value===chosen[0])));
  };
  for(const [value,text] of choices){
    const button=document.createElement('button');button.type='button';button.dataset.value=value;button.textContent=text;
    button.onclick=()=>{input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));refresh();};
    buttons.append(button);
  }
  label.replaceChildren(head,buttons,input);
  input.addEventListener('input',refresh);refreshers.add(refresh);refresh();
}
function isNumericSelect(select){
  if(select.dataset.pulseSliderReady==='true')return false;
  const options=[...select.options];
  return options.length>=2&&options.length<=40&&options.every(option=>numericOption.test(option.value.trim()));
}
function decorateSelect(select,refreshers){
  if(!isNumericSelect(select))return;
  const label=select.closest('label');if(!label)return;
  const title=labelText(label,select),output=document.createElement('output');
  const head=makeHeader(label,title,output);
  const range=document.createElement('input');range.type='range';range.min='0';range.max=String(select.options.length-1);range.step='1';
  range.className='pulse-slider-input';range.dataset.pulseSliderReady='true';
  range.setAttribute('aria-label',title);
  select.dataset.pulseSliderReady='true';select.classList.add('pulse-slider-original');select.hidden=true;select.tabIndex=-1;select.setAttribute('aria-hidden','true');
  label.replaceChildren(head,range,select);
  label.classList.add('pulse-slider-discrete');
  const refresh=()=>{
    const index=Math.max(0,select.selectedIndex),selected=select.options[index];
    range.value=String(index);
    const value=selected?.textContent.trim()||'—';output.textContent=value;
    range.setAttribute('aria-valuetext',value);
    range.style.setProperty('--pulse-slider-progress',String((index/Math.max(1,select.options.length-1))*100)+'%');
  };
  range.addEventListener('input',()=>{
    const option=select.options[Number(range.value)];
    if(!option)return;
    select.value=option.value;
    select.dispatchEvent(new Event('change',{bubbles:true}));
    refresh();
  });
  select.addEventListener('change',refresh);
  refreshers.add(refresh);refresh();
}
/**
 * Enhance a tool's dynamically mounted controls. Returns cleanup for its observer.
 * Selects retain their original IDs and values, including AUTO and Original.
 */
export function enhanceParameterControls(host){
  if(!(host instanceof Element))return ()=>{};
  const refreshers=new Set();
  const decorate=()=>{
    host.querySelectorAll('input[type="number"]').forEach(input=>decorateNumber(input,refreshers));
    host.querySelectorAll('select').forEach(select=>decorateSelect(select,refreshers));
    host.querySelectorAll('input[type="range"]').forEach(input=>decorateRange(input,refreshers));
  };
  const sync=()=>{for(const refresh of refreshers)refresh();};
  let timer=null;
  const schedule=()=>{if(timer!==null)return;timer=setTimeout(()=>{timer=null;sync();},0);};
  decorate();
  const observer=new MutationObserver(()=>decorate());
  observer.observe(host,{childList:true,subtree:true});
  host.addEventListener('click',schedule,true);
  host.addEventListener('pointerup',schedule,true);
  host.addEventListener('keydown',schedule,true);
  return ()=>{
    observer.disconnect();
    if(timer!==null)clearTimeout(timer);
    host.removeEventListener('click',schedule,true);
    host.removeEventListener('pointerup',schedule,true);
    host.removeEventListener('keydown',schedule,true);
    refreshers.clear();
  };
}
