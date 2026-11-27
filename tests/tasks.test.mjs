import test from 'node:test';import assert from 'node:assert/strict';import 'fake-indexeddb/auto';
import {empty,withNodes,archive,parseArchive,androidBlockers,save,load,setStorageAccount,syncOperation,syncMetadata} from './.build/data.mjs';
import {bullet,validate,index} from '../src/domain.mjs';import {taskCatalog,taskPlan,updateTask,startTask,taskDateCounts} from '../src/tasks.mjs';
import {applyDocument,mergeUpdates,projectBuckets} from '../src/sync-buckets.mjs';import {checkRow,repairDocument} from '../src/sync-checks.mjs';import {applyTool} from '../src/mcp-tools.mjs';import {bulletVersion} from '../src/ai-markdown.mjs';
const today='2026-11-26';
const fixture=()=>withNodes(empty(),[
 bullet('quick-capture-inbox',{text:'Inbox'}),bullet('captured',{parentId:'quick-capture-inbox',taskState:'TODO',text:'Captured task'}),
 bullet('project',{position:1,text:'Project'}),bullet('plain',{parentId:'project',text:'Regular note'}),
 bullet('today',{parentId:'project',position:1,text:'Scheduled today',taskState:'TODO',scheduledDate:today}),
 bullet('late',{parentId:'project',position:2,text:'Overdue scheduled',taskState:'TODO',scheduledDate:'2026-11-25'}),
 bullet('future',{parentId:'project',position:3,text:'Next week',taskState:'TODO',scheduledDate:'2026-12-01',dueDate:'2026-12-05'}),
 bullet('any',{parentId:'project',position:4,text:'Any time',taskState:'TODO',dueDate:'2026-12-10'}),
 bullet('someday',{parentId:'project',position:5,text:'Someday',taskState:'TODO',taskPlanning:'SOMEDAY'}),
 bullet('waiting',{parentId:'project',position:6,text:'Waiting',taskState:'TODO',taskPlanning:'WAITING',dueDate:today}),
 bullet('done',{parentId:'project',position:7,text:'Finished',taskState:'DONE',dueDate:today}),
]);
const ids=xs=>xs.map(t=>t.node.id).sort();
test('legacy tasks default without a startup rewrite; deadlines and planning views have explicit semantics',()=>{
 const doc=fixture(),before=JSON.stringify(doc),c=taskCatalog(doc,today);
 assert.deepEqual(taskPlan(doc.tables.bullets.find(n=>n.id==='captured')),{scheduledDate:'',taskPlanning:'ACTIVE',taskPriority:0,taskDurationMinutes:0,taskStartTime:'',taskBlockMinutes:0,taskRepeat:'NONE',taskRepeatTemplate:'',taskRepeatSeed:''});
 assert.deepEqual(ids(c.list('today')),['late','today','waiting']);
 assert.deepEqual(ids(c.list('upcoming')),['any','future']);assert.deepEqual(ids(c.list('anytime')),['any','captured']);
 assert.deepEqual(ids(c.list('inbox')),['captured']);assert.deepEqual(ids(c.list('someday')),['someday']);assert.deepEqual(ids(c.list('waiting')),['waiting']);assert.deepEqual(ids(c.list('completed')),['done']);
 assert.equal(JSON.stringify(doc),before);assert.equal(c.tasks.find(t=>t.node.id==='today').project,'Project');
 assert.equal(taskDateCounts(doc).get(today),2);assert.equal(c.tasks.some(t=>t.node.id==='plain'),false);
});
test('planning and completion update the original bullet, preserve source text/formatting/children/deadline, and can be cleared',()=>{
 const doc=withNodes(empty(),[bullet('p',{text:'Project'}),bullet('task',{parentId:'p',text:'Learn SQL',taskState:'TODO',formatting:'0:5:BOLD',dueDate:'2026-12-10'}),bullet('child',{parentId:'task',text:'Source context'})]);
 const next=updateTask(doc,'task',{scheduledDate:today,taskPlanning:'WAITING',taskPriority:3,taskDurationMinutes:25});
 const n=next.tables.bullets.find(n=>n.id==='task');assert.equal(n.dueDate,'2026-12-10');assert.equal(n.formatting,'0:5:BOLD');assert.equal(n.text,'Learn SQL');assert.equal(next.tables.bullets.length,3);
 const done=updateTask(next,'task',{taskState:'DONE'});assert.equal(done.tables.bullets.find(n=>n.id==='task').scheduledDate,today);assert.equal(taskCatalog(done,today).list('completed').length,1);
 const cleared=updateTask(done,'task',{taskState:'TODO',scheduledDate:'',dueDate:'',taskPlanning:'ACTIVE',taskPriority:0,taskDurationMinutes:0,taskStartTime:'',taskBlockMinutes:0,taskRepeat:'NONE',taskRepeatTemplate:'',taskRepeatSeed:''});assert.equal(taskCatalog(cleared,today).list('anytime').length,1);
 assert.equal(cleared.tables.bullets.find(n=>n.id==='child').text,'Source context');
});
test('mirrors are deduplicated and edits resolve to their source; trait rows never become task results',()=>{
 let doc=fixture();doc=withNodes(doc,[...doc.tables.bullets,bullet('mirror',{parentId:'project',position:20,text:'',mirrorSourceId:'captured',mirrorRootId:'mirror'}),bullet('traits',{parentId:'project',position:21,text:'Traits'}),bullet('trait',{parentId:'traits',text:'Status: Reading',taskState:'TODO'})]);
 assert.equal(taskCatalog(doc,today).tasks.filter(t=>t.node.id==='captured').length,1);assert.ok(!taskCatalog(doc,today).tasks.some(t=>t.node.id==='trait'));
 const next=updateTask(doc,'mirror',{taskPriority:2});assert.equal(next.tables.bullets.find(n=>n.id==='captured').taskPriority,2);assert.equal(next.tables.bullets.find(n=>n.id==='mirror').taskPriority,2);
});
test('invalid planning is rejected by the shared server check; repair preserves invalid originals in recovery notes',()=>{
 const doc=fixture();for(const patch of [{scheduledDate:'2026-02-30'},{taskPlanning:'UNKNOWN'},{taskPriority:4},{taskDurationMinutes:1.5},{taskDurationMinutes:1441}]){
  assert.throws(()=>updateTask(doc,'captured',patch));assert.throws(()=>checkRow('bullets',{...doc.tables.bullets[1],...patch}));
 }
 assert.throws(()=>updateTask(doc,'missing',{taskState:'DONE'}));assert.throws(()=>updateTask(doc,'plain',{taskState:'DONE'}));
 const bad=structuredClone(doc);bad.tables.bullets.find(n=>n.id==='captured').taskPriority='bad-priority';
 const repaired=repairDocument(bad);assert.ok(repaired);assert.ok(JSON.stringify(repaired).includes('bad-priority'));validate(repaired.doc.tables.bullets);
});
test('full backup preserves optional fields and legacy rows; legacy Android export refuses to lose planning',async()=>{
 const doc=updateTask(fixture(),'captured',{scheduledDate:today,taskPriority:2,taskDurationMinutes:30});
 const restored=(await parseArchive(await archive(doc,new Map()))).doc,n=restored.tables.bullets.find(n=>n.id==='captured');
 assert.equal(n.scheduledDate,today);assert.equal(n.taskPriority,2);assert.equal(n.taskDurationMinutes,30);assert.equal(restored.tables.bullets.find(n=>n.id==='future').dueDate,'2026-12-05');
 validate(restored.tables.bullets);assert.ok(androidBlockers(doc).some(r=>/Task planning/.test(r)));await assert.rejects(()=>archive(doc,new Map(),true),/lose data/);
});
test('task creation and metadata remain durable/pending and account isolated',async()=>{
 setStorageAccount('tasks-a');try{
  const result=startTask(empty(),'new-task'),before=await save(null,result.doc);assert.equal(before.tables.bullets.find(n=>n.id==='new-task').parentId,'quick-capture-inbox');
  await syncOperation('initialize',{response:{updates:{},revision:0},doc:before,assets:[]});
  await save(before,updateTask(before,'new-task',{scheduledDate:today}));assert.equal((await load()).tables.bullets.find(n=>n.id==='new-task').scheduledDate,today);assert.ok((await syncMetadata()).pending.length);
  setStorageAccount('tasks-b');assert.equal(await load(),null);
 }finally{setStorageAccount(null);}
});
test('offline scheduling and concurrent text/completion changes converge in either delivery order, including an older client preserving unknown fields',()=>{
 const states=applyDocument(new Map(),null,fixture(),{clientID:11}).states,base=projectBuckets(states).doc;
 const plan=updateTask(base,'captured',{scheduledDate:today,taskPriority:3});const remote=structuredClone(base);remote.tables.bullets.find(n=>n.id==='captured').text+=' from another device';remote.tables.bullets.find(n=>n.id==='captured').taskState='DONE';
 const a=applyDocument(states,base,plan,{clientID:12}),b=applyDocument(states,base,remote,{clientID:13});
 for(const updates of [[a.updates,b.updates],[b.updates,a.updates]]){let merged=states;for(const u of updates)merged=mergeUpdates(merged,u);const doc=projectBuckets(merged).doc,n=doc.tables.bullets.find(n=>n.id==='captured');assert.equal(n.scheduledDate,today);assert.equal(n.taskPriority,3);assert.match(n.text,/another device/);assert.equal(n.taskState,'DONE');
  const older=structuredClone(doc);older.tables.bullets.find(n=>n.id==='captured').text+=' legacy edit';const saved=applyDocument(merged,doc,older,{clientID:14});assert.equal(projectBuckets(saved.states).doc.tables.bullets.find(n=>n.id==='captured').scheduledDate,today);
 }
});
test('MCP exposes planning and versions include changes while legacy versions stay stable',()=>{
 const legacy=bullet('legacy',{text:'A task',taskState:'TODO',dueDate:'2026-12-01'});assert.equal(bulletVersion(legacy),'1lc08nq');
 const before=fixture(),node=before.tables.bullets.find(n=>n.id==='captured');
 const r=applyTool(before,'update_note',{id:node.id,version:bulletVersion(node),scheduled_date:today,task_planning:'WAITING',task_priority:2,task_duration_minutes:20});
 const updated=r.doc.tables.bullets.find(n=>n.id===node.id);assert.equal(updated.scheduledDate,today);assert.equal(updated.taskPriority,2);assert.notEqual(bulletVersion(updated),bulletVersion(node));
 assert.throws(()=>applyTool(r.doc,'update_note',{id:node.id,version:bulletVersion(node),task_priority:1}),/changed/);
 assert.throws(()=>applyTool(before,'update_note',{id:node.id,version:bulletVersion(node),scheduled_date:'invalid'}));
});
