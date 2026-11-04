import test from 'node:test';
import assert from 'node:assert/strict';
import {studioStore} from '../source/modules/studio-store.mjs';

test('studio store exposes a stable external-store API',()=>{
 const state=studioStore.getState();
 assert.equal(state.activeCategory,'analyze');
 assert.equal(state.activeModule,'rhythm');
 assert.equal(typeof studioStore.subscribe,'function');
});
test('studio store publishes active category and module changes',()=>{
 let notifications=0;
 const unsubscribe=studioStore.subscribe(()=>notifications++);
 studioStore.setActiveCategory('ai');
 studioStore.setActiveModule('master');
 assert.equal(studioStore.getState().activeCategory,'ai');
 assert.equal(studioStore.getState().activeModule,'master');
 assert.equal(notifications,2);
 unsubscribe();
 studioStore.setActiveCategory('analyze');
 assert.equal(notifications,2);
});
