import {useEffect,useState,type ReactNode} from 'react';import * as Dialog from '@radix-ui/react-dialog';import {Icon} from './icons';
type Filter='all'|'highlights'|'notes';
export function ArticleNotesPanel({children,onClose,count,onAdd,disabled,filter='all',onFilter}:{children:ReactNode;onClose:()=>void;count:number;onAdd:()=>void;disabled:boolean;filter?:Filter;onFilter?:(filter:Filter)=>void}){
 const [mobile,setMobile]=useState(()=>window.matchMedia('(max-width:760px)').matches);
 useEffect(()=>{const media=window.matchMedia('(max-width:760px)'),change=()=>setMobile(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
 const title=<>Article notes <span className="article-notes-count">{count}</span></>;
 const heading=<header className="web-notes-heading">{mobile?<Dialog.Title>{title}</Dialog.Title>:<h2>{title}</h2>}<div><button className="article-icon-button" disabled={disabled} aria-label="Add article note" title="Add note" onClick={onAdd}><Icon name="plus" size={19}/></button><button className="article-icon-button" aria-label="Close article notes" onClick={onClose}><Icon name="close" size={20}/></button></div></header>;
 // Filter between highlighted passages and free notes once a page has a few of each.
 const filters=onFilter&&count>0&&<div className="article-notes-filter" role="group" aria-label="Show notes">{([['all','All'],['highlights','Highlights'],['notes','Notes']] as const).map(([value,label])=><button key={value} aria-pressed={filter===value} onClick={()=>onFilter(value)}>{label}</button>)}</div>;
 const content=<>{heading}{filters}<div className="article-notes-content">{count===0&&<p className="article-notes-empty">No notes yet. Select a passage and choose Add note, or add a note here.</p>}{children}</div></>;
 return mobile?<Dialog.Root open onOpenChange={open=>{if(!open)onClose();}}><Dialog.Portal container={document.querySelector('.app')||document.body}><Dialog.Overlay className="web-notes-overlay"/><Dialog.Content className="web-notes web-notes-mobile" aria-describedby={undefined}>{content}</Dialog.Content></Dialog.Portal></Dialog.Root>:<aside className="web-notes">{content}</aside>;
}
