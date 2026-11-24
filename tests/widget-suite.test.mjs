import test from 'node:test';
import assert from 'node:assert/strict';
import {empty} from './.build/data.mjs';
import {bullet} from '../src/domain.mjs';
import {createWidgetSnapshot} from '../src/study-widget.mjs';
import {widgetToday,widgetRhythm,widgetFocus,applyWidgetCompletion,resurfacePresentation,widgetFocusAction} from '../src/widget-suite.mjs';
import {defaultDashboard} from '../src/dashboard.mjs';
const NOW=new Date(2026,10,23,12).getTime(),DATE='2026-11-23',SCOPE='local:workspace';
function fixture(){const base=empty();return {...base,revision:1,tables:{...base.tables,bullets:[bullet('journal-'+DATE,{journalDate:DATE,text:'Monday'}),bullet('a',{parentId:'journal-'+DATE,text:'Revise Newton’s laws',taskState:'TODO'}),bullet('b',{text:'Send lab report',dueDate:DATE,taskState:'TODO'}),bullet('other',{text:'An older thought about learning from experience'})],decks:[],cards:[],review_logs:[],media:[]},web:{...base.web,dashboard:defaultDashboard(),calendarEvents:[{id:'reminder',title:'Mock test',date:DATE,time:'16:00',kind:'other',repeat:'none',leadDays:1,notes:'',completed:[]}]}};}
function intent(doc,patch={}){const item=widgetToday(doc,NOW).find(i=>i.id==='bullet:a');return {schema:1,type:'complete',id:'a616af76-a854-43d3-8a15-b4324beb16f0',scope:SCOPE,targetId:item.id,text:item.text,date:item.date,fingerprint:item.fingerprint,at:NOW,...patch};}
test('schema 4 includes bounded Today items, focus and 28 local study days',()=>{
 const doc=fixture(),s=createWidgetSnapshot(doc,SCOPE,'Workspace',NOW);
 assert.equal(s.schema,4);assert.equal(s.today.length,3);assert.equal(s.rhythm.days.length,28);assert.equal(s.focus.label,'Focus timer');
 assert.ok(s.today.some(i=>i.id==='reminder:reminder'&&i.time==='16:00'));
 for(let i=0;i<15;i++)doc.tables.bullets.push(bullet('due'+i,{text:'日'.repeat(100),dueDate:DATE}));
 const all=widgetToday(doc,NOW);assert.equal(all.length,8);assert.ok(all.every(i=>Buffer.byteLength(i.text)<=200));
});
test('completion changes the intended bullet once and preserves other content and schedules',()=>{
 const doc=fixture(),event=intent(doc),result=applyWidgetCompletion(doc,event,SCOPE,NOW);
 assert.equal(result.doc.tables.bullets.find(n=>n.id==='a').taskState,'DONE');
 assert.equal(result.doc.tables.bullets.find(n=>n.id==='b').taskState,'TODO');
 assert.deepEqual(result.doc.tables.cards,doc.tables.cards);assert.deepEqual(result.doc.tables.review_logs,doc.tables.review_logs);
 assert.equal(applyWidgetCompletion(result.doc,event,SCOPE,NOW).doc,result.doc);
 assert.equal(doc.tables.bullets.find(n=>n.id==='a').taskState,'TODO');
});
test('reminder completion is an idempotent set for its occurrence, not a toggle',()=>{
 const doc=fixture(),item=widgetToday(doc,NOW).find(i=>i.id.startsWith('reminder:'));
 const event=intent(doc,{targetId:item.id,fingerprint:item.fingerprint,text:item.text});
 const once=applyWidgetCompletion(doc,event,SCOPE,NOW).doc;
 assert.deepEqual(once.web.calendarEvents[0].completed,[DATE]);
 const twice=applyWidgetCompletion(once,{...event,id:'b616af76-a854-43d3-8a15-b4324beb16f0'},SCOPE,NOW).doc;
 assert.deepEqual(twice.web.calendarEvents[0].completed,[DATE]);
});
test('deleted or edited targets preserve the check-off as a recovery note and durable receipt',()=>{
 for(const edit of ['delete','edit']){
  const doc=fixture(),event=intent(doc);
  doc.tables.bullets=doc.tables.bullets.flatMap(n=>n.id!=='a'?[n]:edit==='delete'?[]:[{...n,text:'New question entirely'}]);
  const result=applyWidgetCompletion(doc,event,SCOPE,NOW);
  assert.equal(result.outcome,'recovered');assert.ok(result.notice);
  assert.ok(result.doc.tables.bullets.some(n=>n.text.includes('Revise Newton')));
  assert.equal(applyWidgetCompletion(result.doc,event,SCOPE,NOW).doc,result.doc);
  if(edit==='edit')assert.equal(result.doc.tables.bullets.find(n=>n.id==='a').taskState,'TODO');
 }
});
test('cross-workspace, invalid-date and malformed actions stay pending rather than being acknowledged',()=>{
 const doc=fixture();
 for(const patch of [{scope:'another'},{date:'2026-99-99'},{id:'../../bad'},{at:Infinity},{fingerprint:'bad'}])assert.throws(()=>applyWidgetCompletion(doc,intent(doc,patch),SCOPE,NOW));
 const future=applyWidgetCompletion(doc,intent(doc,{at:NOW+600000}),SCOPE,NOW);assert.equal(future.outcome,'recovered');
});
test('rhythm counts only spaced reviews in the last 28 local days, and excludes future records',()=>{
 const doc=fixture();doc.tables.review_logs=[{mode:'SPACED',reviewedAtEpochMillis:NOW},{mode:'PRACTICE',reviewedAtEpochMillis:NOW},{mode:'SPACED',reviewedAtEpochMillis:NOW+1},{mode:'SPACED',reviewedAtEpochMillis:NOW-40*86400000}];
 const r=widgetRhythm(doc,NOW);assert.equal(r.total,1);assert.equal(r.days.at(-1),1);
});
test('focus controls verify the cached session and reuse the dashboard timer',()=>{
 const doc=fixture(),f=widgetFocus(doc,NOW),start=widgetFocusAction(doc,f.id,'','start',NOW),running=widgetFocus(start,NOW);
 assert.ok(running.running);assert.equal(running.endsAt,NOW+25*60000);
 assert.equal(widgetFocusAction(start,f.id,'stale','pause',NOW),start);
 const paused=widgetFocusAction(start,f.id,running.cycle,'pause',NOW+60000);
 assert.equal(widgetFocus(paused,NOW+60000).remaining,24*60);assert.equal(widgetFocus(paused,NOW+60000).running,false);
 assert.equal(widgetFocusAction(paused,'gone','','end',NOW),paused);
});
test('resurface uses existing related-note results and observes UTF-8 budgets',()=>{
 const doc=fixture(),r=resurfacePresentation(doc,()=>[{id:'b'}],NOW);
 assert.ok(r.id);assert.ok(r.relatedText);assert.ok(Buffer.byteLength(r.text)<=240);assert.ok(Buffer.byteLength(r.path)<=120);
});


