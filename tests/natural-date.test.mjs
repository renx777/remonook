import test from 'node:test';import assert from 'node:assert/strict';
import {parseQuickTask,relativeDay,deadlineLabel,addDays} from '../src/natural-date.mjs';
const today='2026-11-27'; // a Friday
const pick=(p,keys)=>Object.fromEntries(keys.filter(k=>k in p).map(k=>[k,p[k]]));
const F=['title','scheduledDate','dueDate','taskStartTime','taskBlockMinutes','taskPriority','taskRepeat'];

test('quick add reads day, time and tags while keeping the title',()=>{
 const p=parseQuickTask('Call mom tomorrow 6pm #home',today);
 assert.deepEqual(pick(p,F),{title:'Call mom #home',scheduledDate:'2026-11-28',taskStartTime:'18:00',taskBlockMinutes:30});
 assert.deepEqual(p.chips.map(c=>c.label),['Tomorrow 18:00–18:30','home']);
});

test('durations, ranges and priorities',()=>{
 assert.deepEqual(pick(parseQuickTask('Finish physics chapter 4 today 9am for 90m !high',today),F),{title:'Finish physics chapter 4',scheduledDate:today,taskStartTime:'09:00',taskBlockMinutes:90,taskPriority:3});
 assert.deepEqual(pick(parseQuickTask('Deep work 9-10:30am',today),F),{title:'Deep work',scheduledDate:today,taskStartTime:'09:00',taskBlockMinutes:90});
 assert.deepEqual(pick(parseQuickTask('Review 14:00 for 1h 15m',today),F),{title:'Review',scheduledDate:today,taskStartTime:'14:00',taskBlockMinutes:75});
 assert.equal(parseQuickTask('Gym at 6',today).taskStartTime,'18:00');
 assert.equal(parseQuickTask('lunch at noon',today).taskStartTime,'12:00');
});

test('weekdays, next week, month names and in N days',()=>{
 assert.equal(parseQuickTask('Pay rent monday',today).scheduledDate,'2026-11-30');
 assert.equal(parseQuickTask('Pay rent fri',today).scheduledDate,'2026-12-04');
 assert.equal(parseQuickTask('Pay rent next tuesday',today).scheduledDate,'2026-12-08');
 assert.equal(parseQuickTask('Plan trip this weekend',today).scheduledDate,'2026-11-28');
 assert.equal(parseQuickTask('Clean garage weekend',today).scheduledDate,'2026-11-28');
 assert.deepEqual(pick(parseQuickTask('Plan weekend trip',today),F),{title:'Plan weekend trip'});
 assert.equal(parseQuickTask('Plan trip next week',today).scheduledDate,'2026-11-30');
 assert.equal(parseQuickTask('Renew passport 3 jan',today).scheduledDate,'2027-01-03');
 assert.equal(parseQuickTask('Renew passport dec 5',today).scheduledDate,'2026-12-05');
 assert.equal(parseQuickTask('Water plants in 3 days',today).scheduledDate,'2026-11-30');
 assert.equal(parseQuickTask('Water plants in 2 weeks',today).scheduledDate,'2026-12-11');
});

test('deadlines and repeats are separate from scheduling',()=>{
 const p=parseQuickTask('Lab report due mon',today);
 assert.deepEqual(pick(p,F),{title:'Lab report',dueDate:'2026-11-30'});
 assert.equal(p.chips[0].label,'Due Monday');
 assert.deepEqual(pick(parseQuickTask('Review flashcards every day 11am',today),F),{title:'Review flashcards',scheduledDate:today,taskStartTime:'11:00',taskBlockMinutes:30,taskRepeat:'DAILY'});
});

test('ordinary words are not mistaken for dates or priorities',()=>{
 for(const t of ['Read High Output Management','Sunday roast recipe research','Order 3 more pens','Mayday drill notes'])assert.ok(parseQuickTask(t,today).title.length>0);
 assert.equal(parseQuickTask('Read High Output Management',today).taskPriority,undefined);
 assert.equal(parseQuickTask('Order 3 more pens',today).taskStartTime,undefined);
 assert.equal(parseQuickTask('Mayday drill notes',today).scheduledDate,undefined);
 assert.equal(parseQuickTask('high',today,{bare:true}).taskPriority,3);
 assert.equal(parseQuickTask('25:00',today).taskStartTime,undefined);
 assert.equal(parseQuickTask('13pm',today).taskStartTime,undefined);
});

test('human dates never print ISO',()=>{
 assert.equal(relativeDay(today,today),'Today');
 assert.equal(relativeDay(addDays(today,1),today),'Tomorrow');
 assert.equal(relativeDay(addDays(today,-1),today),'Yesterday');
 assert.equal(relativeDay('2026-12-02',today),'Wednesday');
 assert.equal(relativeDay('2026-12-07',today),'Mon 7 Dec');
 assert.equal(relativeDay('2027-03-01',today),'1 Mar 2027');
 assert.equal(relativeDay('2026-10-01',today),'1 Oct');
 assert.equal(deadlineLabel('2026-11-25',today),'2 days late');
 assert.equal(deadlineLabel('2026-11-26',today),'1 day late');
 assert.equal(deadlineLabel(today,today),'Due today');
 assert.equal(deadlineLabel('2026-12-01',today),'Due Tuesday');
});

test('quick add creates a planned Inbox task and leaves untyped fields alone',async()=>{
 const {empty}=await import('./.build/data.mjs');const {quickAddTask,taskCatalog,taskPlan}=await import('../src/tasks.mjs');
 const {doc,id}=quickAddTask(empty(),'Call mom tomorrow 6pm #home !high',today,{id:'q1'});
 const n=doc.tables.bullets.find(b=>b.id===id),p=taskPlan(n);
 assert.equal(n.text,'Call mom #home');assert.equal(n.taskState,'TODO');assert.equal(n.parentId,'quick-capture-inbox');
 assert.equal(p.scheduledDate,'2026-11-28');assert.equal(p.taskStartTime,'18:00');assert.equal(p.taskBlockMinutes,30);assert.equal(Number(p.taskPriority),3);
 assert.equal(taskCatalog(doc,'2026-11-28').list('today').length,1);
 const plain=quickAddTask(empty(),'Pay electricity bill',today,{id:'q2',defaults:{scheduledDate:today}});
 assert.equal(taskPlan(plain.doc.tables.bullets.find(b=>b.id==='q2')).scheduledDate,today);
 assert.throws(()=>quickAddTask(empty(),'tomorrow 6pm',today),/Type what the task is/);
});
