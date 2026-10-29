import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css = readFileSync(new URL('../source/style.css',import.meta.url),'utf8');
const html = readFileSync(new URL('../source/index.html',import.meta.url),'utf8');
const build = readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

test('only category buttons have a filled surface; all subtools are outlined',()=>{
  assert.match(css,/PULSE 3\.2\.1 \/ category hierarchy/);
  assert.match(css,/\.tool-tabs \.tool-tab\.selected\s*\{\s*background:transparent;/);
  assert.match(css,/\.tool-category-nav \+ \.analyze-shortcuts \.tool-shortcut,\s*\.tool-tabs \.tool-tab\s*\{[\s\S]*?background:transparent;/);
  assert.match(css,/\.coming-soon-note \.coming-soon-link,\s*\.coming-soon-note>span\s*\{\s*background:transparent;/);
});

test('category numbers denote fixed order 01-04, not tool counts',()=>{
  for(const [name,num] of [['ANALYZE','01'],['EDIT','02'],['EXPORT','03'],['AI STUDIO','04']]) {
    assert.match(html,new RegExp(name+' <span>'+num+'<\\/span>'));
  }
  assert.doesNotMatch(html,/ANALYZE <span>05<\/span>/);
});

test('subtools have no numbers and retain navigation arrow; YouTube stays disabled',()=>{
  const tabs=[...html.matchAll(/<button class="tool-tab(?: selected)?"[^>]*>([\s\S]*?)<\/button>/g)];
  assert.equal(tabs.length,11);
  for(const [,label] of tabs){assert.doesNotMatch(label,/<span>\d{2}<\/span>/); assert.match(label,/<b>↗<\/b>/);}
  assert.match(html,/id="tab-youtube"[^>]*disabled/);
  assert.match(html,/id="analyze-shortcuts"/);
  assert.match(build,/PULSE 3\.2\.1 \/ category hierarchy/);
});
