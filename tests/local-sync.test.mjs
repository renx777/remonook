import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {bullet} from '../src/domain.mjs';

globalThis.localStorage ??= (()=>{const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};})();
globalThis.window ??= {addEventListener(){},removeEventListener(){},dispatchEvent(){}};
const {LocalSyncEngine}=await import('./.build/local-sync.mjs');
const {load,save,empty,withNodes,syncOperation}=await import('./.build/data-store.mjs');

const WS='shared0001';
/** A small network: devices deliver messages in order; `settle` waits until all are handled. */
function network(){
 const devices=new Map(),links=new Set();let inflight=0;
 const link=(a,b)=>{links.add(a+'>'+b);links.add(b+'>'+a);};
 const unlink=a=>{for(const l of [...links])if(l.includes(a))links.delete(l);};
 const add=(name,storage,{shared=true}={})=>{
  const ws=shared?[{id:WS,name:'Shared',storage}]:[];
  const engine=new LocalSyncEngine({send:async(peer,data)=>{if(!links.has(name+'>'+peer))throw Error('offline');inflight++;setTimeout(()=>{devices.get(peer).engine.onMessage(name,data).finally(()=>inflight--);},1);}},{
   workspaces:()=>ws,
   addWorkspace:(id,n)=>{const w={id,name:n,storage};ws.push(w);return w;},
  });
  devices.set(name,{engine,storage,ws});return devices.get(name);
 };
 const connect=async()=>{for(const [name,d] of devices)await d.engine.setOnline([...devices.keys()].filter(p=>p!==name&&links.has(name+'>'+p)));};
 const settle=async()=>{for(let quiet=0;quiet<16;){await new Promise(r=>setTimeout(r,30));quiet=inflight?0:quiet+1;}};
 return {add,link,unlink,connect,settle,devices};
}
const projection=async storage=>(await syncOperation('inspect',{doc:null,assets:[]},storage)).doc;
const texts=doc=>doc.tables.bullets.map(n=>n.text).sort();
/** What the app does when a workspace is open: apply what arrived (and adopt it). */
async function open(storage){const current=await load(storage),r=await syncOperation('inspect',{doc:current,assets:[]},storage);if(r.needsApply)await save(current,{...r.doc,web:{...r.doc.web,deviceId:current?.web?.deviceId||r.doc.web.deviceId}},'local sync',new Map(),true,[],r.state,storage);}
async function edit(storage,change){await open(storage);const before=await load(storage);const after=withNodes(before,change(before.tables.bullets));await save(before,after,'edit',undefined,false,[],undefined,storage);}

test('local sync: first sync, concurrent edits, relaying through another device',async()=>{
 const net=network();
 // Device A has notes; B and C start empty (B is told about the workspace by A).
 const a=net.add('A','remo-web-local-devicea01'),b=net.add('B','remo-web-local-deviceb01',{shared:false}),c=net.add('C','remo-web-local-devicec01');
 const start=empty();start.tables.bullets=[bullet('trip',{text:'Trip to Kyoto'}),bullet('f1',{parentId:'trip',text:'Flights'})];
 await save(null,start,'initialize',undefined,false,[],undefined,a.storage);
 net.link('A','B');await net.connect();await net.settle();
 assert.equal(b.ws.length,1,'B added the workspace A syncs');
 assert.deepEqual(texts(await projection(b.storage)),['Flights','Trip to Kyoto']);
 // Both edit at the same time, including the same bullet: both edits are kept.
 await edit(a.storage,ns=>ns.map(n=>n.id==='f1'?{...n,text:'Flights booked'}:n));
 await edit(b.storage,ns=>[...ns,bullet('p1',{parentId:'trip',position:1,text:'Places to see'})]);
 a.engine.changed(a.storage);b.engine.changed(b.storage);await net.settle();
 const pa=await projection(a.storage),pb=await projection(b.storage);
 assert.deepEqual(texts(pa),['Flights booked','Places to see','Trip to Kyoto']);
 assert.deepEqual(texts(pb),texts(pa),'A and B converge');
 // A goes offline; C (never connected to A) gets A's notes through B.
 net.unlink('A');net.link('B','C');await net.connect();await net.settle();
 assert.deepEqual(texts(await projection(c.storage)),texts(pa));
 // C edits; A comes back and meets only C: A gets C's edit and nothing is lost on either side.
 await edit(c.storage,ns=>[...ns,bullet('c1',{text:'Packing list'})]);
 net.unlink('B');net.link('A','C');await net.connect();await net.settle();
 assert.deepEqual(texts(await projection(a.storage)),['Flights booked','Packing list','Places to see','Trip to Kyoto']);
 assert.deepEqual(texts(await projection(c.storage)),texts(await projection(a.storage)));
});

