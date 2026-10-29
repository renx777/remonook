import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {empty,withNodes,updateBulletContent,save,load,archive,parseArchive} from './.build/data.mjs';
import {bullet} from '../src/domain.mjs';
import {createMirror} from '../src/relations.mjs';
import {snapshotIndex,paneSnapshot} from '../src/outline-snapshot.mjs';

function fixture(decks=false){
 let nodes=[bullet('topic',{text:'A topic'}),bullet('q',{parentId:'topic',text:'Question?',kind:'QUESTION'}),bullet('a',{parentId:'q',text:'An answer',kind:'ANSWER'}),bullet('nested',{parentId:'a',text:'More detail'}),bullet('q2',{parentId:'topic',position:1,text:'Another question?',kind:'QUESTION'}),bullet('a2',{parentId:'q2',text:'Other answer'}),bullet('plain',{position:1,text:'Ordinary note'}),bullet('mirror',{position:2})];
 nodes=createMirror(nodes,'mirror','q').nodes;
 let doc=empty();if(decks)doc.tables.decks=[{rootId:'topic',createdAt:1,pinned:0}];
 doc=withNodes(doc,nodes);doc.tables.cards=doc.tables.cards.map(card=>({...card,repetitionCount:8,stability:13,dueAtEpochMillis:123456,lastReviewAtEpochMillis:1234}));
 return doc;
}
test('content edits match full normalization for source, answer, mirrored and deck text without changing scheduling',()=>{
 const originalNow=Date.now;Date.now=()=>1000000;
 try{
  for(const decks of [false,true])for(const id of ['plain','q','a','nested','mirror'])for(const text of ['', 'Updated answer\n日本語 café 👋']){
   const doc=fixture(decks),value={text,formatting:text?'0:7:BOLD;8:14:MASK':''};
   doc.web.studyExcludedCards=['q2'];doc.tables.cards=doc.tables.cards.map(c=>c.id==='q2'?{...c,state:'INACTIVE'}:c);
   const before=structuredClone(doc),full=withNodes(doc,doc.tables.bullets.map(n=>n.id===id?{...n,...value}:n)),fast=updateBulletContent(doc,id,value);
   assert.deepEqual(fast,full,`${id}, deck=${decks}`);assert.deepEqual(doc,before,'edit must not mutate the previous snapshot');
   for(const card of fast.tables.cards){assert.equal(card.repetitionCount,8);assert.equal(card.stability,13);assert.equal(card.dueAtEpochMillis,123456);}
  }
 }finally{Date.now=originalNow;}
});
test('unrelated typing preserves derived data and unchanged snapshots; invalid content is rejected',()=>{
 const doc=fixture(),plain=doc.tables.bullets.find(n=>n.id==='plain');
 assert.equal(updateBulletContent(doc,'plain',{text:plain.text,formatting:plain.formatting}),doc);
 assert.equal(updateBulletContent(doc,'missing',{text:'ignored',formatting:''}),doc);
 const next=updateBulletContent(doc,'plain',{text:'New text',formatting:''});
 assert.equal(next.tables.cards,doc.tables.cards);assert.equal(next.tables.media,doc.tables.media);assert.equal(next.tables.decks,doc.tables.decks);
 assert.equal(next.tables.bullets.find(n=>n.id==='a'),doc.tables.bullets.find(n=>n.id==='a'));
 assert.throws(()=>updateBulletContent(doc,'plain',{text:null,formatting:''}),/Invalid bullet content/);
});
test('fast edits survive durable saving and a full backup',async()=>{
 let doc=await save(null,fixture(),'fixture');doc=updateBulletContent(doc,'a',{text:'A saved answer',formatting:'0:7:BOLD'});doc=await save(await load(),doc,'edit');
 assert.equal((await load()).tables.bullets.find(n=>n.id==='a').text,'A saved answer');
 const restored=await parseArchive(await archive(doc,new Map()));const normalized=rows=>rows.map(({mirrorSourceId,mirrorRootId,...row})=>({...row,mirrorSourceId:mirrorSourceId||null,mirrorRootId:mirrorRootId||null}));assert.deepEqual(normalized(restored.doc.tables.bullets),normalized(doc.tables.bullets));assert.deepEqual(restored.doc.tables.cards,doc.tables.cards);
});
test('read indexes are reused per immutable snapshot and pane projection; generic structural edits get fresh models',()=>{
 const doc=fixture(),nodes=doc.tables.bullets,index=snapshotIndex(nodes);assert.equal(snapshotIndex(nodes),index);
 const collapsed={topic:true};const view=paneSnapshot(nodes,collapsed);assert.equal(paneSnapshot(nodes,collapsed),view);assert.notEqual(view,nodes);assert.equal(view.find(n=>n.id==='topic').collapsed,true);assert.equal(nodes.find(n=>n.id==='topic').collapsed,false);
 assert.equal(paneSnapshot(nodes,{}),nodes);
 const next=updateBulletContent(doc,'plain',{text:'Fresh text',formatting:''});assert.notEqual(snapshotIndex(next.tables.bullets),index);assert.equal(snapshotIndex(next.tables.bullets).byId.get('plain').text,'Fresh text');
});
