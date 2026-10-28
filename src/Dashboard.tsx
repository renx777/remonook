import {useEffect,useMemo,useRef,useState,type CSSProperties} from 'react';
import GridLayout,{useContainerWidth,type Layout} from 'react-grid-layout';
import {Icon} from './icons';
import {LibraryDialog} from './StudyFolders';
import type {Workspace} from './data';
import {accountLocalKey} from './data';
import {localDate,calendarEvents,upcomingEvents,reminderWhen} from './calendar-events.mjs';
import {createStudyContext,dueCards} from './study.mjs';
import {ALL_MCQS} from './mcq.mjs';
import {dashboard as readDashboard,visibleWidgets,widgetCatalog,WIDGET_LIMIT,dashboardCols,widgetLayout,packWidgets,changeDashboard,updateWidget,addWidget,saveDashboardLayout,shiftDay,habitStreak,toggleHabit,addHabit,timerDuration,timerRemaining,finishTimer} from './dashboard.mjs';
import './dashboard.css';

type Box={x:number;y:number;w:number;h:number};
type Timer={mode:string;running:boolean;endsAt:number;remaining:number;duration:number;cycle:string};
type Widget={id:string;kind:string;title:string;order:number;removed:boolean;settings:Record<string,any>;layouts?:Record<string,Box>;timer?:Timer};
type Habit={id:string;title:string;order:number;archived:boolean};
type DashboardData={version:number;widgets:Record<string,Widget>;habits:Record<string,Habit>;checks:Record<string,boolean>;focusSessions:Record<string,{id:string;endedAt:number;minutes:number}>};
type Change=(update:(doc:Workspace)=>Workspace)=>void;
type Props={doc:Workspace;disabled:boolean;onChange:Change;onCapture:(text:string)=>string;onNote:(id:string)=>void;onStudy:()=>void;onCalendar:(date:string)=>void;onTask:(id:string)=>void};
const catalog=(kind:string)=>widgetCatalog.find(item=>item.kind===kind)!;
const clockStyles=[['digital','Digital'],['analog','Analog'],['split','Split']];
const pad=(n:number)=>String(n).padStart(2,'0');
const formatTime=(seconds:number)=>`${pad(Math.floor(seconds/60))}:${pad(seconds%60)}`;

function useNow(){
 const [now,setNow]=useState(Date.now);
 useEffect(()=>{const tick=()=>setNow(Date.now()),timer=setInterval(tick,1000);window.addEventListener('focus',tick);document.addEventListener('visibilitychange',tick);return()=>{clearInterval(timer);window.removeEventListener('focus',tick);document.removeEventListener('visibilitychange',tick);};},[]);
 return now;
}

