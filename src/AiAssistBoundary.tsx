import {Component,type ReactNode} from 'react';
export class AiAssistBoundary extends Component<{children:ReactNode;onClose:()=>void},{error:boolean}>{
 state={error:false};
 static getDerivedStateFromError(){return {error:true};}
 render(){return this.state.error?<aside role="dialog" aria-label="AI assist unavailable" className="research-panel"><header><h2>AI assist is unavailable</h2></header><div className="research-body"><p>Open AI assist once while online, then try again. Your notes and saved drafts are kept.</p><button onClick={this.props.onClose}>Close</button></div></aside>:this.props.children;}
}
