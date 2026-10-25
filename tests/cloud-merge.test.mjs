import test from 'node:test';
import assert from 'node:assert/strict';
import {empty} from './.build/data.mjs';
import {bullet} from '../src/domain.mjs';
import {mergeCloudWorkspaces,mergeAssetManifests} from '../src/cloud-merge.mjs';

function initial(){
 const doc=empty();
 doc.tables.bullets=[bullet('root',{text:'Outline'}),bullet('a',{parentId:'root',text:'Alpha'}),bullet('b',{parentId:'root',position:1,text:'Beta'})];
 doc.web.noteTimes={a:{createdAt:1,updatedAt:1},b:{createdAt:1,updatedAt:1}};
 return doc;
}
const copy=structuredClone;
const edit=(doc,id,patch)=>{doc.tables.bullets=doc.tables.bullets.map(n=>n.id===id?{...n,...patch}:n);doc.web.noteTimes[id]={...doc.web.noteTimes[id],updatedAt:100};};
const byId=(doc,id)=>doc.tables.bullets.find(n=>n.id===id);

test('edits to different nodes, including note timestamps, merge automatically',()=>{
 const base=initial(),local=copy(base),remote=copy(base);
 edit(local,'a',{text:'Edited on desktop'});edit(remote,'b',{text:'Edited on mobile'});
 const result=mergeCloudWorkspaces(base,local,remote);
 assert.equal(result.ok,true,JSON.stringify(result.conflicts));
 assert.equal(byId(result.doc,'a').text,'Edited on desktop');
 assert.equal(byId(result.doc,'b').text,'Edited on mobile');
 assert.equal(result.doc.web.noteTimes.a.updatedAt,100);
 assert.equal(result.doc.web.noteTimes.b.updatedAt,100);
 assert.equal(result.mergedNodes,2);
});

test('simultaneous additions with different IDs are both retained',()=>{
 const base=initial(),local=copy(base),remote=copy(base);
 local.tables.bullets.push(bullet('new-l',{parentId:'root',position:2,text:'Laptop'}));
 remote.tables.bullets.push(bullet('new-r',{parentId:'root',position:2,text:'Phone'}));
 assert.deepEqual(mergeCloudWorkspaces(base,local,remote).doc.tables.bullets.map(n=>n.id),['root','a','b','new-l','new-r']);
});

test('identical concurrent edits are accepted; different concurrent edits are never last-write-wins',()=>{
 const base=initial(),local=copy(base),remote=copy(base);
 edit(local,'a',{text:'Same'});edit(remote,'a',{text:'Same'});
 assert.equal(mergeCloudWorkspaces(base,local,remote).ok,true);
 edit(remote,'a',{text:'Different'});
 const conflict=mergeCloudWorkspaces(base,local,remote);
 assert.equal(conflict.ok,false);assert.ok(conflict.conflicts.some(x=>x.includes('tables.bullets/a')));
});

test('delete one node while changing an independent node merges safely',()=>{
 const base=initial(),local=copy(base),remote=copy(base);
 local.tables.bullets=local.tables.bullets.filter(n=>n.id!=='a');
 edit(remote,'b',{text:'Updated elsewhere'});
 const merged=mergeCloudWorkspaces(base,local,remote);
 assert.equal(merged.ok,true,JSON.stringify(merged.conflicts));
 assert.ok(!byId(merged.doc,'a'));assert.equal(byId(merged.doc,'b').text,'Updated elsewhere');
});

test('delete vs edit and delete parent vs add child require manual review',()=>{
 const base=initial(),local=copy(base),remote=copy(base);
 local.tables.bullets=local.tables.bullets.filter(n=>n.id!=='a');
 edit(remote,'a',{text:'Must not disappear'});
 assert.equal(mergeCloudWorkspaces(base,local,remote).ok,false);
 const l=copy(base),r=copy(base);
 l.tables.bullets=[];r.tables.bullets.push(bullet('new-child',{parentId:'root',text:'Orphan'}));
 const result=mergeCloudWorkspaces(base,l,r);
 assert.equal(result.ok,false);
 assert.ok(result.conflicts.some(x=>/Missing parent|linked records/i.test(x)),JSON.stringify(result.conflicts));
});

