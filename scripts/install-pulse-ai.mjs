/** Run from the PULSE repository root after copying the overlay files. */
import {readFile,writeFile,access} from 'node:fs/promises';
import {join} from 'node:path';
const root=process.cwd();
const main=join(root,'source/modules/features.mjs');
const moduleFile=join(root,'source/modules/pulse-ai-master.mjs');
const apiFile=join(root,'api/pulse-ai.js');
await access(moduleFile);await access(apiFile);
let code=await readFile(main,'utf8');
const imports="import {pulseAiModules} from './pulse-ai-master.mjs';";
if(!code.includes(imports))code=imports+'\n'+code;
if(!code.includes('...pulseAiModules')) {
  // Original PULSE registration uses a trailing spread of legacy or creative modules.
  const existing=['...legacyModules','...advancedModules','...creativeModules'].find(token=>code.includes(token));
  if(!existing)throw Error('Could not find PULSE tool registration. Add ...pulseAiModules manually to toolModules.');
  const last=code.lastIndexOf(existing);
  code=code.slice(0,last+existing.length)+',...pulseAiModules'+code.slice(last+existing.length);
}
await writeFile(main,code,'utf8');
const vercelFile=join(root,'vercel.json');
try {
  const config=JSON.parse(await readFile(vercelFile,'utf8'));
  config.functions={...config.functions,'api/pulse-ai.js':{...config.functions?.['api/pulse-ai.js'],maxDuration:60}};
  await writeFile(vercelFile,JSON.stringify(config,null,2)+'\n','utf8');
} catch(error) {if(error.code!=='ENOENT')throw error;}
console.log('PULSE AI MASTER installed: 4 real UI modules registered in existing categories.');