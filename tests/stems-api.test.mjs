import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/pulse-stems.js';
function res(){return {headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;}};}
test('stems endpoint refuses requests without configuration',async()=>{
 const vars=[process.env.REPLICATE_API_TOKEN,process.env.PULSE_AI_GATE_TOKEN];
 delete process.env.REPLICATE_API_TOKEN;delete process.env.PULSE_AI_GATE_TOKEN;
 const r=res();await handler({method:'POST',headers:{},body:{action:'create'}},r);
 assert.equal(r.statusCode,503);assert.match(r.body.error,/not configured/);
 if(vars[0])process.env.REPLICATE_API_TOKEN=vars[0];if(vars[1])process.env.PULSE_AI_GATE_TOKEN=vars[1];
});
test('stems endpoint allows POST only',async()=>{
 const r=res();await handler({method:'GET',headers:{}},r);assert.equal(r.statusCode,405);
});
