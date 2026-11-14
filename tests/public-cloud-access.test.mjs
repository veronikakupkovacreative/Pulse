import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cloudConfigured,checkCloudOrigin,checkBillableRoute} from '../api/_pulse-cloud-guard.js';

test('public cloud routes require explicit server opt-in and provider credentials',()=>{
 const old=process.env.PULSE_PUBLIC_CLOUD_ENABLED;
 try{
  process.env.PULSE_PUBLIC_CLOUD_ENABLED='false';
  assert.equal(cloudConfigured('provider-server-secret'),false);
  process.env.PULSE_PUBLIC_CLOUD_ENABLED='true';
  assert.equal(cloudConfigured('provider-server-secret'),true);
  assert.equal(cloudConfigured(''),false);
 }finally{if(old===undefined)delete process.env.PULSE_PUBLIC_CLOUD_ENABLED;else process.env.PULSE_PUBLIC_CLOUD_ENABLED=old;}
});
test('same-origin requests work without any browser access token',()=>{
 assert.equal(checkCloudOrigin({headers:{host:'www.thepulsestudio.eu',origin:'https://www.thepulsestudio.eu'}}),null);
 assert.equal(checkCloudOrigin({headers:{host:'localhost:3000',origin:'http://localhost:3000'}}),null);
 assert.equal(checkCloudOrigin({headers:{host:'www.thepulsestudio.eu'}}),'CROSS_ORIGIN_BLOCKED');
 assert.equal(checkCloudOrigin({headers:{host:'www.thepulsestudio.eu',origin:'https://attacker.example'}}),'CROSS_ORIGIN_BLOCKED');
 assert.equal(checkCloudOrigin({headers:{host:'www.thepulsestudio.eu',origin:'http://www.thepulsestudio.eu'}}),'CROSS_ORIGIN_BLOCKED');
});
test('a credit-bearing request cannot bypass the dedicated WAF query path',()=>{
 for(const path of ['/api/pulse-extraction','/api/pulse-lyrics','/api/pulse-musicai-v2','/api/pulse-musicgpt']){
  assert.equal(checkBillableRoute({url:path+'?charge=1'}),null,path);
  for(const invalid of [path,path+'?charge=0',path+'?foo=bar',path+'?charge=1&foo=bar']){
   assert.equal(checkBillableRoute({url:invalid}),'CREDIT_PROTECTION_REQUIRED',invalid);
  }
 }
});
test('every active MusicGPT tool removes owner-token fields and routes paid submits via the firewall',()=>{
 const base=new URL('../source/modules/',import.meta.url);
 for(const file of ['musicgpt-lyrics.mjs','musicgpt-musicai.mjs','musicgpt-voicechanger.mjs','musicgpt-extraction.mjs']){
  const source=readFileSync(new URL(file,base),'utf8');
  assert.doesNotMatch(source,/x-pulse-owner-token|data-(?:ext|mai|lyrics|voice)-token|PRIVATE PULSE ACCESS TOKEN|PULSE OWNER ACCESS TOKEN/,file);
  assert.match(source,/\?charge=1/,file);
 }
 const api=new URL('../api/',import.meta.url);
 for(const file of ['pulse-extraction.js','pulse-lyrics.js','pulse-musicai-v2.js','pulse-musicgpt.js']){
  const source=readFileSync(new URL(file,api),'utf8');
  assert.match(source,/checkBillableRoute\(req\)/,file);
  assert.doesNotMatch(source,/PULSE_MUSICGPT_OWNER_TOKEN|x-pulse-owner-token/,file);
 }
});
