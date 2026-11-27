import test from 'node:test';import assert from 'node:assert/strict';import 'fake-indexeddb/auto';
import {empty,withNodes,archive,parseArchive,setStorageAccount,save,load} from './.build/data.mjs';import {bullet} from '../src/domain.mjs';
import {smartMembers,sourcePath,setTraitView,traitView,newSmartCollectionItem,arrangeCollection,noteTraits,addTraitTab,switchTraitTab} from '../src/traits-block.mjs';
import {applyDocument,mergeUpdates,projectBuckets} from '../src/sync-buckets.mjs';
const fixture=()=>withNodes(empty(),[bullet('collection',{text:'Library #views'}),bullet('local',{parentId:'collection',text:'Local'}),bullet('branch',{position:1,text:'Research'}),bullet('book',{parentId:'branch',text:'Dune'}),bullet('traits',{parentId:'book',text:'Traits',traitsBlock:true}),bullet('author',{parentId:'traits',text:'Author: Frank Herbert'}),bullet('mirror',{parentId:'collection',position:1,text:'',mirrorSourceId:'book',mirrorRootId:'mirror'}),bullet('other',{position:2,text:'Elsewhere'}),bullet('outside',{parentId:'other',text:'Other note'})]);
const ids=xs=>xs.map(n=>n.id).sort();
test('legacy children remain the default; workspace results are canonical, live and exclude traits, self and ancestors',()=>{
 const doc=fixture(),before=JSON.stringify(doc);assert.equal(traitView(doc,'collection').source,'children');assert.deepEqual(ids(smartMembers(doc,'collection')),['book','local']);assert.equal(JSON.stringify(doc),before);
 const next=setTraitView(doc,'collection',{source:'workspace',conditions:[{key:'Author',op:'notempty',value:''}]});const v=traitView(next,'collection');assert.deepEqual(ids(arrangeCollection(next,smartMembers(next,'collection',v),v)),['book']);assert.equal(sourcePath(next,'book'),'Research');assert.equal(next.tables.bullets,doc.tables.bullets);
 const changed=withNodes(next,next.tables.bullets.map(n=>n.id==='author'?{...n,text:'Other: Changed'}:n));assert.equal(arrangeCollection(changed,smartMembers(changed,'collection'),traitView(changed,'collection')).length,0);
});
test('branch scope includes descendants and branch mirrors but never falls back after deletion',()=>{
 let doc=setTraitView(fixture(),'collection',{source:'branch',sourceBranch:'branch'});assert.deepEqual(ids(smartMembers(doc,'collection')),['book']);doc=withNodes(doc,doc.tables.bullets.filter(n=>!['branch','book','traits','author','mirror'].includes(n.id)&&n.mirrorRootId!=='mirror'));assert.deepEqual(smartMembers(doc,'collection'),[]);assert.throws(()=>newSmartCollectionItem(doc,'collection'),/removed/);
});
test('recipes create ordinary traits in the source destination, preserve existing notes and survive full backups',async()=>{
 const doc=setTraitView(fixture(),'collection',{source:'branch',sourceBranch:'branch',recipe:'book'});let serial=0;const r=newSmartCollectionItem(doc,'collection',[],()=> 'new-'+serial++);assert.equal(r.doc.tables.bullets.find(n=>n.id===r.id).parentId,'branch');assert.deepEqual(noteTraits(r.doc,r.id).map(t=>t.key),['Author','Status','Rating','Cover']);assert.equal(doc.tables.bullets.length,fixture().tables.bullets.length);
 const restored=(await parseArchive(await archive(r.doc,new Map()))).doc;assert.equal(traitView(restored,'collection').recipe,'book');assert.equal(traitView(restored,'collection').sourceBranch,'branch');assert.equal(noteTraits(restored,r.id).length,4);
 const noRecipe=setTraitView(doc,'collection',{recipe:''});const plain=newSmartCollectionItem(noRecipe,'collection',[],()=> 'plain');assert.equal(noteTraits(plain.doc,plain.id).length,0);
});
test('concurrent collection configuration and original text edits converge with all revision evidence retained',()=>{
 const states=applyDocument(new Map(),null,fixture(),{clientID:11}).states,base=projectBuckets(states).doc;
 const query=setTraitView(base,'collection',{source:'workspace'},()=> 'view-1',10),text=withNodes(base,base.tables.bullets.map(n=>n.id==='book'?{...n,text:'Dune edited offline'}:n));
 const a=applyDocument(states,base,query,{clientID:12}),b=applyDocument(states,base,text,{clientID:13});for(const order of [[a.updates,b.updates],[b.updates,a.updates]]){let merged=states;for(const u of order)merged=mergeUpdates(merged,u);const doc=projectBuckets(merged).doc;assert.equal(traitView(doc,'collection').source,'workspace');assert.equal(doc.tables.bullets.find(n=>n.id==='book').text,'Dune edited offline');assert.ok(doc.web.traitViews.collection['view-1']);}
});

test('saved views retain independent sources, and malformed newer settings default safely',()=>{
 let doc=setTraitView(fixture(),'collection',{source:'workspace',recipe:'movie'});let n=0;const added=addTraitTab(doc,'collection','Research',()=> 'revision-'+n++,100);doc=setTraitView(added.doc,'collection',{source:'branch',sourceBranch:'branch',recipe:'book'});doc=switchTraitTab(doc,'collection','all');assert.equal(traitView(doc,'collection').source,'workspace');assert.equal(traitView(doc,'collection').recipe,'movie');doc=switchTraitTab(doc,'collection',added.tab);assert.equal(traitView(doc,'collection').sourceBranch,'branch');assert.equal(traitView(doc,'collection').recipe,'book');
});

test('collection definitions and results stay account/workspace isolated across reload',async()=>{
 try{setStorageAccount('smart-account-a');await save(null,setTraitView(fixture(),'collection',{source:'workspace'}));setStorageAccount('smart-account-b');assert.equal(await load(),null);await save(null,withNodes(empty(),[bullet('collection',{text:'Other #views'})]));assert.equal(traitView(await load(),'collection').source,'children');assert.deepEqual(smartMembers(await load(),'collection'),[]);setStorageAccount('smart-account-a');const restored=await load();assert.equal(traitView(restored,'collection').source,'workspace');assert.ok(smartMembers(restored,'collection').some(n=>n.id==='book'));}finally{setStorageAccount(null);}
});

test('a mirrored collection queries and creates against its canonical source, never itself',()=>{
 const doc=withNodes(empty(),[bullet('c',{text:'Collection #views'}),bullet('child',{parentId:'c',text:'Original child'}),bullet('m',{text:'',mirrorSourceId:'c',mirrorRootId:'m'})]);const wide=setTraitView(doc,'m',{source:'workspace'});assert.deepEqual(ids(smartMembers(wide,'m')),['child']);const created=newSmartCollectionItem(wide,'m',[],()=> 'created');assert.equal(created.doc.tables.bullets.find(n=>n.id==='created').parentId,'c');
});
