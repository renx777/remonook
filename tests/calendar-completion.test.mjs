import test from 'node:test';import assert from 'node:assert/strict';
import {empty,withNodes,archive,parseArchive} from './.build/data.mjs';import {bullet} from '../src/domain.mjs';
import {saveCalendarEvent,eventOnDate,upcomingEvents,completeCalendarEvent,validateCalendarEvents} from '../src/calendar-events.mjs';
import {wallTime,zoneParts,reminderSchedule,reminderFieldsChanged} from '../src/reminder-schedule.mjs';
import {timelineLayout,timelineItems,changeTimelineItem} from '../src/calendar-timeline.mjs';
const event=(doc=empty())=>saveCalendarEvent(doc,{title:'Daily review',kind:'task',date:'2026-11-01',time:'09:00',repeat:'daily',leadDays:1,notes:''},()=> 'daily');
test('daily reminders retain compatible enums, per-date completion and backups',async()=>{
 let doc=event();const e=doc.web.calendarEvents[0];assert.equal(e.repeat,'none');assert.equal(e.daily,true);assert.equal(eventOnDate(e,'2026-11-27'),true);assert.equal(eventOnDate(e,'2026-10-31'),false);validateCalendarEvents(doc.web.calendarEvents);
 doc=completeCalendarEvent(doc,'daily','2026-11-27');assert.equal(doc.web.calendarEvents[0].completions['2026-11-27'],true);assert.ok(upcomingEvents(doc.web.calendarEvents,'2026-11-27').some(e=>e.occurrenceDate==='2026-11-28'));
 const copy=(await parseArchive(await archive(doc,new Map()))).doc;assert.equal(copy.web.calendarEvents[0].daily,true);assert.equal(copy.web.calendarEvents[0].completions['2026-11-27'],true);
 const stopped=saveCalendarEvent(copy,{...copy.web.calendarEvents[0],daily:false,repeat:'none'});assert.equal(eventOnDate(stopped.web.calendarEvents[0],'2026-11-28'),false);
 assert.throws(()=>validateCalendarEvents([{...e,daily:'true'}]),/Invalid/);assert.throws(()=>validateCalendarEvents([{...e,daily:true,repeat:'weekly'}]),/Invalid/);
});
test('IANA schedules handle skipped and repeated minutes and different hemispheres',()=>{
 assert.equal(new Date(wallTime('2026-03-08','02:30','America/New_York')).toISOString(),'2026-03-08T07:00:00.000Z');
 assert.equal(new Date(wallTime('2026-11-01','01:30','America/New_York')).toISOString(),'2026-11-01T05:30:00.000Z');
 assert.equal(new Date(wallTime('2026-10-04','02:15','Australia/Sydney')).toISOString(),'2026-10-03T16:00:00.000Z');
 assert.equal(new Date(wallTime('2026-11-27','09:00','Asia/Kolkata')).toISOString(),'2026-11-27T03:30:00.000Z');
 assert.equal(zoneParts(Date.parse('2026-11-27T03:30Z'),'Asia/Kolkata').date,'2026-11-27');assert.throws(()=>wallTime('2026-11-27','09:00','Invalid/Zone'));
});
test('schedule catches up today only, respects receipts and source completion, and finds next wake',()=>{
 let doc=event(),now=Date.parse('2026-11-27T10:00Z'),plan=reminderSchedule(doc,'UTC',now);assert.equal(plan.due.length,1);assert.equal(plan.next,Date.parse('2026-11-28T00:00:01Z'));
 assert.equal(reminderSchedule(doc,'UTC',now,new Set(plan.due.map(i=>i.key))).due.length,0);doc=completeCalendarEvent(doc,'daily','2026-11-27');assert.equal(reminderSchedule(doc,'UTC',now).due.length,0);
 const tomorrow=reminderSchedule(doc,'UTC',Date.parse('2026-11-28T08:00Z'));assert.equal(tomorrow.next,Date.parse('2026-11-28T09:00Z'));
});
test('timeline uses collision lanes and commits only chosen fields against current notes',()=>{
 let doc=withNodes(event(),[bullet('a',{text:'Task A',taskState:'TODO',scheduledDate:'2026-11-27',taskStartTime:'09:00',taskBlockMinutes:60}),bullet('b',{text:'Task B',taskState:'TODO',scheduledDate:'2026-11-27',taskStartTime:'09:30',taskBlockMinutes:30})]);
 const items=timelineItems(doc,'2026-11-27'),layout=timelineLayout(items);assert.equal(layout.length,3);assert.equal(new Set(layout.map(i=>i.lane)).size,3);assert.ok(layout.every(i=>i.lanes===3));
 const task=items.find(i=>i.source==='a');doc=withNodes(doc,doc.tables.bullets.map(n=>n.id==='a'?{...n,text:'Remote title'}:n));const changed=changeTimelineItem(doc,task,{time:'10:00',minutes:45});assert.equal(changed.tables.bullets[0].text,'Remote title');assert.equal(changed.tables.bullets[0].taskStartTime,'10:00');assert.equal(changed.tables.bullets[0].taskBlockMinutes,45);
 const reminder=items.find(i=>i.type==='event'),moved=changeTimelineItem(changed,reminder,{time:'11:00'});assert.equal(moved.web.calendarEvents[0].date,'2026-11-01');assert.equal(moved.web.calendarEvents[0].daily,true);
 assert.throws(()=>changeTimelineItem(withNodes(doc,[]),task,{time:'11:00'}),/no longer|removed|exists/);
 const parts=rows=>({rows:rows.map(n=>({key:n.id,table:'bullets',row:n})),rootFields:[]});assert.equal(reminderFieldsChanged(parts(doc.tables.bullets),parts(doc.tables.bullets.map(n=>({...n,text:n.text+' x',position:9})))),false);assert.equal(reminderFieldsChanged(parts(doc.tables.bullets),parts(changed.tables.bullets)),true);
});
