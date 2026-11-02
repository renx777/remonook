import {createContext,useContext} from 'react';
export type BookReadingSource={kind?:'book';hash:string;unit:number;id:string;label:string};
export type WebReadingSource={kind:'web';bookmarkId:string;highlightId:string;url:string;label:string};
export const ReadingSources=createContext<{sources:Record<string,BookReadingSource|WebReadingSource>;open:(hash:string,unit:number,id:string)=>void;openWeb?:(bookmarkId:string,highlightId:string)=>void}>({sources:{},open:()=>{}});
export function ReadingCitation({id}:{id:string}){const {sources,open,openWeb}=useContext(ReadingSources),source=Object.hasOwn(sources,id)?sources[id]:undefined;return source?<button className="reading-citation" onClick={event=>{event.stopPropagation();if(source.kind==='web')openWeb?.(source.bookmarkId,source.highlightId);else open(source.hash,source.unit,source.id);}} title="Open the original passage">↗ {source.label}</button>:null;}


import {Component,useEffect,useRef,type ReactNode} from 'react';
export function ReaderStartup({onClose,error=false}:{onClose:()=>void;error?:boolean}){const ref=useRef<HTMLDialogElement>(null);useEffect(()=>{ref.current?.showModal();},[]);return <dialog ref={ref} className="reader-startup" aria-label="Opening book reader" onCancel={onClose}><p>{error?'The reader could not load. Open it once while online, then try again.':'Preparing a little room to read…'}</p><button onClick={onClose}>Close</button></dialog>;}
export class ReaderBoundary extends Component<{children:ReactNode;onClose:()=>void},{error:boolean}>{state={error:false};static getDerivedStateFromError(){return {error:true};}render(){return this.state.error?<ReaderStartup error onClose={this.props.onClose}/>:this.props.children;}}
