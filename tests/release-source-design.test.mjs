import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyzeReleaseBuffer} from '../source/modules/release-analysis.mjs';

const read=name=>readFileSync(new URL('../source/'+name,import.meta.url),'utf8');

test('Release Preflight runs on shared audio and does not expose its own upload or URL input',()=>{
 const source=read('modules/producer-workflows.mjs');
 const start=source.indexOf('function mountReleasePreflight(');
 const end=source.indexOf('function mountVocalSessionMapper(',start);
 const release=source.slice(start,end);
 assert.match(release,/analyzeReleaseBuffer\(buffer/);
 assert.match(release,/SOURCE AUDIO/);
 assert.doesNotMatch(release,/type="file"|type="url"|completeAudo\(/);
});
test('full-track local analyzer measures known sine wave and reports real clipping',async()=>{
 const sampleRate=48000,frames=48000;
 const a=Float32Array.from({length:frames},(_,i)=>.3*Math.sin(2*Math.PI*997*i/sampleRate));
 const buffer={sampleRate,length:frames,duration:1,numberOfChannels:2,getChannelData:()=>a};
 const report=await analyzeReleaseBuffer(buffer);
 assert.ok(Number.isFinite(report.integratedLufs));
 assert.ok(report.samplePeakDbfs<-10&&report.samplePeakDbfs>-12);
 assert.ok(Number.isFinite(report.estimatedTruePeakDbtp));
 assert.equal(report.clippedSamples,0);
 assert.equal(report.durationSeconds,1);
 assert.match(report.accuracyNote,/not a certified true-peak/);
});
test('all upload entry points use the shared source panel; visual prototype is wired to real engine',()=>{
 const page=read('index.html'),studio=read('modules/studio-redesign.mjs');
 const extraction=read('modules/musicgpt-extraction.mjs');
 const voice=read('modules/pulse-ai-master.mjs');
 assert.match(page,/id="pulse-hero-drop"/);
 assert.match(studio,/w\.load\(file\)/);
 assert.match(studio,/navigateHome/);
 assert.match(page,/pulse-tool-directory/);
 assert.doesNotMatch(extraction,/data-ext-file|data-ext-url/);
 assert.doesNotMatch(voice,/data-cloud-file/);
 assert.match(read('modules/studio-reference.css'),/--accent:#ff4d1c/);
});
