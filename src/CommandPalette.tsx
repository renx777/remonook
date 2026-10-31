import {useMemo,useRef,useState} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {Command,defaultFilter} from 'cmdk';
import type {Node} from './data';
import {Icon} from './icons';
import './command-palette.css';
export type PaletteAction={id:string;label:string;keywords?:string[];icon?:string;disabled?:boolean;run:()=>void|Promise<void>};
export function CommandPalette({nodes,actions,onChoose,onClose,container}:{nodes:Node[];actions:PaletteAction[];onChoose:(id:string)=>void|Promise<void>;onClose:()=>void;container?:HTMLElement|null}) {
  const [query,setQuery]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const origin=useRef(document.activeElement as HTMLElement|null),input=useRef<HTMLInputElement>(null),running=useRef(false);
  const index=useMemo(()=>new Map(nodes.map(n=>[n.id,n])),[nodes]);
  // Search the whole outline before limiting rendered rows. Duplicate titles keep unique IDs.
  const notes=useMemo(()=>nodes.filter(n=>n.text?.trim()).map((node,order)=>({node,order,score:query.trim()?defaultFilter(node.text,query.trim()):1})).filter(n=>n.score>0).sort((a,b)=>b.score-a.score||a.order-b.order).slice(0,40),[nodes,query]);
  const commands=actions.map(action=>({action,score:query.trim()?defaultFilter(action.label,query.trim(),action.keywords):1})).filter(item=>item.score>0).sort((a,b)=>b.score-a.score).map(item=>item.action);
  const select=async(run:()=>void|Promise<void>)=>{if(running.current)return;running.current=true;setBusy(true);setError('');try{await run();onClose();}catch(e){setError(e instanceof Error?e.message:'This action could not be completed. Try again.');requestAnimationFrame(()=>input.current?.focus());}finally{running.current=false;setBusy(false);}};
  return <Dialog.Root open onOpenChange={open=>{if(!open&&!running.current)onClose();}}><Dialog.Portal container={container||document.querySelector('.app')||document.body}>
    <Dialog.Overlay className="command-backdrop"/>
    <Dialog.Content data-command-palette className="command-dialog" aria-describedby="command-description" onEscapeKeyDown={e=>{e.stopPropagation();if(running.current)e.preventDefault();}} onCloseAutoFocus={e=>{e.preventDefault();requestAnimationFrame(()=>{const target=origin.current?.closest('details:not([open])')?.querySelector<HTMLElement>('summary')||origin.current,modal=document.querySelector('dialog[open], [role="dialog"]');const active=document.activeElement;if(active instanceof HTMLElement&&active!==target&&active.matches('input,textarea,[contenteditable="true"]'))return;if(target?.isConnected&&(!modal||modal.contains(target)))target.focus();});}} onOpenAutoFocus={e=>{e.preventDefault();input.current?.focus();}}>
      <Dialog.Title className="command-sr-only">Commands & notes</Dialog.Title><Dialog.Description id="command-description" className="command-sr-only">Search workspace actions or any note. Use arrow keys to choose and Enter to open.</Dialog.Description>
      <Command label="Commands & notes" shouldFilter={false} loop vimBindings={false}>
        <div className="command-search"><Icon name="search" size={20}/><Command.Input ref={input} value={query} onValueChange={setQuery} placeholder="Search commands and notes…" aria-label="Search commands and notes" disabled={busy}/><Dialog.Close disabled={busy} aria-label="Close command palette"><Icon name="close" size={18}/></Dialog.Close></div>
        {error&&<p role="alert" className="command-error">{error}</p>}
        <Command.List aria-label="Commands and matching notes" aria-busy={busy}>
          {!commands.length&&!notes.length&&<div className="command-empty" role="status">No matches. Try a different word.</div>}
          {!!commands.length&&<Command.Group heading="Actions">{commands.map(action=><Command.Item key={action.id} value={'action:'+action.id} disabled={busy||action.disabled} onSelect={()=>void select(action.run)}><Icon name={action.icon||'chevron'} size={17}/><span>{action.label}</span></Command.Item>)}</Command.Group>}
          {!!notes.length&&<Command.Group heading={query.trim()?'Matching notes':'Your notes'}>{notes.map(({node})=><Command.Item key={node.id} value={'note:'+node.id} disabled={busy} onSelect={()=>void select(()=>onChoose(node.id))}><Icon name="notes" size={17}/><span><strong>{node.text}</strong><small>{index.get(node.parentId||'')?.text||'Home'}</small></span><Icon name="chevron" size={13}/></Command.Item>)}</Command.Group>}
        </Command.List><footer className="command-footer"><span>↑ ↓ Navigate · Enter Open</span><span>{busy?'Opening…':'Esc Close'}</span></footer>
      </Command>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
