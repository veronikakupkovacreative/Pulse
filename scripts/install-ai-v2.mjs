/** Applies the PULSE AI Studio V2 integration to the existing PULSE source tree.
 * Run once from the project root: node scripts/install-ai-v2.mjs
 * Refuses unfamiliar source layouts rather than overwriting arbitrary files.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=process.cwd();
const updates=new Map();
async function load(file){try{return await readFile(resolve(root,file),'utf8')}catch{throw Error('Missing '+file+'. Run from the existing PULSE repository root.')}}
function exactlyOnce(content,needle,label){
 const first=content.indexOf(needle),last=content.lastIndexOf(needle);
 if(first<0||first!==last)throw Error('Source layout changed: expected one '+label+'. No files were modified.');
 return content;
}
const indexPath='source/modules/index.mjs',appPath='source/app.mjs',htmlPath='source/index.html',vercelPath='vercel.json';
let index=await load(indexPath);
if(!index.includes("from './ai-v2.mjs'")){
 exactlyOnce(index,"import {toolModules} from './features.mjs';",'legacy module import');
 exactlyOnce(index,'export {toolModules};','tool module export');
 index=index.replace("import {toolModules} from './features.mjs';",
  "import {toolModules as existingToolModules} from './features.mjs';\nimport {aiV2Modules} from './ai-v2.mjs';");
 index=index.replace('export {toolModules};',
  "export const toolModules=Object.freeze([...existingToolModules.filter(module=>module.category!=='ai'),...aiV2Modules]);");
 const anchor="  workspace.mountSource();";
 exactlyOnce(index,anchor,'workspace boot');
 index=index.replace(anchor,
  "  const aiV2Style=document.createElement('link');aiV2Style.rel='stylesheet';aiV2Style.href='/modules/ai-v2.css';document.head.append(aiV2Style);\n"+anchor);
}
updates.set(indexPath,index);
let app=await load(appPath);
if(!app.includes("from './modules/ai-v2-copy.mjs'")){
 const anchor="import {renderToolBenefits} from './modules/tool-benefits.mjs';";
 exactlyOnce(app,anchor,'editorial import');
 app=app.replace(anchor,anchor+"\nimport {isAiV2,renderAiV2Copy} from './modules/ai-v2-copy.mjs';");
 const rendering='  renderToolEditorial(definition);\n  renderToolBenefits(definition);';
 exactlyOnce(app,rendering,'editorial rendering');
 app=app.replace(rendering,
  "  if(isAiV2(definition))renderAiV2Copy(definition);\n  else {renderToolEditorial(definition);renderToolBenefits(definition);}");
 app=app.replace("description:'This category is ready for new AI audio modules.'",
  "description:'Eight focused audio tools for mixing, mastering, separation, repair and sound design.'");
}
updates.set(appPath,app);
let html=await load(htmlPath);
if(!html.includes('data-open-tool="ai2-stems"')){
 const footer=/<div class="pulse-footer-col"><h2>AI STUDIO<\/h2><ul>[\s\S]*?<\/ul><\/div>/g;
 const matches=[...html.matchAll(footer)];
 if(matches.length!==1)throw Error('AI Studio footer structure not found. No files were modified.');
 const entries=[['ai2-mastering','AI Mastering'],['ai2-stems','Stem Separator'],['ai2-vocals','Vocal Studio'],['ai2-beat','Beat Lab'],['ai2-mix','Mix Assistant'],['ai2-repair','Audio Repair'],['ai2-pitch','Pitch & Time'],['ai2-fx','Smart FX']];
 const list=entries.map(([id,title])=>`<li><button type="button" data-open-tool="${id}">${title}</button></li>`).join('');
 html=html.replace(footer,`<div class="pulse-footer-col"><h2>AI STUDIO</h2><ul>${list}</ul></div>`);
 html=html.replace('data-open-tool="master">Open tool','data-open-tool="ai2-mastering">Open tool');
 html=html.replace('<h3>Smart Master</h3><span>08</span>','<h3>AI Mastering</h3><span>08</span>');
}
updates.set(htmlPath,html);
let vercel=await load(vercelPath);
const parsed=JSON.parse(vercel);
parsed.functions??={};
if(!parsed.functions['api/pulse-stems.js'])parsed.functions['api/pulse-stems.js']={maxDuration:60};
updates.set(vercelPath,JSON.stringify(parsed,null,2)+'\n');
for(const [file,content] of updates)await writeFile(resolve(root,file),content,'utf8');
console.log('PULSE AI Studio V2 installed in four existing files. Review git diff, then run npm test && npm run build.');
