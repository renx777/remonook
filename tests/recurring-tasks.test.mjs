import test from 'node:test';import assert from 'node:assert/strict';import 'fake-indexeddb/auto';
import {empty,withNodes,archive,parseArchive,save,load,setStorageAccount} from './.build/data.mjs';
import {bullet,validate} from '../src/domain.mjs';import {updateTask} from '../src/tasks.mjs';
import {nextRepeatDate,advanceRecurringTasks} from '../src/recurring-tasks.mjs';import {repeatTemplate,creationActor} from '../src/task-repeat-fields.mjs';
import {applyDocument,mergeUpdates,projectBuckets} from '../src/sync-buckets.mjs';
const base=()=>updateTask(withNodes(empty(),[bullet('task',{text:'Pay rent',formatting:'0:3:BOLD',taskState:'TODO',scheduledDate:'2026-01-31',dueDate:'2026-02-02'}),bullet('context',{parentId:'task',text:'Account details'})]),'task',{taskRepeat:'MONTHLY'});
test('recurrence uses calendar anchors and clears deadlines without copying context or study state',()=>{
 const doc=base(),t=repeatTemplate(doc.tables.bullets[0].taskRepeatTemplate);assert.equal(nextRepeatDate('2026-01-31',t),'2026-02-28');assert.equal(nextRepeatDate('2026-02-28',t),'2026-03-31');assert.equal(nextRepeatDate('2024-02-29',{...t,anchor:'2024-02-29',mode:'YEARLY'}),'2025-02-28');assert.equal(nextRepeatDate('2026-12-31',{...t,mode:'DAILY'}),'2027-01-01');
 const done=updateTask(doc,'task',{taskState:'DONE'}),next=done.tables.bullets.find(n=>n.id.startsWith('rt:')&&n.taskState==='TODO');assert.ok(next);assert.equal(next.text,'Pay rent');assert.equal(next.formatting,'0:3:BOLD');assert.equal(next.scheduledDate,'2026-02-28');assert.equal(next.dueDate,'');assert.equal(done.tables.bullets.filter(n=>n.text==='Account details').length,1);assert.equal(advanceRecurringTasks(done),done);validate(done.tables.bullets);
});
test('two offline completions and post-creation edits share initial character identities in both delivery orders',()=>{
 const doc=base(),states=applyDocument(new Map(),null,doc,{clientID:11}).states,shared=projectBuckets(states).doc;
 for(const edits of [false,true]){
 let a=updateTask(shared,'task',{taskState:'DONE'}),b=updateTask(shared,'task',{taskState:'DONE'});const id=a.tables.bullets.find(n=>n.taskState==='TODO').id;assert.equal(b.tables.bullets.find(n=>n.taskState==='TODO').id,id);
 if(edits){a=withNodes(a,a.tables.bullets.map(n=>n.id===id?{...n,text:n.text+' [A]'}:n));b=withNodes(b,b.tables.bullets.map(n=>n.id===id?{...n,text:'[B] '+n.text}:n));}
 const ua=applyDocument(states,shared,a,{clientID:12}),ub=applyDocument(states,shared,b,{clientID:13});
 for(const order of [[ua.updates,ub.updates],[ub.updates,ua.updates]]){let merged=states;for(const u of order)merged=mergeUpdates(merged,u);const d=projectBuckets(merged).doc;assert.equal(d.tables.bullets.filter(n=>n.id===id).length,1);assert.equal(d.tables.bullets.find(n=>n.id===id).text,edits?'[B] Pay rent [A]':'Pay rent');assert.equal(d.tables.bullets.length,4);validate(d.tables.bullets);}
 }
});
test('delete/undo/redo does not reseed or duplicate text, and removing a successor is respected',()=>{
 const doc=base(),states=applyDocument(new Map(),null,doc,{clientID:21}).states,shared=projectBuckets(states).doc,done=updateTask(shared,'task',{taskState:'DONE'}),a=applyDocument(states,shared,done,{clientID:21});
 const undo=applyDocument(a.states,done,shared,{clientID:21}),redo=applyDocument(undo.states,shared,done,{clientID:21}),restored=projectBuckets(redo.states).doc;assert.equal(restored.tables.bullets.filter(n=>n.text==='Pay rent').length,2);
 const removed=withNodes(done,done.tables.bullets.filter(n=>!n.id.startsWith('rt:')));assert.equal(advanceRecurringTasks(removed),removed);assert.equal(removed.tables.bullets.length,2);
});
test('templates and receipts survive backups and durable account-isolated saves; changing one occurrence does not rewrite the template',async()=>{
 const doc=base(),changed=withNodes(doc,doc.tables.bullets.map(n=>n.id==='task'?{...n,text:'Edited occurrence'}:n)),done=updateTask(changed,'task',{taskState:'DONE'});assert.equal(done.tables.bullets.find(n=>n.taskState==='TODO').text,'Pay rent');
 const parsed=(await parseArchive(await archive(done,new Map()))).doc;assert.ok(parsed.web.taskRepeatReceipts);assert.equal(parsed.tables.bullets.find(n=>n.taskState==='TODO').taskRepeat,'MONTHLY');
 try{setStorageAccount('repeat-a');await save(null,done);setStorageAccount('repeat-b');assert.equal(await load(),null);setStorageAccount('repeat-a');assert.ok((await load()).web.taskRepeatReceipts);}finally{setStorageAccount(null);}
});
test('creation actor identities are stable, distinct, and outside ordinary actor range',()=>{
 const seen=new Set();for(let i=0;i<10000;i++){const id='rt:'+i,actor=creationActor(id,'payload');assert.ok(Number.isSafeInteger(actor)&&actor>=2**52);assert.equal(actor,creationActor(id,'payload'));assert.ok(!seen.has(actor));seen.add(actor);}
});