test('simultaneous tree moves which create a cycle are rejected',()=>{
 const base=initial(),local=copy(base),remote=copy(base);
 edit(local,'a',{parentId:'b'});
 edit(remote,'b',{parentId:'a'});
 assert.equal(mergeCloudWorkspaces(base,local,remote).ok,false);
});

test('different mutable metadata keys merge, same settings conflict',()=>{
 const base=initial(),local=copy(base),remote=copy(base);
 local.preferences.appearance.theme='Dark';
 remote.preferences.editor_tools.italic=true;
 assert.equal(mergeCloudWorkspaces(base,local,remote).ok,true);
 remote.preferences.appearance.theme='Light';
 assert.equal(mergeCloudWorkspaces(base,local,remote).ok,false);
});

test('node additions and disjoint attachment/media changes merge with all references preserved',()=>{
 const base=initial(),local=copy(base),remote=copy(base);
 local.tables.media.push({id:'m-l',bulletId:'a',fileName:'l.png',mimeType:'image/png',sourceUrl:'',credit:'',licenseUrl:''});
 remote.tables.media.push({id:'m-r',bulletId:'b',fileName:'r.png',mimeType:'image/png',sourceUrl:'',credit:'',licenseUrl:''});
 assert.equal(mergeCloudWorkspaces(base,local,remote).doc.tables.media.length,2);
 const a={path:'media/l.png',hash:'l'.repeat(64),size:2,type:'image/png'};
 const b={path:'media/r.png',hash:'r'.repeat(64),size:2,type:'image/png'};
 const manifest=mergeAssetManifests([],[a],[b]);
 assert.equal(manifest.ok,true);
 assert.deepEqual(manifest.assets.map(x=>x.path),['media/l.png','media/r.png']);
});

test('same attachment path, different file bytes conflicts; independent deletion merges',()=>{
 const before={path:'media/old',hash:'a'.repeat(64),size:2,type:'image/png'};
 const left={...before,hash:'b'.repeat(64)},right={...before,hash:'c'.repeat(64)};
 assert.equal(mergeAssetManifests([before],[left],[right]).ok,false);
 assert.equal(mergeAssetManifests([before],[],[before]).assets.length,0);
 assert.equal(mergeAssetManifests([],[],[]).ok,true);
});

test('orphaned media and duplicate bullet IDs are never uploaded',()=>{
 const base=initial(),local=copy(base),remote=copy(base);
 local.tables.bullets=local.tables.bullets.filter(n=>n.id!=='a');
 remote.tables.media.push({id:'attachment',bulletId:'a',fileName:'x.png',mimeType:'image/png',sourceUrl:'',credit:'',licenseUrl:''});
 assert.equal(mergeCloudWorkspaces(base,local,remote).ok,false);
 const dup=copy(base);dup.tables.bullets.push(bullet('a',{text:'Duplicate'}));
 const result=mergeCloudWorkspaces(base,dup,base);
 assert.equal(result.ok,false);
});

test('schema extensions on a single device survive, divergent same-property changes conflict',()=>{
 const base=initial(),local=copy(base),remote=copy(base);
 local.columns.bullets.push('customField');
 local.tables.bullets=local.tables.bullets.map(n=>n.id==='a'?{...n,customField:'hello'}:n);
 edit(remote,'b',{text:'Remote'});
 const outcome=mergeCloudWorkspaces(base,local,remote);
 assert.equal(outcome.ok,true,JSON.stringify(outcome.conflicts));
 assert.ok(outcome.doc.columns.bullets.includes('customField'));
 const collision=copy(base);
 collision.columns.bullets.push('otherField');
 assert.equal(mergeCloudWorkspaces(base,local,collision).ok,false);
});

test('missing common baseline cannot guess at independent changes',()=>{
 assert.equal(mergeCloudWorkspaces(null,initial(),initial()).ok,false);
 assert.equal(mergeAssetManifests(undefined,[],[]).ok,false);
});
