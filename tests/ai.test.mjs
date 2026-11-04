import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {readFileSync} from 'node:fs';
import {aiRoute,aiPrompt,reserveAi,aiStatus} from '../cloud/ai.mjs';import {route,readLimited} from '../cloud/worker.mjs';
import {validateAiResult} from '../src/ai-contract.mjs';import {aiContext,insertAi,aiSourceChanged} from '../src/ai-assist.mjs';
import {empty,withNodes} from './.build/data.mjs';import {bullet} from '../src/domain.mjs';import {createMirror} from '../src/relations.mjs';import {studyQueue} from '../src/study.mjs';
import {registerBooks} from '../src/book-storage.mjs';
function fixture(){const sql=new DatabaseSync(':memory:');sql.exec(readFileSync('cloud/ai.sql','utf8'));const env={AI_ENABLED:'true',AI_FREE_TIER_CONFIRMED:'true',DB:{prepare(q){let args=[];return{bind(...v){args=v;return this;},async first(){return sql.prepare(q).get(...args);},async run(){return sql.prepare(q).run(...args);}};}},AI:{run(){return new ReadableStream({start(c){for(const v of [{choices:[{delta:{content:'A concise answer.'}}]},{choices:[{delta:{},finish_reason:'stop'}]}])c.enqueue(new TextEncoder().encode('data: '+JSON.stringify(v)+'\n\n'));c.close();}});}}};return {env,sql,close:()=>sql.close()};}
const input={operation:'answer',mode:'general',question:'What is learning?',context:'A question.'};
const req=(body=input)=>new Request('https://sync.test/ai/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID(),...body})});
test('AI endpoints authenticate, pause closed and stream only completed answers',async()=>{const f=fixture();try{
 await assert.rejects(route(req(),f.env),e=>e.status===401);
 const tasks=[];const response=await aiRoute(req(),f.env,'alice',{readLimited,waitUntil:p=>tasks.push(p)}),events=(await response.text()).trim().split('\n').map(JSON.parse);await Promise.all(tasks);assert.equal(events.at(-1).type,'done');assert.equal(events.at(-1).result.text,'A concise answer.');assert.equal((await aiStatus(f.env,'alice')).remaining,9);
 f.env.AI_ENABLED='false';assert.equal((await aiRoute(req(),f.env,'alice',{readLimited})).status,503);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM ai_requests').get().n,1);
}finally{f.close();}});
test('atomic quota trigger rejects duplicate, simultaneous, minute, daily and shared-budget overuse',async()=>{const f=fixture(),now=Date.UTC(2026,10,4);try{
 const id=crypto.randomUUID();await reserveAi(f.env,'a',id,140,now);await assert.rejects(reserveAi(f.env,'a',id,140,now),e=>e.status===429||e.status===409);await assert.rejects(reserveAi(f.env,'a',crypto.randomUUID(),140,now),/already running/);
 f.sql.exec("UPDATE ai_requests SET state='finished'");await reserveAi(f.env,'a',crypto.randomUUID(),140,now);f.sql.exec("UPDATE ai_requests SET state='finished'");await assert.rejects(reserveAi(f.env,'a',crypto.randomUUID(),140,now),/next minute/);
 for(let i=2;i<10;i++){await reserveAi(f.env,'a',crypto.randomUUID(),140,now+i*60000);f.sql.exec("UPDATE ai_requests SET state='finished'");}
 await assert.rejects(reserveAi(f.env,'a',crypto.randomUUID(),140,now+20*60000),/10 daily/);await reserveAi(f.env,'a',crypto.randomUUID(),140,now+86400000);
 for(let i=0;i<47;i++)await reserveAi(f.env,'other-'+i,crypto.randomUUID(),140,now);
 await assert.rejects(reserveAi(f.env,'last',crypto.randomUUID(),140,now),/shared AI allowance/);
 assert.equal((await aiStatus(f.env,'a',now+86400000)).remaining,9);
 const columns=f.sql.prepare('PRAGMA table_info(ai_requests)').all().map(c=>c.name);assert.ok(!columns.some(n=>/prompt|response|context/.test(n)));
}finally{f.close();}});
test('bounded prompts reserve maximum output and reject oversized context and fabricated citations',()=>{
 const p=aiPrompt(input);assert.ok(p.reserved>0&&p.reserved<160);assert.throws(()=>aiPrompt({...input,context:'x'.repeat(9000)}),/too large/);
 assert.throws(()=>validateAiResult('answer',{supported:true,text:'Answer',citations:[88]},[{id:1}]),/unsupported/);
 assert.throws(()=>validateAiResult('answer',{supported:true,text:'[]',citations:[]}),/explanatory answer/);
 const questionOnly=aiPrompt({...input,context:''});assert.match(questionOnly.messages[0].content,/general knowledge/);assert.doesNotMatch(questionOnly.messages[0].content,/return an empty candidates/);
 assert.throws(()=>validateAiResult('mcqs',{candidates:[{question:'Q',options:['A','a','b','c'],correct:1,explanation:'E'}]}),/four distinct/);
});
test('truncated provider streams do not become insertable and failed attempts keep their reservation',async()=>{const f=fixture();try{
 f.env.AI.run=async()=>new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'));c.close();}});
 const response=await aiRoute(req(),f.env,'alice',{readLimited}),events=(await response.text()).trim().split('\n').map(JSON.parse);assert.equal(events.at(-1).type,'error');assert.equal((await aiStatus(f.env,'alice')).remaining,9);
}finally{f.close();}});
test('note context resolves mirrors and bulk selection without including unrelated children',()=>{
 const ns=createMirror([bullet('q',{text:'Question'}),bullet('a',{parentId:'q',text:'Child'}),bullet('other',{text:'Other',position:1}),bullet('m',{position:2})],'m','q').nodes;
 assert.equal(aiContext(ns,'m').id,'q');assert.match(aiContext(ns,'q').context,/Child/);assert.doesNotMatch(aiContext(ns,'q',['q','other']).context,/Child/);
});
const draft=(operation='answer')=>({id:'source',insertedId:'accepted',query:'Q',answer:'An answer',ai:{operation,mode:'general',complete:true,context:'Question',sourceIds:['source'],sourceTexts:['Question'],selected:[0],title:'Practice',candidates:[operation==='mcqs'?{question:'Which?',options:['A','B','C','D'],correct:1,explanation:'B is correct.'}:{question:'Recall?',answer:'A fact'}]}});
test('acceptance appends once, preserves parent study type, and separates MCQs from flashcards',()=>{
 let doc=withNodes(empty(),[bullet('source',{text:'Question',kind:'QUESTION'}),bullet('old',{text:'Existing',parentId:'source'})]);const d=draft(),next=withNodes(insertAi(doc,d),insertAi(doc,d).tables.bullets);assert.equal(next.tables.bullets.find(n=>n.id==='source').kind,'QUESTION');assert.equal(next.tables.bullets.find(n=>n.id==='accepted').position,1);assert.equal(insertAi(next,d),next);
 const quizDraft=draft('mcqs'),quiz=withNodes(insertAi(doc,quizDraft),insertAi(doc,quizDraft).tables.bullets);assert.equal(quiz.web.deckTypes.accepted,'MCQ');assert.equal(quiz.web.mcqs['accepted-q0'].correctOptionId,'accepted-q0-o1');assert.ok(!studyQueue(quiz,null,'CRAM').includes('accepted-q0'));assert.ok(studyQueue(quiz,'__all_mcqs__','CRAM').includes('accepted-q0'));
 assert.equal(aiSourceChanged({...doc,tables:{...doc.tables,bullets:doc.tables.bullets.map(n=>n.id==='source'?{...n,text:'Changed'}:n)}},d.ai),true);
 assert.throws(()=>insertAi({...doc,tables:{...doc.tables,bullets:[]}},d),/no longer/);
});
test('reader acceptance captures a passage and explanation together and reuses its existing note',()=>{
 const hash='c'.repeat(64),book={id:crypto.randomUUID(),hash,title:'A book',name:'book.pdf',format:'pdf',size:3,createdAt:1,position:0,deleted:false},before=registerBooks(empty(),[book]);
 const d={...draft('explain'),id:'reader-target',ai:{...draft('explain').ai,sourceIds:[],reader:{hash,fingerprint:'d'.repeat(64),selection:{unit:0,start:0,end:7,quote:'Passage',rects:[]}}}};
 const first=insertAi(before,d),quote=Object.values(first.web.readingHighlights)[0];assert.equal(first.tables.bullets.length,3);assert.equal(first.tables.bullets.find(n=>n.id==='accepted').parentId,quote.bulletId);assert.equal(before.tables.bullets.length,0);
 const second=insertAi(first,{...d,insertedId:'accepted-again'});assert.equal(Object.keys(second.web.readingHighlights).length,1);assert.equal(second.tables.bullets.filter(n=>n.parentId===quote.bulletId).length,2);
});
test('web synthesis fails closed on search errors or zero evidence without invoking inference',async()=>{const f=fixture(),original=globalThis.fetch;let runs=0;f.env.AI.run=()=>{runs++;throw Error('Must not run');};try{
 globalThis.fetch=async()=>new Response('<rss><channel></channel></rss>');const response=await aiRoute(req({...input,mode:'web'}),f.env,'a',{readLimited});assert.equal((await response.json()).result.supported,false);assert.equal(runs,0);assert.equal((await aiStatus(f.env,'a')).remaining,10);
 globalThis.fetch=async()=>new Response('',{status:503});assert.equal((await aiRoute(req({...input,mode:'web'}),f.env,'a',{readLimited})).status,502);assert.equal(runs,0);
}finally{globalThis.fetch=original;f.close();}});
