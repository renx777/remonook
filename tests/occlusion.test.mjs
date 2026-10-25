import test from'node:test';import assert from'node:assert/strict';
import{empty,withNodes,archive,parseArchive,androidBlockers,references}from'./.build/data.mjs';
import{bullet}from'../src/domain.mjs';import{applyOcclusion,occlusionDefinition,validateOcclusions}from'../src/occlusion.mjs';
import{scopedCards,deckTopics,newStudySession,reviewCard,saveSession}from'../src/study.mjs';
const masks=[{id:'m1',x:.1,y:.2,w:.2,h:.1,label:'Dendrites'},{id:'m2',x:.5,y:.6,w:.3,h:.2,label:'Axon'}];
const fixture=()=>{const doc=empty();doc.tables.bullets=[bullet('source',{text:'Diagram'})];doc.tables.media=[{id:'image',bulletId:'source',fileName:'diagram.png',mimeType:'image/png',sourceUrl:'',credit:'diagram.png',licenseUrl:'',displayWidth:65}];return doc;};
const apply=(doc,options={})=>{const next=applyOcclusion(doc,{mediaId:'image',title:'Anatomy',masks,mode:'all',...options},1000);return withNodes(next,next.tables.bullets);};
test('one card per region joins existing topics and retains per-card schedules when masks are edited',()=>{
 let doc=fixture();doc.tables.bullets.push(bullet('deck',{position:1,text:'Biology'}));doc.tables.decks=[{rootId:'deck',createdAt:100,layout:'TOPICS'}];doc=apply(doc,{deckId:'deck'});
 const cards=scopedCards(doc,'deck',1000);assert.equal(cards.length,2);const group=doc.web.occlusions[cards[0].id].groupId;
 assert.equal(deckTopics(doc,'deck',1000)[0].cards,2);assert.deepEqual(newStudySession(doc,'deck','NORMAL',1000,Math.random,group).queueJson,JSON.stringify(cards.map(c=>c.id)));
 const now=Date.now()+1000;let session={...newStudySession(doc,'deck','SPACED',now,()=>.99),revealed:1};doc=reviewCard(saveSession(doc,session),session,'GOOD',300,now);const scheduled=doc.tables.cards.find(c=>c.id===cards[0].id);
 doc=apply(doc,{groupId:group,deckId:'deck',masks:[{...masks[0],x:.15,label:'Edited answer'},masks[1]],mode:'one'});
 assert.equal(doc.tables.cards.find(c=>c.id===cards[0].id).dueAtEpochMillis,scheduled.dueAtEpochMillis);assert.equal(doc.tables.review_logs.length,1);assert.equal(occlusionDefinition(doc,cards[0].id).mode,'one');
 doc=withNodes(doc,[...doc.tables.bullets.map(n=>n.id===group?{...n,parentId:'wrapper'}:n),bullet('wrapper',{parentId:'deck',text:'Extra topic'})]);
 doc=apply(doc,{groupId:group,deckId:'wrapper'});assert.equal(doc.tables.bullets.find(n=>n.id===group).parentId,'wrapper');
 doc=withNodes(doc,doc.tables.bullets.map(n=>n.id===group?{...n,parentId:'deck'}:n));
 doc=apply(doc,{groupId:group,deckId:'deck',masks:[masks[1]]});assert.equal(scopedCards(doc,'deck',1000).length,1);assert.equal(scopedCards(doc,'deck',1000)[0].id,cards[1].id);assert.equal(doc.web.occlusions[cards[0].id],undefined);
});
test('image cards, shared assets, resized widths and masks round-trip through full backups',async()=>{
 let doc=apply(fixture());assert.equal(scopedCards(doc,null,1000).length,2);assert.ok(androidBlockers(doc).some(s=>s.includes('occlusion')));assert.ok(doc.columns.media.includes('displayWidth'));
 const assets=new Map([['media/diagram.png',new Blob(['picture'])]]);const restored=await parseArchive(await archive(doc,assets));assert.equal(restored.assets.size,1);assert.equal(restored.doc.tables.media[0].displayWidth,65);assert.deepEqual(Object.values(restored.doc.web.occlusions)[0].masks,masks);assert.equal(scopedCards(restored.doc,null,1000).length,2);
 doc=withNodes(doc,doc.tables.bullets.filter(n=>n.id!=='source'));assert.ok(references(doc).has('media/diagram.png'));assert.equal(scopedCards(doc,null,1000).length,2);
 const id=scopedCards(doc,null,1000)[0].id;doc={...doc,tables:{...doc.tables,media:doc.tables.media.filter(m=>m.id!==doc.web.occlusions[id].mediaId)}};assert.equal(scopedCards(doc,null,1000).length,1);
});
test('bad image regions and non-image deck destinations are rejected without changing notes',()=>{
 const doc=fixture(),before=JSON.stringify(doc);for(const patch of[{x:-.1},{w:0},{h:NaN},{x:.95,w:.2}])assert.throws(()=>apply(doc,{masks:[{...masks[0],...patch}]}),/region/);
 assert.throws(()=>validateOcclusions({bad:{masks:[],mode:'all'}}),/Invalid image/);assert.throws(()=>apply(doc,{deckId:'missing'}),/deck/);assert.equal(JSON.stringify(doc),before);
});
