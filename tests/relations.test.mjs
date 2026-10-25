import {test} from 'node:test';import assert from 'node:assert/strict';
import {bullet,move,generatedCards} from '../src/domain.mjs';
import {createMirror,syncMirrors,detachMirror,backlinks,internalLink,mirrorLocations,tagColor,hasImportantTag,matchesQuery,validateMirrors} from '../src/relations.mjs';
import {empty,withNodes,archive,parseArchive} from './.build/data.mjs';
const seed=()=>[bullet('source',{text:'Source',kind:'QUESTION'}),bullet('answer',{text:'Answer',parentId:'source'}),bullet('place',{text:'Project',position:1}),bullet('slot',{parentId:'place'})];
test('mirrors share edits in both directions, retain identities and collapse state, and follow source child additions/removals',()=>{
 let nodes=createMirror(seed(),'slot','source').nodes;const originalIds=nodes.filter(n=>n.mirrorRootId==='slot').map(n=>n.id),child=nodes.find(n=>n.mirrorSourceId==='answer');
 nodes=syncMirrors(nodes,nodes.map(n=>n.id===child.id?{...n,text:'Edited answer',formatting:'0:6:BOLD',taskState:'TODO'}:n));assert.equal(nodes.find(n=>n.id==='answer').text,'Edited answer');assert.equal(nodes.find(n=>n.id==='answer').taskState,'TODO');
 const previous=nodes;nodes=syncMirrors(previous,[...nodes.map(n=>n.id==='source'?{...n,text:'Renamed source'}:n.id==='slot'?{...n,collapsed:true}:n),bullet('new',{parentId:'source',text:'New answer',position:1})]);
 assert.equal(nodes.find(n=>n.id==='slot').text,'Renamed source');assert.equal(nodes.find(n=>n.id==='slot').collapsed,true);assert.ok(nodes.some(n=>n.mirrorSourceId==='new'));assert.ok(originalIds.every(id=>nodes.some(n=>n.id===id)));
 nodes=syncMirrors(nodes,nodes.filter(n=>n.id!=='answer'));assert.ok(!nodes.some(n=>n.mirrorSourceId==='answer'));assert.deepEqual(generatedCards(nodes,[]).map(c=>c.id),['source']);validateMirrors(nodes);
});
test('mirror removal leaves originals, source removal preserves independent copies, detachment isolates edits and cycles are rejected',()=>{
 const nodes=createMirror(seed(),'slot','source').nodes;
 assert.throws(()=>createMirror(seed(),'answer','source'),/inside its own/);
 assert.throws(()=>syncMirrors(nodes,move(nodes,'slot','source',0)),/inside its own/);
 let detached=detachMirror(nodes,'slot');detached=syncMirrors(nodes,detached.map(n=>n.id==='slot'?{...n,text:'Independent'}:n));assert.equal(detached.find(n=>n.id==='source').text,'Source');assert.equal(detached.find(n=>n.id==='slot').text,'Independent');
 const removed=syncMirrors(nodes,nodes.filter(n=>!['source','answer'].includes(n.id)));assert.equal(removed.find(n=>n.id==='slot').text,'Source');assert.ok(removed.every(n=>!n.mirrorSourceId));
 const deletedMirror=syncMirrors(nodes,nodes.filter(n=>n.mirrorRootId!=='slot'));assert.equal(deletedMirror.find(n=>n.id==='answer').text,'Answer');
});
test('durable links disambiguate duplicate titles and resolve backlinks by identity',()=>{
 const nodes=seed(),link=internalLink(nodes[0]);nodes.push(bullet('ref',{text:`See ${link} and ${link}`}),bullet('duplicate',{text:'Source'}));assert.deepEqual(backlinks(nodes,'source').map(n=>n.id),['ref']);assert.equal(backlinks(nodes,'duplicate').length,0);assert.equal(mirrorLocations(createMirror(nodes,'slot','source').nodes,'source').length,1);
 assert.equal(tagColor('#imp'),tagColor('#IMP'));assert.ok(hasImportantTag('Read #imp'));assert.ok(!hasImportantTag('Read #importantish'));assert.ok(!hasImportantTag('https://x/#imp'));assert.ok(!hasImportantTag(internalLink({id:'x',text:'Physics #imp'})));assert.ok(matchesQuery('Read #IMP','#imp'));assert.ok(!matchesQuery('#important','#imp'));assert.ok(!matchesQuery(internalLink({id:'x',text:'Physics #imp'}),'#imp')); 
});
test('full backups retain mirror links and attachments; detached branches preserve attachment references',async()=>{
 let doc=withNodes(empty(),seed());doc.tables.media=[{id:'image',bulletId:'answer',fileName:'a.png',mimeType:'image/png',sourceUrl:'',credit:'',licenseUrl:''}];
 doc=withNodes(doc,createMirror(doc.tables.bullets,'slot','source').nodes);const mirrorChild=doc.tables.bullets.find(n=>n.mirrorSourceId==='answer');
 const restored=await parseArchive(await archive(doc,new Map([['media/a.png',new Blob(['image'])]]),false));assert.equal(restored.doc.tables.bullets.find(n=>n.id===mirrorChild.id).mirrorSourceId,'answer');
 const detached=withNodes(doc,detachMirror(doc.tables.bullets,'slot'));assert.ok(detached.tables.media.some(m=>m.bulletId===mirrorChild.id&&m.fileName==='a.png'));
 const deleted=withNodes(doc,doc.tables.bullets.filter(n=>!['source','answer'].includes(n.id)));assert.ok(deleted.tables.media.some(m=>m.bulletId===mirrorChild.id));
});
