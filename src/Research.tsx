import {useEffect,useRef,useState} from 'react';
import {researchStore,type ResearchDraft,type ResearchState,type Node} from './data';
import {Icon} from './icons';
import './research.css';

export function useResearchDrafts(account:string){
 const [state,setState]=useState<ResearchState|null>(null),[error,setError]=useState('');
 const current=useRef<ResearchState|null>(null),queue=useRef(Promise.resolve());
 const refresh=async()=>{try{const next=await researchStore(undefined,undefined,account);current.current=next;setState(next);setError('');}catch{setError('Research drafts could not be loaded. Reload to retry.');}};
 useEffect(()=>{void refresh();},[account]);
 const put=async(draft:ResearchDraft|null,id:string)=>{
  if(!current.current)throw Error('Research drafts are still loading.');
  const generation=current.current.generation,previous=current.current.drafts[id];
  const drafts={...current.current.drafts};if(draft)drafts[id]=draft;else delete drafts[id];
  current.current={generation,drafts};setState(current.current);
  const write=queue.current.catch(()=>{}).then(async()=>{await researchStore(old=>{const next={...old.drafts};if(draft)next[id]=draft;else delete next[id];return {...old,drafts:next};},generation,account);});
  queue.current=write;try{await write;setError('');}catch(e){if(!draft&&previous&&current.current?.generation===generation&&!current.current.drafts[id]){current.current={...current.current,drafts:{...current.current.drafts,[id]:previous}};setState(current.current);}setError('Draft not saved. Keep this panel open and copy your text before reloading.');throw e;}
 };
 return {state,error,put,refresh};
}

