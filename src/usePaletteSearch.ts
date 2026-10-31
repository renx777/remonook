import {useEffect,useMemo,useRef,useState} from 'react';
import type {Node} from './data';
import {preparePaletteNotes,searchPaletteNotes,mergePaletteMatches} from './palette-search.mjs';
type Result=ReturnType<typeof searchPaletteNotes>;
export function usePaletteSearch(nodes:Node[],query:string){
 const large=useMemo(()=>nodes.length>500||nodes.reduce((size,node)=>size+(node.text?.length||0),0)>100000,[nodes]);
 const prepared=useMemo(()=>large?[]:preparePaletteNotes(nodes),[nodes,large]);
 const immediate=useMemo(()=>large?null:searchPaletteNotes(prepared,query),[prepared,query,large]);
 const [result,setResult]=useState<{nodes:Node[];query:string;value:Result}|null>(null);
 const worker=useRef<Worker|null>(null),source=useRef<Node[]|null>(null),sequence=useRef(0);
 useEffect(()=>{
  if(!large){worker.current?.terminate();worker.current=null;source.current=null;return;}
  const id=++sequence.current;let timer:ReturnType<typeof setTimeout>|undefined,cancelled=false;
  const publish=(value:Result)=>{if(!cancelled&&id===sequence.current)setResult({nodes,query,value});};
  const fallback=()=>{worker.current?.terminate();worker.current=null;source.current=null;let at=0,value:Result={matches:[],total:0};const chunk=()=>{if(cancelled||id!==sequence.current)return;value=mergePaletteMatches(value,searchPaletteNotes(preparePaletteNotes(nodes.slice(at,at+250)),query));at+=250;if(at<nodes.length)timer=setTimeout(chunk,0);else publish(value);};timer=setTimeout(chunk,0);};
  try{
   let notes: {id:string;text:string}[]|undefined;
   if(source.current!==nodes||!worker.current){worker.current?.terminate();worker.current=new Worker(new URL('./palette-search-worker.ts',import.meta.url),{type:'module'});source.current=nodes;notes=nodes.map(({id,text})=>({id,text}));}
   worker.current.onmessage=event=>{if(event.data.id===id)publish(event.data);};worker.current.onerror=event=>{event.preventDefault();if(!cancelled)fallback();};
   worker.current.postMessage({id,notes,query});
  }catch{fallback();}
  return()=>{cancelled=true;if(timer)clearTimeout(timer);};
 },[nodes,query,large]);
 useEffect(()=>()=>{sequence.current++;worker.current?.terminate();},[]);
 const current=result?.nodes===nodes&&result.query===query;
 return{...(immediate||(current?result!.value:{matches:[],total:0})),pending:large&&!current};
}
