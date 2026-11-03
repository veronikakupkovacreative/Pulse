import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {elevenLabsModules} from '../source/modules/elevenlabs-tools.mjs';
const read=p=>readFileSync(new URL('../source/'+p,import.meta.url),'utf8');
test('all four requested ElevenLabs tools register in AI Studio',()=>{const expected=[['ai-voice-changer','AI Voice Changer'],['ai-text-to-sound-effects','AI Text to Sound Effects'],['ai-voice-cloning','AI Voice Cloning'],['ai-voice-isolator','AI Voice Isolator']];for(const [id,label] of expected){const m=elevenLabsModules.find(x=>x.id===id);assert.ok(m,id);assert.equal(m.label,label);assert.equal(m.category,'ai');assert.equal(typeof m.mount,'function')}assert.equal(elevenLabsModules.length,4)});
test('client only calls same-origin proxy and never contains provider secret',()=>{const s=read('modules/elevenlabs-tools.mjs');assert.match(s,/\/api\/pulse-ai/);assert.match(s,/X-Pulse-Access/);assert.doesNotMatch(s,/xi-api-key|ELEVENLABS_API_KEY|YOUR_API_KEY/)});
test('voice cloning requires explicit consent and isolator supports Apply with Undo',()=>{const s=read('modules/elevenlabs-tools.mjs');assert.match(s,/data-consent/);assert.match(s,/explicit permission/);assert.match(s,/w\.commit\(decoded/)});
test('all cloud modules use PULSE branded dark actions and transparent controls',()=>{const s=read('modules/elevenlabs-tools.mjs'),css=read('modules/pulse-ai-master.mjs');assert.match(s,/pulse-ai-action/);assert.match(s,/pulse-ai-control/);assert.match(css,/\.pulse-ai-action\{[^}]*background:#191919/s)});