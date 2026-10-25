import {test} from 'node:test';
import assert from 'node:assert/strict';
import {empty,withNodes,archive,parseArchive,androidBlockers} from './.build/data.mjs';
import {bullet} from '../src/domain.mjs';
import {saveStudyFolder,studyFolders,moveStudyDeck,deckFolder,deleteStudyFolder,deleteStudyDeck,deckDeletionPlan,enableStudyBranch} from '../src/study-library.mjs';
import {scopedCards,newStudySession} from '../src/study.mjs';
import {configureMcqBranch} from '../src/mcq.mjs';
import {applyOcclusion} from '../src/occlusion.mjs';
function fixture(){
 let doc=empty();doc.tables.decks=[{rootId:'d',layout:'FLAT',createdAt:1,pinned:0},{rootId:'other',layout:'FLAT',createdAt:1,pinned:0}];
 return withNodes(doc,[bullet('d',{text:'ML'}),bullet('q',{parentId:'d',text:'Question',kind:'QUESTION'}),bullet('a',{parentId:'q',text:'Answer'}),bullet('other',{text:'Other'}),bullet('oq',{parentId:'other',text:'Other question',kind:'QUESTION'}),bullet('oa',{parentId:'oq',text:'Other answer'})]);
}
test('folders persist across full backup; moving and deleting folders preserves source and review state',async()=>{
 let doc=fixture();const original=structuredClone(doc.tables);
 doc=saveStudyFolder(doc,{name:'  Learning ',color:'pink'},()=> 'f');doc=moveStudyDeck(doc,'d','f');
 assert.equal(studyFolders(doc)[0].name,'Learning');assert.equal(deckFolder(doc,'d'),'f');assert.deepEqual(doc.tables,original);
 const restored=await parseArchive(await archive(doc,new Map()));assert.equal(deckFolder(restored.doc,'d'),'f');assert.equal(studyFolders(restored.doc)[0].color,'pink');
 assert.ok(androidBlockers(doc).some(s=>s.includes('Study folders')));
 doc=saveStudyFolder(doc,{id:'f',name:'AI',color:'yellow'});assert.equal(studyFolders(doc)[0].name,'AI');
 doc=deleteStudyFolder(doc,'f');assert.equal(deckFolder(doc,'d'),null);assert.deepEqual(doc.tables,original);
 assert.throws(()=>moveStudyDeck(doc,'d','missing'),/no longer exists/);assert.throws(()=>saveStudyFolder(doc,{name:' '}),/name/);
});
test('deck-only deletion keeps exact notes and MCQ/image configuration; cards do not regenerate on edits or reload',async()=>{
 let doc=fixture();doc.web.mcqs={orphan:{example:'kept'}};doc.web.occlusions={};
 doc.tables.study_sessions=[newStudySession(doc,'d','NORMAL')];
 const nodes=structuredClone(doc.tables.bullets),logs=structuredClone(doc.tables.review_logs),other=doc.tables.cards.find(c=>c.id==='oq');
 doc=deleteStudyDeck(doc,'d');assert.deepEqual(doc.tables.bullets,nodes);assert.deepEqual(doc.tables.review_logs,logs);assert.deepEqual(doc.web.mcqs,{orphan:{example:'kept'}});assert.equal(doc.tables.study_sessions.length,0);
 doc=withNodes(doc,doc.tables.bullets.map(n=>n.id==='a'?{...n,text:'Updated answer'}:n));
 assert.ok(!scopedCards(doc).some(c=>c.id==='q'));assert.deepEqual(doc.tables.cards.find(c=>c.id==='oq'),other);assert.equal(doc.tables.trash.length,0);
 const restored=await parseArchive(await archive(doc,new Map()));assert.ok(!scopedCards(withNodes(restored.doc,restored.doc.tables.bullets)).some(c=>c.id==='q'));
 const recreated=enableStudyBranch({...doc,tables:{...doc.tables,decks:[...doc.tables.decks,{rootId:'d'}]}},'d');
 assert.ok(scopedCards(withNodes(recreated,recreated.tables.bullets)).some(c=>c.id==='q'));
});
test('deleting parent deck keeps nested deck unless source notes are also selected; source deletion is restorable Trash',()=>{
 let doc=fixture();doc.tables.decks.push({rootId:'nested'});doc=withNodes(doc,[...doc.tables.bullets,bullet('nested',{parentId:'d',position:1,text:'Nested'}),bullet('nq',{parentId:'nested',text:'Nested question',kind:'QUESTION'}),bullet('na',{parentId:'nq',text:'Nested answer'})]);
 doc=saveStudyFolder(doc,{name:'Learning'},()=> 'f');doc=moveStudyDeck(doc,'d','f');doc=moveStudyDeck(doc,'nested','f');
 assert.equal(deckDeletionPlan(doc,'d').nestedDecks,1);
 const kept=deleteStudyDeck(doc,'d');assert.ok(kept.tables.decks.some(d=>d.rootId==='nested'));assert.ok(scopedCards(withNodes(kept,kept.tables.bullets),'nested').some(c=>c.id==='nq'));
 const deleted=deleteStudyDeck(doc,'d',true,123,()=> 'trash1');assert.equal(deleted.tables.bullets.some(n=>n.id==='d'),false);assert.equal(deleted.tables.decks.length,1);
 const payload=JSON.parse(deleted.tables.trash[0].payload);assert.equal(payload.nodes.length,6);assert.equal(payload.decks.length,2);assert.equal(payload.studyDeckFolders.d,'f');
 const restored=withNodes({...deleted,tables:{...deleted.tables,media:[...deleted.tables.media,...payload.media],decks:[...deleted.tables.decks,...payload.decks]}},[...deleted.tables.bullets,...payload.nodes]);
 assert.equal(scopedCards(restored).length,3);assert.equal(restored.tables.cards.find(c=>c.id==='q').id,'q');
});
test('MCQ decks can be recreated after deletion without losing correct answers',()=>{
 let doc=empty();doc=withNodes(doc,[bullet('d',{text:'Quiz'}),bullet('q',{parentId:'d',text:'Choose'}),...[0,1,2,3].map(i=>bullet('o'+i,{parentId:'q',position:i,text:i===2?'Correct @Answer':'Option '+i}))]);
 doc=configureMcqBranch(doc,'d');doc=withNodes(doc,doc.tables.bullets);assert.equal(scopedCards(doc,'d').length,1);
 doc=deleteStudyDeck(doc,'d');doc=withNodes(doc,doc.tables.bullets);assert.equal(scopedCards(doc).length,0);
 doc=configureMcqBranch(doc,'d');doc=withNodes(doc,doc.tables.bullets);assert.equal(scopedCards(doc,'d').length,1);assert.equal(doc.web.mcqs.q.correctOptionId,'o2');
});
test('image deck removal keeps its image, masks and scheduling history and can be recreated',()=>{
 let doc=empty();doc.tables.bullets=[bullet('image',{text:'Diagram'})];doc.tables.media=[{id:'m',bulletId:'image',fileName:'diagram.png'}];let n=0;
 const options={mediaId:'m',title:'Anatomy',masks:[{id:'mask',label:'Heart',x:.1,y:.1,w:.2,h:.2}],mode:'one'};
 doc=applyOcclusion(doc,options,123,()=> 'id'+(++n));doc=withNodes(doc,doc.tables.bullets);const root=doc.tables.decks[0].rootId,config=structuredClone(doc.web.occlusions),media=structuredClone(doc.tables.media);
 assert.equal(deckDeletionPlan(doc,root).type,'image');
 doc=deleteStudyDeck(doc,root);doc=withNodes(doc,doc.tables.bullets);assert.equal(scopedCards(doc).length,0);assert.deepEqual(doc.web.occlusions,config);assert.deepEqual(doc.tables.media,media);
 doc=applyOcclusion(doc,{...options,groupId:root});doc=withNodes(doc,doc.tables.bullets);assert.equal(scopedCards(doc).length,1);
});

