import {useEffect,useState,type ReactNode} from 'react';import * as Dialog from '@radix-ui/react-dialog';import {Icon} from './icons';
export function ArticleNotesPanel({children,onClose,count,onAdd,disabled}:{children:ReactNode;onClose:()=>void;count:number;onAdd:()=>void;disabled:boolean}){
 const [mobile,setMobile]=useState(()=>window.matchMedia('(max-width:760px)').matches);
 useEffect(()=>{const media=window.matchMedia('(max-width:760px)'),change=()=>setMobile(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
 const title=<>Article notes <span className="article-notes-count">{count}</span></>;
 const heading=<header className="web-notes-heading">{mobile?<Dialog.Title>{title}</Dialog.Title>:<h2>{title}</h2>}<div><button className="article-icon-button" disabled={disabled} aria-label="Add article note" title="Add note" onClick={onAdd}><Icon name="plus" size={19}/></button><button className="article-icon-button" aria-label="Close article notes" onClick={onClose}><Icon name="close" size={20}/></button></div></header>;
 const content=<>{heading}<div className="article-notes-content">{count===0&&<p className="article-notes-empty">No notes yet. Highlight a passage or add a bullet.</p>}{children}</div></>;
 return mobile?<Dialog.Root open onOpenChange={open=>{if(!open)onClose();}}><Dialog.Portal container={document.querySelector('.app')||document.body}><Dialog.Overlay className="web-notes-overlay"/><Dialog.Content className="web-notes web-notes-mobile" aria-describedby={undefined}>{content}</Dialog.Content></Dialog.Portal></Dialog.Root>:<aside className="web-notes">{content}</aside>;
}