test('duplicating or mirroring a recurring note never aliases its creation identity',()=>{
 const doc=base(),done=updateTask(doc,'task',{taskState:'DONE'}),next=done.tables.bullets.find(n=>n.taskState==='TODO');
 const copied=withNodes(done,[...done.tables.bullets,{...next,id:'copy',position:3}]),copy=copied.tables.bullets.find(n=>n.id==='copy');assert.equal(copy.taskRepeatSeed,undefined);assert.notEqual(repeatTemplate(copy.taskRepeatTemplate).id,repeatTemplate(next.taskRepeatTemplate).id);
 const mirrored=withNodes(done,[...done.tables.bullets,bullet('mirror',{mirrorSourceId:next.id,mirrorRootId:'mirror',position:5})]);assert.ok(!mirrored.tables.bullets.find(n=>n.id==='mirror').taskRepeatSeed);validate(mirrored.tables.bullets);
 const completed=updateTask(mirrored,'mirror',{taskState:'DONE'});assert.equal(completed.tables.bullets.filter(n=>n.taskState==='TODO'&&!n.mirrorSourceId).length,1);assert.equal(completed.tables.bullets.find(n=>n.taskState==='TODO'&&!n.mirrorSourceId).scheduledDate,'2026-03-31');
});

test('undo concurrent with another device editing the next task preserves their text',()=>{
 const doc=base(),states=applyDocument(new Map(),null,doc,{clientID:41}).states,shared=projectBuckets(states).doc,done=updateTask(shared,'task',{taskState:'DONE'}),created=applyDocument(states,shared,done,{clientID:42}),visible=projectBuckets(created.states).doc,id=visible.tables.bullets.find(n=>n.taskState==='TODO').id;
 const remote=withNodes(visible,visible.tables.bullets.map(n=>n.id===id?{...n,text:n.text+' remote work'}:n)),edited=applyDocument(created.states,visible,remote,{clientID:43}),undone=applyDocument(created.states,visible,shared,{clientID:44});
 for(const order of [[edited.updates,undone.updates],[undone.updates,edited.updates]]){let merged=created.states;for(const u of order)merged=mergeUpdates(merged,u);const restored=projectBuckets(merged).doc;assert.equal(restored.tables.bullets.filter(n=>n.id===id).length,1);assert.equal(restored.tables.bullets.find(n=>n.id===id).text,'Pay rent remote work');}
});

test('refreshing the next task title preserves month-end anchors; consumed occurrences point users to the next task',()=>{
 const done=updateTask(base(),'task',{taskState:'DONE'}),next=done.tables.bullets.find(n=>n.taskState==='TODO');assert.throws(()=>updateTask(done,'task',{taskRepeat:'NONE'}),/Open that next task/);
 const edited=withNodes(done,done.tables.bullets.map(n=>n.id===next.id?{...n,text:'Updated rent task'}:n)),fresh=updateTask(edited,next.id,{}, {refreshRepeat:true}),completed=updateTask(fresh,next.id,{taskState:'DONE'}),future=completed.tables.bullets.find(n=>n.taskState==='TODO');assert.equal(future.text,'Updated rent task');assert.equal(future.scheduledDate,'2026-03-31');
});
