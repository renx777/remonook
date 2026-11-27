import {safeRandomUUID} from './domain.mjs';
import {TASK_FIELDS} from './task-fields.mjs';
import {repeatFieldInfo,repeatTemplate,creationRow,dateValid,stableCreation} from './task-repeat-fields.mjs';
// Version-one creation schema: do not derive it from an evolving bullet factory.
const creationV1=(id,extra={})=>({id,parentId:null,position:0,text:'',kind:'NOTE',collapsed:false,formatting:'',autoHighlight:false,listType:'NONE',codeLanguage:'',taskState:'NONE',dueDate:'',journalDate:'',...extra});
export function nextRepeatDate(date,template){
 if(!dateValid(date))throw Error('A repeating task needs a valid scheduled date.');
 const [y,m]=date.split('-').map(Number),[,am,ad]=template.anchor.split('-').map(Number);let next;
 const utc=(year,month,day)=>{const d=new Date(0);d.setUTCHours(0,0,0,0);d.setUTCFullYear(year,month,day);return d;};
 if(template.mode==='DAILY'||template.mode==='WEEKLY')next=new Date(Date.parse(date+'T00:00:00Z')+(template.mode==='DAILY'?1:7)*86400000);
 else {const year=template.mode==='YEARLY'?y+1:y,month=template.mode==='YEARLY'?am-1:m;const last=utc(year,month+1,0).getUTCDate();next=utc(year,month,Math.min(ad,last));}
 const out=next.toISOString().slice(0,10);if(!dateValid(out))throw Error('The next repeating task is beyond the supported calendar range.');return out;
}
/** @param {any} node @param {any} patch @param {{refreshRepeat?:boolean,make?:()=>string,doc?:any}} [options] */
export function configureTaskRepeat(node,patch,{refreshRepeat=false,make=safeRandomUUID,doc}={}){
 const next={...node,...patch},mode=next.taskRepeat||'NONE',prior=repeatTemplate(node.taskRepeatTemplate);
 const changed=refreshRepeat||node.taskRepeat!==mode||node.scheduledDate!==next.scheduledDate;
 const receipt=prior&&doc?.web?.taskRepeatReceipts?.[node.id]?.[prior.id];
 if(changed&&node.taskRepeat&&node.taskRepeat!=='NONE'&&receipt&&doc.tables.bullets.some(n=>n.id===receipt.nextId))throw Error('This occurrence already has a next task. Open that next task to change Repeat.');
 if(mode==='NONE')return next;
 if(!dateValid(next.scheduledDate))throw Error('Choose a scheduled date before enabling Repeat.');
 if(refreshRepeat||!repeatTemplate(next.taskRepeatTemplate)||node.taskRepeat!==mode||node.scheduledDate!==next.scheduledDate){
  const context=repeatTemplate(node.taskRepeatTemplate)?.context||node.id;
  const anchor=prior&&node.taskRepeat===mode&&node.scheduledDate===next.scheduledDate?prior.anchor:next.scheduledDate;
  const template={v:1,id:make(),mode,anchor,text:next.text,formatting:next.formatting||'',context,origin:node.id};
  const raw=JSON.stringify(template);if(!repeatTemplate(raw))throw Error('This task is too large for a repeat template (64,000 characters).');next.taskRepeatTemplate=raw;
 }
 return next;
}
/** Incremental creation only; never rewrites an existing successor, receipt or source. */
export function advanceRecurringTasks(doc,input=doc.tables.bullets,previous){
 if(!input.some(n=>n.taskRepeat&&n.taskRepeat!=='NONE'||n.taskRepeatSeed))return doc.tables.bullets===input?doc:{...doc,tables:{...doc.tables,bullets:input}};
 const prior=previous||new Map(doc.tables.bullets.map(n=>[n.id,n]));
 const supplied=input;input=input.map(n=>{
  if(n.mirrorSourceId&&n.taskRepeatSeed){const copy={...n};delete copy.taskRepeatSeed;return copy;}
  if(!n.taskRepeatTemplate)return n;const info=repeatFieldInfo(n);
  if(info.pattern&&(!info.seedId||info.seedId!==n.id)&&info.origin!==n.id&&!n.id.startsWith('rt:'+info.pattern+':')){const t=repeatTemplate(n.taskRepeatTemplate);
   const copy={...n,taskRepeatTemplate:JSON.stringify({...t,id:safeRandomUUID(),context:n.id,origin:n.id,text:n.text,formatting:n.formatting||''})};delete copy.taskRepeatSeed;return copy;
  }
  return n;
 });
 if(input.every((n,i)=>n===supplied[i]))input=supplied;
 const receipts=doc.web.taskRepeatReceipts||{},ids=new Map(input.map(n=>[n.id,n]));let nodes=input,nextReceipts=receipts;
 for(const source of input){if(source.mirrorSourceId||source.taskState!=='DONE'||!source.taskRepeat||source.taskRepeat==='NONE')continue;
  const info=repeatFieldInfo(source);if(!info.pattern)continue;
  if(Object.hasOwn(receipts,source.id)&&Object.hasOwn(receipts[source.id],info.pattern))continue;const t=repeatTemplate(source.taskRepeatTemplate);
  const date=nextRepeatDate(source.scheduledDate,t),id='rt:'+t.id+':'+date;
  // Frozen text identities; placement and non-text settings can merge independently.
  const seed=creationV1(id,{text:t.text,formatting:t.formatting,taskState:'TODO',scheduledDate:date,taskRepeat:t.mode,taskRepeatTemplate:source.taskRepeatTemplate,parentId:null,position:0});
  const raw=stableCreation(seed),existing=ids.get(id);
  if(existing&&existing.taskRepeatSeed!==raw)throw Error('A recurring task identity is already in use. Your existing notes were kept.');
  if(!existing){
   const parentId=source.parentId&&ids.has(source.parentId)?source.parentId:null,position=Math.max(-1,...nodes.filter(n=>n.parentId===parentId).map(n=>n.position))+1;
   const fields=Object.fromEntries(['taskPlanning','taskPriority','taskDurationMinutes','taskStartTime','taskBlockMinutes','listType','codeLanguage','blockStyle','bulletColor'].filter(k=>source[k]!==undefined).map(k=>[k,source[k]]));
   const note={...seed,...fields,parentId,position,taskRepeatSeed:raw};
   const contextId=id+':context',context=creationV1(contextId,{parentId:id,position:0,text:`[[Series context|${t.context}]]`});
   const contextRaw=stableCreation(context);nodes=[...nodes,note,{...context,taskRepeatSeed:contextRaw}];ids.set(id,note);
  }
  nextReceipts={...nextReceipts,[source.id]:{...(Object.hasOwn(nextReceipts,source.id)?nextReceipts[source.id]:{}),[t.id]:{source:source.id,pattern:t.id,nextId:id,date}}};
 }
 if(nextReceipts===receipts)return doc.tables.bullets===input?doc:{...doc,tables:{...doc.tables,bullets:input}};
 const columns=[...new Set([...doc.columns.bullets,...TASK_FIELDS.filter(k=>nodes.some(n=>n[k]!=null))])];
 const noteTimes={...doc.web.noteTimes};for(const n of nodes)if(!prior.has(n.id))noteTimes[n.id]={createdAt:Date.now(),updatedAt:Date.now()};
 return {...doc,columns:{...doc.columns,bullets:columns},web:{...doc.web,noteTimes,taskRepeatReceipts:nextReceipts},tables:{...doc.tables,bullets:nodes}};
}
export function hasPendingRepeat(doc){return doc.tables.bullets.some(n=>!n.mirrorSourceId&&n.taskState==='DONE'&&n.taskRepeat&&n.taskRepeat!=='NONE'&&repeatFieldInfo(n).pattern&&!doc.web.taskRepeatReceipts?.[n.id]?.[repeatFieldInfo(n).pattern]);}
