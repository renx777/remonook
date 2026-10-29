import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {empty,save,load,archive,parseArchive,androidBlockers} from './.build/data.mjs';
import {defaultDashboard,dashboard,mobileWidgets,reorderMobileWidget,changeDashboard,visibleWidgets,addWidget,updateWidget,widgetLayout,packWidgets,saveDashboardLayout,addHabit,toggleHabit,habitStreak,shiftDay,timerRemaining,finishTimer,validateDashboard} from '../src/dashboard.mjs';
import {localDate} from '../src/calendar-events.mjs';
import {Y,seed,sharedState,openShared,applyIntent,project,pack,unpack} from '../src/sync-crdt.mjs';
import {mergeCloudWorkspaces} from '../src/cloud-merge.mjs';

const workspace=()=>({...empty(),web:{...empty().web,dashboard:defaultDashboard()}});
test('default dashboard is lazy, isolated and adapts its layout to desktop, tablet and phone',()=>{
 const doc=empty(),first=dashboard(doc),second=dashboard(doc);
 assert.equal(doc.web.dashboard,undefined);
 assert.notEqual(first,second);
 assert.deepEqual(visibleWidgets(first).map(w=>w.kind),['clock','focus','agenda','habits','capture']);
 for(const [bp,cols]of [['lg',12],['md',8],['sm',4]]){
  const layout=widgetLayout(visibleWidgets(first),bp);
  for(const item of layout){assert.ok(item.x+item.w<=cols);assert.ok(item.h>=3);if(bp==='sm')assert.equal(item.w,4);}
  for(const a of layout)for(const b of layout)if(a!==b)assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y);
 }
});
test('widget removal is reversible, duplicate clocks are supported, and compact layouts persist',()=>{
 let doc=addWidget(workspace(),'clock',()=> 'second-clock');
 doc=updateWidget(doc,'second-clock',{settings:{style:'analog',timezone:'Asia/Kolkata',hour12:true,seconds:false}});
 assert.equal(dashboard(doc).widgets['second-clock'].settings.style,'analog');
 doc=updateWidget(doc,'second-clock',{removed:true});assert.equal(visibleWidgets(dashboard(doc)).length,5);
 doc=updateWidget(doc,'second-clock',{removed:false});assert.equal(visibleWidgets(dashboard(doc)).length,6);
 const widgets=visibleWidgets(dashboard(doc)).reverse(),layout=packWidgets(widgets,'sm');
 doc=saveDashboardLayout(doc,'sm',layout);
 assert.equal(visibleWidgets(dashboard(doc))[0].id,'second-clock');
 assert.deepEqual(widgetLayout(visibleWidgets(dashboard(doc)),'sm').map(({i,x,y,w,h})=>({i,x,y,w,h})),layout);
 assert.throws(()=>addWidget(doc,'unknown'),/Choose a widget/);
});
test('habit check-ins track individual days, preserve history and count streaks across month boundaries',()=>{
 let doc=addHabit(workspace(),'  Practice recall  ',()=> 'recall');
 assert.equal(dashboard(doc).habits.recall.title,'Practice recall');
 const today=localDate();
 for(let i=0;i<3;i++)doc=toggleHabit(doc,'recall',shiftDay(today,-i));
 assert.equal(habitStreak(dashboard(doc),'recall',today),3);
 doc=toggleHabit(doc,'recall',today);
 assert.equal(habitStreak(dashboard(doc),'recall',today),2,'Yesterday’s streak stays alive until today is over');
 doc=toggleHabit(doc,'recall',shiftDay(today,-1));assert.equal(habitStreak(dashboard(doc),'recall',today),0);
 assert.equal(shiftDay('2026-03-01',-1),'2026-02-28');
 assert.throws(()=>toggleHabit(doc,'recall',shiftDay(today,1)),/earlier day/);
});
test('focus timer uses a persisted deadline and records completion only once after returning from a background tab',()=>{
 let doc=workspace(),now=Date.now();
 const timer={mode:'focus',running:true,endsAt:now+60000,remaining:60,duration:60,cycle:'focus-cycle'};
 doc=updateWidget(doc,'default-focus',{timer});
 assert.equal(timerRemaining(dashboard(doc).widgets['default-focus'],now+15000),45);
 assert.equal(timerRemaining(dashboard(doc).widgets['default-focus'],now+70000),0);
 doc=finishTimer(doc,'default-focus',now+70000);
 assert.equal(dashboard(doc).focusSessions['focus-cycle'].minutes,1);
 const repeated=finishTimer(doc,'default-focus',now+80000);
 assert.equal(Object.keys(dashboard(repeated).focusSessions).length,1);
 assert.equal(dashboard(repeated).widgets['default-focus'].timer.running,false);
 doc=updateWidget(doc,'default-focus',{timer:{...timer,mode:'short',cycle:'break-cycle'}});
 doc=finishTimer(doc,'default-focus',now+70000);
 assert.equal(Object.keys(dashboard(doc).focusSessions).length,1,'Breaks do not inflate focus sessions');
});
test('dashboard survives local saving and full backup; incompatible Android export is explained',async()=>{
 let doc=toggleHabit(workspace(),'habit-read',localDate());
 doc=addWidget(doc,'study',()=> 'study-widget');
 const saved=await save(null,doc,'dashboard test');
 assert.deepEqual((await load()).web.dashboard,saved.web.dashboard);
 const restored=await parseArchive(await archive(saved,new Map()));
 assert.deepEqual(restored.doc.web.dashboard,saved.web.dashboard);
 assert.ok(androidBlockers(saved).some(reason=>/Dashboard/.test(reason)));
 const bad=structuredClone(saved.web.dashboard);bad.widgets['default-clock'].layouts={sm:{x:3,y:0,w:4,h:5}};
 assert.throws(()=>validateDashboard(bad),/layout/);
});
test('concurrent widget settings, different habit days and removals converge through the existing CRDT',()=>{
 const base=workspace(),s=seed(base),state=sharedState(s),left=openShared(state),right=openShared(state);
 let a=toggleHabit(base,'habit-read',localDate());a=updateWidget(a,'default-clock',{title:'Home time'});
 let b=toggleHabit(base,'habit-break',shiftDay(localDate(),-1));b=updateWidget(b,'default-clock',{removed:true});
 applyIntent(left,base,a);applyIntent(right,base,b);
 const merged=pack(Y.mergeUpdates([unpack(sharedState(left)),unpack(sharedState(right))])),one=openShared(merged),out=project(one).doc;
 assert.equal(out.web.dashboard.widgets['default-clock'].removed,true);
 assert.equal(out.web.dashboard.widgets['default-clock'].title,'Home time');
 assert.equal(out.web.dashboard.checks['habit-read:'+localDate()],true);
 assert.equal(out.web.dashboard.checks['habit-break:'+shiftDay(localDate(),-1)],true);
 assert.deepEqual(project(one).doc,project(openShared(merged)).doc);
 for(const d of [s,left,right,one])d.destroy();
 const legacy=mergeCloudWorkspaces(base,a,b);assert.equal(legacy.ok,true);assert.equal(legacy.doc.web.dashboard.widgets['default-clock'].title,'Home time');
});

test('phone reordering stays independent, handles stale targets and preserves desktop layouts and settings',()=>{
 let doc=workspace();doc=saveDashboardLayout(doc,'lg',widgetLayout(visibleWidgets(dashboard(doc)),'lg'));
 const before=structuredClone(dashboard(doc)),from='default-clock',target='default-focus';
 doc=reorderMobileWidget(doc,from,target);
 const after=dashboard(doc);assert.equal(mobileWidgets(after)[0].id,target);assert.equal(mobileWidgets(after)[1].id,from);
 for(const [id,w] of Object.entries(before.widgets)){assert.deepEqual(after.widgets[id].layouts,w.layouts);assert.equal(after.widgets[id].order,w.order);}
 assert.deepEqual(dashboard(reorderMobileWidget(doc,from,'deleted-widget')),after);
 assert.equal(after.widgets[from].settings.timezone,before.widgets[from].settings.timezone);
 const invalid=structuredClone(after);invalid.widgets[from].settings.mobileOrder=NaN;assert.throws(()=>validateDashboard(invalid),/phone widget order/);
});
