// Outline rendering for Traits blocks: the "Traits" child bullet shows as a properties header,
// and each `key:: value` child as an Obsidian-style property row (type icon, name, value) that
// edits in place. Clicking a row never opens the raw text; keyboard navigation into a row still
// shows the plain `key:: value` text for power users.
import {useContext,useEffect,useRef,useState} from 'react';
import {AlignLeft,List,Binary,SquareCheck,Calendar,CalendarClock,Plus,Trash2,X} from 'lucide-react';
import {NoteMetadataContext} from './NoteMetadataContext';
import {withNodes} from './data';
import type {Node,Workspace} from './data';
import {TRAIT_KINDS,parseTraitRow,traitKind,setTraitKind,setTraitRow,addTraitRow,freshTraitKey,knownTraitKeys,traitList,isUrl} from './traits-block.mjs';
import './traits-block.css';

const ICONS:Record<string,any>={text:AlignLeft,list:List,number:Binary,checkbox:SquareCheck,date:Calendar,datetime:CalendarClock};
let focusNext='';// row id whose name editor opens when it mounts (after Add property)

function useSave(){const ctx=useContext(NoteMetadataContext);return {ctx,save:(fn:(d:Workspace)=>Workspace)=>ctx?.save?ctx.save(fn):Promise.reject(Error('Editing is unavailable here.'))};}

/** The Traits bullet itself: a quiet "Traits" heading with a count and Add property. */
export function TraitsHeader({node,count,disabled}:{node:Node;count:number;disabled?:boolean}){
 const {ctx,save}=useSave(),[error,setError]=useState('');
 const add=()=>{save(d=>{const parent=d.tables.bullets.find(n=>n.id===node.id)?.parentId||'';const r=addTraitRow(d,node.id,freshTraitKey(d,parent),'text','');focusNext=r.id;return r.doc;}).catch(e=>{focusNext='';setError(e.message);});};
 return <div className="traits-header" onClick={e=>e.stopPropagation()} onPointerDown={e=>e.stopPropagation()}>
  <span className="traits-title">Traits</span>{count>0&&<span className="traits-count">{count}</span>}
  {ctx&&<button type="button" className="traits-add" disabled={disabled||ctx.disabled} onClick={add}><Plus size={14}/>Add property</button>}
  {error&&<span role="alert" className="traits-error">{error}</span>}
 </div>;
}