type Props={draft:ResearchDraft|null;drafts:ResearchDraft[];nodes:Node[];error:string;disabled:boolean;onChoose:(id:string)=>void;onEdit:(draft:ResearchDraft)=>void;onDiscard:()=>Promise<void>;onClose:()=>void;onInsert:(draft:ResearchDraft)=>Promise<void>};
export function ResearchPanel(p:Props){
 const [mobile,setMobile]=useState(()=>window.innerWidth<=650);
 const root=useRef<HTMLElement>(null),answer=useRef<HTMLTextAreaElement>(null),busy=useRef(false);
 const [saving,setSaving]=useState(false),[message,setMessage]=useState('');
 const latest=useRef(p);latest.current=p;
 const node=p.nodes.find(n=>n.id===p.draft?.id),alreadyInserted=!!p.draft?.insertedId&&p.nodes.some(n=>n.id===p.draft?.insertedId);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;root.current?.focus();return()=>{if(previous?.isConnected)previous.focus();};},[]);
 useEffect(()=>{setMessage('');},[p.draft?.id]);
 useEffect(()=>{const resize=()=>setMobile(window.innerWidth<=650);window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);},[]);
 useEffect(()=>{if(!mobile)return;const background=[...document.querySelectorAll<HTMLElement>('.app>main,.app>.sidebar')],prior=background.map(el=>el.inert);background.forEach(el=>el.inert=true);return()=>background.forEach((el,i)=>el.inert=prior[i]);},[mobile]);
 useEffect(()=>{const viewport=window.visualViewport;if(!viewport)return;const resize=()=>{root.current?.style.setProperty('--research-height',viewport.height+'px');root.current?.style.setProperty('--research-top',viewport.offsetTop+'px');};resize();viewport.addEventListener('resize',resize);viewport.addEventListener('scroll',resize);return()=>{viewport.removeEventListener('resize',resize);viewport.removeEventListener('scroll',resize);};},[]);
 const paste=async()=>{const destination=p.draft?.id;try{const text=await navigator.clipboard.readText();const el=answer.current,d=latest.current.draft;if(!el||!d||d.id!==destination)return;const start=el.selectionStart,end=el.selectionEnd;latest.current.onEdit({...d,answer:d.answer.slice(0,start)+text+d.answer.slice(end),updatedAt:Date.now()});requestAnimationFrame(()=>{el.focus();el.setSelectionRange(start+text.length,start+text.length);});setMessage('Text pasted. Review it before adding.');}catch{answer.current?.focus();setMessage('Clipboard access is unavailable. Paste into the answer field using your keyboard or touch menu.');}};
 const insert=async()=>{if(busy.current||!p.draft)return;busy.current=true;setSaving(true);setMessage('');try{await p.onInsert(p.draft);}catch(e){setMessage((e as Error).message);}finally{busy.current=false;setSaving(false);}};
 const edit=(patch:Partial<ResearchDraft>)=>{if(p.draft)p.onEdit({...p.draft,...patch,updatedAt:Date.now()});};
 return <aside ref={root} className="research-panel" aria-label="Research answer" role={mobile?'dialog':undefined} aria-modal={mobile||undefined} tabIndex={-1} onKeyDown={e=>{if(mobile&&e.key==='Tab'){const controls=[...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,textarea')];const first=controls[0],last=controls.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===root.current)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}if(e.key==='Escape'){e.stopPropagation();p.onClose();}}}>
  <header><div><small>RESEARCH</small><h2>{p.draft?'A little room to find an answer':'Research drafts'}</h2></div><button className="icon-button" aria-label="Close research" onClick={p.onClose}><Icon name="close"/></button></header>
  <div className="research-body">
   {p.error&&<p role="alert" className="research-error">{p.error}</p>}
   {p.draft?<>
    <div className="research-destination"><small>Answer under</small><strong>{node?.text||p.draft.query||'Untitled bullet'}</strong>{!node&&<p>This bullet is no longer available. Your draft is still here to copy.</p>}</div>
    <label className="field-label">Search query<input value={p.draft.query} maxLength={2000} onChange={e=>edit({query:e.target.value})}/></label>
    <a className="research-search" href={'https://www.google.com/search?q='+encodeURIComponent(p.draft.query)} target="_blank" rel="noopener noreferrer" aria-label="Search Google (opens in a new tab)" aria-disabled={!p.draft.query.trim()} onClick={e=>{if(!p.draft?.query.trim()){e.preventDefault();return;}setMessage('Copy useful text from Google, then paste and review it here.');}}>Search Google <Icon name="forward" size={13}/></a>
    <div className="research-answer-heading"><label htmlFor="research-answer">Answer draft</label><button onClick={()=>void paste()} disabled={alreadyInserted||saving}>Paste from clipboard</button></div>
    <textarea ref={answer} id="research-answer" value={p.draft.answer} readOnly={alreadyInserted||saving} placeholder="Paste what you find, then make it your own…" onChange={e=>edit({answer:e.target.value})}/>
    <p className="research-hint">Your draft stays on this device when you switch tabs or close this panel.</p>
    {alreadyInserted&&<p role="status">This answer has already been added. Your draft is kept until saving succeeds.</p>}
    <button className="research-discard" disabled={saving} onClick={()=>void p.onDiscard().catch(()=>setMessage('Could not discard this draft. Try again.'))}>Discard draft</button>
    {p.drafts.length>1&&<button className="research-drafts-link" onClick={()=>p.onChoose('')}>All research drafts ({p.drafts.length})</button>}
   </>:<><p className="research-hint">Pick up where you left off. Drafts are saved on this device.</p>{!p.drafts.length&&<p>No unfinished research. Open a bullet’s menu and choose Research answer…</p>}{p.drafts.map(d=><button key={d.id} className="research-draft-item" onClick={()=>p.onChoose(d.id)}><strong>{p.nodes.find(n=>n.id===d.id)?.text||d.query||'Deleted bullet'}</strong><small>{d.answer||'No answer yet'}</small></button>)}</>}
   {message&&<p role="status" className="research-message">{message}</p>}
  </div>
  {p.draft&&<footer><span>One child bullet · editable afterward</span><button className="study-primary" disabled={saving||p.disabled||!node||!p.draft.answer.trim()} onClick={()=>void insert()}>{saving?'Saving answer…':alreadyInserted?'Finish saving':'Add answer'}</button></footer>}
 </aside>;
}