test('folder color and subject collections are unique, local and backward compatible',async()=>{
 const {folderColors,folderLogos,folderAppearance}=await import('../src/folder-designs.mjs');
 assert.equal(folderColors.length,20);assert.equal(folderLogos.length,26);
 assert.equal(new Set(folderColors.map(c=>c.id)).size,20);assert.equal(new Set(folderLogos.map(l=>l.id)).size,26);
 for(const id of ['mathematics','physics','chemistry','biology','ai','geography','languages','medicine'])assert.ok(folderLogos.find(l=>l.id===id)?.path);
 const old=fixture();old.web.studyFolders=[{id:'old',name:'Legacy',color:'pink'}];
 assert.deepEqual(studyFolders(old)[0],{id:'old',name:'Legacy',color:'pink',logo:'none',image:'',imagePosition:'center'});
 assert.equal(folderAppearance({image:'https://example.com/image.png',logo:'bad'}).image,'');
});
test('folder images and logos survive full backup; rename preserves appearance and remove image clears reference',async()=>{
 const {references}=await import('./.build/data.mjs');
 let doc=saveStudyFolder(fixture(),{name:'Physics',color:'indigo',logo:'physics',image:'media/folder-bg-test.webp',imagePosition:'bottom'},()=> 'p');
 doc=moveStudyDeck(doc,'d','p');const path='media/folder-bg-test.webp',assets=new Map([[path,new Blob(['folder-image'],{type:'image/webp'})]]);
 assert.ok(references(doc).has(path));
 const restored=await parseArchive(await archive(doc,assets));assert.equal(await restored.assets.get(path).text(),'folder-image');assert.deepEqual(studyFolders(restored.doc),studyFolders(doc));
 doc=saveStudyFolder(doc,{id:'p',name:'Advanced physics',color:'teal'});assert.equal(studyFolders(doc)[0].logo,'physics');assert.equal(studyFolders(doc)[0].image,path);
 doc=saveStudyFolder(doc,{id:'p',name:'Advanced physics',image:''});assert.equal(references(doc).has(path),false);assert.equal(deckFolder(doc,'d'),'p');
});
test('folder appearance validation rejects remote images and unknown subject metadata',async()=>{
 const {validateStudyLibrary}=await import('../src/study-library.mjs');
 for(const patch of [{image:'https://example.com/test.png'},{image:'media/../../bad'},{logo:'unknown'},{imagePosition:'outside'}])assert.throws(()=>validateStudyLibrary({studyFolders:[{id:'f',name:'Folder',color:'blue',...patch}]}),/folder appearance/);
 assert.doesNotThrow(()=>validateStudyLibrary({studyFolders:[{id:'f',name:'Folder',color:'blue'}]}));
});
