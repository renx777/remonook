import {calendarEvents,eventsOnDate,occurrenceComplete} from './calendar-events.mjs';
import {taskCatalog} from './tasks.mjs';
const formats=new Map();
function format(zone){let f=formats.get(zone);if(!f){f=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});if(formats.size>=32)formats.delete(formats.keys().next().value);formats.set(zone,f);}return f;}
export function zoneParts(at,zone){const p=Object.fromEntries(format(zone).formatToParts(new Date(at)).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`,stamp:Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`)};}
export function wallTime(date,time,zone){
 const target=Date.parse(date+'T'+time+':00Z');if(!Number.isFinite(target))throw Error('Invalid reminder time');
 const offset=at=>zoneParts(at,zone).stamp-Math.floor(at/1000)*1000;
 const offsets=new Set([-36,-12,0,12,36].map(h=>offset(target+h*3600000))),candidates=[...offsets].map(o=>target-o),exact=candidates.filter(at=>zoneParts(at,zone).stamp===target);
 if(exact.length)return Math.min(...exact); // First instance of an ambiguous fall-back minute.
 const later=candidates.filter(at=>zoneParts(at,zone).stamp>target).sort((a,b)=>a-b)[0];if(later===undefined)throw Error('Invalid reminder time zone');
 // A skipped spring minute fires at the first valid minute after the gap.
 let low=Math.floor((later-4*3600000)/60000),high=Math.ceil(later/60000);while(low<high){const mid=Math.floor((low+high)/2);if(zoneParts(mid*60000,zone).stamp>=target)high=mid;else low=mid+1;}return low*60000;
}
const nextDay=date=>new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10);
export function reminderSchedule(doc,zone,now=Date.now(),receipts=new Set()){
 const today=zoneParts(now,zone).date,tomorrow=nextDay(today),items=[];
 const tasks=taskCatalog(doc,today).tasks;
 for(const date of [today,tomorrow]){
  for(const e of eventsOnDate(calendarEvents(doc),date))if(e.time&&!occurrenceComplete(e,date))items.push({key:`event:${e.id}:${date}:${e.time}`,date,at:wallTime(date,e.time,zone)});
  for(const t of tasks)if(t.node.taskState==='TODO'&&t.plan.taskPlanning==='ACTIVE'&&t.plan.scheduledDate===date&&t.plan.taskStartTime)items.push({key:`task:${t.node.id}:${date}:${t.plan.taskStartTime}`,date,at:wallTime(date,t.plan.taskStartTime,zone)});
 }
 const remaining=items.filter(i=>!receipts.has(i.key));return {today,due:remaining.filter(i=>i.date===today&&i.at<=now),next:Math.min(wallTime(tomorrow,'00:00',zone)+1000,...remaining.filter(i=>i.at>now).map(i=>i.at))};
}
export function reminderFieldsChanged(before,after){
 const root=p=>JSON.stringify(p.rootFields.filter(f=>f.path[0]==='web'&&f.path[1]==='calendarEvents'));
 if(root(before)!==root(after))return true;
 const keys=['taskState','taskPlanning','scheduledDate','taskStartTime','mirrorSourceId'];
 const pick=p=>new Map(p.rows.filter(r=>r.table==='bullets'&&r.row.taskState==='TODO'&&r.row.taskStartTime).map(r=>[r.key,JSON.stringify(keys.map(k=>r.row[k]))]));
 const b=pick(before),a=pick(after);return a.size!==b.size||[...a].some(([k,v])=>b.get(k)!==v);
}
