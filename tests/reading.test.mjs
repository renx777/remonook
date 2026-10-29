import test from 'node:test';import assert from 'node:assert/strict';import {empty,archive,parseArchive} from './.build/data.mjs';
import {registerBooks} from '../src/book-storage.mjs';import {captureReadingHighlight,markReading,readingPosition,readingDoneToday,changeReadingHighlight,validateReading} from '../src/reading.mjs';
import {dashboard,saveDashboardTab,dashboardTabs,addWidget,visibleWidgets,reorderMobileWidget,mobileWidgets} from '../src/dashboard.mjs';
import {seed,sharedState,openShared,applyIntent,project,Y} from '../src/sync-crdt.mjs';
import {historyAfterSync} from '../src/cloud-model.mjs';
const hash='a'.repeat(64),fingerprint='b'.repeat(64),book={id:crypto.randomUUID(),hash,title:'A small book',name:'A small book.pdf',format:'pdf',size:1024,createdAt:1,position:0,deleted:false};
const base=()=>registerBooks(empty(),[book]);const select={unit:0,start:0,end:12,quote:'A good idea.',rects:[{x:.1,y:.1,w:.4,h:.02}]};
test('capture undo survives acknowledged row normalization; changed remote notes invalidate snapshots',()=>{
 const before=base(),captured=captureReadingHighlight(before,book,select,fingerprint,{comment:'Keep this thought'}).doc,history={undo:[before],redo:[]},y=seed(captured);
 try{
  const acknowledged=project(y).doc;
  assert.notDeepEqual(acknowledged.tables.bullets.map(n=>n.id),captured.tables.bullets.map(n=>n.id),'Projection reorders the appended comment and passage rows');
  assert.equal(historyAfterSync(history,captured,acknowledged),history);
  const redoHistory={undo:[],redo:[captured]};assert.equal(historyAfterSync(redoHistory,before,project(seed(before)).doc),redoHistory);
  const remote=structuredClone(acknowledged);remote.tables.bullets[0].text='Changed on another device';assert.deepEqual(historyAfterSync(history,captured,remote),{undo:[],redo:[]});
  const reordered=structuredClone(acknowledged);reordered.tables.bullets[0].position++;assert.deepEqual(historyAfterSync(history,captured,reordered),{undo:[],redo:[]});
 }finally{y.destroy();}
});
test('highlights append editable notes under one stable book heading with comments and duplicate protection',()=>{
 const one=captureReadingHighlight(base(),book,select,fingerprint,{comment:'My own thought'});assert.equal(one.doc.tables.bullets.length,3);const root=one.doc.tables.bullets.find(n=>n.parentId===null);assert.equal(root.text,book.title);assert.equal(one.doc.tables.bullets.find(n=>n.id===one.bulletId).parentId,root.id);assert.equal(one.doc.tables.bullets.find(n=>n.text==='My own thought').parentId,one.bulletId);
 assert.equal(captureReadingHighlight(one.doc,book,select,fingerprint).doc,one.doc);
 root.text='My renamed book notes';root.kind='QUESTION';const two=captureReadingHighlight(one.doc,book,{...select,start:20,end:32},'c'.repeat(64));assert.equal(two.doc.tables.bullets.filter(n=>n.parentId===null).length,1);assert.equal(two.doc.tables.bullets.find(n=>n.id===root.id).text,'My renamed book notes');assert.equal(two.doc.tables.bullets.find(n=>n.id===root.id).kind,'QUESTION');
 const editable=two.doc.tables.bullets.find(n=>n.id===one.bulletId);editable.text='Rewritten in my own words';const colored=changeReadingHighlight(two.doc,one.id,{color:'blue'});assert.equal(colored.tables.bullets.find(n=>n.id===one.bulletId).text,editable.text);assert.doesNotThrow(()=>validateReading(colored.web));
});
test('deleted note branches are not overwritten when capturing another passage; removing book or highlight preserves notes',()=>{
 const one=captureReadingHighlight(base(),book,select,fingerprint),root=one.doc.tables.bullets.find(n=>n.parentId===null),trashed={...one.doc,tables:{...one.doc.tables,bullets:[],trash:[{id:'trash',nodes:one.doc.tables.bullets}]}};
 const next=captureReadingHighlight(trashed,book,{...select,start:20,end:32},'c'.repeat(64));assert.notEqual(next.doc.web.readingNoteRoots[hash],root.id);assert.equal(next.doc.tables.trash[0].nodes[0].id,root.id);
 const removed=changeReadingHighlight(one.doc,one.id,{deleted:true});assert.equal(removed.tables.bullets.length,one.doc.tables.bullets.length);removed.web.readingBooks[book.id].deleted=true;assert.equal(removed.tables.bullets[1].text,select.quote);
});
test('daily reading resumes unread units across missed dates and only advances on completion',()=>{
 let doc=base();assert.equal(readingPosition(doc,book),0);doc=markReading(doc,hash,0,'2026-10-29');assert.equal(readingPosition(doc,book),1);assert.equal(readingDoneToday(doc,hash,'2026-10-30'),false);assert.equal(readingPosition(doc,book),1);assert.equal(markReading(doc,hash,0,'2026-11-02'),doc);
 doc=markReading(doc,hash,3,'2026-11-02');assert.equal(readingPosition(doc,book),1);doc=markReading(doc,hash,1,'2026-11-03');assert.equal(readingPosition(doc,book),2);doc=markReading(doc,hash,2,'2026-11-03');assert.equal(readingPosition(doc,book),4);assert.equal(readingDoneToday(doc,hash,'2026-11-03'),true);
});
test('concurrent devices converge on one book heading, preserve highlights and combine reading progress',()=>{
 const original=base(),state=sharedState(seed(original,[])),left=openShared(state),right=openShared(state);
 const a=captureReadingHighlight(markReading(original,hash,0,'2026-10-29'),book,select,fingerprint).doc,b=captureReadingHighlight(markReading(original,hash,1,'2026-10-29'),book,{...select,start:30,end:42},'c'.repeat(64)).doc;
 applyIntent(left,original,a);applyIntent(right,original,b);Y.applyUpdate(left,Y.encodeStateAsUpdate(right));Y.applyUpdate(right,Y.encodeStateAsUpdate(left));const merged=project(left).doc;assert.equal(merged.tables.bullets.filter(n=>n.parentId===null).length,1);assert.equal(Object.keys(merged.web.readingHighlights).length,2);assert.equal(readingPosition(merged,book),2);assert.deepEqual(project(right).doc,merged);left.destroy();right.destroy();
});
test('full backups preserve annotation sources and reject malformed highlight geometry',async()=>{
 const value=captureReadingHighlight(base(),book,select,fingerprint).doc;const result=await parseArchive(await archive(value,new Map()));assert.equal(result.doc.web.readingHighlights['annotation-'+fingerprint].quote,select.quote);
 assert.throws(()=>validateReading({...value.web,readingHighlights:{...value.web.readingHighlights,['annotation-'+fingerprint]:{...value.web.readingHighlights['annotation-'+fingerprint],rects:[{x:5,y:0,w:1,h:1}]}}}),/geometry/);
});
test('dashboard tabs isolate widgets, retain existing layouts, enforce limits and undo removal',()=>{
 let doc=base();const original=dashboard(doc);doc=saveDashboardTab(doc,'reading',{title:'Reading'});doc=addWidget(doc,'reading',()=> 'reader-widget','reading');assert.equal(visibleWidgets(dashboard(doc),'today').length,visibleWidgets(original).length);assert.equal(visibleWidgets(dashboard(doc),'reading').length,1);assert.equal(dashboard(doc).widgets['reader-widget'].settings.bookHash,'');
 doc=saveDashboardTab(doc,'reading',{title:'Quiet time'});assert.equal(dashboardTabs(dashboard(doc))[1].title,'Quiet time');doc=saveDashboardTab(doc,'reading',{removed:true});assert.equal(visibleWidgets(dashboard(doc)).some(w=>w.id==='reader-widget'),false);doc=saveDashboardTab(doc,'reading',{removed:false});assert.equal(visibleWidgets(dashboard(doc),'reading').length,1);
 doc=addWidget(doc,'quotes',()=> 'second','reading');const next=reorderMobileWidget(doc,'second','reader-widget','reading');assert.equal(mobileWidgets(dashboard(next),'reading')[0].id,'second');assert.deepEqual(visibleWidgets(dashboard(next),'today'),visibleWidgets(original));
 assert.throws(()=>saveDashboardTab(empty(),'today',{removed:true}),/at least one/);
});
test('reselecting a saved passage changes its color or adds a comment without replacing edited note text',()=>{
 const one=captureReadingHighlight(base(),book,select,fingerprint);one.doc.tables.bullets.find(n=>n.id===one.bulletId).text='My edited summary';
 const two=captureReadingHighlight(one.doc,book,select,fingerprint,{color:'blue',comment:'A second thought'});assert.equal(Object.keys(two.doc.web.readingHighlights).length,1);assert.equal(two.doc.tables.bullets.filter(n=>n.parentId===two.doc.web.readingNoteRoots[hash]).length,1);assert.equal(two.doc.tables.bullets.find(n=>n.id===one.bulletId).text,'My edited summary');assert.equal(two.doc.tables.bullets.find(n=>n.text==='A second thought').parentId,one.bulletId);
});
