import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {AudioWorkspace} from '../source/modules/workspace.mjs';

const read=name=>readFileSync(new URL('../source/'+name,import.meta.url),'utf8');

test('homepage has a visible source action, independent tool directory and correct heading structure',()=>{
 const {document}=parseHTML(read('index.html'));
 const main=document.querySelector('main'),directory=document.getElementById('pulse-tool-directory'),toolkit=document.getElementById('toolkit');
 assert.ok(main&&directory&&toolkit);
 assert.ok(main.contains(directory)&&!toolkit.contains(directory));
 assert.ok(directory.querySelector('h2#pulse-directory-title'));
 assert.equal(document.querySelectorAll('#pulse-tool-directory .pulse-tool-card').length,7);
 assert.equal(document.querySelectorAll('#pulse-tool-directory .pulse-tool-card[data-kind="ai"]').length,1);
 assert.ok(document.getElementById('pulse-hero-drop'));
 assert.ok(document.querySelector('a.pulse-skip[href="#top"]'));
 assert.ok(document.querySelector('#toolkit h1#toolkit-title'));
});
test('waveform viewport maps zoom and pan to actual time positions',()=>{
 const w=new AudioWorkspace();
 w.buffer={sampleRate:48000,duration:120,length:5760000,numberOfChannels:2};
 w.setWaveViewport(4,30);
 const v=w.getWaveViewport();
 assert.equal(v.visible,30);
 assert.equal(w.waveCoordinate(0,390),30);
 assert.equal(w.waveCoordinate(390,390),60);
 assert.equal(w.waveCoordinate(195,390),45);
 w.setWaveViewport(16,999);
 assert.equal(w.getWaveViewport().view,112.5);
 assert.equal(w.waveCoordinate(390,390),120);
});
test('source and editor share real viewport and loop state',()=>{
 const source=read('modules/source-ui.mjs'),studio=read('modules/studio-redesign.mjs'),workspace=read('modules/workspace.mjs');
 assert.match(source,/w\.setWaveViewport\(zoom,view\)/);
 assert.match(source,/w\.setLoopEnabled\(!w\.loopEnabled\)/);
 assert.doesNotMatch(source,/setInterval\(/);
 assert.match(studio,/w\.waveCoordinate\(/);
 assert.match(studio,/if\(reason==='load'&&document\.body\.classList\.contains\('pulse-home-view'\)\)/);
 assert.match(workspace,/this\.original=decoded/);
});
test('cloud voice, metadata inspection and Release Preflight never request a second audio input',()=>{
 const voice=read('modules/musicgpt-voicechanger.mjs'),watermark=read('modules/watermark-cleaner.mjs'),release=read('modules/producer-workflows.mjs');
 assert.doesNotMatch(voice,/data-voice-file|type="file"/);
 assert.doesNotMatch(watermark,/data-wm-file|type="file"/);
 assert.match(watermark,/w\.originalFile/);
 assert.match(watermark,/w\.buffer!==w\.original/);
 const section=release.slice(release.indexOf('function mountReleasePreflight('),release.indexOf('function mountVocalSessionMapper('));
 assert.doesNotMatch(section,/type="file"|type="url"/);
 assert.match(section,/analyzeReleaseBuffer\(/);
});
test('UI remains dark-only with focus ring and responsive widths',()=>{
 const css=read('modules/studio-reference.css');
 assert.match(css,/--paper:#0e0e0f/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/outline:3px solid var\(--accent\)/);
 assert.match(css,/@media\(max-width:640px\)/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/min-height:44px/);
});
