import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {aiRoute,embedReserve} from '../cloud/ai.mjs';
import {readLimited} from '../cloud/worker.mjs';
import {decodeVectors,similarity,nearest,duplicatePairs,textHash,meaningText,batches,DIMS} from '../src/meaning-core.mjs';

const unit=(seed)=>{const v=Array.from({length:DIMS},(_,i)=>Math.sin(i*seed+seed));const n=Math.hypot(...v);return v.map(x=>x/n);};
function fixture(vectorsFor=texts=>texts.map((_,i)=>unit(i+1).map(x=>x*3))){
  const sql=new DatabaseSync(':memory:');sql.exec(readFileSync('cloud/ai.sql','utf8'));const calls=[];
  const env={AI_ENABLED:'true',AI_FREE_TIER_CONFIRMED:'true',DB:{prepare(q){let args=[];return {bind(...v){args=v;return this;},async first(){return sql.prepare(q).get(...args);},async run(){return sql.prepare(q).run(...args);}};}},
    AI:{async run(model,input){calls.push({model,input});return {shape:[input.text.length,DIMS],data:vectorsFor(input.text)};}}};
  return {env,sql,calls,close:()=>sql.close()};
}
const req=body=>new Request('https://sync.test/ai/embed',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID(),...body})});
const call=async(f,body,uid='alice')=>{const tasks=[];const r=await aiRoute(req(body),f.env,uid,{readLimited,waitUntil:p=>tasks.push(p)});await Promise.all(tasks);return r;};

test('embed returns unit-length int8 vectors and keeps only a usage row', async()=>{
  const f=fixture();try{
    const r=await call(f,{texts:['Lipase breaks down fats','enzymes that digest lipids']});assert.equal(r.status,200);const v=await r.json();
    assert.equal(f.calls[0].model,'@cf/baai/bge-m3');assert.equal(v.dims,DIMS);
    const vecs=decodeVectors(v.vectors);assert.equal(vecs.length,2);
    assert.ok(Math.abs(similarity(vecs[0],vecs[0])-1)<0.02,'normalised before quantising');
    const row=f.sql.prepare('SELECT id,reserved,state FROM ai_requests').get();assert.match(row.id,/^embed:/);assert.equal(row.state,'succeeded');assert.equal(row.reserved,embedReserve(new TextEncoder().encode('Lipase breaks down fatsenzymes that digest lipids').length));
  }finally{f.close();}
});

test('embed validates input and enforces the per-account daily allowance', async()=>{
  const f=fixture();try{
    assert.equal((await call(f,{texts:[]})).status,400);
    assert.equal((await call(f,{texts:Array(65).fill('x')})).status,400);
    assert.equal((await call(f,{texts:['ok',' ']})).status,400);
    assert.equal(f.calls.length,0);
    const big=Array(48).fill('a'.repeat(650));// ~31 KB per call, 19 neurons reserved
    let status=200,n=0;while(status===200&&n<60){status=(await call(f,{texts:big})).status;n++;}
    assert.equal(status,429);assert.equal(n,22,'21 calls of 19 neurons fit in 400; the 22nd is refused');
    assert.equal((await call(f,{texts:['other account']},'bob')).status,200);
  }finally{f.close();}
});

test('nearest, duplicates and helpers', ()=>{
  const q=v=>Int8Array.from(v.map(x=>Math.round(x*127)));
  const a=q(unit(1)),b=q(unit(1).map((x,i)=>i%50===0?x*0.5:x)),c=q(unit(7));
  const hits=nearest(a,[['a',a],['b',b],['c',c]],{skip:id=>id==='a'});
  assert.equal(hits[0].id,'b');assert.ok(!hits.some(h=>h.id==='c'),'unrelated is below the threshold');
  assert.deepEqual(duplicatePairs([['a',a],['b',b],['c',c]]).map(p=>[p.a,p.b]),[['a','b']]);
  assert.equal(textHash('x'),textHash('x'));assert.notEqual(textHash('x'),textHash('y'));
  const plain=t=>t;
  assert.equal(meaningText({text:'  What is   osmosis? '},plain),'What is osmosis?');
  assert.equal(meaningText({text:'ok'},plain),'');assert.equal(meaningText({text:'1234 5678'},plain),'');
  assert.equal(meaningText({text:'const x = 1',codeLanguage:'js'},plain),'');assert.equal(meaningText({text:'mirror text',mirrorSourceId:'s'},plain),'');
  const groups=batches(Array.from({length:100},(_,i)=>({id:String(i),text:'word '.repeat(100)})));
  assert.ok(groups.every(g=>g.length<=48&&g.reduce((n,x)=>n+x.text.length,0)<=24000));assert.equal(groups.flat().length,100);
});
