import {useEffect,useLayoutEffect,useRef,useState} from 'react';
/** Keep text urgent; only the expensive consumer waits for a short typing pause. */
export function useBufferedQuery(value:string,onChange:(value:string)=>void,delay=120){
 const focused=useRef(false),parent=useRef(value);parent.current=value;
 const[draft,setDraft]=useState(value),pending=useRef<string|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null),emitted=useRef(new Set<string>()),latest=useRef(onChange),composing=useRef(false);latest.current=onChange;
 const cancel=()=>{if(timer.current)clearTimeout(timer.current);timer.current=null;};
 const flush=()=>{cancel();if(pending.current===null)return;const text=pending.current;pending.current=null;emitted.current.add(text);latest.current(text);};
 const update=(text:string)=>{setDraft(text);pending.current=text;cancel();if(!composing.current)timer.current=setTimeout(flush,delay);};
 const commit=(text:string)=>{setDraft(text);pending.current=text;flush();};
 useEffect(()=>{if(emitted.current.has(value)){emitted.current.delete(value);return;}cancel();pending.current=null;setDraft(value);},[value]);
 useLayoutEffect(()=>{if(!focused.current&&pending.current===null&&draft!==value)setDraft(value);});
 useEffect(()=>()=>cancel(),[]);
 return{draft,update,commit,flush,focus:()=>{focused.current=true;},blur:()=>{focused.current=false;flush();setDraft(parent.current);},startComposition:()=>{composing.current=true;cancel();},endComposition:(text:string)=>{composing.current=false;update(text);}};
}
