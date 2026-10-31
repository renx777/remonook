import {diagramLabels,changeDiagramLabel} from './visual-notes.mjs';
import {useEffect,useId,useRef,useState} from 'react';
import {ImageDialog} from './ImageTools';
import {mountDiagram,type DiagramState} from './diagram-renderer';
import {UnsavedChanges} from './VisualTools';
import './visual-tools.css';
export const diagramTemplates=[
 {id:'flowchart',name:'Flowchart',detail:'Explain a process',source:'flowchart TD\n  A[Start here] --> B{Make a decision}\n  B -->|Yes| C[Next step]\n  B -->|No| D[Try another way]'},
 {id:'sequence',name:'Sequence',detail:'Show a conversation',source:'sequenceDiagram\n  Alice->>Bob: Share an idea\n  Bob-->>Alice: Build on it'},
 {id:'mindmap',name:'Mind map',detail:'Connect your ideas',source:'mindmap\n  root((My idea))\n    First thought\n      A detail\n    Another thought'},
 {id:'state',name:'States',detail:'Map status changes',source:'stateDiagram-v2\n  [*] --> Draft\n  Draft --> Review\n  Review --> Published\n  Published --> [*]'},
 {id:'er',name:'Relationships',detail:'Describe connected data',source:'erDiagram\n  READER ||--o{ BOOK : reads\n  BOOK ||--o{ NOTE : inspires'},
 {id:'timeline',name:'Timeline',detail:'Put events in order',source:'timeline\n  title My learning journey\n  Discover : Find an idea\n  Explore : Read and take notes\n  Practice : Put it to work'},
];
export function DiagramEditor({source,onSave,onClose,editing=false,disabled=false}:{source?:string;onSave:(source:string)=>void;onClose:()=>void;editing?:boolean;disabled?:boolean}){
 const initial=useRef(source||diagramTemplates[0].source),[text,setText]=useState(initial.current),[selected,setSelected]=useState(source?'custom':'flowchart'),[state,setState]=useState<DiagramState>({}),[tab,setTab]=useState('source'),[discard,setDiscard]=useState(false),[error,setError]=useState('');
 const preview=useRef<HTMLDivElement>(null),drafts=useRef(new Map<string,string>());
 const fields=diagramLabels(text),workspaceId=useId();
 useEffect(()=>{setState({});let stop:(()=>void)|undefined;const timer=setTimeout(()=>{if(preview.current)stop=mountDiagram(preview.current,text,'diagram-composer',setState);},200);return()=>{clearTimeout(timer);stop?.();};},[text]);
 const close=()=>text!==initial.current?setDiscard(true):onClose();
 return <ImageDialog title={editing?'Edit diagram':'Create a diagram'} onClose={close} className="visual-editor diagram-editor">
  <p className="visual-intro">Start with a template, change its labels, and see your diagram take shape.</p>
  <div className="diagram-templates" role="group" aria-label="Diagram templates">{diagramTemplates.map(t=><button key={t.id} aria-pressed={selected===t.id} onClick={()=>{drafts.current.set(selected,text);setText(drafts.current.get(t.id)||t.source);setSelected(t.id);setError('');}}><strong>{t.name}</strong><small>{t.detail}</small></button>)}</div>
  <div className="visual-mobile-tabs" role="tablist" aria-label="Diagram workspace">{(['source','preview'] as const).map(value=><button key={value} id={workspaceId+'-'+value+'-tab'} role="tab" aria-controls={workspaceId+'-'+value} aria-selected={tab===value} tabIndex={tab===value?0:-1} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?'source':e.key==='End'?'preview':value==='source'?'preview':'source';setTab(next);document.getElementById(workspaceId+'-'+next+'-tab')?.focus();}}} onClick={()=>setTab(value)}>{value==='source'?'Edit':'Preview'}</button>)}</div>
  <div className="diagram-workspace" data-tab={tab}><section id={workspaceId+'-source'} role="tabpanel" aria-labelledby={workspaceId+'-source-tab'} className="diagram-source-pane">{fields.length>0&&<div className="diagram-labels"><strong>Edit labels</strong><p>Change the wording. Your connections stay in place.</p>{fields.map((field,i)=><label key={field.id}>Label {i+1}<input aria-label={`Diagram label ${i+1}`} value={field.value} maxLength={300} onChange={e=>setText(changeDiagramLabel(text,field,e.target.value))}/></label>)}</div>}<details className="diagram-code-disclosure" open={fields.length===0?true:undefined}><summary>Edit Mermaid source</summary><label htmlFor="diagram-source">Diagram source <small>Mermaid syntax</small></label><textarea id="diagram-source" aria-label="Diagram source" spellCheck={false} maxLength={50_000} value={text} onChange={e=>{setText(e.target.value.replace(/^```mermaid\s*\n([\s\S]*?)\n?```\s*$/,'$1'));setError('');}}/><p>Use <code>A[Label] --&gt; B[Another label]</code> to connect two steps. Your source stays editable.</p></details></section><section id={workspaceId+'-preview'} role="tabpanel" aria-labelledby={workspaceId+'-preview-tab'} className="diagram-preview-pane" aria-label="Diagram preview"><div className="visual-pane-heading"><strong>Live preview</strong><span role="status">{state.error?'Needs a correction':state.ready?'Ready to insert':'Updating…'}</span></div><div ref={preview} className="diagram-canvas"/>{state.error&&<p className="visual-error" role="alert">{state.error}</p>}</section></div>
  {error&&<p className="visual-error" role="alert">{error}</p>}{discard&&<UnsavedChanges onKeep={()=>setDiscard(false)} onDiscard={onClose}/>}
  <footer className="visual-footer"><span>{editing?'Updates this diagram in your note.':'Saved in your note. Edit it again any time.'}</span><button onClick={close}>Cancel</button><button className="visual-primary" disabled={disabled||!state.ready||!!state.error||!text.trim()} onClick={()=>{try{onSave(text);}catch(e){setError((e as Error).message);}}}>{editing?'Save diagram':'Insert diagram'}</button></footer>
 </ImageDialog>;
}
