import {useMemo,useState} from 'react';
import type {Workspace} from './data';
import {taskCatalog,updateTask} from './tasks.mjs';
import {localDate} from './calendar-events.mjs';
import './calendar-tasks.css';
export function CalendarTasks({doc,date,disabled,onChange,onOpen}:{doc:Workspace;date:string;disabled:boolean;onChange:(update:(doc:Workspace)=>Workspace)=>void;onOpen:(id:string)=>void}){
 const [error,setError]=useState(''),today=localDate();
 const tasks=useMemo(()=>{const c=taskCatalog(doc,today);return (date===today?c.list('today'):c.tasks.filter(t=>t.node.taskState==='TODO'&&(t.deadline===date||t.plan.scheduledDate===date))).sort((a,b)=>String(a.plan.taskStartTime||'99').localeCompare(String(b.plan.taskStartTime||'99')));},[doc.tables.bullets,date,today]);
 if(!tasks.length&&!error)return null;
 return <section className="cal-tasks" aria-label="Tasks for this day"><h2>Tasks <span>{tasks.length}</span></h2>{error&&<p role="alert">{error}</p>}<ul>{tasks.slice(0,30).map(t=><li key={t.node.id}><input type="checkbox" aria-label={`Complete calendar task ${t.node.text.slice(0,80)||'Untitled'}`} checked={false} disabled={disabled} onChange={()=>{try{onChange(d=>updateTask(d,t.node.id,{taskState:'DONE'}));setError('');}catch(e){setError(String(e));}}}/><button onClick={()=>onOpen(t.node.id)}>{t.node.text||'Untitled task'}<small>{t.plan.taskStartTime?String(t.plan.taskStartTime)+' · '+String(t.plan.taskBlockMinutes)+' min · ':''}{t.deadline?'Due '+t.deadline:'Scheduled '+t.plan.scheduledDate}</small></button></li>)}</ul>{tasks.length>30&&<p>Showing 30 tasks. Open Tasks to see all.</p>}</section>;
}
