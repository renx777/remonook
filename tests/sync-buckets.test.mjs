import test from 'node:test';
import assert from 'node:assert/strict';
import {empty} from './.build/data.mjs';
import {bullet} from '../src/domain.mjs';
import {Y,openShared,sharedState,applyIntent,project,pack,unpack} from '../src/sync-crdt.mjs';
import {applyDocument,mergeUpdates,projectBuckets,readRepair,rowBucket,leafBucket,bulletBucket,splitParts,isBucket} from '../src/sync-buckets.mjs';
import {documentParts} from '../src/sync-crdt.mjs';

function rng(seed){return()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}
const words=['alpha','beta','gamma','delta','#tag','**bold**','सीखना','😀','x'];
function edit(doc,r){
 const d=structuredClone(doc),nodes=d.tables.bullets,pick=()=>nodes[Math.floor(r()*nodes.length)];
 const op=r();
 if(op<0.3||!nodes.length){const id='n'+Math.floor(r()*1e9).toString(36);nodes.push(bullet(id,{parentId:nodes.length&&r()<0.6?pick().id:null,position:Math.floor(r()*5),text:words[Math.floor(r()*words.length)]}));}
 else if(op<0.6){const n=pick(),cp=[...n.text],at=Math.floor(r()*(cp.length+1));n.text=cp.slice(0,at).join('')+words[Math.floor(r()*words.length)]+cp.slice(at).join('');}
 else if(op<0.7){const n=pick();n.text=[...n.text].slice(0,Math.floor(r()*[...n.text].length)).join('');}
 else if(op<0.8){const n=pick(),p=pick();n.parentId=p.id===n.id?null:p.id;n.position=Math.floor(r()*5);}
 else if(op<0.87){d.tables.bullets=nodes.filter(n=>n!==pick());}
 else if(op<0.93){d.web.noteTimes={...(d.web.noteTimes||{})};const n=pick();d.web.noteTimes[n.id]={updatedAt:Math.floor(r()*1e6)};}
 else {d.preferences={...d.preferences,appearance:{...d.preferences.appearance,size:12+Math.floor(r()*8)}};}
 return d;
}
const sorted=x=>Array.isArray(x)?x.map(sorted):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sorted(x[k])])):x;
const canonical=doc=>{const d=readRepair(structuredClone(doc));for(const rows of Object.values(d.tables))rows.sort((a,b)=>String(a.id??a.rootId??a.token).localeCompare(String(b.id??b.rootId??b.token)));return JSON.stringify(sorted(d));};

test('bucket routing: every key of a bullet shares one bucket; ids are stable and valid',()=>{
 assert.equal(rowBucket('["bullets","abc"]'),bulletBucket('abc'));
 assert.equal(leafBucket(JSON.stringify(['web','noteTimes','abc','updatedAt'])),bulletBucket('abc'),'per-bullet times live with the bullet');
 assert.match(leafBucket(JSON.stringify(['web','workdays','version'])),/^r\d+$/);
 assert.equal(leafBucket(JSON.stringify(['web','workdays','a','b'])),leafBucket(JSON.stringify(['web','workdays','version'])),'a root domain stays together');
 for(let i=0;i<2000;i++)assert.ok(isBucket(bulletBucket('id'+i)));
 assert.ok(!isBucket('b256')&&!isBucket('r16')&&!isBucket('__proto__'));
});

test('one device: bucketed state projects exactly like the single v2 document over random edits',()=>{
 for(let seed=1;seed<=12;seed++){
  const r=rng(seed);let doc=empty(),states=new Map(),single=new Y.Doc(),prev=null;const cache=new Map();
  for(let step=0;step<60;step++){
   const next=edit(doc,r);
   ({states}=applyDocument(states,prev,next));applyIntent(single,prev,next);
   prev=next;doc=next;
   const a=projectBuckets(states,cache).doc,b=project(single).doc;
   assert.equal(canonical(a),canonical(b),`seed ${seed} step ${step}`);
  }
 }
});