test('Today and Resurface never expose a flashcard or MCQ answer through another widget',()=>{
 const doc=fixture();doc.tables.bullets.push(bullet('private-question',{kind:'QUESTION',text:'A private question',parentId:'journal-'+DATE}),bullet('private-answer',{text:'Private study answer content to keep hidden',parentId:'private-question'}));
 assert.ok(widgetToday(doc,NOW).every(n=>!n.id.includes('private-')));
 const r=resurfacePresentation(doc,()=>[{id:'private-answer'}],NOW);
 assert.ok(!r.id.includes('private-'));assert.equal(r.relatedText,'');
});

test('offline Focus start/pause/resume/end uses causal receipts, survives clock rollback and never launches a different timer',async()=>{
 const {applyWidgetFocus,focusFingerprint,orderWidgetActions}=await import('../src/widget-suite.mjs');
 let d=fixture();const id=widgetFocus(d,NOW).id,base=focusFingerprint(d,id);
 const a={schema:1,type:'focus',id:crypto.randomUUID(),scope:SCOPE,targetId:id,action:'start',baseFingerprint:base,previousId:null,nextCycle:'native-cycle',at:NOW};
 const b={...a,id:crypto.randomUUID(),action:'pause',previousId:a.id,at:NOW+60000};
 const c={...a,id:crypto.randomUUID(),action:'start',previousId:b.id,at:NOW+59000};
 assert.deepEqual(orderWidgetActions([c,b,a]).map(x=>x.id),[a.id,b.id,c.id]);
 for(const e of orderWidgetActions([c,b,a])){const r=applyWidgetFocus(d,e,SCOPE,NOW+120000);assert.equal(r.outcome,'applied');d=r.doc;assert.equal(applyWidgetFocus(d,e,SCOPE,NOW+120000).doc,d);}
 assert.equal(widgetFocus(d,NOW+59000).cycle,'native-cycle');assert.equal(widgetFocus(d,NOW+59000).remaining,24*60);
 const end={...c,id:crypto.randomUUID(),action:'end',previousId:c.id,at:NOW+120000};d=applyWidgetFocus(d,end,SCOPE,NOW+120000).doc;
 assert.equal(widgetFocus(d,NOW+120000).running,false);assert.equal(widgetFocus(d,NOW+120000).remaining,0);
 const conflict=applyWidgetFocus(d,{...a,id:crypto.randomUUID()},SCOPE,NOW+120000);assert.equal(conflict.outcome,'recovered');assert.ok(conflict.doc.tables.bullets.some(n=>n.text.includes('Focus: start')));
 assert.throws(()=>applyWidgetFocus(d,a,'other',NOW));
});
test('native quick capture keeps newlines, appends once, retains unrelated notes and rejects wrong accounts',async()=>{
 const {applyWidgetCapture}=await import('../src/widget-suite.mjs');const d=fixture(),event={schema:1,type:'capture',id:crypto.randomUUID(),scope:SCOPE,text:'An idea\nwith a second line',at:NOW};
 const made=applyWidgetCapture(d,event,SCOPE,NOW).doc;assert.ok(made.tables.bullets.some(n=>n.text===event.text&&n.parentId==='quick-capture-inbox'));
 assert.equal(applyWidgetCapture(made,event,SCOPE,NOW).doc,made);assert.ok(made.tables.bullets.some(n=>n.id==='a'));
 assert.throws(()=>applyWidgetCapture(d,event,'another',NOW));assert.throws(()=>applyWidgetCapture(d,{...event,text:'日'.repeat(3000)},SCOPE,NOW));
});