function ClockWidget({widget,now,disabled,onStyle}:{widget:Widget;now:number;disabled:boolean;onStyle:(style:string)=>void}){
 const settings=widget.settings,options=settings.timezone==='local'?{}:{timeZone:settings.timezone};
 const parts=new Intl.DateTimeFormat('en-GB',{...options,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now);
 const part=(key:string)=>Number(parts.find(item=>item.type===key)?.value||0),hours=part('hour'),minutes=part('minute'),seconds=part('second');
 const displayHour=settings.hour12?(hours%12||12):hours;
 const date=new Intl.DateTimeFormat(undefined,{...options,weekday:'long',month:'short',day:'numeric'}).format(now);
 const zone=settings.timezone==='local'?Intl.DateTimeFormat().resolvedOptions().timeZone:settings.timezone;
 return <div className={`dash-clock dash-clock-${settings.style}`}>
  <div className="dash-clock-zone"><span className="dash-live-dot"/> {zone.replaceAll('_',' ').split('/').at(-1)}</div>
  {settings.style==='analog'?<svg className="dash-clock-face" viewBox="0 0 160 160" role="img" aria-label={`${hours}:${pad(minutes)}`}>
   <circle cx="80" cy="80" r="70" className="dash-clock-dial"/>
   {Array.from({length:60},(_,i)=><line key={i} x1="80" y1={i%5===0?17:12} x2="80" y2="10" transform={`rotate(${i*6} 80 80)`} className={i%5===0?'dash-clock-major':'dash-clock-minor'}/>)}
   <line x1="80" y1="83" x2="80" y2="42" transform={`rotate(${hours*30+minutes/2} 80 80)`} className="dash-clock-hour"/>
   <line x1="80" y1="85" x2="80" y2="25" transform={`rotate(${minutes*6+seconds/10} 80 80)`} className="dash-clock-minute"/>
   {settings.seconds&&<line x1="80" y1="94" x2="80" y2="21" transform={`rotate(${seconds*6} 80 80)`} className="dash-clock-second"/>}<circle cx="80" cy="80" r="4" className="dash-clock-center"/>
  </svg>:<div className="dash-clock-time" aria-label={`${displayHour}:${pad(minutes)}${settings.seconds?':'+pad(seconds):''}`}>
   <span className="dash-clock-digits">{pad(displayHour)}</span><span className="dash-clock-colon">:</span><span className="dash-clock-digits">{pad(minutes)}</span>{settings.seconds&&settings.style==='digital'&&<small>{pad(seconds)}</small>}{settings.hour12&&<em>{hours<12?'AM':'PM'}</em>}
  </div>}
  <p className="dash-clock-date">{date}</p>
  <div className="dash-segments dash-clock-styles" aria-label="Clock style">{clockStyles.map(([id,title])=><button key={id} disabled={disabled} aria-pressed={settings.style===id} onClick={()=>onStyle(id)}>{title}</button>)}</div>
 </div>;
}

function FocusWidget({widget,now,disabled,sessions,onUpdate,onFinish}:{widget:Widget;now:number;disabled:boolean;sessions:DashboardData['focusSessions'];onUpdate:(timer:Timer)=>void;onFinish:()=>void}){
 const mode=widget.timer?.mode||'focus',remaining=timerRemaining(widget,now),running=!!widget.timer?.running,duration=widget.timer?.duration||timerDuration(widget,mode),complete=remaining===0;
 const finish=useRef(onFinish);finish.current=onFinish;
 useEffect(()=>{if(!disabled&&running&&remaining===0)finish.current();},[running,remaining,disabled]);
 const changeMode=(next:string)=>{const duration=timerDuration(widget,next);onUpdate({mode:next,running:false,endsAt:0,remaining:duration,duration,cycle:crypto.randomUUID()});};
 const toggle=()=>{
  if(running){onUpdate({...widget.timer!,running:false,remaining,endsAt:0});return;}
  const seconds=remaining||timerDuration(widget,mode);
  onUpdate({mode,running:true,endsAt:now+seconds*1000,remaining:seconds,duration:widget.timer?.duration||seconds,cycle:complete||!widget.timer?crypto.randomUUID():widget.timer.cycle});
 };
 const today=localDate(new Date(now)),count=Object.values(sessions).filter(session=>localDate(new Date(session.endedAt))===today).length;
 return <div className="dash-focus">
  <div className="dash-segments" aria-label="Focus timer mode">{[['focus','Focus'],['short','Short break'],['long','Long break']].map(([id,label])=><button key={id} aria-pressed={mode===id} disabled={disabled} onClick={()=>changeMode(id)}>{label}</button>)}</div>
  <div className={`dash-timer-ring ${running?'is-running':''}`} style={{'--timer-progress':`${Math.min(100,(1-remaining/duration)*100)}%`} as CSSProperties}>
   <span className="dash-timer-value" role="timer" aria-label={`${mode==='focus'?'Focus':'Break'} time remaining`}>{formatTime(remaining)}</span>
   <span className="dash-timer-status">{complete?'Nicely done.':running?mode==='focus'?'One thing at a time.':'A moment to recharge.':'Make a little room.'}</span>
  </div>
  <div className="dash-timer-controls"><button className="dash-primary" disabled={disabled} onClick={toggle}><Icon name={running?'pause':'play'} size={15}/>{running?'Pause':complete?'Start again':'Start'}</button><button className="dash-quiet dash-timer-reset" disabled={disabled} aria-label="Reset focus timer" onClick={()=>changeMode(mode)}><Icon name="refresh" size={16}/></button></div>
  <p className="dash-focus-foot" aria-live="polite">{complete?'Session complete. Choose a break or start again.':`${count} focus ${count===1?'session':'sessions'} today`}</p>
 </div>;
}

function HabitsWidget({value,today,disabled,onChange}:{value:DashboardData;today:string;disabled:boolean;onChange:Change}){
 const [name,setName]=useState(''),[editing,setEditing]=useState<string|null>(null),[rename,setRename]=useState('');
 const habits=Object.values(value.habits).filter(h=>!h.archived).sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id)),days=Array.from({length:7},(_,i)=>shiftDay(today,i-6));
 const completed=habits.filter(h=>value.checks[h.id+':'+today]).length;
 return <div className="dash-habits">
  <div className="dash-habit-summary"><div><strong>{completed}<span> / {habits.length}</span></strong><small>habits nurtured today</small></div><span className="dash-habit-motto"><Icon name="sprout" size={19}/>Little by little.</span></div>
  <div className="dash-habit-table-scroll"><div className="dash-habit-table" role="group" aria-label="Weekly habits">
   <div className="dash-habit-table-head"><span>This week</span>{days.map(day=><span key={day} className={day===today?'is-today':''}><small>{new Date(day+'T12:00:00').toLocaleDateString(undefined,{weekday:'narrow'})}</small>{Number(day.slice(-2))}</span>)}<span/></div>
   {habits.map(habit=><div className="dash-habit-row" key={habit.id}>
    <button className="dash-habit-name" disabled={disabled} title="Edit habit" onClick={()=>{setEditing(habit.id);setRename(habit.title);}}><span>{habit.title}</span><small>{habitStreak(value,habit.id,today)>0?`${habitStreak(value,habit.id,today)} day streak`:'A fresh start'}</small></button>
    {days.map(day=><button key={day} className={`dash-habit-check ${value.checks[habit.id+':'+day]?'is-checked':''}`} aria-label={`${habit.title} on ${day}`} aria-pressed={!!value.checks[habit.id+':'+day]} disabled={disabled} onClick={()=>onChange(doc=>toggleHabit(doc,habit.id,day))}>{value.checks[habit.id+':'+day]?<Icon name="check" size={14}/>:<span/>}</button>)}
    <button className="dash-habit-remove" disabled={disabled} aria-label={`Archive ${habit.title}`} title="Archive habit" onClick={()=>onChange(doc=>changeDashboard(doc,(d:DashboardData)=>({...d,habits:{...d.habits,[habit.id]:{...d.habits[habit.id],archived:true}}})))}><Icon name="close" size={12}/></button>
   </div>)}
  </div></div>
  {!habits.length&&<p className="dash-empty-inline">Start with one small habit you want to make time for.</p>}
  <form className="dash-habit-add" onSubmit={event=>{event.preventDefault();if(!name.trim()||disabled)return;onChange(doc=>addHabit(doc,name));setName('');}}><Icon name="plus" size={15}/><input aria-label="New habit" maxLength={80} disabled={disabled||habits.length>=32} placeholder="Add a small habit…" value={name} onChange={e=>setName(e.target.value)}/><button className="dash-text-button" disabled={disabled||!name.trim()||habits.length>=32}>Add</button></form>
  {Object.values(value.habits).some(h=>h.archived)&&<details className="dash-archived-habits"><summary>Archived habits ({Object.values(value.habits).filter(h=>h.archived).length})</summary>{Object.values(value.habits).filter(h=>h.archived).map(h=><div key={h.id}><span>{h.title}</span><button className="dash-text-button" disabled={disabled||habits.length>=32} onClick={()=>onChange(doc=>changeDashboard(doc,(d:DashboardData)=>({...d,habits:{...d.habits,[h.id]:{...d.habits[h.id],archived:false}}})))}>Restore</button></div>)}</details>}
  {editing&&<LibraryDialog title="Edit habit" onClose={()=>setEditing(null)}><form className="dash-settings-form" onSubmit={event=>{event.preventDefault();if(disabled||!rename.trim())return;onChange(doc=>changeDashboard(doc,(d:DashboardData)=>({...d,habits:{...d.habits,[editing]:{...d.habits[editing],title:rename.trim()}}})));setEditing(null);}}><label>Habit name<input autoFocus maxLength={80} value={rename} onChange={e=>setRename(e.target.value)}/></label><footer><button type="button" onClick={()=>setEditing(null)}>Cancel</button><button className="dash-primary" disabled={disabled||!rename.trim()}>Save habit</button></footer></form></LibraryDialog>}
 </div>;
}

