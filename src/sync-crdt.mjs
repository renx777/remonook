import * as Y from 'yjs';
import {diffChars} from 'diff';
import {marks,encode,validate,bullet} from './domain.mjs';
import {cloudDocument} from './cloud-model.mjs';
import schema from './android-schema.json' with {type:'json'};
export {Y};
export const PROTOCOL=2;
export const pack=bytes=>{let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);};
export const unpack=s=>{if(typeof s!=='string'||s.length>8*1024*1024||!/^[A-Za-z0-9+/]*={0,2}$/.test(s))throw Error('Invalid sync update');return Uint8Array.from(atob(s),c=>c.charCodeAt(0));};
export function openShared(state){const d=new Y.Doc();if(state)Y.applyUpdate(d,unpack(state));return d;}
export const sharedState=d=>pack(Y.encodeStateAsUpdate(d));
export const vector=d=>pack(Y.encodeStateVector(d));
export const delta=(d,v)=>pack(Y.encodeStateAsUpdate(d,unpack(v)));
export const rowKey=(table,row,i)=>JSON.stringify([table,String(row[({decks:'rootId',emojis:'token',study_limits:'deckId'})[table]||'id']??`row:${i}`)]);
const stable=x=>Array.isArray(x)?x.map(stable):plain(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
const same=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
const plain=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
const safe=p=>p.every(k=>typeof k==='string'&&!['__proto__','constructor','prototype'].includes(k));
export function emptyShared(){return {tables:Object.fromEntries(Object.keys(schema).map(k=>[k,[]])),columns:structuredClone(schema),preferences:{appearance:{theme:'System',font:'Sans',size:16},editor_tools:{},study_preferences:{mode:'NORMAL'}},web:{contract:'1.0.0'}};}
function leaves(value,path=[],out=new Map()){
 if(path[0]==='web'&&path[1]==='workdays'&&((path[2]==='entries'&&path.length===6)||(['leaveTypes','targets','schedules'].includes(path[2])&&path.length===4))){if(!safe(path))throw Error('Invalid sync field');out.set(JSON.stringify(path),value);}
 else if(plain(value)&&Object.keys(value).length){for(const k of Object.keys(value))leaves(value[k],[...path,k],out);}
 else if(value!==undefined){if(!safe(path))throw Error('Invalid sync field');out.set(JSON.stringify(path),value);}
 return out;
}
function putPath(root,path,value){if(!safe(path)||!path.length)throw Error('Invalid sync field');let at=root;for(const key of path.slice(0,-1)){if(!plain(at[key]))at[key]={};at=at[key];}at[path.at(-1)]=value;}
function formattingSignature(node){
 const ranges=marks(node.formatting||'',node.text?.length||0).sort((a,b)=>a.style.localeCompare(b.style)||a.start-b.start||a.end-b.end),merged=[];
 for(const mark of ranges){const prior=merged.at(-1);if(prior&&prior.style===mark.style&&prior.end>=mark.start)prior.end=Math.max(prior.end,mark.end);else merged.push({...mark});}
 const unknown=(node.formatting||'').split(';').filter(Boolean).filter(part=>!marks(part,node.text?.length||0).length).sort();
 return {ranges:merged,unknown};
}
function sameRecord(a,b,table){return table==='bullets'?same({...a,formatting:formattingSignature(a)},{...b,formatting:formattingSignature(b)}):same(a,b);}
function changes(before,after){
 const parts=diffChars(before,after,{timeout:20,maxEditLength:10000});if(parts)return parts;
 let start=0,end=0;while(start<Math.min(before.length,after.length)&&before[start]===after[start])start++;
 if(start&&/[\uD800-\uDBFF]/.test(before[start-1]))start--;
 while(end<Math.min(before.length,after.length)-start&&before.at(-1-end)===after.at(-1-end))end++;
 if(end&&/[\uDC00-\uDFFF]/.test(before[before.length-end]))end--;
 return [{value:before.slice(0,start)},{removed:true,value:before.slice(start,before.length-end)},{added:true,value:after.slice(start,after.length-end)},{value:end?before.slice(-end):''}].filter(p=>p.value);
}
// Legacy snapshots have no CRDT identities. Match surviving baseline characters
// to the current text, then change only those characters. New CRDT clients never
// need this adapter: all later edits reference the same Y.Text identities.
function baselineMap(base,current){const map=new Map();let b=0,c=0;for(const p of changes(base,current)){if(p.added)c+=p.value.length;else if(p.removed)b+=p.value.length;else{for(let i=0;i<p.value.length;i++)map.set(b+i,c+i);b+=p.value.length;c+=p.value.length;}}map.set(base.length,current.length);return map;}
function editText(type,before,after,rebase){
 const old=before?.text||'',next=after.text||'';
 if(!rebase||type.toString()===old){let pos=0;for(const p of changes(old,next)){if(p.added){type.insert(pos,p.value,{});pos+=p.value.length;}else if(p.removed)type.delete(pos,p.value.length);else pos+=p.value.length;}}
 else{
  const mapping=baselineMap(old,type.toString()),ops=[];let pos=0;
  for(const p of changes(old,next)){
   if(p.added){let anchor=pos;while(anchor<=old.length&&!mapping.has(anchor))anchor++;ops.push({at:mapping.get(anchor)??type.length,insert:p.value});}
   else if(p.removed){for(let i=pos;i<pos+p.value.length;i++)if(mapping.has(i))ops.push({at:mapping.get(i),remove:true});pos+=p.value.length;}
   else pos+=p.value.length;
  }
  // Reverse application keeps offsets stable. Insertions at a removed anchor
  // are applied after removal; retained remote insertions are never deleted.
  ops.sort((a,b)=>b.at-a.at||(a.remove?-1:1));for(const op of ops){if(op.remove)type.delete(op.at,1);else type.insert(op.at,op.insert,{});}
 }
 const wanted=marks(after.formatting||'',next.length);
 if(type.toString()===next){
  const actual=type.toDelta(),bounds=new Set([0,next.length]);let offset=0;
  for(const p of actual){offset+=p.insert.length;bounds.add(offset);}for(const m of wanted){bounds.add(m.start);bounds.add(m.end);}
  const points=[...bounds].sort((a,b)=>a-b);let i=0,at=0;
  for(let k=0;k<points.length-1;k++){
   const from=points[k],to=points[k+1];while(i<actual.length&&at+actual[i].insert.length<=from){at+=actual[i].insert.length;i++;}
   const existing=actual[i]?.attributes||{},desired=Object.fromEntries(wanted.filter(m=>m.start<=from&&m.end>=to).map(m=>[m.style,true]));
   const patch={};for(const style of new Set([...Object.keys(existing),...Object.keys(desired)]))if(existing[style]!==desired[style])patch[style]=desired[style]||null;
   if(Object.keys(patch).length&&to>from)type.format(from,to-from,patch);
  }
 }else if((before?.formatting||'')!==(after.formatting||'')){
  // Migration-only formatting is mapped onto surviving text. Never clear styles
  // received from another device merely because an older snapshot lacked them.
  const mapping=baselineMap(next,type.toString());for(const m of wanted){const hits=[];for(let i=m.start;i<m.end;i++)if(mapping.has(i))hits.push(mapping.get(i));for(const p of hits)type.format(p,1,{[m.style]:true});}
 }
}
export function documentLeaves(doc){
 const root=Object.fromEntries(Object.entries(doc).filter(([k])=>k!=='tables'));
 root.web={...root.web};
 for(const name of ['calendarEvents','studyFolders'])if(Array.isArray(root.web[name]))root.web[name]=Object.fromEntries(root.web[name].map(row=>[row.id,row]));
 if(root.web.workdays){root.web.workdays={...root.web.workdays};if(Array.isArray(root.web.workdays.schedules))root.web.workdays.schedules=Object.fromEntries(root.web.workdays.schedules.map(row=>[row.effectiveFrom,row]));if(Array.isArray(root.web.workdays.policies))root.web.workdays.policies=Object.fromEntries(root.web.workdays.policies.map(row=>[row.effectiveFrom,row]));}
 return leaves(root);
}
/** A document's shared content as independent keyed parts: root leaves and table rows.
 Every CRDT key belongs to exactly one part, which is what lets sync v3 store parts in buckets. */
export function documentParts(doc){
 const d=doc?cloudDocument(doc):{tables:{},web:{},columns:{},preferences:{}},tables=new Map();
 for(const [name,rows] of Object.entries(d.tables))tables.set(name,new Map((rows||[]).map((n,i)=>[rowKey(name,n,i),n])));
 return {leaves:documentLeaves(d),tables};
}
export function applyIntent(d,before,after,assetsBefore=[],assetsAfter=[],rebase=false){
 applyParts(d,documentParts(before),documentParts(after),assetsBefore,assetsAfter,rebase);
}
/** Writes the difference between two sets of parts into `d` (see documentParts). */
export function applyParts(d,b,a,assetsBefore=[],assetsAfter=[],rebase=false){
 const fields=d.getMap('fields'),rows=d.getMap('rows'),tables=d.getMap('tables'),assets=d.getMap('assets');
 d.transact(()=>{
  const bf=b.leaves,af=a.leaves;
  for(const [k,v] of af)if(!same(bf.get(k),v))fields.set(k,v);
  for(const k of bf.keys())if(!af.has(k))fields.delete(k);
  for(const name of new Set([...b.tables.keys(),...a.tables.keys()])){
   if(!tables.has(name))tables.set(name,true);
   const prior=b.tables.get(name)||new Map(),next=a.tables.get(name)||new Map();
   for(const [id,n]of next){const old=prior.get(id);if(old===n||same(old,n))continue;
    if(rows.get(id)!==true)rows.set(id,true);
    for(const key of new Set([...Object.keys(old||{}),...Object.keys(n)])){
     if(name==='bullets'&&['text','formatting','collapsed','parentId','position'].includes(key))continue;
     if(!same(old?.[key],n[key])){const path=JSON.stringify(['row',id,key]);if(n[key]===undefined)fields.delete(path);else fields.set(path,n[key]);}
    }
    if(name==='bullets'&&(!old||old.parentId!==n.parentId||old.position!==n.position))fields.set(JSON.stringify(['row',id,'_syncLocation']),{parentId:n.parentId,position:n.position});
    // Undo/Trash restore retains the Y.Text for concurrent edits. Use its
    // deletion baseline so making the row visible does not insert a second copy.
    const textBefore=old||fields.get(JSON.stringify(['row',id,'_syncDeletedValue']));
    if(name==='bullets'&&(!textBefore||textBefore.text!==n.text||textBefore.formatting!==n.formatting)){
      editText(d.getText('text:'+id),textBefore,n,rebase||!old&&!!textBefore);
      const raw=n.formatting||'',parsed=marks(raw,n.text.length),path=JSON.stringify(['row',id,'_syncLegacyFormatting']);
      if(raw.split(';').filter(Boolean).length!==parsed.length)fields.set(path,{text:n.text,formatting:raw});else fields.delete(path);
    }
   }
   for(const id of prior.keys())if(!next.has(id)){fields.set(JSON.stringify(['row',id,'_syncDeletedValue']),prior.get(id));rows.set(id,false);}
  }
  const oldAssets=new Map(assetsBefore.map(x=>[x.path,x])),newAssets=new Map(assetsAfter.map(x=>[x.path,x]));
  for(const [path,v]of newAssets)if(!same(oldAssets.get(path),v))assets.set(path,v);
  for(const path of oldAssets.keys())if(!newAssets.has(path))assets.delete(path);
 });
}
/** Reads one Yjs document's raw content (root fields, visible rows, table names, assets).
 Sync v3 caches this per bucket and assembles many with assembleParts. */
export function projectParts(d){
 const fields=d.getMap('fields'),rows=d.getMap('rows'),allRows=new Map(),rootFields=[],out=[];
 for(const [key,value]of fields){
  const path=JSON.parse(key);if(path[0]==='row'){if(!allRows.has(path[1]))allRows.set(path[1],{});if(!safe([path[2]]))throw Error('Invalid row field');allRows.get(path[1])[path[2]]=value;}
  else rootFields.push({path,value});
 }
 for(const [id,exists]of rows){const [table]=JSON.parse(id),row=allRows.get(id)||{},deleted=row._syncDeletedValue;delete row._syncDeletedValue;
  if(table==='bullets'){
   if(row._syncLocation)Object.assign(row,row._syncLocation);delete row._syncLocation;
   const text=d.getText('text:'+id),ranges=[];let offset=0;
   for(const p of text.toDelta()){if(typeof p.insert!=='string')throw Error('Unsupported rich text');for(const [style,on]of Object.entries(p.attributes||{}))if(on)ranges.push({start:offset,end:offset+p.insert.length,style});offset+=p.insert.length;}
   Object.assign(row,{text:text.toString(),formatting:row._syncLegacyFormatting?.text===text.toString()?row._syncLegacyFormatting.formatting:encode(ranges),collapsed:false});delete row._syncLegacyFormatting;
  }
  // Concurrent edit vs delete recovers the edited record automatically. A
  // deletion made after observing that edit still removes the record normally.
  if(!exists&&(!deleted||sameRecord(row,deleted,table)))continue;
  out.push({key:id,table,row});
 }
 return {rootFields,rows:out,tables:[...d.getMap('tables').keys()],assets:[...d.getMap('assets').values()]};
}
/** Builds the document from the parts of one or more Yjs documents. */
export function assembleParts(list,{clone=true}={}){
 const doc={tables:{},columns:{},preferences:{},web:{}},rootFields=[],assets=[];
 for(const p of list){for(const name of p.tables)doc.tables[name]=[];rootFields.push(...p.rootFields);assets.push(...p.assets);}
 rootFields.sort((a,b)=>a.path.length-b.path.length);for(const {path,value}of rootFields)putPath(doc,path,structuredClone(value));
 for(const p of list)for(const {table,row}of p.rows)(doc.tables[table]||=[]).push(clone?structuredClone(row):row);
 for(const name of ['calendarEvents','studyFolders'])if(plain(doc.web[name]))doc.web[name]=Object.values(doc.web[name]).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
 if(plain(doc.web.workdays?.schedules))doc.web.workdays.schedules=Object.values(doc.web.workdays.schedules).sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom));
 if(plain(doc.web.workdays?.policies))doc.web.workdays.policies=Object.values(doc.web.workdays.policies).sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom));
 for(const list of Object.values(doc.tables))list.sort((a,b)=>String(a.id??a.rootId??a.token??a.deckId).localeCompare(String(b.id??b.rootId??b.token??b.deckId)));
 // A new or partly stored account still projects every table and the default settings,
 // so the app never sees a document without, for example, tables.media.
 const base=emptyShared();
 for(const [name,rows] of Object.entries(base.tables))if(!Array.isArray(doc.tables[name]))doc.tables[name]=rows;
 doc.columns={...base.columns,...doc.columns};
 for(const [key,value] of Object.entries(base.preferences))if(!plain(doc.preferences[key]))doc.preferences[key]=value;
 if(!doc.web.contract)doc.web.contract=base.web.contract;
 return {doc,assets:assets.sort((a,b)=>a.path.localeCompare(b.path))};
}
export function project(d){return assembleParts([projectParts(d)]);}
export function seed(doc,assets=[]){const d=new Y.Doc();applyIntent(d,null,doc,[],assets);return d;}
export function normalizeTree(doc){
 const nodes=doc.tables.bullets,byId=new Map(nodes.map(n=>[n.id,n]));
 for(const node of nodes){
  if(node.parentId&&!byId.has(node.parentId))node.parentId=null;
  if(node.mirrorSourceId&&!byId.has(node.mirrorSourceId)||node.mirrorRootId&&!byId.has(node.mirrorRootId)){delete node.mirrorSourceId;delete node.mirrorRootId;}
 }
 const complete=new Set();
 for(const node of nodes){const path=[],seen=new Map();let current=node;
  while(current&&!complete.has(current.id)){if(seen.has(current.id)){const cycle=path.slice(seen.get(current.id));cycle.sort((a,b)=>a.id.localeCompare(b.id))[0].parentId=null;break;}seen.set(current.id,path.length);path.push(current);current=byId.get(current.parentId);}
  for(const item of path)complete.add(item.id);
 }
 // Concurrent attachment/deck creation and deletion must not discard the item.
 // Recover its retained source record as a root in the server normalization pass.
 validate(nodes);return doc;
}
