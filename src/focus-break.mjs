// Pomodoro breaks. When a focus session ends, the break starts on its own (a long break after
// every fourth focus session of the day, a short one otherwise), and while it runs the app is
// covered by the break screen (BreakOverlay.tsx). When the break ends, the timer is ready for
// the next focus session. finishTimer (dashboard.mjs) still records the session.
import {dashboard,finishTimer,timerDuration,changeDashboard} from './dashboard.mjs';
import {localDate,calendarEvents,upcomingEvents,reminderWhen} from './calendar-events.mjs';
import {noteQuotes,quotePool} from './quotes.mjs';

const dayOf=ms=>localDate(new Date(ms));

/** Ends a timer whose time is up: a focus session turns into a running break (from the moment
 focus ended, so a closed app catches up), and a break turns back into a ready focus timer. */
export function endTimer(doc,id,now=Date.now()){
 const widget=dashboard(doc).widgets?.[id],timer=widget?.timer;
 if(!timer?.running||timer.endsAt>now)return doc;
 const finished=finishTimer(doc,id,now);
 if(timer.mode==='focus'){
  const today=dayOf(timer.endsAt),sessions=Object.values(dashboard(finished).focusSessions||{}).filter(s=>dayOf(s.endedAt)===today).length;
  const mode=sessions>0&&sessions%4===0?'long':'short',duration=timerDuration(widget,mode),endsAt=timer.endsAt+duration*1000;
  const running=endsAt>now;
  return changeDashboard(finished,value=>({...value,widgets:{...value.widgets,[id]:{...value.widgets[id],timer:{mode,running,endsAt:running?endsAt:0,remaining:running?duration:0,duration,cycle:crypto.randomUUID()}}}}));
 }
 // A break ended: ready to focus again (not started, so nobody is pulled back in unannounced).
 const duration=timerDuration(widget,'focus');
 return changeDashboard(finished,value=>({...value,widgets:{...value.widgets,[id]:{...value.widgets[id],timer:{mode:'focus',running:false,endsAt:0,remaining:duration,duration,cycle:crypto.randomUUID()}}}}));
}

/** The running break, if any: {widget, endsAt, mode}. */
export function runningBreak(doc,now=Date.now()){
 for(const w of Object.values(dashboard(doc).widgets||{})){
  const t=w?.timer;
  if(w.kind==='focus'&&!w.removed&&t?.running&&t.mode!=='focus'&&t.endsAt>now)return {widget:w,endsAt:t.endsAt,mode:t.mode,duration:t.duration};
 }
 return null;
}

/** What you did today, for the break screen. `baseline` is the set of bullet ids that existed when
 the day began on this device (see dayBaseline), since bullets carry no creation time.
 @param {any} doc @param {{baseline?: Set<string>|null, now?: number}} [options] */
export function todayStats(doc,{baseline=null,now=Date.now()}={}){
 const today=dayOf(now),web=doc.web||{},value=dashboard(doc);
 const sessions=Object.values(value.focusSessions||{}).filter(s=>dayOf(s.endedAt)===today);
 const bullets=baseline?doc.tables.bullets.filter(n=>!baseline.has(n.id)&&String(n.text||'').replace(/<[^>]*>/g,'').trim()).length:null;
 const cards=(doc.tables.cards||[]).filter(c=>c.lastReviewAtEpochMillis&&dayOf(c.lastReviewAtEpochMillis)===today).length;
 const pages=Object.values(web.readingProgress||{}).reduce((sum,p)=>sum+Object.values(p?.units||{}).filter(d=>d===today).length,0);
 const saved=Object.values(web.bookmarks||{}).filter(b=>b&&!b.deleted&&b.createdAt&&dayOf(b.createdAt)===today).length;
 const tasks=doc.tables.bullets.filter(n=>(n.dueDate===today||n.journalDate===today)&&n.taskState&&n.taskState!=='NONE');
 return {focusSessions:sessions.length,focusMinutes:Math.round(sessions.reduce((m,s)=>m+(Number(s.minutes)||0),0)),bullets,cards,pages,saved,tasksDone:tasks.filter(n=>n.taskState==='DONE').length,tasks:tasks.length};
}

/** The bullet ids at the start of today on this device, kept in localStorage per workspace. */
export function dayBaseline(storageKey,ids,now=Date.now(),storage=globalThis.localStorage){
 const today=dayOf(now),key='remo-day-baseline:'+storageKey;
 try{
  const saved=JSON.parse(storage?.getItem(key)||'null');
  if(saved?.day===today&&Array.isArray(saved.ids))return new Set(saved.ids);
  storage?.setItem(key,JSON.stringify({day:today,ids}));
 }catch{/* storage full or unavailable: count nothing rather than guess */return null;}
 return new Set(ids);
}

/** The rest of the break screen: open to-dos (overdue and due today first), the reminders coming
 up, and a quote — one of yours (bullets tagged #quote) when you have any, otherwise from the
 library, following the Quotes widget's source. The quote stays the same for the whole break. */
export function breakExtras(doc,{today=localDate(),seed='',limit=5}={}){
 const plainText=t=>String(t||'').replace(/<[^>]*>/g,' ').replace(/#\S+/g,'').replace(/\s+/g,' ').trim();
 const open=doc.tables.bullets.filter(n=>n.taskState==='TODO'&&plainText(n.text));
 const rank=n=>n.dueDate&&n.dueDate<today?0:n.dueDate===today||n.journalDate===today?1:n.dueDate?2:3;
 const todos=open.slice().sort((a,b)=>rank(a)-rank(b)||String(a.dueDate||'9').localeCompare(String(b.dueDate||'9'))).slice(0,limit)
  .map(n=>({id:n.id,text:plainText(n.text).slice(0,120),when:n.dueDate?(n.dueDate<today?'Overdue':n.dueDate===today?'Today':n.dueDate):n.journalDate===today?'Today':''}));
 const reminders=upcomingEvents(calendarEvents(doc),today).slice(0,limit).map(e=>({key:e.key,title:e.title,when:reminderWhen(e)}));
 const quoteWidget=Object.values(dashboard(doc).widgets||{}).find(w=>w?.kind==='quotes'&&!w.removed);
 const mine=noteQuotes(doc.tables.bullets),pool=mine.length?mine:quotePool(mine,quoteWidget?.settings?.source||'all');
 let h=0;for(const c of String(seed))h=(h*31+c.charCodeAt(0))>>>0;
 const quote=pool.length?pool[h%pool.length]:null;
 return {todos,openTodos:open.length,reminders,quote};
}