test('three offline devices converge identically to v2 in every delivery order',()=>{
 for(let seed=1;seed<=8;seed++){
  const r=rng(100+seed);let base=empty();for(let i=0;i<6;i++)base=edit(base,r);
  const {states:seeded}=applyDocument(new Map(),null,base,{clientID:1});
  const singleSeed=new Y.Doc();singleSeed.clientID=1;applyIntent(singleSeed,null,base);const seedState=sharedState(singleSeed);
  const devices=[2,3,4].map(id=>{let doc=project(openShared(seedState)).doc,states=seeded,single=openShared(seedState);single.clientID=id;const updates=[],singles=[];
   let mapped=projectBuckets(states).doc;
   for(let k=0;k<8;k++){const next=edit(mapped,r);const out=applyDocument(states,mapped,next,{clientID:id});states=out.states;updates.push(out.updates);const v=Y.encodeStateVector(single);applyIntent(single,mapped,next);singles.push(Y.encodeStateAsUpdate(single,v));mapped=next;}
   return {updates,singles};});
  for(let order=0;order<3;order++){
   const seq=[...devices.keys()].sort(()=>r()-0.5);
   let states=seeded;const single=openShared(seedState);
   for(const i of seq){for(const u of devices[i].updates)states=mergeUpdates(states,u);for(const u of devices[i].singles)Y.applyUpdate(single,u);}
   assert.equal(canonical(projectBuckets(states).doc),canonical(project(single).doc),`seed ${seed} order ${order}`);
  }
 }
});

test('a text edit touches only its bullet\'s bucket',()=>{
 const doc=empty();doc.tables.bullets=Array.from({length:500},(_,i)=>bullet('n'+i,{text:'note '+i}));
 const {states}=applyDocument(new Map(),null,doc);
 const next=structuredClone(doc);next.tables.bullets[42].text+=' edited';
 const out=applyDocument(states,doc,next);
 assert.deepEqual(Object.keys(out.updates),[bulletBucket('n42')]);
 assert.ok(states.size>200,'500 bullets spread over many buckets');
});

test('read repair copies only repaired rows and never mutates its input; unchanged projections are reused',()=>{
 const a=bullet('a',{parentId:'b',text:'a'}),b=bullet('b',{parentId:'a',text:'b'}),c=bullet('c',{parentId:'gone',text:'c'}),d=bullet('d',{text:'d'});
 const doc={tables:{bullets:[a,b,c,d]}};const frozen=JSON.stringify([a,b,c,d]);
 readRepair(doc);
 assert.equal(JSON.stringify([a,b,c,d]),frozen,'input rows untouched');
 assert.equal(doc.tables.bullets[3],d,'an unrepaired row keeps its identity');
 assert.equal(doc.tables.bullets.find(n=>n.id==='a').parentId,null,'cycle broken at the smallest id');
 assert.equal(doc.tables.bullets.find(n=>n.id==='c').parentId,null,'missing parent becomes a root');
 const base=empty();base.tables.bullets=[bullet('x',{text:'x'})];const {states}=applyDocument(new Map(),null,base);const cache=new Map();
 const first=projectBuckets(states,cache),second=projectBuckets(states,cache);assert.equal(first,second,'nothing changed: same projection object');
});

test('repairDocument fixes only what the server checks refuse and records the originals',async()=>{
 const {repairDocument,checkRow,checkRoot}=await import('../src/sync-checks.mjs');
 const doc=empty();doc.tables.bullets=[bullet('ok',{text:'fine'}),{...bullet('bad',{text:'keep me'}),kind:'WEIRD',journalDate:'2026-13-01'}];
 assert.equal(repairDocument(empty(),[]),null,'a valid document needs nothing');
 const fixed=repairDocument(doc,[]);
 const bad=fixed.doc.tables.bullets.find(n=>n.id==='bad');
 assert.deepEqual([bad.text,bad.kind,bad.journalDate],['keep me','NOTE','']);
 assert.equal(fixed.doc.tables.bullets.find(n=>n.id==='ok'),doc.tables.bullets[0]);
 for(const n of fixed.doc.tables.bullets)checkRow('bullets',n);checkRoot(fixed.doc.web);
 assert.equal(fixed.recovered.length,1);assert.ok(fixed.doc.tables.bullets.some(n=>n.text==='Recovered from this device'));
});
