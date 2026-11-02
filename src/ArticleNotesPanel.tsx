import {useEffect,useState,type ReactNode} from 'react';import * as Dialog from '@radix-ui/react-dialog';
export function ArticleNotesPanel({children,onClose}:{children:ReactNode;onClose:()=>void}){
 const [mobile,setMobile]=useState(()=>window.matchMedia('(max-width:650px)').matches);
 useEffect(()=>{const media=window.matchMedia('(max-width:650px)'),change=()=>setMobile(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
 const heading=<div className="web-notes-heading"><h2>Article notes</h2><button aria-label="Close article notes" onClick={onClose}>×</button></div>;
 return mobile?<Dialog.Root open onOpenChange={open=>{if(!open)onClose();}}><Dialog.Portal container={document.querySelector('.app')||document.body}><Dialog.Overlay className="web-notes-overlay"/><Dialog.Content className="web-notes web-notes-mobile" aria-describedby={undefined}><Dialog.Title className="sr-only">Article notes</Dialog.Title>{heading}{children}</Dialog.Content></Dialog.Portal></Dialog.Root>:<aside className="web-notes">{heading}{children}</aside>;
}
