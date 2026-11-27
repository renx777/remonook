import {CalendarTimeline} from './CalendarTimeline';
import {accountLocalKey} from './data';
import {useMemo,useState} from 'react';
import type {Workspace} from './data';
import {taskCatalog,updateTask} from './tasks.mjs';
import {localDate} from './calendar-events.mjs';
import './calendar-tasks.css';
export function CalendarTasks({doc,date,disabled,onChange,onOpen}:{doc:Workspace;date:string;disabled:boolean;onChange:(update:(doc:Workspace)=>Workspace)=>void;onOpen:(id:string)=>void}){
 const [error,setError]=useState(''),[layout,setLayout]=useState(()=>{try{return localStorage.getItem(accountLocalKey('calendar-day-layout'))==='timeline'?'timeline':'list';}catch{return 'list';}}),today=localDate();
 const tasks=useMemo(()=>{const c=taskCatalog(doc,today);return (date===today?c.list('today'):c.tasks.filter(t=>t.node.taskState==='TODO'&&(t.deadline===date||t.plan.scheduledDate===date))).sort((a,b)=>String(a.plan.taskStartTime||'99').localeCompare(String(b.plan.taskStartTime||'99')));},[doc.tables.bullets,date,today]);
 return <section className="cal-tasks" aria-label="Tasks for this day"><header className="cal-plan-header"><h2>Day plan <span>{tasks.length} {tasks.length===1?'task':'tasks'}</span></h2><div role="group" aria-label="Day plan view">{['list','timeline'].map(value=><button key={value} aria-pressed={layout===value} onClick={()=>{setLayout(value);try{localStorage.setItem(accountLocalKey('calendar-day-layout'),value);}catch{}}}>{value==='list'?'List':'Timeline'}</button>)}</div></header>{layout==='timeline'&&<CalendarTimeline doc={doc} date={date} disabled={disabled} onChange={onChange}/>}{error&&<p role="alert">{error}</p>}<ul>{tasks.slice(0,30).map(t=><li key={t.node.id}><input type="checkbox" aria-label={`Complete calendar task ${t.node.text.slice(0,80)||'Untitled'}`} checked={false} disabled={disabled} onChange={()=>{try{onChange(d=>updateTask(d,t.node.id,{taskState:'DONE'}));setError('');}catch(e){setError(String(e));}}}/><button onClick={()=>onOpen(t.node.id)}>{t.node.text||'Untitled task'}<small>{t.plan.taskStartTime?String(t.plan.taskStartTime)+' · '+String(t.plan.taskBlockMinutes)+' min · ':''}{t.deadline?'Due '+t.deadline:'Scheduled '+t.plan.scheduledDate}</small></button></li>)}</ul>{tasks.length>30&&<p>Showing 30 tasks. Open Tasks to see all.</p>}</section>;
}
