import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {toolModules} from '../source/modules/index.mjs';
const read=name=>readFileSync(new URL('../source/'+name,import.meta.url),'utf8');
const html=read('index.html'),app=read('app.mjs');
test('four toolkit categories remain',()=>{for(const category of ['analyze','edit','export','ai']){assert.ok(html.includes('data-category="'+category+'"'));assert.ok(app.includes(category+':{name:'));assert.ok(toolModules.some(m=>m.category===category))}});
test('modular audio tools are registered',()=>{assert.ok(toolModules.length>=12);assert.equal(new Set(toolModules.map(m=>m.id)).size,toolModules.length);for(const m of toolModules){assert.equal(typeof m.mount,'function');assert.equal(typeof m.label,'string')}});
test('mount points are preserved',()=>{for(const id of ['tool-panel','tool-tabs','blank-panel'])assert.ok(html.includes('id="'+id+'"'));assert.ok(app.includes('definition.mount'))});
