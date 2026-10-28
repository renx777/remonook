import {validate} from './domain.mjs';
import {validateMirrors} from './relations.mjs';
import {validateStudyLibrary} from './study-library.mjs';
import {validateOcclusions} from './occlusion.mjs';
import {validateWorkdays,emptyWorkdays} from './workdays.mjs';
import {validateCalendarEvents} from './calendar-events.mjs';
import {validateDashboard} from './dashboard.mjs';
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
function mergeKeyedRows(base,local,remote,key,path,conflicts,mergeRow=choose) {
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
    const chosen=mergeRow(b,l,r,path+'/'+id,conflicts);
    if(chosen!==absent)result.push(chosen);
  }
  return result;
}
const keyedTables=new Set(['goals','concepts','cards','review_logs','bullets','media','emojis','decks','trash','study_sessions','study_limits']);
const keyForTable = table => !keyedTables.has(table)?null:table==='decks'?'rootId':table==='emojis'?'token':table==='study_limits'?'deckId':'id';

// Merge fields only for existing bullets. Delete/edit and colliding creations
// remain conflicts. Text/format offsets and move coordinates are atomic pairs.
function mergeBullet(base,local,remote,path,conflicts){
 if(![base,local,remote].every(plain))return choose(base,local,remote,path,conflicts);
 const groups=[['text','formatting'],['parentId','position']];
 const grouped=new Set(groups.flat()),result=mergeObject(
   Object.fromEntries(Object.entries(base).filter(([k])=>!grouped.has(k))),
   Object.fromEntries(Object.entries(local).filter(([k])=>!grouped.has(k))),
   Object.fromEntries(Object.entries(remote).filter(([k])=>!grouped.has(k))),path,conflicts);
 for(const group of groups){
   const values=[base,local,remote].map(o=>Object.fromEntries(group.filter(k=>own(o,k)).map(k=>[k,o[k]])));
   const chosen=choose(...values,path+'.'+group.join('/'),conflicts);
   if(chosen!==absent)Object.assign(result,chosen);
 }
 return result;
}
const mergeMap=(b,l,r,path,errors)=>mergeObject(b===absent?{}:b,l===absent?{}:l,r===absent?{}:r,path,errors);
function mergeTimes(b,l,r,path,errors){
 const names=keys(b,l,r),handlers={};
 for(const name of names)handlers[name]=(base,left,right,p,e)=>{
   if(![left,right].every(plain))return choose(base,left,right,p,e);
   const out=mergeObject(base,left,right,p,e,{
     createdAt:(a,c,d)=>Math.min(...[a,c,d].filter(v=>typeof v==='number'&&Number.isFinite(v))),
     updatedAt:(a,c,d)=>Math.max(...[a,c,d].filter(v=>typeof v==='number'&&Number.isFinite(v)))
   });return out;
 };
 return mergeObject(b===absent?{}:b,l===absent?{}:l,r===absent?{}:r,path,errors,handlers);
}
function mergeWorkdays(b,l,r,path,errors){
 // Defaults permit independent first-time entries without treating missing data
 // as a deletion. Whole-feature removal still requires review.
 if(b===absent&&plain(l)&&plain(r))b=emptyWorkdays();
 if([b,l,r].some(x=>x===absent))return choose(b,l,r,path,errors);
 return mergeObject(b,l,r,path,errors,{
   entries:mergeMap,holidays:mergeMap,allowances:mergeMap,
   policies:(a,c,d,p,e)=>mergeKeyedRows(a,c,d,'effectiveFrom',p,e)
 });
}

function validateMerged(doc,conflicts){
  try{
    const nodes=doc.tables?.bullets;
    if(!Array.isArray(nodes))throw Error('Missing outline');
    validate(nodes);
    validateMirrors(nodes);
    validateStudyLibrary(doc.web);
    validateOcclusions(doc.web.occlusions);
    validateWorkdays(doc.web.workdays);
    validateCalendarEvents(doc.web.calendarEvents);
    validateDashboard(doc.web.dashboard);
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
   const idField=keyForTable(name);
   const stableIds = idField!==null&&[x,y,z].every(Array.isArray)&&[...x,...y,...z].every(row=>plain(row)&&own(row,idField));
   tables[name]=stableIds?mergeKeyedRows(x,y,z,keyForTable(name),'tables.'+name,conflicts,name==='bullets'?mergeBullet:choose):choose(x,y,z,'tables.'+name,conflicts);
 }
 const columns=mergeObject(b.columns,l.columns,r.columns,'columns',conflicts);
 const prefHandlers=Object.fromEntries(keys(b.preferences,l.preferences,r.preferences).map(k=>[k,mergeMap]));
 const preferences=mergeObject(b.preferences,l.preferences,r.preferences,'preferences',conflicts,prefHandlers);
 const mapHandlers={};
 for(const name of ['occlusions','deckTypes','deckFolders','mcqs','deckDesigns','musicNodes','galleryNodes'])mapHandlers[name]=mergeMap;
 mapHandlers.noteTimes=mergeTimes;
 mapHandlers.workdays=mergeWorkdays;
 mapHandlers.dashboard=(a,c,d,p,e)=>{
  const recursive=(b,l,r,path,errors)=>mergeObject(b===absent?{}:b,l===absent?{}:l,r===absent?{}:r,path,errors,Object.fromEntries(keys(b,l,r).filter(key=>[prop(b,key),prop(l,key),prop(r,key)].every(value=>value===absent||plain(value))).map(key=>[key,recursive])));
  return recursive(a,c,d,p,e);
 };
 for(const name of ['calendarEvents','studyFolders'])mapHandlers[name]=(a,c,d,p,e)=>mergeKeyedRows(a===absent?[]:a,c===absent?[]:c,d===absent?[]:d,'id',p,e);
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
 const mergedIds=new Set(doc.tables.bullets.map(n=>n.id));
 const mergedNodes=doc.tables.bullets.filter(n=>!before.has(n.id)||!equalSyncValue(n,before.get(n.id))).length+
   b.tables.bullets.filter(n=>!mergedIds.has(n.id)).length;
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

export function describeSyncConflict(path,doc){
 const node=path.match(/^tables\.bullets\/([^/.]+)(?:\.(.*))?$/);
 if(node){const title=doc?.tables?.bullets?.find(n=>n.id===node[1])?.text?.slice(0,80)||'Deleted note';
   return `“${title}”: ${node[2]?.includes('text')?'both devices changed its text or formatting':node[2]?.includes('parentId')?'both devices moved this note':'overlapping changes or a deletion and edit'}.`;}
 if(path.startsWith('web.workdays.entries.'))return 'Workdays: both devices changed '+path.slice('web.workdays.entries.'.length)+'.';
 if(path.startsWith('web.workdays.'))return 'Workdays: overlapping changes to '+path.split('.')[2]+'.';
 if(path.startsWith('assets'))return 'An attachment was changed differently on both devices.';
 if(path.startsWith('preferences'))return 'The same setting was changed on both devices.';
 if(path.startsWith('web.calendarEvents'))return 'The same calendar reminder was changed on both devices.';
 if(path.startsWith('Outline or linked records:'))return 'The combined changes would leave an invalid outline or a broken link. Both copies have been kept.';
 if(path.startsWith('tables.'))return 'Overlapping changes to study or note records need review.';
 if(path.startsWith('web.'))return 'Overlapping changes to workspace settings need review.';
 return path;
}
