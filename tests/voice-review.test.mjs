import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {aiRoute} from '../cloud/ai.mjs';
import {readLimited} from '../cloud/worker.mjs';
import {validateGradeInput,gradePrompt,validateGrade,verdict,suggestedGrade,gaveUp,quickMatch} from '../src/voice-review.mjs';

const body={question:'What are the three main types of machine learning?',points:['Supervised learning','Unsupervised learning','Reinforcement learning'],transcript:'learning with labels and without labels'};
function fixture(response={response:{covered:[1,2,7],wrong:false,feedback:'You missed reinforcement learning.'},usage:{neurons:2.3}}){
  const sql=new DatabaseSync(':memory:');sql.exec(readFileSync('cloud/ai.sql','utf8'));const calls=[];
  const env={AI_ENABLED:'true',AI_FREE_TIER_CONFIRMED:'true',DB:{prepare(q){let a=[];return {bind(...v){a=v;return this;},async first(){return sql.prepare(q).get(...a);},async run(){return sql.prepare(q).run(...a);}};}},
    AI:{async run(model,input){calls.push({model,input});if(response instanceof Error)throw response;return response;}}};
  return {env,sql,calls,close:()=>sql.close()};
}
const call=async(f,b=body)=>{const tasks=[];const r=await aiRoute(new Request('https://sync.test/ai/grade',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID(),...b})}),f.env,'alice',{readLimited,waitUntil:p=>tasks.push(p)});await Promise.all(tasks);return r;};

test('grade returns only valid covered points and settles the reservation to actual use', async()=>{
  const f=fixture();try{
    const r=await call(f);assert.equal(r.status,200);const v=await r.json();
    assert.deepEqual(v,{covered:[1,2],wrong:false,feedback:'You missed reinforcement learning.'},'point 7 does not exist');
    const input=f.calls[0].input;assert.equal(input.max_tokens,200);assert.deepEqual(input.response_format,{type:'json_object'});
    const row=f.sql.prepare('SELECT id,reserved,state FROM ai_requests').get();assert.match(row.id,/^grade:/);assert.equal(row.reserved,3);assert.equal(row.state,'succeeded');
  }finally{f.close();}
});

test('grade rejects bad input and unreadable model output', async()=>{
  const f=fixture({response:'not json'});try{
    assert.equal((await call(f,{...body,points:[]})).status,400);
    assert.equal((await call(f,{...body,transcript:''})).status,400);
    assert.equal(f.calls.length,0);
    const r=await call(f);assert.equal(r.status,502);assert.match((await r.json()).error,/grade as usual/);
  }finally{f.close();}
  const g=fixture({choices:[{message:{content:'{"covered":[3],"wrong":true,"feedback":"x"}'}}]});try{assert.deepEqual(await (await call(g)).json(),{covered:[3],wrong:true,feedback:'x'},'OpenAI-style responses are read too');}finally{g.close();}
});

test('verdict follows the ticks, and grades map from it', ()=>{
  assert.equal(verdict([1,2,3],3),'correct');assert.equal(verdict([1,2],3),'partial');assert.equal(verdict([],3),'incorrect');
  assert.equal(verdict([1,2,3],3,true),'partial','a wrong claim stops "correct"');assert.equal(verdict([1],3,true),'incorrect');assert.equal(verdict([1,2],3,true),'partial');
  assert.deepEqual(['correct','partial','incorrect'].map(suggestedGrade),['GOOD','HARD','AGAIN']);
});

test('free local checks: giving up and exact matches', ()=>{
  for(const t of ["I don't know",'skip','No idea.','','pass'])assert.ok(gaveUp(t),t);
  assert.ok(!gaveUp('I know it is Aizawl'));
  assert.deepEqual(quickMatch(['Aizawl'],'It is Aizawl.'),[1]);
  assert.deepEqual(quickMatch(['Supervised learning','Unsupervised learning','Reinforcement learning'],'supervised learning and reinforcement learning'),[1,3]);
  assert.deepEqual(quickMatch(['F = ma'],'force equals mass times acceleration'),[],'paraphrases go to the model');
});

test('prompt and limits', ()=>{
  const p=gradePrompt(validateGradeInput(body));assert.equal(p.messages.length,2);assert.match(p.messages[1].content,/1\. Supervised learning/);assert.ok(p.reserved>5&&p.reserved<30);
  assert.throws(()=>validateGradeInput({...body,points:Array(21).fill('x')}));
  assert.deepEqual(validateGrade({covered:['2',2,0,4.5],wrong:'yes',feedback:'  a  b '},3),{covered:[2],wrong:false,feedback:'a b'});
});
