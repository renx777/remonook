import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import type {Node,Workspace} from './data';
import {Icon} from './icons';
import {RichRead} from './editor';
import {TASK_VIEWS,taskCatalog,taskPlan,updateTask} from './tasks.mjs';
import {TASK_FIELDS} from './task-fields.mjs';
import {GoogleTasksWidget} from './GoogleTasksWidget';
import {useReminderClock} from './CalendarReminders';
import './tasks.css';
type Props={doc:Workspace;disabled:boolean;canUndo:boolean;canRedo:boolean;onChange:(update:(doc:Workspace)=>Workspace)=>void;onOpen:(id:string)=>void;onNew:()=>void;onInbox:()=>void;onUndo:(redo?:boolean)=>void;storageKey:string};
type Draft={scheduledDate:string;dueDate:string;taskPlanning:string;taskPriority:string;taskDurationMinutes:string;taskStartTime:string;taskBlockMinutes:string;taskRepeat:string};
function planDraft(n:Node):Draft{const p=taskPlan(n);return {scheduledDate:p.scheduledDate,dueDate:n.dueDate||'',taskPlanning:p.taskPlanning,taskPriority:String(p.taskPriority),taskDurationMinutes:p.taskDurationMinutes?String(p.taskDurationMinutes):'',taskStartTime:String(p.taskStartTime),taskBlockMinutes:p.taskBlockMinutes?String(p.taskBlockMinutes):'',taskRepeat:String(p.taskRepeat)} as Draft;}
const priority=['No priority','Low','Medium','High'];
function TaskDetails({node,disabled,onChange,onClose}:{node:Node;disabled:boolean;onChange:Props['onChange'];onClose:(saved?:boolean)=>void}){
 const [initial]=useState(()=>planDraft(node)),[draft,setDraft]=useState(initial),[error,setError]=useState(''),[refreshRepeat,setRefreshRepeat]=useState(false);
 const first=useRef<HTMLInputElement>(null);useLayoutEffect(()=>{first.current?.focus();},[]);
 const set=(key:keyof Draft,value:string)=>setDraft(d=>({...d,[key]:value}));
 return <form className="task-details" aria-label="Task details" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose();}}} onSubmit={e=>{
  e.preventDefault();if(disabled)return;
  try{
   // Write only fields the user changed. Remote text, completion and other plan fields survive.
   const patch:Record<string,unknown>={};for(const key of [...TASK_FIELDS,'dueDate'] as (keyof Draft)[])if(draft[key]!==initial[key])patch[key]=key==='taskPriority'||key==='taskDurationMinutes'||key==='taskBlockMinutes'?Number(draft[key]):draft[key];
   onChange(doc=>updateTask(doc,node.id,patch,{refreshRepeat}));onClose(true);
  }catch(e){setError(e instanceof Error?e.message:String(e));}
 }}>
  <h2 className="task-plan-title">{node.text||'Untitled task'}</h2><p>Plan this task. Its text, children and attachments stay in the original note.</p>
  <div className="task-detail-grid">
   <label>Scheduled for<input ref={first} aria-label="Task scheduled date" type="date" value={draft.scheduledDate} onChange={e=>set('scheduledDate',e.target.value)}/><small>When you intend to work on it.</small></label>
   <label>Deadline<input aria-label="Task deadline" type="date" value={draft.dueDate} onChange={e=>set('dueDate',e.target.value)}/><small>When it must be finished.</small></label>
   <label>Planning status<select aria-label="Task planning status" value={draft.taskPlanning} onChange={e=>set('taskPlanning',e.target.value)}><option value="ACTIVE">Active</option><option value="SOMEDAY">Someday</option><option value="WAITING">Waiting</option></select></label>
   <label>Priority<select aria-label="Task priority" value={draft.taskPriority} onChange={e=>set('taskPriority',e.target.value)}>{priority.map((p,i)=><option key={p} value={i}>{p}</option>)}</select></label>
   <label>Estimated minutes<input aria-label="Task estimated minutes" type="number" min="0" max="1440" step="1" placeholder="Optional" value={draft.taskDurationMinutes} onChange={e=>set('taskDurationMinutes',e.target.value)}/></label>
   <label>Start time<input aria-label="Task start time" type="time" value={draft.taskStartTime} onChange={e=>set('taskStartTime',e.target.value)}/><small>Local time on the scheduled date.</small></label>
   <label>Time block (minutes)<input aria-label="Task block minutes" type="number" min="0" max="1440" step="1" value={draft.taskBlockMinutes} onChange={e=>set('taskBlockMinutes',e.target.value)}/><small>Separate from your effort estimate. Overlaps remain allowed.</small></label>
   <label>Repeat<select aria-label="Task repeat" value={draft.taskRepeat} onChange={e=>set('taskRepeat',e.target.value)}><option value="NONE">Does not repeat</option><option value="DAILY">Every day</option><option value="WEEKLY">Every week</option><option value="MONTHLY">Every month</option><option value="YEARLY">Every year</option></select><small>Completion creates the next task. Context stays linked; deadlines are not repeated.</small></label>
  </div>
  {draft.taskRepeat!=='NONE'&&<label><input type="checkbox" checked={refreshRepeat} onChange={e=>setRefreshRepeat(e.target.checked)}/>Use this task’s current title as the future template</label>}
  {error&&<p role="alert">{error}</p>}
  <footer><button type="button" onClick={()=>onClose()}>Cancel</button><button className="task-primary" disabled={disabled}>Save task details</button></footer>
 </form>;
}
export function TasksView({doc,disabled,canUndo,canRedo,onChange,onOpen,onNew,onInbox,onUndo,storageKey}:Props){
 const today=useReminderClock(),catalog=useMemo(()=>taskCatalog(doc,today),[doc.tables.bullets,today]);
 const [view,setView]=useState('today'),[search,setSearch]=useState(''),[project,setProject]=useState(''),[sort,setSort]=useState('date'),[limit,setLimit]=useState(40),[editing,setEditing]=useState<string|null>(null),[error,setError]=useState(''),[google,setGoogle]=useState(false),[listId,setListId]=useState(()=>{try{return localStorage.getItem(storageKey)||'';}catch{return '';}});
 const origin=useRef<HTMLButtonElement|null>(null),searchInput=useRef<HTMLInputElement>(null);
 const projects=useMemo(()=>[...new Map(catalog.tasks.map(t=>[t.projectId,t.project])).entries()].sort((a,b)=>String(a[1]).localeCompare(String(b[1]))),[catalog]);
 const tasks=useMemo(()=>{
  const q=search.trim().toLocaleLowerCase();return catalog.list(view).filter(t=>(!project||t.projectId===project)&&(!q||(t.node.text+' '+t.path).toLocaleLowerCase().includes(q))).sort((a,b)=>{
   const pa=Number(a.plan.taskPriority),pb=Number(b.plan.taskPriority),date=(t:typeof a)=>[t.deadline,t.plan.scheduledDate].filter(Boolean).sort()[0]||'9999';
   return (sort==='priority'?pb-pa:date(a).localeCompare(date(b)))||(sort==='priority'?date(a).localeCompare(date(b)):pb-pa)||a.project.localeCompare(b.project)||a.node.position-b.node.position||a.node.id.localeCompare(b.node.id);
  });
 },[catalog,view,search,project,sort]);
 useEffect(()=>{setLimit(40);setEditing(null);setError('');},[view,search,project,google]);
 const selected=editing?doc.tables.bullets.find(n=>n.id===editing):undefined;
 const lastSelected=useRef<Node|null>(null);if(selected)lastSelected.current=selected as Node;
 const planNode=selected||(editing&&lastSelected.current?.id===editing?lastSelected.current:null);
 const close=(saved=false)=>{setEditing(null);if(saved||!origin.current?.isConnected)searchInput.current?.focus();else origin.current.focus();};
 const run=(action:()=>void)=>{try{if(disabled)return;action();setError('');}catch(e){setError(e instanceof Error?e.message:String(e));}};
 const history=(redo=false)=>{setEditing(null);setError('');onUndo(redo);};
 return <section className="tasks-page" aria-labelledby="tasks-title">
  <header className="tasks-heading"><div><p>PLAN → DO</p><h1 id="tasks-title">Tasks</h1><span>One task, wherever you work.</span></div><button className="task-primary" disabled={disabled} onClick={()=>run(onNew)}><Icon name="plus" size={17}/>New task</button></header>
  <div className="tasks-source" role="group" aria-label="Task source"><button aria-pressed={!google} onClick={()=>setGoogle(false)}>RemoNook</button><button aria-pressed={google} onClick={()=>setGoogle(true)}>Google Tasks <Icon name="link" size={13}/></button></div>
  {google?<section className="tasks-google" aria-label="Google Tasks"><h2>Google Tasks</h2><p>These tasks stay in Google. Changes need an internet connection and do not create note copies.</p><GoogleTasksWidget listId={listId} disabled={disabled} onList={id=>{setListId(id);try{localStorage.setItem(storageKey,id);}catch{}}}/></section>:<>
   <nav className="task-views" aria-label="Task views">{TASK_VIEWS.map(([id,label])=><button key={id} aria-current={view===id?'page':undefined} onClick={()=>setView(id)}>{label}<span>{catalog.counts[id]}</span></button>)}</nav>
   <div className="tasks-tools"><label className="tasks-search"><Icon name="search" size={16}/><input ref={searchInput} aria-label="Search tasks" placeholder="Find a task or project…" value={search} onChange={e=>setSearch(e.target.value)}/></label><div className="tasks-filters"><select aria-label="Filter tasks by project" value={project} onChange={e=>setProject(e.target.value)}><option value="">All projects</option>{projects.map(([id,title])=><option key={id} value={id}>{title}</option>)}</select><select aria-label="Task sort" value={sort} onChange={e=>setSort(e.target.value)}><option value="date">Date first</option><option value="priority">Priority first</option></select><button className="icon-button" aria-label="Undo task action" disabled={disabled||!canUndo} onClick={()=>history()}><Icon name="undo" size={16}/></button><button className="icon-button" aria-label="Redo task action" disabled={disabled||!canRedo} onClick={()=>history(true)}><Icon name="redo" size={16}/></button></div></div>
   {error&&<p role="alert" className="task-error">{error}</p>}
   {editing&&!selected&&<p role="status" className="task-error">This task was removed. Your other notes are unchanged.</p>}
   {editing&&planNode&&<TaskDetails key={editing} node={planNode as Node} disabled={disabled||!selected} onChange={onChange} onClose={close}/>}
   {view==='inbox'&&<p className="tasks-hint">Tasks still in your Inbox. <button onClick={onInbox}>Process Inbox</button></p>}
   {view==='today'&&<p className="tasks-hint">Scheduled work and due deadlines. Expired deadlines stay visible even for Waiting or Someday tasks.</p>}
   {!tasks.length?<div className="tasks-empty"><Icon name="check" size={28}/><h2>{search||project?'No matching tasks.':view==='today'?'A clear day.':`No ${TASK_VIEWS.find(([id])=>id===view)?.[1].toLowerCase()} tasks.`}</h2><p>{view==='today'?'Schedule a task, or choose Anytime to find your next action.':'Tasks are ordinary note bullets with a checkbox.'}</p>{view==='today'&&<button onClick={()=>setView('anytime')}>Browse Anytime</button>}</div>:<ol className="tasks-list">{tasks.slice(0,limit).map(t=>{
    const n=t.node,done=n.taskState==='DONE',p=t.plan;
    return <li key={n.id} data-task-id={n.id} className={done?'task-row is-completed':'task-row'}>
     <div className="task-row-main"><input type="checkbox" aria-label={`${done?'Reopen':'Complete'} task ${n.text.slice(0,100)||'Untitled'}`} checked={done} disabled={disabled} onChange={()=>run(()=>{onChange(d=>updateTask(d,n.id,{taskState:done?'TODO':'DONE'}));searchInput.current?.focus();})}/><div className="task-copy"><div className="task-text"><RichRead node={n}/>{!n.text&&'Untitled task'}</div><div className="task-meta"><span>{t.path}</span>{p.taskRepeat!=='NONE'&&<span>Repeats {String(p.taskRepeat).toLowerCase()}</span>}{p.taskStartTime&&<span>{String(p.taskStartTime)} · {String(p.taskBlockMinutes)} min block</span>}{p.scheduledDate&&<span>Scheduled {String(p.scheduledDate)}</span>}{t.deadline&&<span className={!done&&t.deadline<today?'is-overdue':''}>Due {t.deadline}</span>}{p.taskPlanning!=='ACTIVE'&&<span>{p.taskPlanning==='WAITING'?'Waiting':'Someday'}</span>}{Number(p.taskPriority)>0&&<span className={'priority-'+p.taskPriority}>{priority[Number(p.taskPriority)]}</span>}{Number(p.taskDurationMinutes)>0&&<span>{String(p.taskDurationMinutes)} min</span>}</div></div></div>
     <div className="task-row-actions">{done&&p.taskRepeat!=='NONE'&&Object.values(doc.web.taskRepeatReceipts?.[n.id]||{}).filter((r:any)=>doc.tables.bullets.some(b=>b.id===r.nextId)).map((r:any)=><button key={r.nextId} onClick={()=>onOpen(r.nextId)}>Next task · {r.date}</button>)}<button onClick={()=>onOpen(n.id)}><Icon name="notes" size={14}/>Open note</button><button disabled={disabled} aria-expanded={editing===n.id} onClick={e=>{origin.current=e.currentTarget;setEditing(editing===n.id?null:n.id);}}><Icon name="sliders" size={14}/>Plan</button></div>
    </li>;
   })}</ol>}
   {tasks.length>limit&&<button className="tasks-more" onClick={()=>setLimit(n=>n+40)}>Show more tasks ({tasks.length-limit} remaining)</button>}
  </>}
 </section>;
}
