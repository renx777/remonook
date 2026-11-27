import {calendarEvents,eventsOnDate,localDate,occurrenceComplete} from './calendar-events.mjs';
import {taskCatalog} from './tasks.mjs';
// Compare local wall-clock components: a DST-skipped minute is delivered on the
// next visible tick, and a repeated minute has the same occurrence identity.
export function dueReminders(doc,now=new Date()){
 const day=localDate(now),minute=now.getHours()*60+now.getMinutes(),due=time=>time&&Number(time.slice(0,2))*60+Number(time.slice(3))<=minute;
 return [...eventsOnDate(calendarEvents(doc),day).filter(e=>due(e.time)&&!occurrenceComplete(e,day)).map(e=>({key:'event:'+e.id+':'+day,title:e.title})),...taskCatalog(doc,day).tasks.filter(t=>t.node.taskState==='TODO'&&t.plan.taskPlanning==='ACTIVE'&&t.plan.scheduledDate===day&&due(t.plan.taskStartTime)).map(t=>({key:'task:'+t.node.id+':'+day,title:(t.node.text||'Scheduled task').slice(0,160)}))];
}
