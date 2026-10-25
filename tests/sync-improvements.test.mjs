import test from 'node:test';
import assert from 'node:assert/strict';
import {empty} from './.build/data.mjs';
import {bullet} from '../src/domain.mjs';
import {emptyWorkdays} from '../src/workdays.mjs';
import {mergeCloudWorkspaces,describeSyncConflict} from '../src/cloud-merge.mjs';
import {cloudDocument,contentKey,recoverCheckpoint,restoreDeviceState} from '../src/cloud-model.mjs';
const copy=structuredClone;
const initial=()=>{const d=empty();d.tables.bullets=[bullet('a',{text:'Alpha'}),bullet('b',{text:'Beta',position:1})];return d;};

test('old acknowledged JSON keys recover the exact baseline without guessing from current notes',()=>{
 const base=initial();base.tables.bullets[0].collapsed=true;
 const {revision,...rest}=base;const {deviceId,...web}=rest.web;
 const key=JSON.stringify({...rest,web});
 const restored=recoverCheckpoint({revision:3,key});
 assert.equal(restored.key,contentKey(base));assert.equal(restored.baseDoc.tables.bullets[0].text,'Alpha');
 const l=copy(base),r=copy(base);l.tables.bullets[0].text='Laptop';r.tables.bullets[1].text='Android';
 assert.equal(mergeCloudWorkspaces(restored.baseDoc,l,r).ok,true);
 assert.equal(recoverCheckpoint({revision:1,key:'not JSON'}).baseDoc,undefined);
 const mismatch=initial();mismatch.tables.bullets[0].text='Wrong baseline';
 assert.equal(recoverCheckpoint({revision:1,key,baseDoc:mismatch}).key,key);
});

test('collapsing notes and changing Workdays view never mark shared content as changed',()=>{
 const base=initial();base.web.workdays=emptyWorkdays();const local=copy(base);
 local.tables.bullets[0].collapsed=true;local.web.workdays.view='month';local.web.deviceId='phone';
 assert.equal(contentKey(base),contentKey(local));
 const remote=copy(base);remote.tables.bullets[1].text='New cloud text';
 const applied=restoreDeviceState(cloudDocument(remote),local);
 assert.equal(applied.tables.bullets[0].collapsed,true);assert.equal(applied.web.workdays.view,'month');
 assert.equal(applied.tables.bullets[1].text,'New cloud text');assert.equal(applied.web.deviceId,'phone');
 const shuffled={web:base.web,preferences:base.preferences,columns:base.columns,tables:base.tables,revision:base.revision};
 assert.equal(contentKey(base),contentKey(shuffled));
});

test('same bullet text and task edits merge and derived timestamps do not cause conflicts',()=>{
 const b=initial(),l=copy(b),r=copy(b);
 b.web.noteTimes={a:{createdAt:1,updatedAt:1}};l.web.noteTimes={a:{createdAt:1,updatedAt:10}};r.web.noteTimes={a:{createdAt:1,updatedAt:20}};
 l.tables.bullets[0].text='Desktop text';r.tables.bullets[0].taskState='TODO';
 const m=mergeCloudWorkspaces(b,l,r);assert.equal(m.ok,true,JSON.stringify(m.conflicts));
 assert.equal(m.doc.tables.bullets[0].text,'Desktop text');assert.equal(m.doc.tables.bullets[0].taskState,'TODO');
 assert.equal(m.doc.web.noteTimes.a.updatedAt,20);
});

test('text and formatting remain atomic; deletion and editing remain a real conflict',()=>{
 const b=initial(),l=copy(b),r=copy(b);l.tables.bullets[0].text='New';r.tables.bullets[0].formatting='offsets';
 const m=mergeCloudWorkspaces(b,l,r);assert.equal(m.ok,false);assert.match(m.conflicts[0],/text\/formatting/);
 assert.match(describeSyncConflict(m.conflicts[0],b),/Alpha.*text or formatting/);
 r.tables.bullets=r.tables.bullets.filter(n=>n.id!=='a');assert.equal(mergeCloudWorkspaces(b,l,r).ok,false);
});

test('move coordinates stay together while moving and editing text can merge',()=>{
 const b=initial(),l=copy(b),r=copy(b);l.tables.bullets[1].parentId='a';r.tables.bullets[1].text='Updated';
 assert.equal(mergeCloudWorkspaces(b,l,r).ok,true);
 r.tables.bullets[1].position=4;assert.equal(mergeCloudWorkspaces(b,l,r).ok,false);
});

test('independent Workdays dates and first-time calendar reminders merge',()=>{
 const b=initial();b.web.workdays=emptyWorkdays();const l=copy(b),r=copy(b);
 l.web.workdays.entries['2026-10-25']={plan:{status:'WFH',detail:'',updatedAt:1}};
 r.web.workdays.entries['2026-10-26']={plan:{status:'WFO',detail:'',updatedAt:2}};
 const reminder=(id,date)=>({id,date,title:id,kind:'task',time:'',repeat:'none',leadDays:1,notes:'',completed:[]});
 l.web.calendarEvents=[reminder('left','2026-10-25')];r.web.calendarEvents=[reminder('right','2026-10-26')];
 const m=mergeCloudWorkspaces(b,l,r);assert.equal(m.ok,true,JSON.stringify(m.conflicts));
 assert.equal(Object.keys(m.doc.web.workdays.entries).length,2);assert.equal(m.doc.web.calendarEvents.length,2);
 r.web.workdays.entries['2026-10-25']={plan:{status:'WFO',detail:'',updatedAt:2}};
 const conflict=mergeCloudWorkspaces(b,l,r);assert.equal(conflict.ok,false);
 assert.ok(conflict.conflicts.some(p=>describeSyncConflict(p,b).includes('2026-10-25')));
});

test('different appearance fields merge but the same setting does not silently overwrite',()=>{
 const b=initial(),l=copy(b),r=copy(b);l.preferences.appearance.font='Serif';r.preferences.appearance.size=18;
 assert.equal(mergeCloudWorkspaces(b,l,r).ok,true);
 r.preferences.appearance.font='Mono';assert.equal(mergeCloudWorkspaces(b,l,r).ok,false);
});
