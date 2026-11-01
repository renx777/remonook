import {test} from 'node:test';import assert from 'node:assert/strict';import 'fake-indexeddb/auto';
import {empty,withNodes,save,load,archive,parseArchive} from './.build/data.mjs';
import {bullet} from '../src/domain.mjs';import {newStudySession,reviewCard} from '../src/study.mjs';import {readFsrs} from '../src/fsrs-scheduler.mjs';
import {seed,sharedState,openShared,applyIntent,project,Y} from '../src/sync-crdt.mjs';
const now=Date.UTC(2026,10,1,12);
// Card creation and the historical review fixture must use the same clock.
test.mock.method(Date,'now',()=>now);
function initial(){let d=withNodes(empty(),[bullet('q',{kind:'QUESTION',text:'Q'}),bullet('a',{parentId:'q',text:'A'})]);Object.assign(d.preferences.study_preferences,{fsrsRetention:.93,fsrsMaximumInterval:1000});return d;}
const review=(d,grade,at=now)=>reviewCard(d,{...newStudySession(d,null,'SPACED',at),revealed:1},grade,500,at);
test('FSRS state, review snapshots and retention survive durable reload and a full archive round trip',async()=>{
 const d=review(initial(),'GOOD');const stored=await save(await load(),d,'review');assert.ok(readFsrs((await load()).tables.cards[0]));const file=await archive(stored,new Map());const restored=await parseArchive(file);assert.deepEqual(restored.doc.tables.cards,stored.tables.cards);assert.deepEqual(restored.doc.tables.review_logs,stored.tables.review_logs);assert.deepEqual(restored.doc.preferences.study_preferences,{mode:"NORMAL",fsrsRetention:.93,fsrsMaximumInterval:1000});
 const again=review(restored.doc,'GOOD',restored.doc.tables.cards[0].dueAtEpochMillis);assert.equal(readFsrs(again.tables.cards[0]).reps,2);
});
test('two offline reviews retain both history records and converge through the existing CRDT protocol',()=>{
 const base=initial(),a=review(base,'AGAIN'),b=review(base,'GOOD'),state=seed(base),one=openShared(sharedState(state)),two=openShared(sharedState(state));
 try{applyIntent(one,base,a);applyIntent(two,base,b);const u1=Y.encodeStateAsUpdate(one),u2=Y.encodeStateAsUpdate(two);Y.applyUpdate(one,u2);Y.applyUpdate(two,u1);const x=project(one).doc,y=project(two).doc;assert.deepEqual(x,y);assert.equal(x.tables.review_logs.length,2);assert.equal(new Set(x.tables.review_logs.map(l=>l.id)).size,2);assert.ok(readFsrs(x.tables.cards[0]));assert.equal(x.tables.cards[0].dueAtEpochMillis,readFsrs(x.tables.cards[0]).dueAt.getTime());}
 finally{state.destroy();one.destroy();two.destroy();}
});