function CaptureWidget({widget,disabled,onCapture,onNote}:{widget:Widget;disabled:boolean;onCapture:Props['onCapture'];onNote:Props['onNote']}){
 const key=accountLocalKey('dashboard-draft-'+widget.id),[text,setText]=useState(()=>{try{return window.localStorage.getItem(key)||'';}catch{return '';}}),[last,setLast]=useState('');
 useEffect(()=>{const timer=setTimeout(()=>{try{if(text)window.localStorage.setItem(key,text);else window.localStorage.removeItem(key);}catch{}},200);return()=>clearTimeout(timer);},[text,key]);
 const draft=useRef(text);draft.current=text;
 useEffect(()=>()=>{try{if(draft.current)window.localStorage.setItem(key,draft.current);else window.localStorage.removeItem(key);}catch{}},[key]);
 return <form className="dash-capture" onSubmit={event=>{event.preventDefault();if(disabled||!text.trim())return;const id=onCapture(text.trim());setLast(id);setText('');try{window.localStorage.removeItem(key);}catch{}}}>
  <textarea data-capture-id={widget.id} aria-label="Quick capture note" disabled={disabled} maxLength={6000} placeholder="An idea, a question, a little reminder…" value={text} onChange={e=>{setText(e.target.value);setLast('');}}/>
  <div className="dash-capture-footer"><span aria-live="polite">{last?<button type="button" className="dash-text-button" onClick={()=>onNote(last)}><Icon name="check" size={13}/>Added to Notes <Icon name="forward" size={12}/></button>:'A thought worth keeping.'}</span><button className="dash-capture-submit" aria-label="Add capture to notes" title="Add to notes" disabled={disabled||!text.trim()}><Icon name="forward" size={17}/></button></div>
 </form>;
}

