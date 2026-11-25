import './traits-block.css';
// While typing a bullet directly under a Traits bullet, suggests trait names already used in the
// workspace ("Dir…" → "Director: "), so the same trait is not split by spelling.
// Tab accepts the highlighted name (Tab indents as usual when nothing is suggested), Up/Down
// move, Escape hides. Tapping a name accepts it too.
import {useContext,useEffect,useMemo,useState,type MutableRefObject} from 'react';
import type {Editor} from '@tiptap/core';
import {NoteMetadataContext} from './NoteMetadataContext';
import {isTraitsBlock,knownTraitNames} from './traits-block.mjs';

export function TraitNameSuggest({editor,nodeId,keyHandler}:{editor:Editor;nodeId:string;keyHandler:MutableRefObject<((event:KeyboardEvent)=>boolean)|null>}){
 const ctx=useContext(NoteMetadataContext),doc=ctx?.doc;
 const inTraits=useMemo(()=>{if(!doc)return false;const n=doc.tables.bullets.find(x=>x.id===nodeId);return !!n&&isTraitsBlock(doc.tables.bullets.find(x=>x.id===n.parentId));},[doc,nodeId]);
 const names:string[]=useMemo(()=>inTraits&&doc?knownTraitNames(doc.tables.bullets):[],[inTraits,doc?.tables.bullets]);
 const [text,setText]=useState(()=>editor.getText()),[active,setActive]=useState(0),[hidden,setHidden]=useState(false);
 useEffect(()=>{const on=()=>{setText(editor.getText());setHidden(false);};editor.on('update',on);return()=>{editor.off('update',on);};},[editor]);
 const q=text.trim().toLocaleLowerCase();
 const matches=useMemo(()=>!inTraits||hidden||!q||q.length>40||text.includes(':')?[]:names.filter(k=>k.toLocaleLowerCase()!==q&&k.toLocaleLowerCase().startsWith(q)).concat(names.filter(k=>!k.toLocaleLowerCase().startsWith(q)&&k.toLocaleLowerCase().includes(q))).slice(0,5),[inTraits,hidden,q,text,names]);
 useEffect(()=>setActive(0),[q]);
 const accept=(name:string)=>{editor.chain().focus().selectAll().insertContent(name+': ').run();setHidden(true);};
 useEffect(()=>{
  keyHandler.current=matches.length?(e:KeyboardEvent)=>{
   if(e.key==='Tab'&&!e.shiftKey){accept(matches[Math.min(active,matches.length-1)]);return true;}
   if(e.key==='ArrowDown'){setActive(a=>(a+1)%matches.length);return true;}
   if(e.key==='ArrowUp'){setActive(a=>(a-1+matches.length)%matches.length);return true;}
   if(e.key==='Escape'){setHidden(true);return true;}
   return false;}:null;
  return()=>{keyHandler.current=null;};
 },[matches,active]);
 if(!matches.length)return null;
 return <div className="trait-suggest" role="listbox" aria-label="Trait names">
  {matches.map((k,i)=><button type="button" role="option" key={k} aria-selected={i===active} className={i===active?'is-active':''} onPointerDown={e=>{e.preventDefault();accept(k);}}>{k}</button>)}
  <small>Tab</small>
 </div>;
}
