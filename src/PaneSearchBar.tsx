import {useBufferedQuery} from './useBufferedQuery';
import {Icon} from './icons';
import './workspace-views.css';
export function PaneSearchBar({value,onChange,label,onFocus}:{value:string;onChange:(q:string)=>void;label:string;onFocus?:()=>void}){
 const query=useBufferedQuery(value,onChange),draft=query.draft;
 return <div className={`pane-search ${draft?'has-query':''}`}>
  <Icon name="search" size={14}/>
  <input aria-label={label} placeholder="Search pane" value={draft} onFocus={()=>{query.focus();onFocus?.();}} onChange={e=>query.update(e.target.value)} onBlur={query.blur} onCompositionStart={query.startComposition} onCompositionEnd={e=>query.endComposition(e.currentTarget.value)} onKeyDown={e=>{if(e.nativeEvent.isComposing||e.keyCode===229)return;if(e.key==='Escape'){e.stopPropagation();query.commit('');e.currentTarget.blur();}if(e.key==='Enter')query.flush();}}/>
  {draft&&<button className="pane-search-clear" aria-label="Clear pane search" title="Clear search" onPointerDown={e=>e.preventDefault()} onClick={()=>query.commit('')}><Icon name="close" size={11}/></button>}
 </div>;
}
