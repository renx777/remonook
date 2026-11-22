import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {aiRoute} from '../cloud/ai.mjs';
import {readLimited} from '../cloud/worker.mjs';
import {empty} from './.build/data.mjs';
import {bullet} from '../src/domain.mjs';
import {validatePhotoResult,insertPhotoResult,photoPrompt} from '../src/photo-notes.mjs';

const reply='```json\n{"title":"Photosynthesis","outline":"Definition\\n  Plants make glucose\\nFactors\\n  Light\\n  CO2","cards":[{"question":"Where does photosynthesis happen?","answer":"Chloroplasts"}]}\n```';
function fixture(response={response:reply,usage:{neurons:12.9}}){
  const sql=new DatabaseSync(':memory:');sql.exec(readFileSync('cloud/ai.sql','utf8'));const calls=[];
  const env={AI_ENABLED:'true',AI_FREE_TIER_CONFIRMED:'true',DB:{prepare(q){let a=[];return {bind(...v){a=v;return this;},async first(){return sql.prepare(q).get(...a);},async run(){return sql.prepare(q).run(...a);}};}},AI:{async run(model,input){calls.push({model,input});return response;}}};
  return {env,sql,calls,close:()=>sql.close()};
}
const photo=(mode='notes',type='image/jpeg',size=4000)=>new Request(`https://sync.test/ai/photo?id=${crypto.randomUUID()}&mode=${mode}`,{method:'POST',headers:{'Content-Type':type},body:new Uint8Array(size).fill(9)});
const call=async(f,r)=>{const tasks=[];const res=await aiRoute(r,f.env,'alice',{readLimited,waitUntil:p=>tasks.push(p)});await Promise.all(tasks);return res;};

test('photo is sent to Gemma as an image and returns a validated outline or cards', async()=>{
  const f=fixture();try{
    const r=await call(f,photo());assert.equal(r.status,200);assert.deepEqual(await r.json(),{title:'Photosynthesis',outline:'Definition\n  Plants make glucose\nFactors\n  Light\n  CO2'});
    const msg=f.calls[0].input.messages[0];assert.equal(f.calls[0].model,'@cf/google/gemma-4-26b-a4b-it');assert.equal(msg.content[1].type,'image_url');assert.match(msg.content[1].image_url.url,/^data:image\/jpeg;base64,/);
    const cards=await (await call(f,photo('cards'))).json();assert.equal(cards.cards.length,1);
    assert.deepEqual(f.sql.prepare('SELECT reserved,state FROM ai_requests').all().map(r=>[r.reserved,r.state]),[[16,'succeeded'],[16,'succeeded']],'settled to actual use');
  }finally{f.close();}
});

test('photo rejects bad input, empty pages and enforces the daily allowance', async()=>{
  const f=fixture({response:'{"empty":true}'});try{
    assert.equal((await call(f,photo('summary'))).status,400);
    assert.equal((await call(f,photo('notes','image/gif'))).status,415);
    assert.equal((await call(f,photo('notes','image/png',10))).status,400);
    assert.equal(f.calls.length,0);
    const r=await call(f,photo());assert.equal(r.status,422);assert.match((await r.json()).error,/No study content/);
  }finally{f.close();}
  const g=fixture({response:reply});try{let s=200,n=0;while(s===200&&n<20){s=(await call(g,photo())).status;n++;}assert.equal(s,429);assert.equal(n,9,'8 photos at the full 69-neuron reservation fit in 600');}finally{g.close();}
});

test('results are validated and inserted as one change', ()=>{
  assert.throws(()=>validatePhotoResult('notes','nonsense'),/could not be read/);
  assert.throws(()=>validatePhotoResult('cards',{title:'x',cards:[{question:'q'}]}),/No flashcards/);
  assert.match(photoPrompt('cards'),/flashcards/);assert.throws(()=>photoPrompt('x'));
  const doc=empty();doc.tables.bullets=[bullet('t',{parentId:null,position:0,text:'Biology'}),bullet('old',{parentId:'t',position:0,text:'Existing'})];
  const notes=insertPhotoResult(doc,'t',validatePhotoResult('notes',reply),'ins');
  const kids=id=>notes.tables.bullets.filter(n=>n.parentId===id).sort((a,b)=>a.position-b.position).map(n=>n.text);
  assert.deepEqual(kids('t'),['Existing','Photosynthesis']);assert.deepEqual(kids('ins'),['Definition','Factors']);assert.deepEqual(kids('ins-2'),['Light','CO2']);
  assert.equal(insertPhotoResult(notes,'t',validatePhotoResult('notes',reply),'ins'),notes,'a retry with the same identity adds nothing');
  const deck=insertPhotoResult(doc,'t',validatePhotoResult('cards',reply),'d');
  assert.equal(deck.web.deckTypes.d,'QA');assert.ok(deck.tables.decks.some(x=>x.rootId==='d'));
  assert.deepEqual(deck.tables.bullets.filter(n=>n.parentId==='d').map(n=>[n.kind,n.text]),[['QUESTION','Where does photosynthesis happen?']]);
  assert.deepEqual(deck.tables.bullets.filter(n=>n.parentId==='d-q0').map(n=>[n.kind,n.text]),[['ANSWER','Chloroplasts']]);
});
