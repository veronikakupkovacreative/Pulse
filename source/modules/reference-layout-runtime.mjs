/**
 * PULSE / Reference-layout adapter.
 * Uses the uploaded HTML prototype's structure and class names instead of
 * repainting the historic Producer Toolkit grid.
 * Only moves original live DOM nodes (source, panel, help); DSP and handlers stay.
 */
export function initializeReferenceLayout({workspace}){
 const root=document.getElementById('pulse-phase-one');
 const legacy=document.getElementById('pulse-legacy-workspace');
 const footer=document.getElementById('pulse-phase-footer');
 const toolkit=document.getElementById('toolkit');
 if(!root||!legacy||!footer||!toolkit)return {updateTool(){},decorateTool(){}};
 // Make the actual workspace a sibling of the homepage *inside* the approved
 // prototype shell so all canonical @scope rules apply equally to both screens.
 root.insertBefore(legacy,footer);
 legacy.classList.add('view','editor','phase2-live-view');
 const main=legacy.querySelector('#top');
 main?.classList.add('wrap');
 toolkit.classList.add('phase2-reference-screen');
 toolkit.setAttribute('aria-label','PULSE audio tools');
 const oldHeading=toolkit.querySelector('.toolkit-heading');
 const editorial=oldHeading?.querySelector('.toolkit-intro');
 const category=toolkit.querySelector('.tool-category-nav');
 const tabs=toolkit.querySelector('#tool-tabs');
 const board=toolkit.querySelector('.tool-board');
 const source=board?.querySelector('.tool-source');
 const settings=board?.querySelector('.tool-settings');
 const toolPanel=toolkit.querySelector('#tool-panel');
 const crumbs=document.createElement('p');
 crumbs.className='crumbs';
 const homeLink=document.createElement('a');
 homeLink.href='#main';
 homeLink.setAttribute('data-phase-home','');
 homeLink.textContent='Tools';
 const crumbSlash=document.createElement('span');crumbSlash.textContent='/';
 const crumbName=document.createElement('span');crumbName.id='phase2-crumb';crumbName.textContent='Analyze';
 crumbs.append(homeLink,crumbSlash,crumbName);
 const head=document.createElement('div');head.className='editor__head';
 const intro=document.createElement('div');intro.className='phase2-editor-intro';
 const title=document.createElement('h1');title.id='phase2-tool-title';
 title.append(document.createTextNode('Song '));
 const accent=document.createElement('em');accent.textContent='Analyzer';
 title.append(accent);
 const tag=document.createElement('span');tag.className='tag tag--local';tag.id='phase2-tool-tag';tag.textContent='Local';
 title.append(tag);
 intro.append(title);
 if(editorial)intro.append(editorial); // keep live #pulse-tool-summary, #pulse-tool-steps
 const filechip=document.createElement('div');filechip.className='filechip phase2-filechip';
 const dot=document.createElement('i');dot.className='dot';dot.setAttribute('aria-hidden','true');
 const name=document.createElement('b');name.textContent='No track loaded';
 const meta=document.createElement('span');meta.className='phase2-file-status';meta.textContent='Choose audio to begin';
 const replace=document.createElement('button');replace.type='button';replace.className='btn btn--sm';
 replace.textContent='Choose file';
 replace.setAttribute('aria-label','Choose a file in SOURCE AUDIO');
 replace.addEventListener('click',()=>{const input=document.getElementById('audio-file');if(input){input.value='';input.click()}});
 filechip.append(dot,name,meta,replace);
 head.append(intro,filechip);
 const modes=document.createElement('div');
 modes.className='phase2-modes toolbar';
 modes.setAttribute('role','toolbar');
 modes.setAttribute('aria-label','Active audio editing controls');
 modes.hidden=true;
 toolkit.prepend(crumbs);
 crumbs.after(head);
 if(category)category.classList.add('filters','phase2-categories');
 if(tabs)tabs.classList.add('filters','phase2-tool-tabs');
 if(board){
  board.classList.add('editor__grid','phase2-content-grid');
  board.before(modes);
 }
 if(source)source.classList.add('panel','stage');
 if(settings)settings.classList.add('panel','side');
 if(toolPanel)toolPanel.classList.add('phase2-inspector');
 if(oldHeading)oldHeading.hidden=true;
 const tagline=toolkit.querySelector('.section-label');
 if(tagline)tagline.hidden=true;
 const updateSource=()=>{
  const loaded=Boolean(workspace.buffer);
  filechip.dataset.loaded=String(loaded);
  name.textContent=loaded?(workspace.displayName||workspace.name||'Audio loaded'):'No track loaded';
  meta.textContent=loaded?'Ready · shared SOURCE AUDIO':'Choose audio to begin';
  replace.textContent=loaded?'Replace':'Choose file';
 };
 const unsubscribe=workspace.subscribe((snapshot,reason)=>{
  if(reason!=='position')updateSource();
 });
 const titles=Object.freeze({
  'song-analyzer':['Song','Analyzer','Analyze','analysis'],
  'music-tagger':['Music','Tagger','Analyze','analysis'],
  'editor':['Audio','Editor','Audio Editor','editor'],
  'wav':['Audio','Converter','Convert','converter'],
  'visualizer':['Audio','Visualizer','Visuals','visualizer']
 });
 function updateTool(definition){
  if(!definition)return;
  const preset=titles[definition.id];
  const pieces=preset||[definition.label.split(' ')[0],definition.label.split(' ').slice(1).join(' ')||'Tools',definition.category||'Tools','extended'];
  legacy.dataset.template=pieces[3];
  legacy.dataset.activeTool=definition.id;
  intro.querySelector('h1')?.replaceChildren();
  const heading=document.getElementById('phase2-tool-title');
  heading.append(document.createTextNode(pieces[0]+' '));
  const emphasis=document.createElement('em');emphasis.textContent=pieces[1];heading.append(emphasis,tag);
  tag.textContent=['song-analyzer','music-tagger','editor','wav','visualizer'].includes(definition.id)?'Local':'Tool';
  crumbName.textContent=pieces[2];
  modes.replaceChildren();
  modes.hidden=true;
 }
 function decorateTool(definition,host){
  modes.replaceChildren();
  modes.hidden=true;
  if(definition?.id==='editor'){
   // Use the REAL six mode buttons, with their original listeners, as the
   // reference prototype's full-width editing toolbar.
   const live=host.querySelector('.focus-editor-modes');
   if(live){
    live.classList.add('phase2-live-modes');
    modes.append(live);
    modes.hidden=false;
   }
  }
 }
 updateSource();
 return {updateTool,decorateTool,dispose(){unsubscribe();modes.remove();replace.remove();}};
}
