import test from 'node:test';
import assert from 'node:assert/strict';
import {runAudialMusicTags,isAbort} from '../source/modules/music-tagger-ai.mjs';
const dummy={name:'sample.wav',base64:'ZmFrZQ=='};
const tags={genre:['UK Garage'],description:'Electronic dance music',song_tags:{full:{moods:['energetic'],instruments:['synth bass']}}};
test('AI genre mood instrument tagging runs automatically in browser and handles 409 stem preparation',async()=>{
 const calls=[],stages=[],pauses=[];
 let taggingAttempts=0,resultAttempts=0;
 const output=await runAudialMusicTags({
  file:dummy,
  send:async(action,payload)=>{
   calls.push(action);
   if(action==='start'){assert.equal(payload.file.name,'sample.wav');return {analysisExeId:'exe_12345abcde'};}
   if(action==='tag'){taggingAttempts++;if(taggingAttempts<=2){const e=Error('Waiting');e.code='STEMS_NOT_READY';throw e;}return {status:'tagging_requested'};}
   resultAttempts++;return resultAttempts===1?{status:'pending'}:{status:'complete',tags};
  },
  onProgress:s=>stages.push(s.stage),
  pause:async ms=>{pauses.push(ms);}
 });
 assert.equal(output.analysisExeId,'exe_12345abcde');
 assert.deepEqual(output.tags.genre,['UK Garage']);
 assert.deepEqual(calls,['start','tag','tag','tag','result','result']);
 assert.ok(stages.includes('waiting-stems')&&stages.includes('waiting-results')&&stages.includes('complete'));
 assert.deepEqual(pauses,[25000,25000,12000]);
});
test('a resumed job skips re-upload and repeats only remaining API actions',async()=>{
 let uploads=0,requests=[];
 const result=await runAudialMusicTags({
  resume:{analysisExeId:'exe_test123456',tagsRequested:true},
  send:async(action)=>{requests.push(action);if(action==='start')uploads++;return {status:'complete',tags};},
  pause:async()=>{}
 });
 assert.equal(uploads,0);
 assert.deepEqual(requests,['result']);
 assert.deepEqual(result.tags, tags);
});
test('model errors propagate instead of fabricating tags',async()=>{
 const err=Object.assign(new Error('Subscription required'),{code:'SUBSCRIPTION_REQUIRED'});
 await assert.rejects(runAudialMusicTags({
  file:dummy,send:async action=>action==='start'?{analysisExeId:'exe_12345abcde'}:Promise.reject(err),
  pause:async()=>{}
 }),/Subscription required/);
});
test('cancellation stops API polling cleanly',async()=>{
 const controller=new AbortController();
 const requests=[];
 await assert.rejects(runAudialMusicTags({
  file:dummy,signal:controller.signal,
  send:async action=>{requests.push(action);if(action==='start')return {analysisExeId:'exe_12345abcde'};if(action==='tag'){const error=Error('stems');error.code='STEMS_NOT_READY';throw error;}return {};},
  pause:async()=>{controller.abort();}
 }),isAbort);
 assert.deepEqual(requests,['start','tag']);
});
