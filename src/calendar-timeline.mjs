import {calendarEvents,eventsOnDate,saveCalendarEvent,occurrenceComplete} from './calendar-events.mjs';
import {taskCatalog,updateTask} from './tasks.mjs';
export const clockMinutes=s=>Number(s.slice(0,2))*60+Number(s.slice(3));
export const clockTime=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
export const snapMinute=n=>Math.max(0,Math.min(1435,Math.round(n/5)*5));
export function timelineItems(doc,date){
 const tasks=taskCatalog(doc,date).tasks.filter(t=>t.node.taskState==='TODO'&&t.plan.taskPlanning==='ACTIVE'&&t.plan.scheduledDate===date&&t.plan.taskStartTime).map(t=>({id:'task:'+t.node.id,source:t.node.id,type:'task',title:t.node.text||'Untitled task',time:t.plan.taskStartTime,minutes:t.plan.taskBlockMinutes||0}));
 return [...tasks,...eventsOnDate(calendarEvents(doc),date).filter(e=>e.time).map(e=>({id:'event:'+e.id,source:e.id,type:'event',title:e.title,time:e.time,minutes:0,done:occurrenceComplete(e,date)}))].sort((a,b)=>a.time.localeCompare(b.time)||a.id.localeCompare(b.id));
}
export function timelineLayout(items){
 const result=[];let group=[],ends=[],until=-1;
 const flush=()=>{for(const i of group)result.push({...i,lanes:ends.length});group=[];ends=[];};
 for(const item of items){const start=clockMinutes(item.time),end=start+Math.max(48,item.minutes);if(start>=until){flush();until=-1;}
  let lane=ends.findIndex(e=>e<=start);if(lane<0)lane=ends.length;ends[lane]=end;group.push({...item,start,end,lane});until=Math.max(until,end);
 }flush();return result;
}
export function changeTimelineItem(doc,item,patch){
 if(item.type==='task')return updateTask(doc,item.source,{...(patch.time!==undefined?{taskStartTime:patch.time}:{}),...(patch.minutes!==undefined?{taskBlockMinutes:patch.minutes}:{}),...(patch.date!==undefined?{scheduledDate:patch.date}:{})});
 const event=calendarEvents(doc).find(e=>e.id===item.source);if(!event)throw Error('This reminder was removed. Your form is kept.');return saveCalendarEvent(doc,{...event,time:patch.time??event.time});
}
