/** @typedef {{id:string,title:string,kind:string,date:string,time:string,repeat:string,leadDays:number,notes:string,completed:string[],countdown?:boolean}} CalendarEvent */
export const eventKinds=[
 {id:'birthday',name:'Birthday',icon:'birthday',repeat:'yearly',lead:7},
 {id:'exam',name:'Exam / assignment',icon:'study',repeat:'none',lead:14},
 {id:'bill',name:'Bill payment',icon:'bill',repeat:'monthly',lead:7},
 {id:'appointment',name:'Appointment',icon:'calendar',repeat:'none',lead:2},
 {id:'anniversary',name:'Anniversary',icon:'heart',repeat:'yearly',lead:7},
 {id:'renewal',name:'Document / insurance renewal',icon:'renewal',repeat:'yearly',lead:30},
 {id:'subscription',name:'Subscription renewal',icon:'bill',repeat:'monthly',lead:3},
 {id:'task',name:'Project / application deadline',icon:'check',repeat:'none',lead:7},
 {id:'travel',name:'Travel / reservation',icon:'travel',repeat:'none',lead:7},
 {id:'target',name:'Target / countdown',icon:'renewal',repeat:'none',lead:365},
 {id:'other',name:'Other reminder',icon:'calendar',repeat:'none',lead:1},
];
const DAY=86400000;
export const localDate=(date=new Date())=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const stamp=date=>Date.parse(date+'T00:00:00Z');
export const dateGap=(a,b)=>Math.round((stamp(a)-stamp(b))/DAY);
export function validEventDate(date){if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;const time=stamp(date);return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===date&&+date.slice(0,4)>=1900&&+date.slice(0,4)<=2199;}
const dateAt=(y,m,d)=>{const last=new Date(Date.UTC(y,m+1,0)).getUTCDate();return new Date(Date.UTC(y,m,Math.min(d,last))).toISOString().slice(0,10);};
export function eventOnDate(event,date){
 if(!validEventDate(date)||date<event.date)return false;
 if(event.repeat==='none')return date===event.date;
 const [y,m,d]=event.date.split('-').map(Number),[cy,cm]=date.split('-').map(Number);
 if(event.repeat==='weekly')return dateGap(date,event.date)%7===0;
 if(event.repeat==='monthly')return date===dateAt(cy,cm-1,d);
 return date===dateAt(cy,m-1,d);
}
/** @returns {CalendarEvent[]} */
export function calendarEvents(doc){return Array.isArray(doc.web.calendarEvents)?doc.web.calendarEvents:[];}
export function validateCalendarEvents(events){
 if(events===undefined)return;
 if(!Array.isArray(events)||events.length>5000||new Set(events.map(e=>e?.id)).size!==events.length)throw Error('Invalid calendar reminders');
 for(const e of events)if(!e||(e.countdown!==undefined&&typeof e.countdown!=='boolean')||typeof e.id!=='string'||!e.id||e.id.length>200||typeof e.title!=='string'||!e.title.trim()||e.title.length>160||!eventKinds.some(k=>k.id===e.kind)||!validEventDate(e.date)||!['none','weekly','monthly','yearly'].includes(e.repeat)||!Number.isInteger(e.leadDays)||e.leadDays<0||e.leadDays>365||typeof e.time!=='string'||(e.time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(e.time))||typeof e.notes!=='string'||e.notes.length>2000||!Array.isArray(e.completed)||e.completed.length>1000||e.completed.some(d=>!validEventDate(d)))throw Error('Invalid calendar reminder');
}
export function saveCalendarEvent(doc,draft,uuid=()=>crypto.randomUUID()){
 const prior=calendarEvents(doc).find(e=>e.id===draft.id);if(draft.id&&!prior)throw Error('This reminder no longer exists.');
 const item={countdown:!!draft.countdown,id:prior?.id||uuid(),title:String(draft.title||'').trim(),kind:draft.kind,date:draft.date,time:draft.time||'',repeat:draft.repeat,leadDays:Number(draft.leadDays),notes:String(draft.notes||'').trim(),completed:prior&&prior.date===draft.date&&prior.repeat===draft.repeat?prior.completed:[]};
 const events=prior?calendarEvents(doc).map(e=>e.id===item.id?item:e):[...calendarEvents(doc),item];validateCalendarEvents(events);return {...doc,web:{...doc.web,calendarEvents:events}};
}
export function removeCalendarEvent(doc,id){return {...doc,web:{...doc.web,calendarEvents:calendarEvents(doc).filter(e=>e.id!==id)}};}
export function completeCalendarEvent(doc,id,date){return {...doc,web:{...doc.web,calendarEvents:calendarEvents(doc).map(e=>e.id!==id?e:!eventOnDate(e,date)?e:{...e,completed:e.completed.includes(date)?e.completed.filter(d=>d!==date):[...e.completed,date].slice(-1000)})}};}
/** @param {CalendarEvent[]} events @returns {CalendarEvent[]} */
export const eventsOnDate=(events,date)=>events.filter(e=>eventOnDate(e,date)).sort((a,b)=>(a.time||'').localeCompare(b.time||'')||a.title.localeCompare(b.title));
// At most one overdue occurrence plus the nearest upcoming occurrence per recurring reminder.
/** @param {CalendarEvent[]} events @returns {(CalendarEvent & {occurrenceDate:string,days:number,key:string})[]} */
export function upcomingEvents(events,today=localDate()){
 const output=[];
 for(const e of events){
  const completed=new Set(e.completed),[y,m,d]=e.date.split('-').map(Number),[cy,cm]=today.split('-').map(Number);let candidates=[];
  if(e.repeat==='none')candidates=[e.date];
  else if(e.repeat==='yearly')candidates=[cy-1,cy,cy+1,cy+2].map(year=>dateAt(year,m-1,d));
  else if(e.repeat==='monthly')candidates=Array.from({length:15},(_,i)=>dateAt(cy,cm-2+i,d));
  else {const steps=Math.max(0,Math.floor(dateGap(today,e.date)/7));candidates=Array.from({length:55},(_,i)=>new Date(stamp(e.date)+(steps-1+i)*7*DAY).toISOString().slice(0,10));}
  candidates=candidates.filter(date=>date>=e.date&&validEventDate(date));
  const actionable=['exam','bill','renewal','subscription','task','target','other'].includes(e.kind);
  const past=candidates.filter(date=>date<today).at(-1),future=candidates.filter(date=>date>=today&&!completed.has(date)).find(date=>(e.countdown||dateGap(date,today)<=e.leadDays));
  for(const date of [actionable&&past&&!completed.has(past)?past:null,future])if(date)output.push({...e,occurrenceDate:date,days:dateGap(date,today),key:e.id+':'+date});
 }
 return output.sort((a,b)=>a.days-b.days||(a.time||'').localeCompare(b.time||'')||a.title.localeCompare(b.title));
}
export function eventWhen(days){return days<0?`${-days}d overdue`:days===0?'Today':days===1?'Tomorrow':`In ${days} days`;}

export function reminderWhen(event){if(!event.countdown)return eventWhen(event.days);return event.days===0?"Today":event.days<0?`${-event.days} day${event.days===-1?"":"s"} overdue`:`${event.days} day${event.days===1?"":"s"} left`;}
