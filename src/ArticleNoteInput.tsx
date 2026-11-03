import {useLayoutEffect,useRef,useState} from 'react';
export function ArticleNoteInput({value,readCurrent,onValue,disabled}:{value:string;readCurrent?:()=>string;onValue:(text:string)=>void;disabled:boolean}){
 const [draft,setDraft]=useState(value),live=useRef(value),echo=useRef(value),composing=useRef(false);
 useLayoutEffect(()=>{if(composing.current)return;const next=readCurrent?.()??(value!==echo.current?value:live.current);echo.current=value;if(next!==live.current){live.current=next;setDraft(next);}});
 const update=(text:string)=>{live.current=text;setDraft(text);onValue(text);};
 return <textarea data-article-note aria-label="Edit article note" disabled={disabled} value={draft} onChange={e=>update(e.currentTarget.value)} onCompositionStart={e=>{composing.current=true;e.currentTarget.dataset.composing='true';}} onCompositionEnd={e=>{composing.current=false;delete e.currentTarget.dataset.composing;update(e.currentTarget.value);}}/>;
}
