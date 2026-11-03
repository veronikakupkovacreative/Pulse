import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {toolModules} from '../source/modules/index.mjs';
import {getCategoryMenuItems,HIDDEN_PUBLIC_TOOL_IDS} from '../source/modules/category-menu.mjs';
const read=p=>readFileSync(new URL('../source/'+p,import.meta.url),'utf8');
const categories=['analyze','edit','export','ai','visuals'];
test('every category has a real dropdown trigger and an associated menu',()=>{
 const html=read('index.html');
 for(const category of categories){
  assert.match(html,new RegExp('data-nav-dropdown-trigger="'+category+'"'));
  assert.match(html,new RegExp('data-nav-dropdown-menu="'+category+'"'));
  assert.match(html,new RegExp('aria-controls="nav-menu-'+category+'"'));
 }
});
test('each category dropdown lists all registered, launchable tools for that category',()=>{
 for(const category of categories){
  const items=getCategoryMenuItems(toolModules,category);
  assert.ok(items.length>0,'No menu items registered for '+category);
  assert.ok(items.every(tool=>tool.category===category&&typeof tool.mount==='function'));
  assert.equal(new Set(items.map(tool=>tool.id)).size,items.length);
 }
});
test('unconfigured ElevenLabs tools remain hidden from public category dropdowns',()=>{
 for(const id of ['ai-voice-changer','ai-text-to-sound-effects','ai-voice-cloning','ai-voice-isolator']){
  assert.ok(HIDDEN_PUBLIC_TOOL_IDS.has(id));
  assert.ok(!getCategoryMenuItems(toolModules,'ai').some(tool=>tool.id===id));
 }
});
test('menu labels are generated from the registry, not duplicated in HTML',()=>{
 const app=read('app.mjs'),html=read('index.html');
 assert.match(app,/getCategoryMenuItems\(toolModules,category\)/);
 assert.match(app,/label\.textContent=tool\.label/);
 assert.match(app,/renderDropdownMenus\(\)/);
 assert.match(app,/openToolFromDropdown\(tool\)/);
 assert.doesNotMatch(html,/data-nav-menu-tool=/);
});
test('dropdowns support accessible open state, Escape and outside click',()=>{
 const app=read('app.mjs'),css=read('style.css');
 assert.match(app,/aria-expanded/);
 assert.match(app,/event\.key==='Escape'/);
 assert.match(app,/closest\('\.header-nav'\)/);
 assert.match(css,/\.nav-dropdown-menu\[hidden\]\{display:none!important\}/);
 assert.match(css,/\.nav-dropdown-item:focus-visible/);
});
