import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {visibleToolModules} from '../source/modules/index.mjs';

const read=path=>readFileSync(new URL('../source/'+path,import.meta.url),'utf8');
const css=read('modules/pulse-design-system.css');
const ui=read('modules/ui.css');
const ai=read('modules/ai-v2.css');
const html=read('index.html');

test('phase 4 includes all original 5 toolkit areas and 11 AI tools',()=>{
 assert.deepEqual([...new Set(visibleToolModules.map(m=>m.category))],['analyze','edit','export','ai','visuals']);
 assert.equal(visibleToolModules.filter(m=>m.category==='ai').length,11);
 assert.equal(visibleToolModules.length,17);
 assert.ok(visibleToolModules.some(m=>m.id==='music-tagger'&&m.category==='analyze'));
 for(const id of ['song-analyzer','editor','wav','visualizer'])assert.ok(visibleToolModules.some(m=>m.id===id));
});
test('phase 4 introduces primary and secondary color tokens for dark and red surfaces',()=>{
 for(const key of [
  '--pulse-text-red-primary','--pulse-text-red-secondary',
  '--pulse-text-dark-primary','--pulse-text-dark-secondary',
  '--pulse-metric-label-size','--pulse-cta-height'
 ])assert.ok(css.includes(key+':'),key);
 assert.match(css,/--pulse-red:#ff2b20/);
 assert.match(css,/--pulse-ink:#191919/);
 assert.match(css,/--pulse-paper:#f5f4f0/);
});
test('focus, hover, and disabled states are coherent and legible',()=>{
 assert.match(css,/opacity:\.85;\s*cursor:not-allowed/);
 assert.match(css,/\.pulse-slider-pills button\[aria-pressed="true"\]/);
 assert.match(css,/\.pulse-number-field input\[type="number"\]/);
 assert.match(css,/\.pulse-workspace-actions-buttons button\[data-workspace-preview\]/);
 assert.match(css,/\.pulse-workspace-actions-buttons button\[data-workspace-export\]/);
 assert.match(css,/\.pulse-noise-profile-actions button/);
 assert.doesNotMatch(ui,/\.pulse-slider-pills button\[aria-pressed=true\]\{background:#f2f0ec/);
 assert.doesNotMatch(ai,/\.ai2-action:hover\{background:#333/);
});
test('phase 4 covers producer tools, converter, creative FX and mixer details',()=>{
 for(const selector of [
  '.pulse-producer-secondary','.pulse-producer-detail','.pulse-producer-status',
  '.module-work .converter-codec-note','.pulse-creative .creative-status',
  '.pulse-producer-field input[type="number"]','.pulse-producer-action','.creative-apply',
  '.creative-presets button[aria-pressed="true"]','.ai2-track-head button',
  '.ai2-stem-row button','.pulse-master-output button:last-child',
  '.pulse-master-disclaimer','.pulse-master-spectrum-legend',
  '.pulse-slider-card input[type="range"]'
 ])assert.ok(css.includes(selector),selector);
});
test('single Producer Toolkits Song Analyzer stays inside RED design scope',()=>{
 assert.ok(html.includes('id="analyzer"')); // old bookmarked #analyzer redirects to the toolkit
 assert.ok(html.includes('id="toolkit"'));
 assert.doesNotMatch(html,/class="pulse-song-analyzer"/);
 assert.doesNotMatch(html,/src="\/song\/song-ui.mjs"/);
 assert.match(css,/\.focus-song-v3/);
 assert.match(css,/\.tool-settings/);
});
test('consiselevent uppercase control and senelevence-case editorial styles survive mobile',()=>{
 assert.match(css,/text-transform:uppercase/);
 assert.match(css,/text-transform:none/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(css,/@media\(max-width:560px\)/);
 assert.match(css,/@media\(max-width:440px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
