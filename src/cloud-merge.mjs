import {validate} from './domain.mjs';
import {validateMirrors} from './relations.mjs';
import {validateStudyLibrary} from './study-library.mjs';
import {validateOcclusions} from './occlusion.mjs';
import {validateWorkdays} from './workdays.mjs';
import {cloudDocument} from './cloud-model.mjs';

// Identity-based three-way merge. Never resolve simultaneous edits to the
// same record by clock time or arrival order.
const absent = Symbol('missing');
const own = (value,key) => Object.prototype.hasOwnProperty.call(value,key);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const stable = value => {
  if (Array.isArray(value)) return '['+value.map(stable).join(',')+']';
  if (plain(value)) return '{'+Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
  return JSON.stringify(value);
};
export const equalSyncValue = (a,b) => a === absent ? b === absent : b !== absent && stable(a) === stable(b);
const choose = (base,local,remote,path,conflicts) => {
  if (equalSyncValue(local,remote)) return local;
  if (equalSyncValue(local,base)) return remote;
  if (equalSyncValue(remote,base)) return local;
  if (conflicts.length < 30) conflicts.push(path);
  return absent;
};
const keys = (...objects) => [...new Set(objects.flatMap(o=>plain(o)?Object.keys(o):[]))];
const prop = (object,key) => plain(object)&&own(object,key)?object[key]:absent;

function mergeObject(base,local,remote,path,conflicts,handlers={}) {
  if (![base,local,remote].every(o=>o===absent||plain(o))) return choose(base,local,remote,path,conflicts);
  const result={};
  for (const key of keys(base,local,remote)) {
    const b=prop(base,key),l=prop(local,key),r=prop(remote,key);
    const output=handlers[key] ? handlers[key](b,l,r,path+'.'+key,conflicts) : choose(b,l,r,path+'.'+key,conflicts);
    if(output!==absent)result[key]=output;
  }
  if (base===absent && local===absent && remote===absent) return absent;
  return result;
}
function mergeKeyedRows(base,local,remote,key,path,conflicts) {
  if (![base,local,remote].every(Array.isArray)) {
    return choose(base,local,remote,path,conflicts);
  }
  const maps=[];
  for(const rows of [base,local,remote]){
    const map=new Map();
    for(const row of rows){
      const id=row?.[key];
      if(!plain(row)||(typeof id!=='string'&&typeof id!=='number')||!String(id)||map.has(String(id))){
        if(conflicts.length<30)conflicts.push(path+' (invalid or duplicate ID)');
        return absent;
      }
      map.set(String(id),row);
    }
    maps.push(map);
  }
  const order=[...new Set([...maps[0].keys(),...maps[1].keys(),...maps[2].keys()])],result=[];
  for(const id of order){
    const [b,l,r]=maps.map(m=>m.has(id)?m.get(id):absent);
    const chosen=choose(b,l,r,path+'/'+id,conflicts);
    if(chosen!==absent)result.push(chosen);
  }
  return result;
}
const keyForTable = table => table==='decks'?'rootId':table==='emojis'?'token':table==='study_limits'?'deckId':'id';

function validateMerged(doc,conflicts){
  try{
    const nodes=doc.tables?.bullets;
    if(!Array.isArray(nodes))throw Error('Missing outline');
    validate(nodes);
    validateMirrors(nodes);
    validateStudyLibrary(doc.web);
    validateOcclusions(doc.web.occlusions);
    validateWorkdays(doc.web.workdays);
    const ids=new Set(nodes.map(n=>n.id)),media=new Set((doc.tables.media||[]).map(row=>row.id));
    for(const item of doc.tables.media||[])if(!ids.has(item.bulletId))throw Error('A media attachment refers to a removed node');
    for(const deck of doc.tables.decks||[])if(!ids.has(deck.rootId))throw Error('A deck refers to a removed node');
    for(const config of Object.values(doc.web.occlusions||{}))if(!ids.has(config.groupId)||!media.has(config.mediaId))throw Error('An occlusion refers to a removed node or image');
  }catch(error){
    if(conflicts.length<30)conflicts.push('Outline or linked records: '+(error?.message||String(error)));
  }
}

/**
 * @returns {{ok:boolean,doc?:object,conflicts:string[],mergedNodes?:number}}
 * Works with the existing complete-workspace API. A server-side revision CAS
 * must still protect the final write.
 */
export function mergeCloudWorkspaces(base,local,remote){
 const conflicts=[];
 if(!base||!local||!remote||!plain(base.tables)||!plain(local.tables)||!plain(remote.tables)||!plain(base.web)||!plain(local.web)||!plain(remote.web))return {ok:false,conflicts:['Missing common sync baseline']};
 const b=cloudDocument(base),l=cloudDocument(local),r=cloudDocument(remote);
 const tables={};
 for(const name of keys(b.tables,l.tables,r.tables)){
   const x=prop(b.tables,name),y=prop(l.tables,name),z=prop(r.tables,name);
   const stableIds = [x,y,z].every(Array.isArray)&&[...x,...y,...z].every(row=>plain(row)&&own(row,keyForTable(name)));
   tables[name]=stableIds?mergeKeyedRows(x,y,z,keyForTable(name),'tables.'+name,conflicts):choose(x,y,z,'tables.'+name,conflicts);
 }
 const columns=mergeObject(b.columns,l.columns,r.columns,'columns',conflicts);
 const preferences=mergeObject(b.preferences,l.preferences,r.preferences,'preferences',conflicts);
 const mapHandlers={};
 for(const name of ['noteTimes','occlusions','deckTypes','deckFolders','mcqs','deckDesigns'])mapHandlers[name]=(a,c,d,path,errors)=>mergeObject(a,c,d,path,errors);
 const web=mergeObject(b.web,l.web,r.web,'web',conflicts,mapHandlers);
 const doc={...b,tables,columns,preferences,web};
 // Unknown top-level extensions are never dropped silently.
 for(const key of keys(b,l,r).filter(key=>!['tables','columns','preferences','web'].includes(key))) {
   const value=choose(prop(b,key),prop(l,key),prop(r,key),key,conflicts);
   if(value!==absent)doc[key]=value;else delete doc[key];
 }
 if(!conflicts.length)validateMerged(doc,conflicts);
 if(conflicts.length)return {ok:false,conflicts};
 const before=new Map(b.tables.bullets.map(n=>[n.id,n]));
 const mergedNodes=doc.tables.bullets.filter(n=>!before.has(n.id)||!equalSyncValue(n,before.get(n.id))).length+
   b.tables.bullets.filter(n=>!doc.tables.bullets.some(item=>item.id===n.id)).length;
 return {ok:true,doc,conflicts:[],mergedNodes};
}

/** Immutable path/hash mapping, including safe additions and deletions. */
export function mergeAssetManifests(base,local,remote){
 const conflicts=[],name='assets';
 if(![base,local,remote].every(Array.isArray))return {ok:false,conflicts:['Missing common attachment baseline']};
 const merged=mergeKeyedRows(base,local,remote,'path',name,conflicts);
 if(conflicts.length||merged===absent)return {ok:false,conflicts};
 return {ok:true,assets:merged.sort((a,b)=>a.path.localeCompare(b.path)),conflicts:[]};
}
