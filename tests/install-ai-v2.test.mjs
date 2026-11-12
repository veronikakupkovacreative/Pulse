import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const installer=resolve(fileURLToPath(new URL('../scripts/install-ai-v2.mjs',import.meta.url)));
test('installer registers AI v2 without deleting existing app or duplicating imports',async()=>{
 const root=await mkdtemp(join(tmpdir(),'pulse-ai2-'));
 try{
  await mkdir(join(root,'source/modules'),{recursive:true});
  await writeFile(join(root,'source/modules/index.mjs'),"import {toolModules} from './features.mjs';\nimport {workspace} from './workspace.mjs';\nexport {toolModules};\nif(typeof document!=='undefined'){\n  workspace.mountSource();\n}\n");
  await writeFile(join(root,'source/app.mjs'),"import {renderToolBenefits} from './modules/tool-benefits.mjs';\n// example\n  renderToolEditorial(definition);\n  renderToolBenefits(definition);\nconst description='This category is ready for new AI audio modules.';\n");
  await writeFile(join(root,'source/index.html'),'<main>Original page stays intact</main><div class="pulse-footer-col"><h2>AI STUDIO</h2><ul><li>Old AI</li></ul></div><button data-open-tool="master">Open tool</button>');
  await writeFile(join(root,'vercel.json'),'{"framework":null,"outputDirectory":"public","functions":{"api/pulse-ai.js":{"maxDuration":60}}}');
  execFileSync(process.execPath,[installer],{cwd:root});
  const a=await readFile(join(root,'source/modules/index.mjs'),'utf8');
  const b=await readFile(join(root,'source/app.mjs'),'utf8');
  const c=await readFile(join(root,'source/index.html'),'utf8');
  const d=JSON.parse(await readFile(join(root,'vercel.json'),'utf8'));
  assert.match(a,/aiV2Modules/);assert.match(a,/workspace\.mountSource/);
  assert.match(b,/renderAiV2Copy/);assert.match(b,/renderToolBenefits/);
  assert.match(c,/Original page stays intact/);assert.match(c,/ai2-stereo/);
  assert.equal(d.functions['api/pulse-stems.js'],undefined);
  execFileSync(process.execPath,[installer],{cwd:root});
  assert.equal((await readFile(join(root,'source/modules/index.mjs'),'utf8')).split('ai-v2.mjs').length-1,1);
 }finally{await rm(root,{recursive:true,force:true});}
});
