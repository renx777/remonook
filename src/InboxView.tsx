import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import type {Workspace,Node} from './data';
import {Icon} from './icons';
import {RichRead} from './editor';
import {inboxItems,inboxDestinations,processInbox,inboxReminderId} from './inbox.mjs';
import {snapshotIndex} from './outline-snapshot.mjs';
import {calendarEvents,localDate} from './calendar-events.mjs';
import {UndoToast,type Toast} from './UndoToast';
import {relativeDay} from './natural-date.mjs';
import './inbox.css';
type Action='file'|'link'|'schedule';
type Props={doc:Workspace;disabled:boolean;onChange:(update:(doc:Workspace)=>Workspace)=>void;onOpen:(id:string)=>void;onCapture:()=>void;onTrash:(id:string)=>void;onUndo:(redo?:boolean)=>void;canUndo:boolean;canRedo:boolean};
export function InboxView({doc,disabled,onChange,onOpen,onCapture,onTrash,onUndo,canUndo,canRedo}:Props){
 const [search,setSearch]=useState(''),[limit,setLimit]=useState(30),[panel,setPanel]=useState<{id:string;kind:Action}|null>(null),[query,setQuery]=useState(''),[target,setTarget]=useState<string|null|undefined>(),[date,setDate]=useState(localDate()),[time,setTime]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[toast,setToast]=useState<Toast>(null),[selected,setSelected]=useState<string|null>(null);
 const list=useRef<HTMLOListElement>(null),today=localDate();
 const say=(text:string)=>{setNotice('');setToast({id:Date.now(),text,undo:true});};
 const busy=useRef(false),searchInput=useRef<HTMLInputElement>(null),panelInput=useRef<HTMLInputElement>(null),origin=useRef<HTMLButtonElement|null>(null);
 const items=useMemo<Node[]>(()=>inboxItems(doc),[doc.tables.bullets]),idx=useMemo(()=>snapshotIndex(doc.tables.bullets),[doc.tables.bullets]);
 const matches=useMemo(()=>items.filter(n=>n.text.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())),[items,search]);
 const destinationNotes=useMemo<{id:string;title:string;path:string}[]>(()=>panel&&panel.kind!=='schedule'?inboxDestinations(doc):[],[doc.tables.bullets,panel?.kind]);
 const destinations=useMemo(()=>{const q=query.trim().toLocaleLowerCase();return q?destinationNotes.filter(n=>(n.title+' '+n.path).toLocaleLowerCase().includes(q)):destinationNotes;},[destinationNotes,query]);
 const receipts=useMemo(()=>new Map(Object.values(doc.web.androidShareReceipts||{}).map((r:any)=>[r.id,r.receivedAt])),[doc.web.androidShareReceipts]);
 useEffect(()=>{setLimit(30);},[search]);
 useLayoutEffect(()=>{if(panel)panelInput.current?.focus();},[panel?.id,panel?.kind]);
 useEffect(()=>{if(panel&&!items.some(n=>n.id===panel.id)){setPanel(null);setError('The capture moved or was removed. Your other notes are unchanged.');}},[items,panel]);
 const history=(redo=false)=>{setNotice('');setToast(null);setError('');setPanel(null);onUndo(redo);};
 const capture=()=>{try{onCapture();}catch(e){setError(e instanceof Error?e.message:String(e));}};
 const close=()=>{setPanel(null);setQuery('');setError('');origin.current?.isConnected&&origin.current.focus();};
 const open=(id:string,kind:Action,button:HTMLButtonElement)=>{
  const existing=calendarEvents(doc).find(e=>e.id===inboxReminderId(id));
  origin.current=button;setPanel({id,kind});setQuery('');setTarget(undefined);setDate(existing?.date||localDate());setTime(existing?.time||'');setError('');setNotice('');
 };
 const apply=(id:string,action:any)=>{
  if(disabled||busy.current)return;busy.current=true;
  try{onChange(current=>processInbox(current,id,action));close();if(action.kind==='file'){const row=list.current?.querySelector<HTMLElement>(`[data-inbox-id="${CSS.escape(id)}"]`),next=(row?.nextElementSibling||row?.previousElementSibling) as HTMLElement|null;requestAnimationFrame(()=>(next?.isConnected?next:searchInput.current)?.focus());}const name=(doc.tables.bullets.find(n=>n.id===id)?.text||'capture').slice(0,48),where=action.target===null?'My notes':destinationNotes.find(n=>n.id===action.target)?.title||'the note';say(action.kind==='file'?`Filed “${name}” to ${where}`:action.kind==='link'?`Linked “${name}” to ${where}`:action.kind==='task'?`“${name}” is now a task`:`Reminder set for ${relativeDay(action.date,today)}${action.time?' '+action.time:''}`);}
  catch(e){setError(e instanceof Error?e.message:String(e));}
  finally{queueMicrotask(()=>{busy.current=false;});}
 };
 // Keyboard triage: J/K move, F file, L link, T task, S schedule, O open. Ignored while typing.
 const keys=(e:React.KeyboardEvent<HTMLOListElement>)=>{
  const t=e.target as HTMLElement;if(e.metaKey||e.ctrlKey||e.altKey||t.closest('input,textarea,select,form,[contenteditable="true"]'))return;
  const rows=[...(list.current?.querySelectorAll<HTMLElement>('.inbox-item')||[])],row=t.closest<HTMLElement>('.inbox-item'),at=row?rows.indexOf(row):-1,k=e.key.toLowerCase();
  if(k==='j'||k==='arrowdown'||k==='k'||k==='arrowup'){e.preventDefault();rows[Math.max(0,Math.min(rows.length-1,at+(k==='j'||k==='arrowdown'?1:-1)))]?.focus();return;}
  const press=({f:'file',l:'link',t:'task',s:'schedule',o:'open'} as Record<string,string>)[k];if(!row||!press)return;
  const button=row.querySelector<HTMLButtonElement>(`[data-key="${press}"]`);if(button&&!button.disabled){e.preventDefault();button.click();}
 };
 return <section className="inbox-page" aria-labelledby="inbox-title">
  <header className="inbox-heading"><div><h1 id="inbox-title">Inbox <span>{items.length}</span></h1>{items.length>0&&<p className="inbox-keys" aria-hidden="true"><kbd>J</kbd><kbd>K</kbd> move · <kbd>F</kbd> file · <kbd>L</kbd> link · <kbd>T</kbd> task · <kbd>S</kbd> schedule · <kbd>Z</kbd> undo</p>}</div><button className="inbox-primary" disabled={disabled} onClick={capture}><Icon name="plus" size={17}/>New capture</button></header>
  <div className="inbox-tools"><label className="inbox-search"><Icon name="search" size={17}/><input ref={searchInput} aria-label="Search captures" placeholder="Find a capture…" value={search} onChange={e=>setSearch(e.target.value)}/></label><div className="inbox-history"><button className="icon-button" aria-label="Undo Inbox action" title="Undo" disabled={!canUndo||disabled} onClick={()=>history()}><Icon name="undo" size={17}/></button><button className="icon-button" aria-label="Redo Inbox action" title="Redo" disabled={!canRedo||disabled} onClick={()=>history(true)}><Icon name="redo" size={17}/></button></div></div>
  {notice&&<p className="inbox-feedback" role="status">{notice}</p>}
  {error&&!panel&&<p className="inbox-feedback is-error" role="alert">{error}</p>}
  {!items.length?<div className="inbox-empty"><Icon name="inbox" size={30}/><h2>Room for your next thought.</h2><p>Quick captures and shared notes arrive here. File them when you are ready.</p><button disabled={disabled} onClick={capture}>Capture a thought</button></div>:!matches.length?<p className="inbox-empty" role="status">No captures match this search.</p>:<ol ref={list} className="inbox-list" onKeyDown={keys} aria-label="Captures">{matches.slice(0,limit).map(node=>{
   const kids=idx.children.get(node.id)||[],media=doc.tables.media.filter(m=>m.bulletId===node.id),stamp=Number(receipts.get(node.id)||doc.web.noteTimes?.[node.id]?.createdAt),received=Number.isFinite(stamp)&&!Number.isNaN(new Date(stamp).getTime())?stamp:null;
   const reminder=calendarEvents(doc).find(e=>e.id===inboxReminderId(node.id)),active=panel?.id===node.id?panel:null,mirror=!!node.mirrorSourceId;
   return <li className={'inbox-item'+(active?' is-open':'')+(selected===node.id?' is-selected':'')} key={node.id} data-inbox-id={node.id} tabIndex={0} onFocus={()=>setSelected(node.id)} onClick={()=>setSelected(node.id)} aria-label={(node.text||'Untitled capture').slice(0,120)}>
    <div className="inbox-item-meta">{received&&<time dateTime={new Date(Number(received)).toISOString()}>{relativeDay(localDate(new Date(Number(received))),today)}</time>}{receipts.has(node.id)&&<span>Shared to RemoNook</span>}{node.taskState!=='NONE'&&<span><Icon name="check" size={12}/>{node.taskState==='DONE'?'Completed task':'Task'}</span>}{reminder&&<span className="inbox-reminder"><Icon name="calendar" size={12}/>{relativeDay(reminder.date,today)}{reminder.time?' '+reminder.time:''}</span>}</div>
    <div className="inbox-item-text"><RichRead node={node}/>{!node.text&&<span className="inbox-muted">Untitled capture</span>}</div>
    {(kids.length>0||media.length>0)&&<p className="inbox-detail">{[kids.length?`${kids.length} child note${kids.length===1?'':'s'}`:'',media.length?`${media.length} attachment${media.length===1?'':'s'}`:''].filter(Boolean).join(' · ')}</p>}
    <div className="inbox-actions" role="group" aria-label={`Process ${node.text.slice(0,70)||'capture'}`}>
     <button data-key="file" aria-keyshortcuts="F" title="File (F)" disabled={disabled||mirror} aria-expanded={!!active&&active.kind==='file'} onClick={e=>open(node.id,'file',e.currentTarget)}><Icon name="organize" size={15}/>File</button>
     <button data-key="link" aria-keyshortcuts="L" title="Link (L)" disabled={disabled||mirror} aria-expanded={!!active&&active.kind==='link'} onClick={e=>open(node.id,'link',e.currentTarget)}><Icon name="link" size={15}/>Link</button>
     <button data-key="task" aria-keyshortcuts="T" title="Make task (T)" disabled={disabled||mirror||node.taskState!=='NONE'} onClick={()=>apply(node.id,{kind:'task'})}><Icon name="check" size={15}/>{node.taskState==='NONE'?'Make task':'Task added'}</button>
     <button data-key="schedule" aria-keyshortcuts="S" title="Schedule (S)" disabled={disabled||mirror} aria-expanded={!!active&&active.kind==='schedule'} onClick={e=>open(node.id,'schedule',e.currentTarget)}><Icon name="calendar" size={15}/>{reminder?'Reschedule':'Schedule'}</button>
    </div>
    {active&&<form className="inbox-action-panel" aria-label={active.kind==='file'?'File capture':active.kind==='link'?'Link capture':'Schedule capture'} onSubmit={e=>{e.preventDefault();if(active.kind==='schedule')apply(node.id,{kind:'schedule',date,time});else if(target!==undefined)apply(node.id,{kind:active.kind,target});}} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}}}>
     <h3>{active.kind==='file'?'Where does this belong?':active.kind==='link'?'Connect to an existing note':'Make time for this'}</h3>
     {active.kind==='schedule'?<><p>Add an in-app Calendar reminder linked to this note. It does not change its deadline.</p><div className="inbox-date-row"><label>Date<input ref={panelInput} type="date" aria-label="Capture reminder date" required min="1900-01-01" max="2199-12-31" value={date} onChange={e=>setDate(e.target.value)}/></label><label>Time (optional)<input type="time" aria-label="Capture reminder time" value={time} onChange={e=>setTime(e.target.value)}/></label></div><small>Reminders appear while RemoNook is open.</small></>:<><p>{active.kind==='file'?'Move the original note with all its children and attachments.':'Add a reference under this capture. Both original notes stay where they are.'}</p><label className="inbox-search"><Icon name="search" size={15}/><input ref={panelInput} aria-label="Find destination note" placeholder="Search notes or paths…" value={query} onChange={e=>{setQuery(e.target.value);setTarget(undefined);}}/></label><fieldset className="inbox-destinations"><legend>Choose a destination</legend>{active.kind==='file'&&!query&&<label><input type="radio" name="inbox-destination" checked={target===null} onChange={()=>setTarget(null)}/><span><strong>My notes</strong><small>Top level</small></span></label>}{destinations.slice(0,80).map(n=><label key={n.id}><input type="radio" name="inbox-destination" checked={target===n.id} onChange={()=>setTarget(n.id)}/><span><strong>{n.title}</strong><small>{n.path}</small></span></label>)}{!destinations.length&&<p>No matching notes. {active.kind==='file'?'Clear search to file at the top level.':'Create a note in Notes first.'}</p>}</fieldset>{destinations.length>80&&<small>Showing 80 destinations. Search to narrow the list.</small>}</>}
     {error&&<p role="alert">{error}</p>}<footer><button type="button" onClick={close}>Cancel</button><button className="inbox-primary" disabled={disabled||(active.kind!=='schedule'&&target===undefined)}>{active.kind==='file'?'File note':active.kind==='link'?'Add link':'Save reminder'}</button></footer>
    </form>}
    <footer className="inbox-item-footer"><button data-key="open" aria-keyshortcuts="O" title="Open (O)" onClick={()=>onOpen(node.mirrorSourceId||node.id)}><Icon name="notes" size={14}/>{mirror?'Open source':'Open note'}</button><button className="icon-button" aria-label={`Move capture to Trash: ${node.text.slice(0,70)||'Untitled'}`} title="Move to Trash" disabled={disabled} onClick={()=>{try{onTrash(node.id);say(`Moved “${(node.text||'capture').slice(0,48)}” to Trash`);}catch(e){setError(String(e));}}}><Icon name="trash" size={15}/></button></footer>
   </li>;
  })}</ol>}
  <UndoToast toast={toast} onUndo={()=>history()} onClose={()=>setToast(null)}/>
  {matches.length>limit&&<button className="inbox-more" onClick={()=>setLimit(n=>n+30)}>Show more captures ({matches.length-limit} remaining)</button>}
 </section>;
}
