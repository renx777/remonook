import './visual-tools.css';
import {Component,Suspense,createContext,useContext,type ReactNode} from 'react';
import {ImageDialog} from './ImageTools';
export type DiagramTarget={id:string;source?:string;original?:string;start?:number;base?:string};
export const VisualToolsContext=createContext<{diagram?:(target:DiagramTarget)=>void;drawing?:(id:string,mediaId?:string)=>void}>({});
export const useVisualTools=()=>useContext(VisualToolsContext);
export function UnsavedChanges({onKeep,onDiscard}:{onKeep:()=>void;onDiscard:()=>void}){return <div className="visual-discard" role="alert"><span>Discard unsaved changes?</span><button autoFocus onClick={onKeep}>Keep editing</button><button onClick={onDiscard}>Discard changes</button></div>;}

class VisualBoundary extends Component<{children:ReactNode;title:string;onClose:()=>void},{error:boolean}>{state={error:false};static getDerivedStateFromError(){return{error:true};}render(){return this.state.error?<ImageDialog title={this.props.title} onClose={this.props.onClose}><p className="visual-intro" role="alert">This editor could not be loaded. Check your connection and reopen it.</p></ImageDialog>:this.props.children;}}
export function VisualToolLoader({children,title,onClose}:{children:ReactNode;title:string;onClose:()=>void}){return <VisualBoundary title={title} onClose={onClose}><Suspense fallback={<ImageDialog title={title} onClose={onClose}><p className="visual-intro" role="status">Opening your workspace…</p></ImageDialog>}>{children}</Suspense></VisualBoundary>;}