function AgendaWidget({doc,today,disabled,onNote,onTask,onCalendar}:{doc:Workspace;today:string;disabled:boolean;onNote:Props['onNote'];onTask:Props['onTask'];onCalendar:Props['onCalendar']}){
 const [section,setSection]=useState('tasks');
 const tasks=doc.tables.bullets.filter(node=>node.taskState==='TODO'&&!node.mirrorSourceId).sort((a,b)=>(a.dueDate||'9999').localeCompare(b.dueDate||'9999')||a.position-b.position);
 const events=upcomingEvents(calendarEvents(doc),today).slice(0,6);
 return <div className="dash-agenda"><div className="dash-agenda-tabs">{[['tasks','Tasks',tasks.length],['reminders','Reminders',events.length]].map(([id,label,count])=><button key={id} className={section===id?'is-active':''} aria-pressed={section===id} onClick={()=>setSection(String(id))}>{label}<span>{count}</span></button>)}</div>
  <div className="dash-agenda-items">{section==='tasks'?tasks.length?tasks.slice(0,8).map(task=><div className="dash-agenda-row" key={task.id}><button className="dash-task-check" aria-label={`Complete dashboard task ${task.text}`} disabled={disabled} onClick={()=>onTask(task.id)}><Icon name="check" size={12}/></button><button className="dash-agenda-link" onClick={()=>onNote(task.id)}><strong>{task.text||'Untitled task'}</strong>{task.dueDate&&<small className={task.dueDate<today?'is-overdue':''}>{task.dueDate===today?'Today':new Date(task.dueDate+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'})}</small>}</button></div>):<div className="dash-widget-empty"><Icon name="sunrise" size={29}/><strong>A little breathing room.</strong><p>Tasks from your notes will appear here.</p></div>:events.length?events.map(event=><button className="dash-reminder-row" key={event.key} onClick={()=>onCalendar(event.occurrenceDate)}><span className="dash-reminder-date">{new Date(event.occurrenceDate+'T12:00:00').toLocaleDateString(undefined,{month:'short'})}<strong>{Number(event.occurrenceDate.slice(-2))}</strong></span><span><strong>{event.title}</strong><small>{reminderWhen(event)}</small></span><Icon name="forward" size={13}/></button>):<div className="dash-widget-empty"><Icon name="calendar" size={27}/><strong>Nothing on the horizon.</strong><p>Add a reminder in Calendar for the things that matter.</p></div>}</div>
  <button className="dash-widget-footer-link" onClick={()=>section==='tasks'?onNote(''):onCalendar(today)}>{section==='tasks'?'Open notes':'Open calendar'}<Icon name="forward" size={13}/></button>
 </div>;
}

function StudyWidget({doc,now,onStudy}:{doc:Workspace;now:number;onStudy:()=>void}){
 const today=localDate(new Date(now)),context=useMemo(()=>createStudyContext(doc,now),[doc,today]);
 const flashcards=dueCards(doc,null,now,context).length,mcqs=dueCards(doc,ALL_MCQS,now,context).length;
 const week=Array.from({length:7},(_,i)=>shiftDay(today,i-6)),counts=week.map(day=>doc.tables.review_logs.filter(log=>localDate(new Date(log.reviewedAtEpochMillis))===day).length),max=Math.max(1,...counts);
 return <div className="dash-study"><div className="dash-study-intro"><Icon name="study" size={24}/><span>A little recall goes a long way.</span></div><div className="dash-study-numbers"><div><strong>{flashcards}</strong><span>flashcards due</span></div><div><strong>{mcqs}</strong><span>MCQs due</span></div></div><div className="dash-study-week" aria-label="Reviews over the last seven days">{week.map((day,i)=><div key={day} title={`${day}: ${counts[i]} reviews`}><span style={{height:Math.max(3,counts[i]/max*40)}}/><small>{new Date(day+'T12:00:00').toLocaleDateString(undefined,{weekday:'narrow'})}</small></div>)}</div><button className="dash-widget-footer-link" onClick={onStudy}>Open Study Desk<Icon name="forward" size={13}/></button></div>;
}

function WidgetSettings({widget,disabled,onSave,onClose}:{widget:Widget;disabled:boolean;onSave:(title:string|null,settings:Widget['settings'])=>void;onClose:()=>void}){
 const [title,setTitle]=useState(widget.title),[settings,setSettings]=useState({...widget.settings}),[initial]=useState(()=>({title:widget.title,settings:{...widget.settings}}));
 const zones=useMemo(()=>{try{return ['local','UTC','Asia/Kolkata',widget.settings.timezone,...(Intl as any).supportedValuesOf('timeZone')].filter((zone,i,all)=>all.indexOf(zone)===i);}catch{return ['local','UTC','America/New_York','America/Los_Angeles','Europe/London','Europe/Paris','Asia/Kolkata','Asia/Tokyo','Australia/Sydney'];}},[]);
 return <LibraryDialog title={`Customize ${widget.title}`} onClose={onClose}><form className="dash-settings-form" onSubmit={event=>{event.preventDefault();if(!title.trim()||disabled)return;onSave(title.trim()!==initial.title?title.trim():null,Object.fromEntries(Object.entries(settings).filter(([key,value])=>value!==initial.settings[key])));onClose();}}>
  <label>Widget name<input autoFocus aria-label="Widget name" maxLength={80} disabled={disabled} value={title} onChange={e=>setTitle(e.target.value)}/></label>
  {widget.kind==='clock'&&<><label>Clock style<select aria-label="Clock appearance" value={settings.style} onChange={e=>setSettings({...settings,style:e.target.value})}>{clockStyles.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label>Time zone<select aria-label="Clock time zone" value={settings.timezone} onChange={e=>setSettings({...settings,timezone:e.target.value})}>{zones.map(zone=><option key={zone} value={zone}>{zone==='local'?'Device time zone':zone.replaceAll('_',' ')}</option>)}</select></label><label className="dash-setting-check"><input type="checkbox" checked={settings.hour12} onChange={e=>setSettings({...settings,hour12:e.target.checked})}/>12-hour time</label><label className="dash-setting-check"><input type="checkbox" checked={settings.seconds} onChange={e=>setSettings({...settings,seconds:e.target.checked})}/>Show seconds</label></>}
  {widget.kind==='focus'&&<><p>Set a rhythm that works for you. Changing durations resets this timer.</p>{[['focus','Focus',120],['short','Short break',60],['long','Long break',60]].map(([id,label,max])=><label key={id}>{label} · minutes<input type="number" aria-label={`${label} minutes`} min={1} max={max} required value={settings[id]} onChange={e=>setSettings({...settings,[id]:Number(e.target.value)})}/></label>)}</>}
  <footer><button type="button" onClick={onClose}>Cancel</button><button className="dash-primary" disabled={disabled||!title.trim()}>Save changes</button></footer>
 </form></LibraryDialog>;
}

export function Dashboard({doc,disabled,onChange,onCapture,onNote,onStudy,onCalendar,onTask}:Props){
 const value=readDashboard(doc) as DashboardData,widgets=visibleWidgets(value) as Widget[],now=useNow(),today=localDate(new Date(now));
 const [editing,setEditing]=useState(false),[library,setLibrary]=useState(false),[settingsId,setSettingsId]=useState<string|null>(null),[menu,setMenu]=useState<string|null>(null),[removed,setRemoved]=useState<string|null>(null),[announcement,setAnnouncement]=useState(''),[error,setError]=useState('');
 const menuRef=useRef<HTMLDivElement>(null);
 const {width,containerRef,mounted}=useContainerWidth({initialWidth:1040,debounceTimeout:60});
 const bp=width>=1000?'lg':width>=650?'md':'sm',layout=useMemo(()=>widgetLayout(widgets,bp),[value.widgets,bp]) as Layout;
 const settingsWidget=settingsId?value.widgets[settingsId]:null;
 const change:Change=update=>{if(disabled)return;try{onChange(update);setError('');}catch(e){setError((e as Error).message);}};
 useEffect(()=>{if(!menu)return;const outside=(event:PointerEvent)=>{if(!(event.target as Element)?.closest('.dash-widget-options'))setMenu(null);};const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setMenu(null);};window.addEventListener('pointerdown',outside);window.addEventListener('keydown',escape);return()=>{window.removeEventListener('pointerdown',outside);window.removeEventListener('keydown',escape);};},[menu]);
 useEffect(()=>{if(menu)menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();},[menu]);
 const saveLayout=(next:Layout)=>{change(doc=>saveDashboardLayout(doc,bp,next));setAnnouncement('Dashboard layout updated.');};
 const rearrange=(widget:Widget,direction:number)=>{
  const ids=[...layout].sort((a,b)=>a.y-b.y||a.x-b.x).map(item=>item.i),at=ids.indexOf(widget.id),next=Math.max(0,Math.min(ids.length-1,at+direction));
  if(at===next)return;ids.splice(at,1);ids.splice(next,0,widget.id);
  const ordered=ids.map(id=>value.widgets[id]);saveLayout(packWidgets(ordered,bp,Object.fromEntries(layout.map(item=>[item.i,{w:item.w,h:item.h}]))));setMenu(null);
 };
 const resize=(widget:Widget,size:string)=>{
  const item=layout.find(item=>item.i===widget.id)!;const w=bp==='sm'?4:bp==='md'?(size==='large'?8:4):(size==='small'?4:size==='medium'?6:12),h=size==='small'?4:size==='large'?7:5;
  const ordered=[...layout].sort((a,b)=>a.y-b.y||a.x-b.x).map(item=>value.widgets[item.i]);
  saveLayout(packWidgets(ordered,bp,Object.fromEntries(layout.map(current=>[current.i,current.i===item.i?{w,h}:{w:current.w,h:current.h}]))));setMenu(null);
 };
 const greet=new Date(now).getHours()<12?'Good morning':new Date(now).getHours()<18?'Good afternoon':'Good evening';
 const visibleHabits=Object.values(value.habits).filter(h=>!h.archived),doneHabits=visibleHabits.filter(h=>value.checks[h.id+':'+today]).length;
 const sessionCount=Object.values(value.focusSessions).filter(s=>localDate(new Date(s.endedAt))===today).length;
 return <section className={`dashboard ${editing?'is-editing':''}`} aria-label="Dashboard">
  <div className="dash-page-heading"><div><span className="dash-eyebrow"><Icon name="sunrise" size={15}/>{new Date(now).toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})}</span><h1>{greet}<span>.</span></h1><p>A little space for a better day.</p></div><div className="dash-page-actions"><button className={`dash-quiet ${editing?'is-active':''}`} aria-pressed={editing} disabled={disabled} onClick={()=>{setEditing(!editing);setMenu(null);}}><Icon name={editing?'check':'sliders'} size={16}/>{editing?'Done editing':'Edit layout'}</button><button className="dash-primary" disabled={disabled||widgets.length>=WIDGET_LIMIT} onClick={()=>setLibrary(true)}><Icon name="plus" size={17}/>Add widget</button></div></div>
  <div className="dash-day-strip"><span><span className="dash-status-dot"/>Your day, at your pace</span><div><span><Icon name="timer" size={14}/>{sessionCount} focus {sessionCount===1?'session':'sessions'}</span><span><Icon name="sprout" size={14}/>{doneHabits} habits nurtured</span></div></div>
  {editing&&<div className="dash-edit-help"><Icon name="grip" size={16}/><span>Drag the grip to move a widget. Resize from its corner, or use the widget menu.</span><button className="dash-text-button" disabled={disabled} onClick={()=>{saveLayout(packWidgets(widgets,bp));setAnnouncement('Widgets arranged neatly.');}}>Tidy layout</button></div>}
  {error&&<p role="alert" className="dash-error">{error}</p>}
  {removed&&<div className="dash-undo" role="status">Widget removed.<button className="dash-text-button" disabled={disabled} onClick={()=>{change(doc=>updateWidget(doc,removed,{removed:false}));setRemoved(null);}}>Undo</button><button className="dash-quiet" aria-label="Dismiss widget removal" onClick={()=>setRemoved(null)}><Icon name="close" size={13}/></button></div>}
  <div ref={containerRef} className="dash-grid-container">
   {!widgets.length?<div className="dash-empty-board"><span><Icon name="dashboard" size={32}/></span><h2>A space that feels like you.</h2><p>Add a clock, a small habit, or a place to focus.<br/>Make this corner of RemoNook your own.</p><button className="dash-primary" disabled={disabled} onClick={()=>setLibrary(true)}><Icon name="plus" size={16}/>Choose your first widget</button></div>:width>0&&(mounted||typeof ResizeObserver==='undefined')&&<GridLayout width={Math.max(width,1)} layout={layout} gridConfig={{cols:dashboardCols[bp],rowHeight:48,margin:[16,16],containerPadding:[0,0]}} dragConfig={{enabled:editing&&!disabled,handle:'.dash-widget-drag',bounded:true,threshold:6}} resizeConfig={{enabled:editing&&!disabled,handles:['se']}} onDragStop={next=>saveLayout(next)} onResizeStop={next=>saveLayout(next)}>
    {widgets.map(widget=><div key={widget.id} className="dash-grid-item" data-widget-id={widget.id} data-widget-kind={widget.kind}>
     <article className={`dash-widget dash-widget-${widget.kind}`} aria-label={`${widget.title} widget`}>
      <header className="dash-widget-header"><div>{editing&&<button className="dash-widget-drag" aria-label={`Drag ${widget.title} widget`} title="Drag to move · use the menu to move with buttons" disabled={disabled}><Icon name="grip" size={15}/></button>}<Icon name={catalog(widget.kind).icon} size={16}/><h2>{widget.title}</h2></div><div className="dash-widget-options"><button className="dash-widget-more" aria-label={`Options for ${widget.title}`} aria-haspopup="menu" aria-expanded={menu===widget.id} onClick={()=>setMenu(menu===widget.id?null:widget.id)}><Icon name="more" size={18}/></button>
       {menu===widget.id&&<div ref={menuRef} className="dash-widget-menu" role="menu" aria-label={`${widget.title} options`} onKeyDown={event=>{
        const items=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')],at=items.indexOf(document.activeElement as HTMLButtonElement);
        if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();items[event.key==='Home'?0:event.key==='End'?items.length-1:(at+(event.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();}
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setMenu(null);event.currentTarget.parentElement?.querySelector<HTMLButtonElement>('.dash-widget-more')?.focus();}
       }}><button role="menuitem" disabled={disabled} onClick={()=>{setSettingsId(widget.id);setMenu(null);}}><Icon name="sliders" size={14}/>Customize</button><div className="dash-menu-divider"/><button role="menuitem" disabled={disabled||layout.length<2} onClick={()=>rearrange(widget,-1)}><Icon name="up" size={14}/>Move earlier</button><button role="menuitem" disabled={disabled||layout.length<2} onClick={()=>rearrange(widget,1)}><Icon name="down" size={14}/>Move later</button><span className="dash-menu-label">Widget size</span><div className="dash-size-buttons">{['small','medium','large'].map(size=><button key={size} role="menuitem" disabled={disabled} onClick={()=>resize(widget,size)}>{size}</button>)}</div><div className="dash-menu-divider"/><button className="dash-remove-widget" role="menuitem" disabled={disabled} onClick={()=>{change(doc=>updateWidget(doc,widget.id,{removed:true}));setRemoved(widget.id);setMenu(null);}}><Icon name="trash" size={14}/>Remove widget</button></div>}
      </div></header>
      <div className="dash-widget-body">
       {widget.kind==='clock'&&<ClockWidget widget={widget} now={now} disabled={disabled} onStyle={style=>change(doc=>{const w=readDashboard(doc).widgets[widget.id];return updateWidget(doc,widget.id,{settings:{...w.settings,style}});})}/>}
       {widget.kind==='focus'&&<FocusWidget widget={widget} now={now} disabled={disabled} sessions={value.focusSessions} onUpdate={timer=>change(doc=>updateWidget(doc,widget.id,{timer}))} onFinish={()=>change(doc=>finishTimer(doc,widget.id))}/>}
       {widget.kind==='habits'&&<HabitsWidget value={value} today={today} disabled={disabled} onChange={change}/>}
       {widget.kind==='capture'&&<CaptureWidget widget={widget} disabled={disabled} onCapture={onCapture} onNote={onNote}/>}
       {widget.kind==='agenda'&&<AgendaWidget doc={doc} today={today} disabled={disabled} onNote={onNote} onTask={onTask} onCalendar={onCalendar}/>}
       {widget.kind==='study'&&<StudyWidget doc={doc} now={now} onStudy={onStudy}/>}
      </div>
     </article>
    </div>)}
   </GridLayout>}
  </div>
  <div className="dash-board-footer"><span><Icon name="leaf" size={13}/>Room for the things that matter.</span><span>{widgets.length} / {WIDGET_LIMIT} widgets</span></div>
  <span className="dash-sr-only" role="status">{announcement}</span>
  {library&&<LibraryDialog title="Make it your space" onClose={()=>setLibrary(false)}><div className="dash-library"><p>Choose a little something for your day. You can add more than one of any widget.</p><div className="dash-library-grid">{widgetCatalog.map(item=><button key={item.kind} className={`dash-library-card dash-library-${item.kind}`} disabled={disabled||widgets.length>=WIDGET_LIMIT} aria-label={`Add ${item.title} widget`} onClick={()=>{change(doc=>addWidget(doc,item.kind));setLibrary(false);setAnnouncement(`${item.title} widget added.`);}}><span className="dash-library-icon"><Icon name={item.icon} size={25}/></span><strong>{item.title}</strong><small>{item.description}</small><span className="dash-library-add"><Icon name="plus" size={13}/>Add widget</span></button>)}</div><small className="dash-library-note">Your widgets, layout, and habits are saved with your workspace.</small></div></LibraryDialog>}
  {settingsWidget&&!settingsWidget.removed&&<WidgetSettings key={settingsWidget.id} widget={settingsWidget} disabled={disabled} onClose={()=>setSettingsId(null)} onSave={(title,patch)=>change(doc=>{
   const current=readDashboard(doc).widgets[settingsWidget.id],settings={...current.settings,...patch};
   const reset=current.kind==='focus'&&['focus','short','long'].some(key=>settings[key]!==current.settings[key]);
   return updateWidget(doc,settingsWidget.id,{title:title??current.title,settings,...(reset?{timer:undefined}:{})});
  })}/>}
 </section>;
}
