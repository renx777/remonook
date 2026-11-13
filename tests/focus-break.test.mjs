import test from 'node:test';
import assert from 'node:assert/strict';
import {empty} from './.build/data.mjs';
import {defaultDashboard,dashboard,updateWidget,validateDashboard} from '../src/dashboard.mjs';
import {endTimer,runningBreak,todayStats,dayBaseline} from '../src/focus-break.mjs';
import {bullet} from '../src/domain.mjs';

const workspace=()=>({...empty(),web:{...empty().web,dashboard:defaultDashboard()}});
const focus=(doc,endsAt,cycle='c1')=>updateWidget(doc,'default-focus',{timer:{mode:'focus',running:true,endsAt,remaining:1500,duration:1500,cycle}});

test('a finished focus session starts the break, which covers the app until it ends',()=>{
 const t0=Date.UTC(2026,10,13,9,0,0);
 let doc=endTimer(focus(workspace(),t0),'default-focus',t0+1000);
 const timer=dashboard(doc).widgets['default-focus'].timer;
 assert.equal(timer.mode,'short');assert.equal(timer.running,true);assert.equal(timer.endsAt,t0+300000,'the break runs from when focus ended');
 assert.equal(Object.keys(dashboard(doc).focusSessions).length,1,'the focus session is recorded');
 validateDashboard(dashboard(doc));
 assert.ok(runningBreak(doc,t0+60000));assert.equal(runningBreak(doc,t0+300000),null);
 doc=endTimer(doc,'default-focus',t0+300000);
 const ready=dashboard(doc).widgets['default-focus'].timer;
 assert.deepEqual([ready.mode,ready.running,ready.remaining],['focus',false,1500],'after the break the timer waits for the next focus session');
 assert.equal(Object.keys(dashboard(doc).focusSessions).length,1,'breaks are not focus sessions');
});

test('every fourth focus session of the day earns a long break; a break already over is skipped',()=>{
 const t0=Date.UTC(2026,10,13,9,0,0);let doc=workspace();
 for(let i=0;i<4;i++){doc=focus(doc,t0+i*60000,'c'+i);doc=endTimer(doc,'default-focus',t0+i*60000+1);if(i<3)doc=endTimer(doc,'default-focus',t0+i*60000+3600000);}
 assert.equal(dashboard(doc).widgets['default-focus'].timer.mode,'long');
 let late=endTimer(focus(workspace(),t0),'default-focus',t0+3600000);
 assert.equal(runningBreak(late,t0+3600000),null,'coming back after the break would have ended shows no break screen');
});

test('today on the break screen: focus, new bullets since the day began, cards, pages, saved articles, tasks',()=>{
 const now=Date.now(),today=new Date(now),day=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
 const store=new Map(),storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
 let doc=workspace();doc.tables.bullets=[bullet('old',{text:'Before'})];
 const base=dayBaseline('acct',doc.tables.bullets.map(n=>n.id),now,storage);
 doc.tables.bullets=[...doc.tables.bullets,bullet('new',{text:'Written today'}),bullet('blank',{text:''}),bullet('task',{text:'Do it',dueDate:day,taskState:'DONE'})];
 doc.tables.cards=[{id:'k',lastReviewAtEpochMillis:now},{id:'k2',lastReviewAtEpochMillis:0}];
 doc.web.readingProgress={['a'.repeat(64)]:{base:0,units:{0:day,1:day,2:'2020-01-01'}}};
 doc.web.bookmarks={b:{id:'b',createdAt:now},c:{id:'c',createdAt:now,deleted:true}};
 doc=endTimer(focus(doc,now-1000),'default-focus',now);
 const s=todayStats(doc,{baseline:dayBaseline('acct',[],now,storage),now});
 assert.deepEqual(s,{focusSessions:1,focusMinutes:25,bullets:2,cards:1,pages:2,saved:1,tasksDone:1,tasks:1});
 assert.equal(base.size,1);assert.equal(todayStats(doc,{now}).bullets,null,'without a baseline the count is left out, not guessed');
});

import {breakExtras} from '../src/focus-break.mjs';
test('break screen extras: open to-dos (overdue first), coming reminders, and your own quote',()=>{
 const doc=workspace(),today='2026-11-13';
 doc.tables.bullets=[bullet('a',{text:'Later thing',taskState:'TODO'}),bullet('b',{text:'Late <b>report</b> #work',taskState:'TODO',dueDate:'2026-11-10'}),bullet('c',{text:'Done one',taskState:'DONE'}),bullet('d',{text:'Due today',taskState:'TODO',dueDate:today}),bullet('q',{text:'Stay hungry #quote\n— Someone'})];
 doc.web.calendarEvents=[{id:'e1',kind:'bill',title:'Rent',date:'2026-11-14',time:'',repeat:'none',leadDays:3,countdown:false,completed:[]}];
 const x=breakExtras(doc,{today,seed:'cycle-1'});
 assert.deepEqual(x.todos.map(t=>[t.text,t.when]),[['Late report','Overdue'],['Due today','Today'],['Later thing','']]);
 assert.equal(x.openTodos,3);
 assert.deepEqual(x.reminders.map(r=>[r.title,r.when]),[['Rent','Tomorrow']]);
 assert.equal(x.quote.text,'Stay hungry');assert.equal(x.quote.author,'Someone');
 assert.deepEqual(breakExtras(doc,{today,seed:'cycle-1'}).quote,x.quote,'the same quote for the whole break');
 const library=breakExtras({...doc,tables:{...doc.tables,bullets:[]}},{today,seed:'x'});
 assert.equal(library.quote.source,'library','without quotes of your own, the library');
});

test('focus widget: ending a break early can be turned off, and old data stays valid',()=>{
 let doc=workspace();const w=dashboard(doc).widgets['default-focus'];
 doc=updateWidget(doc,'default-focus',{settings:{...w.settings,breakSkip:false}});
 validateDashboard(dashboard(doc));
 assert.throws(()=>validateDashboard({...dashboard(doc),widgets:{...dashboard(doc).widgets,'default-focus':{...w,settings:{...w.settings,breakSkip:'no'}}}}),/focus timer settings/);
});