test('local sync: messages for unknown workspaces or with bad content are ignored',async()=>{
 const net=network();
 const a=net.add('A','remo-web-local-devicea02');
 await a.engine.onMessage('X','not json');
 await a.engine.onMessage('X',JSON.stringify({t:'updates',ws:'other00001',updates:{b1:'AAA='}}));
 await a.engine.onMessage('X',JSON.stringify({t:'updates',ws:WS,updates:{'../x':'AAA='}}));
 await a.engine.onMessage('X',JSON.stringify({t:'hello',ws:WS,vectors:{b1:'!!'}}));
 assert.equal(await load(a.storage),null,'nothing was written');
});

test('local sync: attachments travel by content hash',async()=>{
 const {manifest}=await import('./.build/local-sync.mjs');
 const {getAssets}=await import('./.build/data-store.mjs');
 const net=network();
 const a=net.add('A','remo-web-local-devicea03'),b=net.add('B','remo-web-local-deviceb03');
 const files=new Map([['media/photo.png',new Blob([new Uint8Array([137,80,78,71,1,2,3,4])],{type:'image/png'})]]);
 const start=empty();start.tables.bullets=[bullet('n1',{text:'With a photo'})];
 const saved=await save(null,start,'initialize',files,false,[],undefined,a.storage);
 await syncOperation('initialize',{response:{revision:0,updates:{}},doc:saved,assets:await manifest(files)},a.storage);
 net.link('A','B');await net.connect();await net.settle();
 const got=(await getAssets(b.storage)).get('media/photo.png');
 assert.ok(got,'B fetched the attachment');
 assert.deepEqual([...new Uint8Array(await got.arrayBuffer())],[137,80,78,71,1,2,3,4]);
 assert.equal(got.type,'image/png');
});

test('local sync carries bookshelf originals separately from note attachments',async()=>{
 const {cachedBook,localBookScope,bookPath}=await import('./.build/local-books.mjs');const {digest}=await import('./.build/data-store.mjs');
 const net=network(),a=net.add('A','remo-web-local-bookspeer01'),b=net.add('B','remo-web-local-bookspeer02');
 const original=new Blob(['%PDF-1.7\noriginal on A'],{type:'application/pdf'}),hash=await digest(await original.arrayBuffer()),id=crypto.randomUUID();
 const doc=empty();doc.web.readingBooks={[id]:{id,name:'Local.pdf',title:'Local',format:'pdf',size:original.size,hash,createdAt:1,position:0,deleted:false}};
 await cachedBook(localBookScope(a.storage),id+':'+hash,original);await save(null,doc,'book',undefined,false,[],undefined,a.storage);
 net.link('A','B');await net.connect();await net.settle();
 const received=await cachedBook(localBookScope(b.storage),id+':'+hash);assert.ok(received);assert.equal(await received.text(),await original.text());
 assert.deepEqual(await syncOperation('peer-assets',{},b.storage),[],'books do not enter the note attachment manifest');
 assert.equal((await projection(b.storage)).web.readingBooks[id].hash,hash);
});
