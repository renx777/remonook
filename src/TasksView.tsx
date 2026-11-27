import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import type {Node,Workspace} from './data';
import {Icon} from './icons';
import {RichRead} from './editor';
import {TASK_VIEWS,taskCatalog,taskPlan,updateTask,quickAddTask} from './tasks.mjs';
import {parseQuickTask,relativeDay,deadlineLabel,addMinutes,addDays} from './natural-date.mjs';
import {UndoToast,type Toast} from './UndoToast';
import {Sheet} from './Sheet';
import {TASK_FIELDS} from './task-fields.mjs';
import {GoogleTasksWidget} from './GoogleTasksWidget';
import {useReminderClock} from './CalendarReminders';
import './tasks.css';
type Props={doc:Workspace;disabled:boolean;canUndo:boolean;canRedo:boolean;onChange:(update:(doc:Workspace)=>Workspace)=>void;onOpen:(id:string)=>void;onNew:()=>void;onInbox:()=>void;onUndo:(redo?:boolean)=>void;storageKey:string};
type Draft={scheduledDate:string;dueDate:string;taskPlanning:string;taskPriority:string;taskDurationMinutes:string;taskStartTime:string;taskBlockMinutes:string;taskRepeat:string};
function planDraft(n:Node):Draft{const p=taskPlan(n);return {scheduledDate:p.scheduledDate,dueDate:n.dueDate||'',taskPlanning:p.taskPlanning,taskPriority:String(p.taskPriority),taskDurationMinutes:p.taskDurationMinutes?String(p.taskDurationMinutes):'',taskStartTime:String(p.taskStartTime),taskBlockMinutes:p.taskBlockMinutes?String(p.taskBlockMinutes):'',taskRepeat:String(p.taskRepeat)} as Draft;}
const priority=['No priority','Low','Medium','High'];
function TaskDetails({node,disabled,today,onChange,onClose}:{node:Node;disabled:boolean;today:string;onChange:Props['onChange'];onClose:(saved?:boolean)=>void}){
 const [initial]=useState(()=>planDraft(node)),[draft,setDraft]=useState(initial),[error,setError]=useState(''),[refreshRepeat,setRefreshRepeat]=useState(false),[phrase,setPhrase]=useState(''),[chips,setChips]=useState<{kind:string;label:string}[]>([]);
 const first=useRef<HTMLInputElement>(null);useLayoutEffect(()=>{first.current?.focus();},[]);
 const set=(key:keyof Draft,value:string)=>setDraft(d=>({...d,[key]:value}));
 // Type it the way you say it; the fields below follow and stay editable.
 const understand=(value:string)=>{setPhrase(value);const p=parseQuickTask(value,today,{bare:true});setChips(value.trim()?p.chips:[]);setDraft(d=>{const n={...d};for(const k of ['scheduledDate','dueDate','taskStartTime','taskRepeat'] as const)if(p[k]!==undefined)n[k]=String(p[k]);if(p.taskBlockMinutes!==undefined)n.taskBlockMinutes=String(p.taskBlockMinutes);if(p.taskPriority!==undefined)n.taskPriority=String(p.taskPriority);return n;});};
 const when=(date:string,planning='ACTIVE')=>setDraft(d=>({...d,scheduledDate:date,taskPlanning:planning,...(date?{}:{taskStartTime:'',taskBlockMinutes:''})}));
 const weekend=(()=>{const w=new Date(today+'T12:00:00').getDay();return addDays(today,w===6||w===0?0:6-w);})(),nextWeek=addDays(today,((8-new Date(today+'T12:00:00').getDay())%7)||7);
 const picks:[string,string,string][]=[['Today',today,'ACTIVE'],['Tomorrow',addDays(today,1),'ACTIVE'],['This weekend',weekend,'ACTIVE'],['Next week',nextWeek,'ACTIVE'],['Someday','','SOMEDAY']];
 return <form className="task-details" aria-label="Task details" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose();}}} onSubmit={e=>{
  e.preventDefault();if(disabled)return;
  try{
   // Write only fields the user changed. Remote text, completion and other plan fields survive.
   const patch:Record<string,unknown>={};for(const key of [...TASK_FIELDS,'dueDate'] as (keyof Draft)[])if(draft[key]!==initial[key])patch[key]=key==='taskPriority'||key==='taskDurationMinutes'||key==='taskBlockMinutes'?Number(draft[key]):draft[key];
   onChange(doc=>updateTask(doc,node.id,patch,{refreshRepeat}));onClose(true);
  }catch(e){setError(e instanceof Error?e.message:String(e));}
 }}>
  <h2 className="task-plan-title">{node.text||'Untitled task'}</h2>
  <label className="task-phrase"><Icon name="calendar" size={16}/><input ref={first} aria-label="Type when" placeholder="tomorrow 9am for 90m high · due fri · every week" value={phrase} onChange={e=>understand(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();e.currentTarget.form?.requestSubmit();}}}/></label>
  <div className="rn-parse" aria-live="polite">{chips.length?<>Understood {chips.map((c,i)=><span key={i} className={'rn-chip is-'+c.kind}>{c.label}</span>)}</>:<span>Or pick below. ⌘↵ saves.</span>}</div>
  <div className="task-picks" role="group" aria-label="When">{picks.map(([label,date,planning])=><button type="button" key={label} aria-pressed={draft.scheduledDate===date&&draft.taskPlanning===planning} onClick={()=>when(date,planning)}>{label}</button>)}</div>
  <div className="task-detail-grid">
   <label>Scheduled for<input aria-label="Task scheduled date" type="date" value={draft.scheduledDate} onChange={e=>set('scheduledDate',e.target.value)}/></label>
   <label>Deadline<input aria-label="Task deadline" type="date" value={draft.dueDate} onChange={e=>set('dueDate',e.target.value)}/></label>
   <label>Start time<input aria-label="Task start time" type="time" value={draft.taskStartTime} onChange={e=>set('taskStartTime',e.target.value)}/></label>
   <label>Time block (minutes)<input aria-label="Task block minutes" type="number" min="0" max="1440" step="1" value={draft.taskBlockMinutes} onChange={e=>set('taskBlockMinutes',e.target.value)}/></label>
   <label>Priority<select aria-label="Task priority" value={draft.taskPriority} onChange={e=>set('taskPriority',e.target.value)}>{priority.map((p,i)=><option key={p} value={i}>{p}</option>)}</select></label>
   <label>Repeat<select aria-label="Task repeat" value={draft.taskRepeat} onChange={e=>set('taskRepeat',e.target.value)}><option value="NONE">Does not repeat</option><option value="DAILY">Every day</option><option value="WEEKLY">Every week</option><option value="MONTHLY">Every month</option><option value="YEARLY">Every year</option></select></label>
   <label>Planning status<select aria-label="Task planning status" value={draft.taskPlanning} onChange={e=>set('taskPlanning',e.target.value)}><option value="ACTIVE">Active</option><option value="SOMEDAY">Someday</option><option value="WAITING">Waiting</option></select></label>
  </div>
  <details className="task-more"><summary>More: effort estimate</summary><div className="task-detail-grid">
   <label>Estimated minutes<input aria-label="Task estimated minutes" type="number" min="0" max="1440" step="1" placeholder="Optional" value={draft.taskDurationMinutes} onChange={e=>set('taskDurationMinutes',e.target.value)}/></label>
  </div></details>
  {draft.taskRepeat!=='NONE'&&<label className="task-repeat-template"><input type="checkbox" checked={refreshRepeat} onChange={e=>setRefreshRepeat(e.target.checked)}/>Use this task’s current title as the future template</label>}
  {error&&<p role="alert">{error}</p>}
  <footer><span>Text, children and attachments stay in the note.</span><button type="button" onClick={()=>onClose()}>Cancel</button><button className="task-primary" disabled={disabled}>Save task details</button></footer>
 </form>;
}
export function TasksView({doc,disabled,canUndo,canRedo,onChange,onOpen,onNew,onInbox,onUndo,storageKey}:Props){
 const today=useReminderClock(),catalog=useMemo(()=>taskCatalog(doc,today),[doc.tables.bullets,today]);
 const [view,setView]=useState('today'),[search,setSearch]=useState(''),[project,setProject]=useState(''),[sort,setSort]=useState('date'),[limit,setLimit]=useState(40),[editing,setEditing]=useState<string|null>(null),[error,setError]=useState(''),[google,setGoogle]=useState(false),[listId,setListId]=useState(()=>{try{return localStorage.getItem(storageKey)||'';}catch{return '';}});
 const origin=useRef<HTMLButtonElement|null>(null),searchInput=useRef<HTMLInputElement>(null),quickInput=useRef<HTMLInputElement>(null),titleButton=useRef<HTMLButtonElement>(null),filterButton=useRef<HTMLButtonElement>(null);
 const [sheet,setSheet]=useState<'views'|'filter'|null>(null),[searchOpen,setSearchOpen]=useState(false);
 const [quick,setQuick]=useState(''),[toast,setToast]=useState<Toast>(null),[leaving,setLeaving]=useState<Record<string,{at:number;index:number;task:any}>>({});
 const quickParse=useMemo(()=>quick.trim()?parseQuickTask(quick,today):null,[quick,today]);
 const say=(text:string,undo=true)=>setToast({id:Date.now(),text,undo});
 useEffect(()=>{const ids=Object.keys(leaving);if(!ids.length)return;const t=setTimeout(()=>setLeaving({}),460);return ()=>clearTimeout(t);},[leaving]);
 const projects=useMemo(()=>[...new Map(catalog.tasks.map(t=>[t.projectId,t.project])).entries()].sort((a,b)=>String(a[1]).localeCompare(String(b[1]))),[catalog]);
 const tasks=useMemo(()=>{
  const q=search.trim().toLocaleLowerCase();return catalog.list(view).filter(t=>(!project||t.projectId===project)&&(!q||(t.node.text+' '+t.path).toLocaleLowerCase().includes(q))).sort((a,b)=>{
   const pa=Number(a.plan.taskPriority),pb=Number(b.plan.taskPriority),date=(t:typeof a)=>[t.deadline,t.plan.scheduledDate].filter(Boolean).sort()[0]||'9999';
   return (sort==='priority'?pb-pa:date(a).localeCompare(date(b)))||(sort==='priority'?date(a).localeCompare(date(b)):pb-pa)||a.project.localeCompare(b.project)||a.node.position-b.node.position||a.node.id.localeCompare(b.node.id);
  });
 },[catalog,view,search,project,sort]);
 useEffect(()=>{setLimit(40);setEditing(null);setError('');setLeaving({});},[view,search,project,google]);
 const selected=editing?doc.tables.bullets.find(n=>n.id===editing):undefined;
 const lastSelected=useRef<Node|null>(null);if(selected)lastSelected.current=selected as Node;
 const planNode=selected||(editing&&lastSelected.current?.id===editing?lastSelected.current:null);
 const close=(saved=false)=>{setEditing(null);if(saved||!origin.current?.isConnected)(searchInput.current||quickInput.current)?.focus();else origin.current.focus();};
 const run=(action:()=>void)=>{try{if(disabled)return;action();setError('');}catch(e){setError(e instanceof Error?e.message:String(e));}};
 const history=(redo=false)=>{setEditing(null);setError('');setToast(null);setLeaving({});onUndo(redo);};
 const label=TASK_VIEWS.find(([id])=>id===view)?.[1]||'Tasks';
 const plannedMinutes=view==='today'?tasks.reduce((sum,t)=>sum+Number(t.plan.taskBlockMinutes||t.plan.taskDurationMinutes||0),0):0;
 const add=()=>{const input=quick.trim();if(!input||disabled)return;run(()=>{const defaults=view==='today'&&!quickParse?.scheduledDate?{scheduledDate:today}:view==='someday'?{taskPlanning:'SOMEDAY'}:view==='waiting'?{taskPlanning:'WAITING'}:{};const id=crypto.randomUUID();onChange(d=>quickAddTask(d,input,today,{id,defaults}).doc);setQuick('');const p=quickParse;say(`Added “${(p?.title||input).slice(0,48)}”${p?.chips.length?' · '+p.chips.filter(c=>c.kind!=='tag').map(c=>c.label).join(' · '):''}`);});};
 const complete=(t:any,index:number)=>run(()=>{const done=t.node.taskState==='DONE';onChange(d=>updateTask(d,t.node.id,{taskState:done?'TODO':'DONE'}));if(!done&&view!=='completed'){setLeaving(l=>({...l,[t.node.id]:{at:Date.now(),index,task:{...t,node:{...t.node,taskState:'DONE'}}}}));say(`Completed “${(t.node.text||'Untitled task').slice(0,56)}”`);}(searchInput.current||quickInput.current)?.focus();});
 const shown=useMemo(()=>{const list:any[]=tasks.slice(0,limit);for(const [id,g] of Object.entries(leaving).sort((a,b)=>a[1].index-b[1].index))if(!list.some(t=>t.node.id===id))list.splice(Math.min(g.index,list.length),0,{...g.task,leaving:true});return list;},[tasks,limit,leaving]);
 const hours=(m:number)=>m>=60?`${Math.floor(m/60)} h${m%60?' '+String(m%60).padStart(2,'0'):''}`:`${m} min`;
 return <section className="tasks-page" aria-labelledby="tasks-title">
  <header className="tasks-heading rn-head"><button ref={titleButton} className="tasks-title" aria-haspopup="dialog" aria-expanded={sheet==='views'} aria-label={`Task view: ${google?'Google Tasks':label}. Choose another view`} onClick={()=>setSheet(sheet==='views'?null:'views')}><h1 id="tasks-title">{google?'Google Tasks':label}</h1><Icon name="down" size={18}/></button>{!google?<span className="rn-count">{tasks.length}{plannedMinutes?' · '+hours(plannedMinutes)+' planned':''}</span>:<span className="rn-count"/>}
   {!google&&<><button className="rn-icon-btn" aria-label="Search tasks" aria-pressed={searchOpen||!!search} title="Search" onClick={()=>{setSearchOpen(o=>!o||!!search);requestAnimationFrame(()=>(searchInput.current||quickInput.current)?.focus());}}><Icon name="search" size={18}/></button>
   <button ref={filterButton} className="rn-icon-btn" aria-label="Filter and sort tasks" aria-expanded={sheet==='filter'} title="Filter & sort" onClick={()=>setSheet(sheet==='filter'?null:'filter')}><Icon name="sliders" size={18}/></button></>}
   <button className="rn-icon-btn tasks-new" aria-label="New task" disabled={disabled} onClick={()=>run(onNew)} title="Open a new task in the Inbox outline"><Icon name="plus" size={18}/></button></header>
  <nav className="task-views rn-tabs" aria-label="Task views">{TASK_VIEWS.map(([id,name])=><button key={id} aria-current={!google&&view===id?'page':undefined} onClick={()=>{setGoogle(false);setView(id);}}>{name}{catalog.counts[id]?<span>{catalog.counts[id]}</span>:null}</button>)}<button className="task-views-google" aria-current={google?'page':undefined} onClick={()=>setGoogle(true)}>Google Tasks <Icon name="link" size={12}/></button></nav>
  {sheet==='views'&&<Sheet anchor={titleButton.current} label="Task views" onClose={()=>setSheet(null)}><span className="rn-label" style={{marginTop:0}}>Tasks</span>{TASK_VIEWS.map(([id,name])=><button key={id} className="rn-sheet-item" aria-current={!google&&view===id?'page':undefined} onClick={()=>{setGoogle(false);setView(id);setSheet(null);}}>{name}<small>{catalog.counts[id]||''}</small></button>)}<hr style={{border:0,borderTop:'1px solid var(--line)',margin:'6px 0'}}/><button className="rn-sheet-item" aria-current={google?'page':undefined} onClick={()=>{setGoogle(true);setSheet(null);}}>Google Tasks<small><Icon name="link" size={13}/></small></button></Sheet>}
  {sheet==='filter'&&<Sheet anchor={filterButton.current} label="Filter and sort tasks" onClose={()=>setSheet(null)}><div style={{display:'flex',alignItems:'center'}}><h2>Filter & sort</h2>{(project||sort!=='date')&&<button className="rn-fchip" style={{marginLeft:'auto',border:0}} onClick={()=>{setProject('');setSort('date');}}>Reset</button>}</div>
   <span className="rn-label">Project</span><div className="rn-sheet-row" role="group" aria-label="Filter tasks by project"><button className="rn-fchip" aria-pressed={!project} onClick={()=>setProject('')}>All</button>{projects.map(([id,title])=><button key={id} className="rn-fchip" aria-pressed={project===id} onClick={()=>setProject(project===id?'':id)}>{String(title).slice(0,32)||'Untitled'}</button>)}</div>
   <span className="rn-label">Sort by</span><div className="rn-seg" role="group" aria-label="Task sort"><button aria-pressed={sort==='date'} onClick={()=>setSort('date')}>Date</button><button aria-pressed={sort==='priority'} onClick={()=>setSort('priority')}>Priority</button></div>
   <button className="task-primary tasks-sheet-done" onClick={()=>setSheet(null)}>Show {tasks.length} {tasks.length===1?'task':'tasks'}</button></Sheet>}
  {google?<section className="tasks-google" aria-label="Google Tasks"><p>These tasks stay in Google. Changes need an internet connection and do not create note copies.</p><GoogleTasksWidget listId={listId} disabled={disabled} onList={id=>{setListId(id);try{localStorage.setItem(storageKey,id);}catch{}}}/></section>:<>
   <form className="task-quick-add" onSubmit={e=>{e.preventDefault();add();}}><label><Icon name="plus" size={17}/><input ref={quickInput} aria-label="Quick add task" placeholder={view==='today'?'Add a task for today — try “call mom 6pm #home”':'Add a task — try “lab report due fri !high”'} value={quick} disabled={disabled} onChange={e=>setQuick(e.target.value)} onKeyDown={e=>{if(e.key==='Escape')setQuick('');}}/></label>{quickParse&&<div className="rn-parse" aria-live="polite">{quickParse.chips.map((c,i)=><span key={i} className={'rn-chip is-'+c.kind}>{c.label}</span>)}{!quickParse.chips.length&&<span>No date — {view==='today'?'it goes on Today':'it goes to Anytime'}</span>}<span className="task-quick-hint">↵ add</span></div>}</form>
   {(searchOpen||search)&&<label className="tasks-search"><Icon name="search" size={16}/><input ref={searchInput} aria-label="Find tasks" placeholder="Find a task or project…" value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==='Escape'){setSearch('');setSearchOpen(false);}}}/></label>}
   {(project||sort!=='date')&&<div className="tasks-active-filters">{project&&<button className="rn-fchip" aria-pressed="true" aria-label={'Remove project filter '+(projects.find(([id])=>id===project)?.[1]||'')} onClick={()=>setProject('')}>{String(projects.find(([id])=>id===project)?.[1]||'Project')} ×</button>}{sort!=='date'&&<button className="rn-fchip" aria-pressed="true" onClick={()=>setSort('date')}>Priority first ×</button>}</div>}
   {error&&<p role="alert" className="task-error">{error}</p>}
   {editing&&!selected&&<p role="status" className="task-error">This task was removed. Your other notes are unchanged.</p>}
   {editing&&planNode&&<TaskDetails key={editing} node={planNode as Node} today={today} disabled={disabled||!selected} onChange={onChange} onClose={close}/>}
   {view==='inbox'&&<p className="tasks-hint">Tasks still in your Inbox. <button onClick={onInbox}>Process Inbox</button></p>}
   {!tasks.length?<div className="tasks-empty"><Icon name="check" size={28}/><h2>{search||project?'No matching tasks.':view==='today'?'A clear day.':`No ${TASK_VIEWS.find(([id])=>id===view)?.[1].toLowerCase()} tasks.`}</h2><p>{view==='today'?'Schedule a task, or choose Anytime to find your next action.':'Tasks are ordinary note bullets with a checkbox.'}</p>{view==='today'&&<button onClick={()=>setView('anytime')}>Browse Anytime</button>}</div>:<ol className="tasks-list">{shown.map((t:any,index:number)=>{
    const n=t.node,done=n.taskState==='DONE',p=t.plan,late=!done&&t.deadline&&t.deadline<today;
    return <li key={n.id} data-task-id={t.leaving?undefined:n.id} aria-hidden={t.leaving||undefined} className={t.leaving?'task-leaving is-completed':done?'task-row is-completed':'task-row'}>
     <div className="task-row-main"><input type="checkbox" aria-label={`${done?'Reopen':'Complete'} task ${n.text.slice(0,100)||'Untitled'}`} checked={done} disabled={disabled} onChange={()=>{if(!t.leaving)complete(t,index);}}/><div className="task-copy"><div className="task-text"><RichRead node={n}/>{!n.text&&'Untitled task'}</div><div className="task-meta">{p.taskStartTime&&<span className="rn-chip is-time">{p.scheduledDate&&p.scheduledDate!==today?relativeDay(String(p.scheduledDate),today)+' ':''}{String(p.taskStartTime)}–{addMinutes(String(p.taskStartTime),Number(p.taskBlockMinutes)||30)}</span>}{!p.taskStartTime&&p.scheduledDate&&!(view==='today'&&p.scheduledDate===today)&&<span className={p.scheduledDate<today&&!done?'is-stale':''}>{relativeDay(String(p.scheduledDate),today)}</span>}{t.deadline&&<span className={late?'rn-chip is-deadline':t.deadline===today&&!done?'rn-chip is-deadline':''}>{deadlineLabel(t.deadline,today)}</span>}{Number(p.taskPriority)>0&&<span className={Number(p.taskPriority)===3?'rn-chip is-high':'priority-'+p.taskPriority}>{priority[Number(p.taskPriority)]}</span>}{p.taskRepeat!=='NONE'&&<span>↻ {({DAILY:'Daily',WEEKLY:'Weekly',MONTHLY:'Monthly',YEARLY:'Yearly'} as any)[String(p.taskRepeat)]}</span>}{p.taskPlanning!=='ACTIVE'&&<span>{p.taskPlanning==='WAITING'?'Waiting':'Someday'}</span>}{Number(p.taskDurationMinutes)>0&&<span>~{String(p.taskDurationMinutes)} min</span>}<span className="task-path">{t.path}</span></div></div></div>
     <div className="task-row-actions">{done&&p.taskRepeat!=='NONE'&&Object.values(doc.web.taskRepeatReceipts?.[n.id]||{}).filter((r:any)=>doc.tables.bullets.some(b=>b.id===r.nextId)).map((r:any)=><button key={r.nextId} onClick={()=>onOpen(r.nextId)}>Next task · {relativeDay(r.date,today)}</button>)}<button onClick={()=>onOpen(n.id)}><Icon name="notes" size={14}/>Open note</button><button disabled={disabled} aria-expanded={editing===n.id} onClick={e=>{origin.current=e.currentTarget;setEditing(editing===n.id?null:n.id);}}><Icon name="sliders" size={14}/>Plan</button></div>
    </li>;
   })}</ol>}
   {tasks.length>limit&&<button className="tasks-more" onClick={()=>setLimit(n=>n+40)}>Show more tasks ({tasks.length-limit} remaining)</button>}
  </>}
  <UndoToast toast={toast} onUndo={()=>history()} onClose={()=>setToast(null)}/>
 </section>;
}
