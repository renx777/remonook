import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {aiRoute,aiStatus,audioReserve} from '../cloud/ai.mjs';
import {readLimited} from '../cloud/worker.mjs';
import {joinTranscript} from '../src/dictation-text.mjs';

function fixture(result={text:' Supervised,  unsupervised and reinforcement learning. ',transcription_info:{duration:5.93,language:'en'}}){
  const sql=new DatabaseSync(':memory:');sql.exec(readFileSync('cloud/ai.sql','utf8'));const calls=[];
  const env={AI_ENABLED:'true',AI_FREE_TIER_CONFIRMED:'true',
    DB:{prepare(q){let args=[];return {bind(...v){args=v;return this;},async first(){return sql.prepare(q).get(...args);},async run(){return sql.prepare(q).run(...args);}};}},
    AI:{async run(model,input){calls.push({model,input});if(result instanceof Error)throw result;return result;}}};
  return {env,sql,calls,close:()=>sql.close()};
}
const clip=(bytes=4000,type='audio/webm;codecs=opus',id=crypto.randomUUID())=>new Request('https://sync.test/ai/transcribe?id='+id,{method:'POST',headers:{'Content-Type':type},body:new Uint8Array(bytes).fill(7)});
const call=async(f,req)=>{const tasks=[];const r=await aiRoute(req,f.env,'alice',{readLimited,waitUntil:p=>tasks.push(p)});await Promise.all(tasks);return r;};

test('transcribe sends the audio to Whisper, settles the reservation to the measured duration and stores no audio', async()=>{
  const f=fixture();try{
    const r=await call(f,clip());assert.equal(r.status,200);const v=await r.json();
    assert.equal(v.text,'Supervised, unsupervised and reinforcement learning.');assert.equal(v.language,'en');assert.equal(v.duration,5.9);
    assert.equal(f.calls[0].model,'@cf/openai/whisper-large-v3-turbo');assert.equal(typeof f.calls[0].input.audio,'string');assert.equal(f.calls[0].input.vad_filter,true);
    const row=f.sql.prepare('SELECT * FROM ai_requests').get();
    assert.match(row.id,/^audio:/);assert.equal(row.state,'succeeded');assert.equal(row.reserved,audioReserve(5.93));
    assert.deepEqual(Object.keys(row).sort(),['created_at','day','expires_at','finished_at','id','minute','reserved','state','uid'],'only operational metadata is kept');
    assert.equal(v.remainingSeconds,(await aiStatus(f.env,'alice')).audioRemainingSeconds);
    assert.ok(v.remainingSeconds>=590&&v.remainingSeconds<600);
  }finally{f.close();}
});

test('transcribe rejects bad input before using the model', async()=>{
  const f=fixture();try{
    assert.equal((await call(f,clip(4000,'audio/webm','not-a-uuid'))).status,400);
    assert.equal((await call(f,clip(4000,'video/webm'))).status,415);
    assert.equal((await call(f,clip(10))).status,400);
    assert.equal((await call(f,clip(3*1024*1024+1))).status,413);
    f.env.AI_ENABLED='false';assert.equal((await call(f,clip())).status,503);
    assert.equal(f.calls.length,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM ai_requests').get().n,0);
  }finally{f.close();}
});

test('each account gets 10 dictation minutes a day, within the shared allowance', async()=>{
  const f=fixture({text:'long',transcription_info:{duration:120}});try{
    for(let i=0;i<5;i++)assert.equal((await call(f,clip())).status,200);
    const over=await call(f,clip());assert.equal(over.status,429);assert.equal((await over.json()).code,'audio_limit');
    assert.equal((await aiStatus(f.env,'alice')).audioRemainingSeconds,0);
    assert.equal((await aiStatus(f.env,'bob')).audioRemainingSeconds,600,'other accounts keep their minutes');
    f.sql.prepare("INSERT INTO ai_requests(uid,id,day,minute,reserved,created_at,expires_at) VALUES('x','y',?,0,7400,0,0)").run(new Date().toISOString().slice(0,10));
    const shared=await aiRoute(clip(),f.env,'bob',{readLimited});assert.equal(shared.status,429);assert.equal((await shared.json()).code,'shared_allowance');
  }finally{f.close();}
});

test('a failed transcription keeps its reservation and reports a clear error', async()=>{
  const f=fixture(new Error('upstream'));try{
    const r=await call(f,clip());assert.equal(r.status,502);assert.match((await r.json()).error,/could not be transcribed/);
    assert.equal(f.sql.prepare('SELECT state FROM ai_requests').get().state,'failed');
  }finally{f.close();}
});

test('transcript chunks join into readable text at the cursor', ()=>{
  assert.equal(joinTranscript('','hello there.'),'Hello there.');
  assert.equal(joinTranscript('Notes:','first point'),' First point');
  assert.equal(joinTranscript('Ends with space ','next'),'next');
  assert.equal(joinTranscript('Done! ','next'),'Next');
  assert.equal(joinTranscript('mid sentence','and more'),' and more');
  assert.equal(joinTranscript('x','   '),'');
});
