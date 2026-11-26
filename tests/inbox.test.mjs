import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {empty,save,load,withNodes,setStorageAccount,syncOperation,syncMetadata} from './.build/data.mjs';
import {bullet} from '../src/domain.mjs';
import {internalLink,noteLinks} from '../src/relations.mjs';
import {quickCapture} from '../src/quick-capture.mjs';
import {incomingShare} from '../src/android-share.mjs';
import {inboxItems,startInboxCapture,inboxDestinations,processInbox,INBOX_ID,inboxReminderId} from '../src/inbox.mjs';
const fixture=()=>withNodes(empty(),[
 bullet(INBOX_ID,{text:'My renamed inbox'}),bullet('capture',{parentId:INBOX_ID,text:'Read this https://example.com/article',position:0,formatting:'0:4:BOLD',kind:'QUESTION'}),
 bullet('child',{parentId:'capture',text:'Keep this child'}),bullet('other',{parentId:INBOX_ID,position:1,text:'Another capture'}),
 bullet('project',{position:1,text:'Project',collapsed:true}),bullet('existing',{parentId:'project',text:'Existing note'}),
]);
test('capture producers converge on the existing Inbox; blank captures use normal bullets and explicit Android bookmarks stay separate',()=>{
 let doc=fixture();doc=quickCapture(doc,'New thought').doc;
 const shared=incomingShare(doc,{schema:1,id:'12345678-1234-1234-1234-123456789abc',receivedAt:10},'https://example.com/shared');
 assert.equal(shared.doc.tables.bullets.find(n=>n.id===shared.id).parentId,INBOX_ID);
 assert.equal(shared.doc.web.androidShareReceipts['12345678-1234-1234-1234-123456789abc'].receivedAt,10);
 const started=startInboxCapture(shared.doc,'blank');assert.equal(inboxItems(started.doc).at(-1).id,'blank');
 assert.equal(started.doc.tables.bullets.filter(n=>n.id===INBOX_ID).length,1);
 assert.equal(started.doc.tables.bullets.find(n=>n.id===INBOX_ID).text,'My renamed inbox');
 const bookmark=incomingShare(started.doc,{schema:1,id:'12345678-1234-1234-1234-123456789abd',receivedAt:11},'https://example.com/bookmark','bookmark');
 assert.notEqual(bookmark.doc.tables.bullets.find(n=>n.id===bookmark.id).parentId,INBOX_ID);
 assert.equal(inboxItems(bookmark.doc).length,inboxItems(started.doc).length);
});
test('File appends the same branch, expands destination and retains attachments, provenance, links and study type',()=>{
 const before=fixture();before.tables.media=[{id:'media',bulletId:'child',fileName:'page.png',mimeType:'image/png',sourceUrl:'https://example.com/image',credit:'Keep',licenseUrl:''}];
 before.web.androidShareReceipts={receipt:{id:'capture',hash:'hash',kind:'note',receivedAt:123}};
 before.tables.bullets.push(bullet('reference',{position:2,text:internalLink(before.tables.bullets.find(n=>n.id==='capture'))}));
 const created=before.web.noteTimes.capture.createdAt,next=processInbox(before,'capture',{kind:'file',target:'project'});
 assert.equal(next.tables.bullets.find(n=>n.id==='capture').parentId,'project');
 assert.equal(next.tables.bullets.find(n=>n.id==='capture').position,1);
 assert.equal(next.tables.bullets.find(n=>n.id==='capture').kind,'QUESTION');
 assert.equal(next.tables.bullets.find(n=>n.id==='capture').formatting,'0:4:BOLD');
 assert.equal(next.tables.bullets.find(n=>n.id==='project').collapsed,false);
 assert.deepEqual(next.tables.media,before.tables.media);assert.deepEqual(next.web.androidShareReceipts,before.web.androidShareReceipts);
 assert.equal(next.web.noteTimes.capture.createdAt,created);assert.equal(next.tables.bullets.find(n=>n.id==='child').parentId,'capture');
 assert.equal(noteLinks(next.tables.bullets.find(n=>n.id==='reference').text)[0].id,'capture');
 assert.equal(inboxItems(next).length,1);
 assert.equal(processInbox(before,'capture',{kind:'file',target:null}).tables.bullets.find(n=>n.id==='capture').parentId,null);
});
test('Link adds one reference without copying either note or replacing existing children; repeated actions are harmless',()=>{
 const before=fixture(),linked=processInbox(before,'capture',{kind:'link',target:'project'},()=> 'link');
 assert.equal(linked.tables.bullets.length,before.tables.bullets.length+1);
 assert.equal(linked.tables.bullets.find(n=>n.id==='capture').parentId,INBOX_ID);
 assert.equal(linked.tables.bullets.find(n=>n.id==='link').position,1);
 assert.equal(noteLinks(linked.tables.bullets.find(n=>n.id==='link').text)[0].id,'project');
 assert.equal(processInbox(linked,'capture',{kind:'link',target:'project'}),linked);
 const task=processInbox(linked,'capture',{kind:'task'});assert.equal(task.tables.bullets.find(n=>n.id==='capture').taskState,'TODO');
 assert.equal(processInbox(task,'capture',{kind:'task'}),task);
 const done=withNodes(task,task.tables.bullets.map(n=>n.id==='capture'?{...n,taskState:'DONE'}:n));
 assert.equal(processInbox(done,'capture',{kind:'task'}),done);
});
test('Schedule creates one linked Calendar reminder; retry/reschedule preserves deadline, content and user-edited reminder details',()=>{
 let doc=fixture();doc.tables.bullets=doc.tables.bullets.map(n=>n.id==='capture'?{...n,dueDate:'2027-01-20'}:n);
 doc=processInbox(doc,'capture',{kind:'schedule',date:'2027-01-10',time:'09:30'});
 assert.equal(doc.web.calendarEvents.length,1);assert.equal(doc.web.calendarEvents[0].id,inboxReminderId('capture'));
 assert.equal(noteLinks(doc.web.calendarEvents[0].notes)[0].id,'capture');
 assert.equal(doc.tables.bullets.find(n=>n.id==='capture').dueDate,'2027-01-20');
 doc.web.calendarEvents[0].title='My edited reminder';doc.web.calendarEvents[0].notes+=' More context';
 const again=processInbox(doc,'capture',{kind:'schedule',date:'2027-01-11',time:''});
 assert.equal(again.web.calendarEvents.length,1);assert.equal(again.web.calendarEvents[0].title,'My edited reminder');
 assert.match(again.web.calendarEvents[0].notes,/More context/);assert.equal(again.web.calendarEvents[0].date,'2027-01-11');
 assert.throws(()=>processInbox(doc,'capture',{kind:'schedule',date:'2027-02-30'}));
});
test('stale items, missing destinations, descendants, Traits and mirrors cannot be processed accidentally',()=>{
 const doc=fixture();
 for(const target of ['capture','child',INBOX_ID,'missing'])assert.throws(()=>processInbox(doc,'capture',{kind:'file',target}));
 assert.throws(()=>processInbox(doc,'missing',{kind:'task'}));
 const moved=processInbox(doc,'capture',{kind:'file',target:'project'});
 assert.throws(()=>processInbox(moved,'capture',{kind:'task'}));
 const withTraits=withNodes(doc,[...doc.tables.bullets,bullet('traits',{parentId:'project',text:'Traits'}),bullet('field',{parentId:'traits',text:'Author: Jane'})]);
 assert.ok(!inboxDestinations(withTraits).some(n=>['capture','child','other',INBOX_ID,'traits','field'].includes(n.id)));
 assert.throws(()=>processInbox(withTraits,'capture',{kind:'link',target:'field'}));
 const mirror={...doc,tables:{...doc.tables,bullets:doc.tables.bullets.map(n=>n.id==='capture'?{...n,mirrorSourceId:'project',mirrorRootId:'capture'}:n)}};
 assert.throws(()=>processInbox(mirror,'capture',{kind:'task'}),/mirror source/);
});
test('processing survives normal durable save/reload, remains pending without cloud acknowledgement and stays isolated by account',async()=>{
 setStorageAccount('inbox-test-a');
 try{
  const before=await save(null,fixture());
  await syncOperation('initialize',{response:{updates:{},revision:0},doc:before,assets:[]});
  const next=processInbox(before,'capture',{kind:'file',target:'project'});await save(before,next);
  assert.equal((await load()).tables.bullets.find(n=>n.id==='capture').parentId,'project');
  assert.ok((await syncMetadata()).pending.length>0);
  setStorageAccount('inbox-test-b');assert.equal(await load(),null);
  setStorageAccount('inbox-test-a');assert.equal(inboxItems(await load()).length,1);
 }finally{setStorageAccount(null);}
});

test('offline filing and another device editing the capture converge without losing either edit',async()=>{
 const {applyDocument,mergeUpdates,projectBuckets}=await import('../src/sync-buckets.mjs');
 const seed=applyDocument(new Map(),null,fixture(),{clientID:101}),base=projectBuckets(seed.states).doc;
 const filed=processInbox(base,'capture',{kind:'file',target:'project'}),edited=structuredClone(base);
 edited.tables.bullets.find(n=>n.id==='capture').text+=' — added on phone';
 edited.tables.bullets.find(n=>n.id==='child').text+=' while offline';
 const a=applyDocument(seed.states,base,filed,{clientID:102}),b=applyDocument(seed.states,base,edited,{clientID:103});
 for(const updates of [[a.updates,b.updates],[b.updates,a.updates]]){
  let states=seed.states;for(const u of updates)states=mergeUpdates(states,u);
  const merged=projectBuckets(states).doc;
  assert.equal(merged.tables.bullets.find(n=>n.id==='capture').parentId,'project');
  assert.match(merged.tables.bullets.find(n=>n.id==='capture').text,/added on phone/);
  assert.match(merged.tables.bullets.find(n=>n.id==='child').text,/while offline/);
 }
});