/** One property row. `node.text` is `key:: value`. */
export function TraitRow({node,disabled}:{node:Node;disabled?:boolean}){
 const {ctx,save}=useSave();const row=parseTraitRow(node.text)!;const doc=ctx?.doc;
 const type=doc?traitKind(doc,row.key,row.value):'text',Icon=ICONS[type]||AlignLeft;
 const [nameOpen,setNameOpen]=useState(false),[editing,setEditing]=useState(false),[draft,setDraft]=useState(row.value),[name,setName]=useState(row.key),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const lock=useRef(false),off=disabled||!ctx||ctx.disabled;
 useEffect(()=>{if(!editing)setDraft(row.value);if(!nameOpen)setName(row.key);},[row.key,row.value]);
 useEffect(()=>{if(focusNext===node.id){focusNext='';setNameOpen(true);}},[node.id]);
 const run=async(fn:(d:Workspace)=>Workspace)=>{if(lock.current)return false;lock.current=true;setBusy(true);setError('');try{await save(fn);return true;}catch(e){setError((e as Error).message);return false;}finally{lock.current=false;setBusy(false);}};
 const commit=async(value:any=draft)=>{if((Array.isArray(value)?value.join(', '):String(value??''))===row.value){setEditing(false);return;}if(await run(d=>setTraitRow(d,node.id,row.key,value)))setEditing(false);};
 const rename=async()=>{const k=name.trim();if(!k||k===row.key){setNameOpen(false);setName(row.key);return;}if(await run(d=>setTraitRow(d,node.id,k,row.value)))setNameOpen(false);};
 const changeType=(t:string)=>void run(d=>{let next=setTraitKind(d,row.key,t);try{next=setTraitRow(next,node.id,row.key,row.value);}catch{/* keep the old text; it shows as invalid until edited */}return next;});
 const remove=()=>void run(d=>withNodes(d,d.tables.bullets.filter(n=>n.id!==node.id) as any));
 const stop={onClick:(e:any)=>e.stopPropagation(),onPointerDown:(e:any)=>e.stopPropagation(),onKeyDown:(e:any)=>e.stopPropagation(),onDoubleClick:(e:any)=>e.stopPropagation()};
 const suggestions=doc&&nameOpen?knownTraitKeys(doc).filter(k=>k.toLowerCase()!==row.key.toLowerCase()).slice(0,30):[];
 return <div className="trait-row" {...stop}>
  <button type="button" className="trait-key" aria-label={`Property ${row.key}, ${TRAIT_KINDS.find(([k])=>k===type)?.[1]}. Rename or change type`} aria-expanded={nameOpen} disabled={off} onClick={()=>setNameOpen(o=>!o)}><Icon size={16} aria-hidden="true"/><span>{row.key}</span></button>
  <div className="trait-value">{type==='checkbox'?<input type="checkbox" aria-label={row.key} checked={row.value==='true'} disabled={off||busy} onChange={e=>void commit(e.target.checked?'true':'false')}/>
   :editing?<ValueEditor type={type} value={draft} busy={busy} label={row.key} onDraft={setDraft} onCommit={v=>void commit(v)} onCancel={()=>{setEditing(false);setDraft(row.value);setError('');}}/>
   :<button type="button" className={'trait-display'+(row.value?'':' is-empty')} disabled={off} aria-label={`Edit ${row.key}`} onClick={()=>{setDraft(row.value);setEditing(true);}}>{row.value?<Shown type={type} value={row.value}/>:'Empty'}</button>}
   {!editing&&isUrl(row.value)&&type==='text'&&<a className="trait-open" href={row.value} target="_blank" rel="noopener noreferrer" aria-label={`Open ${row.key}`}>↗</a>}
  </div>
  {nameOpen&&<div className="trait-menu" role="group" aria-label={`Edit property ${row.key}`}>
   <form onSubmit={e=>{e.preventDefault();void rename();}}><input autoFocus aria-label="Property name" list={'trait-keys-'+node.id} maxLength={64} value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'){setNameOpen(false);setName(row.key);}}}/><datalist id={'trait-keys-'+node.id}>{suggestions.map(k=><option key={k} value={k}/>)}</datalist><button type="submit" disabled={busy}>Save</button></form>
   <label>Type<select aria-label="Property type" value={type} disabled={busy} onChange={e=>changeType(e.target.value)}>{TRAIT_KINDS.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label>
   <small>The type applies to “{row.key}” on every note.</small>
   <div className="trait-menu-actions"><button type="button" className="trait-delete" disabled={busy} onClick={remove}><Trash2 size={14}/>Delete property</button><button type="button" onClick={()=>{setNameOpen(false);setName(row.key);}}>Close</button></div>
  </div>}
  {error&&<span role="alert" className="traits-error">{error}</span>}
 </div>;
}

function Shown({type,value}:{type:string;value:string}){
 if(type==='list')return <span className="trait-chips">{traitList(value).map(v=><span key={v} className="trait-chip">{v}</span>)}</span>;
 if(type==='date'){const d=new Date(value+'T00:00:00');return <>{Number.isNaN(d.getTime())?value:d.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'})}</>;}
 if(type==='datetime'){const d=new Date(value);return <>{Number.isNaN(d.getTime())?value:d.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})}</>;}
 if(isUrl(value))return <span className="trait-link">{value}</span>;
 return <>{value}</>;
}

function ValueEditor({type,value,busy,label,onDraft,onCommit,onCancel}:{type:string;value:any;busy:boolean;label:string;onDraft:(v:any)=>void;onCommit:(v:any)=>void;onCancel:()=>void}){
 const [item,setItem]=useState('');
 const keys=(e:React.KeyboardEvent)=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();onCancel();}if(e.key==='Enter'&&!(e.target as HTMLElement).matches('textarea')){e.preventDefault();onCommit(value);}};
 if(type==='list'){const items=traitList(Array.isArray(value)?value.join(','):value);const add=()=>{const v=item.trim();if(!v)return;onDraft([...items,v]);setItem('');};
  return <div className="trait-list-edit">{items.map(v=><span key={v} className="trait-chip">{v}<button type="button" aria-label={'Remove '+v} onClick={()=>onDraft(items.filter(x=>x!==v))}><X size={11}/></button></span>)}
   <input autoFocus aria-label={'Add to '+label} placeholder="Add item, Enter" value={item} disabled={busy} onChange={e=>setItem(e.target.value)} onKeyDown={e=>{e.stopPropagation();if(e.key==='Enter'){e.preventDefault();if(item.trim())add();else onCommit(items);}if(e.key===','){e.preventDefault();add();}if(e.key==='Escape')onCancel();if(e.key==='Backspace'&&!item&&items.length)onDraft(items.slice(0,-1));}} onBlur={()=>onCommit(item.trim()?[...items,item.trim()]:items)}/></div>;}
 const input=type==='number'?'number':type==='date'?'date':type==='datetime'?'datetime-local':'text';
 return <input autoFocus className="trait-input" aria-label={label} type={input} step={type==='number'?'any':undefined} value={value??''} disabled={busy} onChange={e=>onDraft(e.target.value)} onKeyDown={keys} onBlur={()=>onCommit(value)}/>;
}
