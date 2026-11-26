import {index} from './domain.mjs';
import {withNodes} from './workspace-nodes.mjs';
import {TASK_FIELDS,taskPlan,validTaskField} from './task-fields.mjs';
import {traitBulletIds} from './traits-block.mjs';
import {INBOX_ID,startInboxCapture} from './inbox.mjs';
export {taskPlan};
export const TASK_VIEWS=[['inbox','Inbox'],['today','Today'],['upcoming','Upcoming'],['anytime','Anytime'],['someday','Someday'],['waiting','Waiting'],['completed','Completed']];
export function taskCatalog(doc,today){
 const nodes=doc.tables.bullets,idx=index(nodes),hidden=traitBulletIds(nodes),seen=new Set(),tasks=[];
 for(const shown of nodes){
  const source=shown.mirrorSourceId||shown.id,node=idx.byId.get(source);
  if(!node||node.taskState==='NONE'||hidden.has(node.id)||seen.has(source))continue;
  seen.add(source);
  let at=node,inbox=false,project=node;const path=[],visited=new Set();
  while(at&&!visited.has(at.id)){visited.add(at.id);if(at.id===INBOX_ID)inbox=true;project=at;if(at.id!==node.id)path.unshift(at.text||'Untitled');at=idx.byId.get(at.parentId);}
  const plan=taskPlan(node),deadline=node.dueDate||'',active=plan.taskPlanning==='ACTIVE';
  const inToday=!!(deadline&&deadline<=today)||!!(active&&plan.scheduledDate&&plan.scheduledDate<=today);
  tasks.push({node,plan,deadline,inbox,inToday,projectId:node.parentId===null?'__unfiled':project.id,project:node.parentId===null?'My notes':project.text||'Untitled',path:path.join(' / ')||'My notes'});
 }
 const list=view=>tasks.filter(t=>{
  if(view==='completed')return t.node.taskState==='DONE';if(t.node.taskState!=='TODO')return false;
  if(view==='inbox')return t.inbox;
  if(view==='today')return t.inToday;
  if(view==='upcoming')return !t.inToday&&!!((t.plan.taskPlanning==='ACTIVE'&&t.plan.scheduledDate&&t.plan.scheduledDate>today)||(t.deadline&&t.deadline>today));
  if(view==='anytime')return t.plan.taskPlanning==='ACTIVE'&&!t.plan.scheduledDate&&!t.inToday;
  if(view==='someday')return t.plan.taskPlanning==='SOMEDAY';
  if(view==='waiting')return t.plan.taskPlanning==='WAITING';return false;
 });
 return {tasks,list,counts:Object.fromEntries(TASK_VIEWS.map(([id])=>[id,list(id).length]))};
}
export function updateTask(doc,id,patch){
 const shown=doc.tables.bullets.find(n=>n.id===id),source=shown?.mirrorSourceId||id,node=doc.tables.bullets.find(n=>n.id===source);
 if(!node)throw Error('This task was removed. Your other notes are unchanged.');
 if(node.taskState==='NONE')throw Error('This bullet is no longer a task. Open its note to make it a task again.');
 const allowed=new Set([...TASK_FIELDS,'dueDate','taskState']);
 for(const [key,value]of Object.entries(patch)){
  if(!allowed.has(key))throw Error('Unsupported task change.');
  if(key==='taskState'){if(!['TODO','DONE'].includes(value))throw Error('Invalid task state.');}
  else if(key==='dueDate'){if(typeof value!=='string'||!validTaskField('scheduledDate',value))throw Error('Invalid deadline.');}
  else if(!validTaskField(key,value)||value==null)throw Error('Invalid task planning value.');
 }
 const planned=taskPlan({...node,...patch});if((planned.taskStartTime||planned.taskBlockMinutes)&&(!planned.scheduledDate||!planned.taskStartTime||!planned.taskBlockMinutes))throw Error('A time block needs a scheduled date, start time and duration.');
 if(Object.entries(patch).every(([k,v])=>node[k]===v))return doc;
 return withNodes(doc,doc.tables.bullets.map(n=>n.id===source?{...n,...patch}:n));
}
export function startTask(doc,id){const result=startInboxCapture(doc,id);return {...result,doc:withNodes(result.doc,result.doc.tables.bullets.map(n=>n.id===result.id?{...n,taskState:'TODO'}:n))};}
export function taskDateCounts(doc){
 const dates=new Map();
 for(const t of taskCatalog(doc,'').tasks)if(t.node.taskState==='TODO')for(const date of new Set([t.deadline,t.plan.scheduledDate].filter(Boolean))){if(!dates.has(date))dates.set(date,new Set());dates.get(date).add(t.node.id);}
 return new Map([...dates].map(([date,ids])=>[date,ids.size]));
}
