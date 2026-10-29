import {useEffect,useRef,useState} from 'react';
import {GoogleTasksConnection,useGoogleTasks,type GoogleTask} from './GoogleTasks';
import {Icon} from './icons';

export function orderedGoogleTasks(tasks:GoogleTask[]){
 const byId=new Map(tasks.map(t=>[t.id,t])),children=new Map<string,GoogleTask[]>();
 for(const task of tasks){const parent=task.parent&&byId.has(task.parent)?task.parent:'';const siblings=children.get(parent)||[];siblings.push(task);children.set(parent,siblings);}
 for(const siblings of children.values())siblings.sort((a,b)=>(a.position||'').localeCompare(b.position||'')||a.id.localeCompare(b.id));
 const seen=new Set<string>(),out:{task:GoogleTask;depth:number}[]=[],stack=(children.get('')||[]).slice().reverse().map(task=>({task,depth:0}));
 const visit=()=>{while(stack.length){const {task,depth}=stack.pop()!;if(seen.has(task.id))continue;seen.add(task.id);out.push({task,depth:Math.min(depth,4)});const nested=children.get(task.id)||[];for(let i=nested.length-1;i>=0;i--)stack.push({task:nested[i],depth:depth+1});}};
 visit();for(const task of tasks)if(!seen.has(task.id)){stack.push({task,depth:0});visit();}return out;
}
export function GoogleTasksWidget({listId,onList,disabled}:{listId:string;onList:(id:string)=>void;disabled:boolean}){
 const g=useGoogleTasks(),[title,setTitle]=useState(''),[due,setDue]=useState(''),[busy,setBusy]=useState(''),[error,setError]=useState(''),[ambiguous,setAmbiguous]=useState(false),[showCompleted,setShowCompleted]=useState(false),lock=useRef(false),origin=useRef(''),lastSelected=useRef('');
 useEffect(()=>g.enable(),[]);
 const lists=g.pages.lists,selected=listId?lists?.items.find(item=>item.id===listId):lists?.items[0],selectedId=selected?.id||'',page=selectedId?g.pages['tasks:'+selectedId]:undefined;
 useEffect(()=>{if(g.status?.connected&&!lists)void g.load();},[g.status?.connected,g.status?.connection,lists]);
 useEffect(()=>{if(g.status?.connected&&selectedId&&!page)void g.load(selectedId);},[g.status?.connected,g.status?.connection,selectedId,page]);
 if(selectedId)lastSelected.current=selectedId;
 const key=(g.status?.account||g.status?.email||'')+':'+(listId||selectedId||lastSelected.current);
 useEffect(()=>{origin.current=key;setTitle('');setDue('');setError('');setAmbiguous(false);setBusy('');lock.current=false;},[key]);
 if(!g.status?.connected)return <div className="google-tasks-widget"><GoogleTasksConnection/></div>;
 const rows=orderedGoogleTasks(page?.items||[]),pending=rows.filter(row=>row.task.status!=='completed'),completed=rows.filter(row=>row.task.status==='completed');
 const refresh=async()=>{setError('');const refreshed=await g.refresh();if(refreshed&&origin.current===key)setAmbiguous(false);};
 const update=async(task:GoogleTask)=>{if(lock.current)return;lock.current=true;setBusy(task.id);setError('');try{await g.mutate('complete',{list:selectedId,task:task.id,completed:task.status!=='completed'});}catch(e){if(origin.current===key&&(e as Error).name!=='AbortError')setError((e as Error).message);}finally{if(origin.current===key){lock.current=false;setBusy('');}}};
 const row=({task,depth}:{task:GoogleTask;depth:number})=><li key={task.id} style={{paddingInlineStart:depth*12}}><label><input type="checkbox" aria-label={`${task.status==='completed'?'Reopen':'Complete'} Google task ${task.title}`} checked={task.status==='completed'} disabled={disabled||!g.online||!!busy} onChange={()=>void update(task)}/><span className={task.status==='completed'?'is-completed':''}>{task.title||'Untitled task'}{task.due&&<small>Due {task.due}</small>}</span></label>{busy===task.id&&<small role="status">Updating…</small>}</li>;
 return <div className="google-tasks-widget">
  <div className="google-tasks-list-picker"><label><span className="dash-sr-only">Google task list</span><select aria-label="Google task list" value={selectedId} disabled={!g.online||!!busy} onChange={e=>onList(e.target.value)}>{!selectedId&&<option value="">Choose a task list</option>}{lists?.items.map(list=><option key={list.id} value={list.id}>{list.title}</option>)}</select></label><button className="dash-text-button" aria-label="Refresh Google Tasks" disabled={!g.online||g.loading||!!busy} onClick={()=>void refresh()}><Icon name="refresh" size={15}/></button></div>
  <p className="google-tasks-account">{g.status.email}</p>
  {!g.online&&<p role="status">Offline · showing the last loaded tasks. Changes need a connection.</p>}
  {(error||page?.error||lists?.error||g.error)&&<p role="alert">{error||page?.error||lists?.error||g.error}</p>}
  {lists?.loading&&!lists.items.length?<p role="status">Loading task lists…</p>:!lists?.items.length?<p>No Google task lists found.</p>:!selectedId?<p>Choose a list. Your previous list may have been removed or belong to a different Google account.</p>:<>
   {page?.loading&&!page.items.length?<p role="status">Loading tasks…</p>:<><ul className="google-tasks-items">{pending.map(row)}</ul>{page&&!page.loading&&!pending.length&&!page.error&&<p className="google-tasks-empty">A little breathing room. No incomplete tasks on this page.</p>}</>}
   {!!completed.length&&<><button className="dash-expand" aria-expanded={showCompleted} onClick={()=>setShowCompleted(!showCompleted)}>{showCompleted?'Hide':'Show'} completed ({completed.length} loaded)</button>{showCompleted&&<ul className="google-tasks-items">{completed.map(row)}</ul>}</>}
   {page?.nextPageToken&&<button className="dash-expand" disabled={page.loading||!g.online} onClick={()=>void g.load(selectedId,true)}>Load more tasks</button>}
   <form className="google-tasks-add" onSubmit={async e=>{e.preventDefault();if(lock.current||!title.trim()||!g.online||ambiguous)return;lock.current=true;setBusy('create');setError('');try{await g.mutate('create',{list:selectedId,title,due,operation:crypto.randomUUID()});if(origin.current===key){setTitle('');setDue('');}}catch(e){if(origin.current===key&&(e as Error).name!=='AbortError'){setError((e as Error).message);if((e as any).code==='ambiguous')setAmbiguous(true);}}finally{if(origin.current===key){lock.current=false;setBusy('');}}}}>
    <input aria-label="New Google task" placeholder="Add a task…" maxLength={1024} value={title} disabled={disabled||!!busy||!g.online} onChange={e=>setTitle(e.target.value)}/>
    <div><label>Due date <input aria-label="Google task due date" type="date" value={due} disabled={disabled||!!busy||!g.online} onChange={e=>setDue(e.target.value)}/></label><button className="dash-text-button" disabled={disabled||!title.trim()||!!busy||!g.online||ambiguous}>{busy==='create'?'Adding…':'Add task'}</button></div>
   </form>
   {ambiguous&&<p>Refresh and check the list before adding this task again. Your draft is kept.</p>}
  </>}
  {lists?.nextPageToken&&<button className="dash-expand" disabled={lists.loading||!g.online} onClick={()=>void g.load(undefined,true)}>Load more lists</button>}
 </div>;
}
