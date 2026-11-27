import test from 'node:test';import assert from 'node:assert/strict';
import {empty,withNodes,archive,parseArchive} from './.build/data.mjs';
import {bullet} from '../src/domain.mjs';import {updateTask,taskPlan} from '../src/tasks.mjs';
import {saveCalendarEvent,completeCalendarEvent,occurrenceComplete,upcomingEvents,validateCalendarEvents} from '../src/calendar-events.mjs';
import {applyDocument,mergeUpdates,projectBuckets} from '../src/sync-buckets.mjs';
import {dueReminders} from '../src/reminder-delivery.mjs';
const seed=()=>saveCalendarEvent(empty(),{title:'Practice',kind:'task',date:'2026-03-01',time:'02:30',repeat:'weekly',leadDays:7,notes:''},()=> 'practice');
test('concurrent recurring completions retain both days and project exactly one next occurrence',()=>{
 const doc=seed(),states=applyDocument(new Map(),null,doc,{clientID:11}).states,base=projectBuckets(states).doc;
 for(const dates of [['2026-03-01','2026-03-08'],['2026-03-08','2026-03-08']]){
 const a=applyDocument(states,base,completeCalendarEvent(base,'practice',dates[0]),{clientID:12}),b=applyDocument(states,base,completeCalendarEvent(base,'practice',dates[1]),{clientID:13});
 for(const order of [[a.updates,b.updates],[b.updates,a.updates]]){let merged=states;for(const u of order)merged=mergeUpdates(merged,u);const d=projectBuckets(merged).doc,e=d.web.calendarEvents[0];for(const date of dates)assert.ok(occurrenceComplete(e,date));assert.equal(d.web.calendarEvents.length,1);const next=upcomingEvents([e],'2026-03-08').filter(x=>x.days>=0);assert.equal(next.length,1);assert.equal(next[0].occurrenceDate,'2026-03-15');validateCalendarEvents([e]);}
 }
});
test('task blocks preserve estimates, deadlines, original identity and full backups',async()=>{
 const doc=withNodes(empty(),[bullet('t',{text:'Read',taskState:'TODO',dueDate:'2026-12-31',taskDurationMinutes:20})]);
 const next=updateTask(doc,'t',{scheduledDate:'2026-11-26',taskStartTime:'10:30',taskBlockMinutes:45}),n=next.tables.bullets[0];assert.equal(n.taskDurationMinutes,20);assert.equal(n.dueDate,'2026-12-31');assert.equal(n.id,'t');assert.equal((await parseArchive(await archive(next,new Map()))).doc.tables.bullets[0].taskBlockMinutes,45);
 assert.throws(()=>updateTask(doc,'t',{taskStartTime:'10:30'}));assert.throws(()=>updateTask(doc,'t',{taskStartTime:'24:00'}));assert.equal(taskPlan(doc.tables.bullets[0]).taskBlockMinutes,0);
});
test('wall-clock delivery catches a skipped minute, deduplicates repeated-hour identity and excludes completed or deferred work',()=>{
 const doc=seed(),at=(hour,minute)=>new Date(2026,2,8,hour,minute);
 assert.equal(dueReminders(doc,at(1,59)).length,0);const due=dueReminders(doc,at(3,0));assert.equal(due.length,1);assert.equal(due[0].key,dueReminders(doc,at(3,45))[0].key);
 assert.equal(dueReminders(completeCalendarEvent(doc,'practice','2026-03-08'),at(4,0)).length,0);
 const tasks=withNodes(doc,[bullet('t',{taskState:'TODO',scheduledDate:'2026-03-08',taskStartTime:'03:00',taskBlockMinutes:30})]);assert.equal(dueReminders(tasks,at(3,0)).length,2);assert.equal(dueReminders(updateTask(tasks,'t',{taskPlanning:'WAITING'}),at(3,0)).length,1);
});

test('actual New York DST transitions preserve the local occurrence identity',async()=>{
 const {execFileSync}=await import('node:child_process');
 const code=`import assert from 'node:assert/strict';import {dueReminders} from './src/reminder-delivery.mjs';
 const doc={web:{calendarEvents:[{id:'dst',title:'DST',date:'2026-01-01',time:'02:30',repeat:'yearly',kind:'other',completed:[]}]},tables:{bullets:[]}};
 doc.web.calendarEvents[0].date='2026-03-08';assert.equal(dueReminders(doc,new Date('2026-03-08T06:59:00Z')).length,0);assert.equal(dueReminders(doc,new Date('2026-03-08T07:00:00Z')).length,1);
 doc.web.calendarEvents[0].date='2026-11-01';doc.web.calendarEvents[0].time='01:30';assert.equal(dueReminders(doc,new Date('2026-11-01T05:30:00Z'))[0].key,dueReminders(doc,new Date('2026-11-01T06:30:00Z'))[0].key);`;
 execFileSync(process.execPath,['--input-type=module','-e',code],{env:{...process.env,TZ:'America/New_York'}});
});
