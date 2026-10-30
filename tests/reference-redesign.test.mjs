import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../source/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../source/style.css',import.meta.url),'utf8');
const app=readFileSync(new URL('../source/app.mjs',import.meta.url),'utf8');
test('eight curated toolkit cards and processing note are retained',()=>{
 assert.equal([...html.matchAll(/<article class="pulse-directory-card/g)].length,8);
 assert.equal([...html.matchAll(/class="pulse-directory-column"/g)].length,3);
 assert.match(html,/FILE PROCESSING/);
 for(const n of ['AI Stem Splitter','AI Vocal Remover','AI Beat Detection','Parametric Equalizer','Transient Shaper / De-Esser','AI Audio Reverse','Audio Converter','AI Normalizer']) assert.ok(html.includes(n),n);
 for(const name of ['ANALYZE','EDIT','EXPORT','AI STUDIO']) assert.match(html,new RegExp('<h2>'+name+'</h2>'));
});
test('Arial Regular 18px applies to tool navigation and featured-card titles',()=>{
 assert.match(css,/\.pulse-card-head h3\{font:400 18px\/1\.22 Arial/);
 assert.match(css,/\.tool-tabs \.tool-tab,\.tool-category-nav\+\.analyze-shortcuts \.tool-shortcut\{font:400 18px/);
 assert.match(css,/--ink:#191919/);
});
test('EQ keeps existing interactive graph IDs and moves presets into red inspector',()=>{
 const eq=html.split('id="pulse-eq-left"')[1].split('id="panel-converter"')[0];
 assert.match(eq,/id="eq-response-graph"/);
 assert.match(eq,/id="eq-live-spectrum"/);
 assert.match(html,/id="panel-equalizer"/);
 assert.match(html,/id="eq-compare"/);
 assert.match(html,/id="eq-split-view"/);
 assert.match(html,/class="pulse-eq-right-presets"/);
 assert.match(css,/\.tool-settings\{background:var\(--red\)!important/);
 assert.match(app,/bypass\.click\(\)/);
});
test('Help modal contains working producer shortcuts and planned cards give status',()=>{
 for(const x of ['Keyboard','Shift +','Set IN marker','Set OUT marker','Split at playhead','Mute and solo']) assert.ok(html.includes(x));
 assert.match(app,/event\.key==='\?'/);
 assert.match(app,/\[data-feature-info\]/);
 assert.match(html,/id="pulse-feature-dialog"/);
});
