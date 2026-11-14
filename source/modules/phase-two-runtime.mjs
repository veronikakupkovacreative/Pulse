/**
 * Phase 2 navigation and source-status shell.
 * UI-only adapter: all controls, audio operations, history and provider calls
 * remain owned by their original production modules.
 */
export function initializePhaseTwo({workspace}){
 const toolkit=document.getElementById('toolkit');
 const shell=document.getElementById('pulse-legacy-workspace');
 if(!toolkit||!shell||!workspace)return {updateTool(){}};
 const bar=document.createElement('div');
 bar.className='phase2-breadcrumb';
 bar.setAttribute('aria-label','Workspace location');
 const home=document.createElement('button');
 home.type='button';
 home.className='phase2-home';
 home.textContent='← ALL TOOLS';
 home.setAttribute('aria-label','Return to PULSE Studio homepage');
 const trail=document.createElement('span');
 trail.className='phase2-trail';
 const categoryLabel=document.createElement('span');
 categoryLabel.className='phase2-category-label';
 const separator=document.createElement('span');
 separator.className='phase2-separator';
 separator.textContent='/';
 separator.setAttribute('aria-hidden','true');
 const toolLabel=document.createElement('strong');
 toolLabel.className='phase2-current-tool';
 trail.append(categoryLabel,separator,toolLabel);
 const chip=document.createElement('span');
 chip.className='phase2-source-chip';
 chip.setAttribute('role','status');
 chip.setAttribute('aria-live','polite');
 chip.title='Shared SOURCE AUDIO for all tools';
 const open=document.createElement('button');
 open.type='button';
 open.className='phase2-open-source';
 open.textContent='OPEN AUDIO +';
 open.setAttribute('aria-label','Choose audio in shared source workspace');
 bar.append(home,trail,chip,open);
 toolkit.prepend(bar);
 const goHome=()=>{
  const root=document.getElementById('pulse-phase-one');
  const logo=root?.querySelector('a.logo[href="#main"]');
  if(logo)logo.click();
 };
 home.addEventListener('click',goHome);
 const choose=()=>{
  const input=document.getElementById('audio-file');
  if(!input)return;
  input.value='';
  input.click();
 };
 open.addEventListener('click',choose);
 const sync=()=>{
  const snapshot=workspace.getSnapshot();
  const name=snapshot?.track?.name;
  chip.textContent=name?'SOURCE / '+name:'SOURCE / NO AUDIO';
  chip.dataset.loaded=name?'true':'false';
  open.textContent=name?'REPLACE AUDIO ↗':'OPEN AUDIO +';
 };
 const unsubscribe=workspace.subscribe((_snapshot,reason)=>{
  if(reason!=='position')sync();
 });
 function updateTool(definition,category){
  if(!definition)return;
  shell.dataset.activeTool=definition.id;
  shell.dataset.activeCategory=category||definition.category||'analyze';
  categoryLabel.textContent=String(category||definition.category||'analyze').toUpperCase();
  toolLabel.textContent=definition.label;
 }
 sync();
 return {updateTool,dispose(){unsubscribe();home.removeEventListener('click',goHome);open.removeEventListener('click',choose);bar.remove();}};
}
