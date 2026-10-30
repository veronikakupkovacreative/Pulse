import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../source/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../source/style.css',import.meta.url),'utf8');
const app=readFileSync(new URL('../source/app.mjs',import.meta.url),'utf8');
test('reference layout includes contextual header, functional directory and full footer',()=>{
 assert.match(html,/class="toolkit-heading pulse-editorial-intro"/);
 assert.equal([...html.matchAll(/class="pulse-directory-card/g)].length,10);
 for(const section of ['ANALYZE','EDIT','EXPORT','AI STUDIO']) assert.match(html,new RegExp('<h2>'+section+'</h2>'));
 for(const name of ['Auto-Tune','Sidechain','Modulation Effects','Clip Volume','De-Esser','Custom Plug-ins','AI Master','BPM Analyzer']) assert.ok(html.includes(name),name);
 assert.match(html,/data-open-tool="mix"/);
 assert.match(html,/id="open-privacy"/);
 assert.match(app,/new MutationObserver\(update\)/);
});
test('nonimplemented tools do not claim working audio processing',()=>{
 for(const id of ['autotune','stretch','sidechain','modulation','volume-pan','plugins','dynamics']){
  const card=html.split('id="feature-'+id+'"')[1]?.split('</article>')[0]||'';
  assert.match(card,/IN DEVELOPMENT/);
  assert.doesNotMatch(card,/data-open-tool/);
 }
 assert.match(css,/PULSE Reference Redesign/);
});