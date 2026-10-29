import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import {validPromo} from '../api/access.js';
import {compareStripeSignature} from '../api/_pulse.js';

test('the only supported discount code is FREEFOREVER',()=>{
  for(const code of ['FREEFOREVER','freeforever',' FREEFOREVER ']) assert.equal(validPromo(code),true);
  for(const code of ['FREE','FREE50','FREEFOREVER1','FREEFOREVER;','',null,123])assert.equal(validPromo(code),false);
});
test('webhook signature validation rejects tampering and stale timestamps',()=>{
  const body=Buffer.from('{"event":"ok"}');const now=Math.floor(Date.now()/1000);const secret='whsec_test';
  const sign=(time,buf)=>`t=${time},v1=${createHmac('sha256',secret).update(`${time}.${buf.toString()}`).digest('hex')}`;
  assert.equal(compareStripeSignature(body,sign(now,body),secret),true);
  assert.equal(compareStripeSignature(Buffer.from('tampered'),sign(now,body),secret),false);
  assert.equal(compareStripeSignature(body,sign(now-400,body),secret),false);
});
test('the public entry contains no DSP bundle, and the private entry does',()=>{
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const studio=readFileSync(new URL('../private/studio.html',import.meta.url),'utf8');
  assert.match(html,/id="promo-form"/);
  assert.match(html,/Lifetime Access/);
  assert.doesNotMatch(html,/function initStudioTools|PULSE STUDIO \/ producer toolkit/);
  assert.match(studio,/initStudioTools\(/);
  assert.match(studio,/<base href="\/">/);
});
test('deploy configuration excludes studio from public directory',()=>{
 const vercel=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.equal(vercel.outputDirectory,'public');
 assert.equal(vercel.functions['api/studio.js'].includeFiles,'private/studio.html');
});
