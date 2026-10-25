import {test} from 'node:test';
import assert from 'node:assert/strict';
import {eventKinds,eventOnDate,saveCalendarEvent,completeCalendarEvent,removeCalendarEvent,upcomingEvents,eventsOnDate,validateCalendarEvents,validEventDate} from '../src/calendar-events.mjs';
import {empty,archive,parseArchive,androidBlockers} from './.build/data.mjs';
const draft=(patch={})=>({title:'Reminder',kind:'exam',date:'2026-10-23',time:'',repeat:'none',leadDays:7,notes:'Details',...patch});
const event=patch=>({...draft(patch),id:patch?.id||'e',completed:patch?.completed||[]});
test('calendar recurrence keeps day anchors across short months, leap years and year boundaries',()=>{
 assert.ok(eventOnDate(event({date:'2000-02-29',repeat:'yearly'}),'2027-02-28'));
 assert.ok(eventOnDate(event({date:'2000-02-29',repeat:'yearly'}),'2028-02-29'));
 assert.equal(eventOnDate(event({date:'2000-02-29',repeat:'yearly'}),'2028-02-28'),false);
 const month=event({date:'2026-01-31',repeat:'monthly'});for(const date of ['2026-02-28','2026-03-31','2026-04-30','2027-01-31'])assert.ok(eventOnDate(month,date));
 assert.equal(eventOnDate(month,'2026-03-28'),false);assert.equal(eventOnDate(month,'2025-12-31'),false);
 assert.ok(eventOnDate(event({date:'2026-12-30',repeat:'weekly'}),'2027-01-06'));assert.equal(validEventDate('2026-02-30'),false);
});
test('rotation uses notice window, overdue priorities and completion for each occurrence',()=>{
 const events=[event({id:'birthday',title:'Birthday',kind:'birthday',repeat:'yearly',date:'1990-10-22'}),event({id:'bill',title:'Bill',kind:'bill',repeat:'monthly',date:'2026-09-20'}),event({id:'exam',title:'Exam',date:'2026-10-25'}),event({id:'far',date:'2027-10-25'})];
 let doc={web:{calendarEvents:events}};let upcoming=upcomingEvents(events,'2026-10-23');assert.deepEqual(upcoming.map(e=>e.id),['bill','exam']);assert.equal(upcoming[0].days,-3);
 doc=completeCalendarEvent(doc,'bill','2026-10-20');assert.deepEqual(upcomingEvents(doc.web.calendarEvents,'2026-10-23').map(e=>e.id),['exam']);
 assert.ok(upcomingEvents(doc.web.calendarEvents,'2026-11-18').some(e=>e.id==='bill'&&e.occurrenceDate==='2026-11-20'));
 doc=completeCalendarEvent(doc,'bill','2026-10-20');assert.ok(upcomingEvents(doc.web.calendarEvents,'2026-10-23').some(e=>e.id==='bill'));
});
test('reminders edit, persist in backups, reject invalid dates and delete without changing notes',async()=>{
 let doc=empty();doc=saveCalendarEvent(doc,draft({kind:'birthday',date:'1995-06-02',repeat:'yearly'}),()=> 'e');doc=completeCalendarEvent(doc,'e','2026-06-02');
 doc=saveCalendarEvent(doc,{...doc.web.calendarEvents[0],title:'Updated'});assert.deepEqual(doc.web.calendarEvents[0].completed,['2026-06-02']);
 const restored=await parseArchive(await archive(doc,new Map()));assert.deepEqual(restored.doc.web.calendarEvents,doc.web.calendarEvents);assert.ok(androidBlockers(doc).some(s=>s.includes('reminders')));
 assert.equal(eventsOnDate(doc.web.calendarEvents,'2027-06-02')[0].title,'Updated');const nodes=doc.tables.bullets;doc=removeCalendarEvent(doc,'e');assert.equal(doc.web.calendarEvents.length,0);assert.equal(doc.tables.bullets,nodes);
 for(const patch of [{date:'2026-02-30'},{repeat:'daily'},{time:'25:00'},{leadDays:-1},{title:''}])assert.throws(()=>saveCalendarEvent(empty(),draft(patch)),/Invalid calendar reminder/);
 assert.throws(()=>validateCalendarEvents([event({completed:['bad']})]),/Invalid/);assert.equal(eventKinds.length,11);
});
