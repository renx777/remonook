// The checks the sync v3 server runs on every accepted change, shared with the app so a
// refused batch can be repaired on the device with exactly the same rules.
import {validate} from './domain.mjs';
import {validateBookmarks} from './bookmarks.mjs';
import {validateDashboard} from './dashboard.mjs';
import {validateReading} from './reading.mjs';
import {validateReadingBooks} from './book-storage.mjs';
import {validateWorkdays} from './workdays.mjs';
import {validateCalendarEvents} from './calendar-events.mjs';
import {validateStudyLibrary} from './study-library.mjs';
import {validateOcclusions} from './occlusion.mjs';
import {recoveryNotes} from './sync-recovery-notes.mjs';

export const FILE_LIMIT=2*1024*1024,ASSET_LIMIT=20*1024*1024,ASSET_COUNT=2000;
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};

/** One projected record. Tree structure is repaired at read time, not checked here. */
export function checkRow(table,row){
 if(!row||typeof row!=='object')fail('Invalid record');
 if(table==='bullets')validate([{...row,parentId:null}]);
}
/** Root settings, by domain. Each check receives the whole `web` object. */
export const ROOT_CHECKS=[
 ['Books',web=>validateReadingBooks(web.readingBooks)],
 ['Reading',web=>validateReading(web)],
 ['Bookmarks',web=>validateBookmarks(web)],
 ['Dashboard',web=>validateDashboard(web.dashboard)],
 ['Workdays',web=>validateWorkdays(web.workdays)],
 ['Calendar reminders',web=>validateCalendarEvents(web.calendarEvents)],
 ['Study library',web=>validateStudyLibrary(web)],
 ['Image occlusion',web=>validateOcclusions(web.occlusions)],
];
export function checkRoot(web){for(const [name,check] of ROOT_CHECKS)try{check(web);}catch(e){fail(`${name}: ${e.message}`);}}
const assetProblem=a=>typeof a?.path!=='string'||!a.path||a.path.length>500||!/^[a-f0-9]{64}$/.test(a.hash)||!Number.isSafeInteger(a.size)||a.size<0||a.size>FILE_LIMIT||typeof a.type!=='string'||a.type.length>150;
export function checkAssets(assets){
 if(assets.length>ASSET_COUNT)fail('Too many attachments.',413);
 const paths=new Set();let bytes=0;
 for(const a of assets){if(assetProblem(a)||paths.has(a.path))fail('Invalid attachment.');paths.add(a.path);bytes+=a.size;}
 if(bytes>ASSET_LIMIT)fail('Attachments exceed 20 MiB.',413);
}

const ok=fn=>{try{fn();return true;}catch{return false;}};
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const validDate=d=>{if(d==='')return true;if(typeof d!=='string'||!DATE.test(d))return false;const t=new Date(d+'T00:00:00Z');return !Number.isNaN(t.getTime())&&t.toISOString().slice(0,10)===d;};
/** A bullet with every invalid field replaced by its default; its text is always kept. */
function sanitizeBullet(row){
 const n={...row};
 if(typeof n.text!=='string')n.text=n.text==null?'':String(n.text);
 if(!Number.isInteger(n.position))n.position=Math.max(0,Math.round(Number(n.position))||0);
 if(n.parentId!==null&&typeof n.parentId!=='string')n.parentId=null;
 if(!['NOTE','QUESTION','ANSWER'].includes(n.kind))n.kind='NOTE';
 if(!['NONE','UNORDERED','ORDERED'].includes(n.listType))n.listType='NONE';
 if(!['NONE','TODO','DONE'].includes(n.taskState))n.taskState='NONE';
 for(const k of ['dueDate','journalDate'])if(!validDate(n[k]))n[k]='';
 return n;
}

/**
 * Makes a document pass every server check with the smallest change, keeping a readable copy
 * of anything replaced under "Recovered from this device". Returns null when nothing needed
 * repair (so a refusal has another cause, such as quota or an attachment still uploading).
 */
export function repairDocument(doc,assets=[]){
 const recovered=[];let tables=doc.tables,web=doc.web||{},fixedAssets=assets,changed=false;
 for(const [name,rows] of Object.entries(doc.tables||{})){
  if(!Array.isArray(rows))continue;
  let out=null;
  rows.forEach((row,i)=>{
   if(ok(()=>checkRow(name,row)))return;
   const fixed=name==='bullets'&&row&&typeof row==='object'&&typeof row.id==='string'&&row.id?sanitizeBullet(row):null;
   if(fixed&&!ok(()=>checkRow(name,fixed)))return;
   out||=[...rows];out[i]=fixed;recovered.push({label:`${name} record ${row?.id??i}`,value:row});
  });
  if(out){tables={...tables,[name]:out.filter(Boolean)};changed=true;}
 }
 for(const [name,check] of ROOT_CHECKS){
  if(ok(()=>check(web)))continue;
  // Remove the fewest settings keys that make this check pass; keep their values readable.
  const next={...web};
  for(const key of Object.keys(web)){if(ok(()=>check(next)))break;const value=next[key];delete next[key];if(ok(()=>check(next))){recovered.push({label:`${name} setting ${key}`,value});web=next;changed=true;break;}next[key]=value;}
  if(!ok(()=>check(web))){for(const key of Object.keys(web)){if(ok(()=>check(next)))break;recovered.push({label:`${name} setting ${key}`,value:next[key]});delete next[key];}web=next;changed=true;}
 }
 if(!ok(()=>checkAssets(fixedAssets))){
  const kept=[],paths=new Set();let bytes=0;
  for(const a of assets){if(assetProblem(a)||paths.has(a.path)||kept.length>=ASSET_COUNT||bytes+a.size>ASSET_LIMIT){recovered.push({label:'attachment',value:a});continue;}kept.push(a);paths.add(a.path);bytes+=a.size;}
  fixedAssets=kept;changed=true;
 }
 if(!changed)return null;
 return {doc:recoveryNotes({...doc,tables,web},recovered),assets:fixedAssets,recovered};
}
