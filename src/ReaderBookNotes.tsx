import {useEffect,useRef,useState} from 'react';
import {Editor} from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {RemoCode,RemoMask,RemoColor,RemoHighlight,toEditor,fromEditor,RichRead,unsupportedFormatting} from './editor';
import {RemoRough} from './RoughAnnotation';
import {rows} from './domain.mjs';
import {MediaContent} from './MediaContent';
import {ReadingCitation} from './ReadingSources';
import type {Workspace,Node} from './data';
import {Icon} from './icons';
function NoteField({node,disabled,onText,readCurrentNode,onReady,onUndo}:{node:Node;disabled:boolean;onText:(id:string,value:{text:string;formatting:string})=>void;readCurrentNode:(id:string)=>Node|undefined;onReady:(editor:Editor|null)=>void;onUndo:(redo:boolean)=>void}){
 const host=useRef<HTMLDivElement>(null),ref=useRef<Editor|null>(null),latest=useRef({node,onText,onUndo,readCurrentNode});latest.current={node,onText,onUndo,readCurrentNode};
 useEffect(()=>{const editor=new Editor({element:host.current!,extensions:[StarterKit.configure({heading:false,blockquote:false,bulletList:false,orderedList:false,listItem:false,codeBlock:false,code:false,horizontalRule:false,link:false,strike:false,undoRedo:false}),RemoCode,RemoMask,RemoColor,RemoHighlight,RemoRough],content:toEditor(node),editable:!disabled&&!unsupportedFormatting(node),editorProps:{attributes:{'aria-label':'Edit book note',role:'textbox','aria-multiline':'true'},handleKeyDown:(_view,event)=>{if(!event.isComposing&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();latest.current.onUndo(event.shiftKey);return true;}return false;}},onUpdate:({editor})=>latest.current.onText(node.id,fromEditor(editor.getJSON()))});ref.current=editor;onReady(editor);editor.commands.focus('end');return()=>{onReady(null);ref.current=null;editor.destroy();};},[node.id]);
 useEffect(()=>{const editor=ref.current;if(!editor)return;const incoming=readCurrentNode(node.id)||node,value=fromEditor(editor.getJSON());if(value.text!==incoming.text||value.formatting!==incoming.formatting){const selection=editor.state.selection.from;editor.commands.setContent(toEditor(incoming),{emitUpdate:false});editor.commands.setTextSelection(Math.min(selection,incoming.text.length+1));}const editable=!disabled&&!unsupportedFormatting(incoming);if(editor.isEditable!==editable)editor.setEditable(editable,false);},[node.text,node.formatting,disabled]);
 return <div ref={host} className="reader-note-editor"/>;
}
export function ReaderBookNotes({doc,hash,assets,disabled,onText,readCurrentNode,onAdd,onUndo,canUndo,canRedo,onFullNotes}:{doc:Workspace;hash:string;assets:Map<string,Blob>;disabled:boolean;onText:(id:string,value:{text:string;formatting:string})=>void;readCurrentNode:(id:string)=>Node|undefined;onAdd:()=>string;onUndo:(redo:boolean)=>void;canUndo:boolean;canRedo:boolean;onFullNotes:(id:string)=>void}){
 const root=doc.web.readingNoteRoots?.[hash],rootNode=doc.tables.bullets.find(n=>n.id===root),notes=rootNode?rows(doc.tables.bullets,root,true):[];
 const [editing,setEditing]=useState<string|null>(null),[editor,setEditor]=useState<Editor|null>(null),[limit,setLimit]=useState(60),[error,setError]=useState('');
 useEffect(()=>{if(editing&&!doc.tables.bullets.some(n=>n.id===editing))setEditing(null);},[doc.tables.bullets,editing]);
 const add=()=>{try{const id=onAdd();setLimit(value=>Math.max(value,notes.length+1));setEditing(id);setError('');}catch(error){setError((error as Error).message);}};
 return <div className="reader-book-notes"><div className="reader-book-notes-tools"><button disabled={disabled} onClick={add}><Icon name="plus" size={15}/>New note</button><button aria-label="Undo book note edit" disabled={disabled||!canUndo} onClick={()=>onUndo(false)}><Icon name="undo" size={15}/></button><button aria-label="Redo book note edit" disabled={disabled||!canRedo} onClick={()=>onUndo(true)}><Icon name="redo" size={15}/></button>{rootNode&&<button aria-label="Open full book notes" onClick={()=>onFullNotes(rootNode.id)}><Icon name="forward" size={15}/></button>}</div>
 {rootNode&&<h4 className="reader-book-note-title">{rootNode.text||'Book notes'}</h4>}
 {editing&&<div className="reader-note-format" role="group" aria-label="Book note formatting">{[['bold','Bold'],['italic','Italic'],['underline','Underline']].map(([mark,label])=><button key={mark} aria-label={label+' book note'} disabled={disabled||!editor} onPointerDown={event=>event.preventDefault()} onClick={()=>editor?.chain().focus().toggleMark(mark).run()}><Icon name={mark} size={15}/></button>)}<button onClick={()=>setEditing(null)}>Done</button></div>}
 {!notes.length&&<p className="reader-find-empty">Keep this book open while you write. New notes, highlights and captures belong to this same branch.</p>}
 <div className="reader-book-note-list">{notes.slice(0,limit).map(({bullet:node,depth}:any)=><article key={node.id} className={editing===node.id?'is-editing':''} style={{marginLeft:Math.min(depth,5)*12}}>
  {editing===node.id?<NoteField node={node} disabled={disabled} onText={onText} readCurrentNode={readCurrentNode} onReady={setEditor} onUndo={onUndo}/>:<div role="button" tabIndex={disabled||unsupportedFormatting(node)?-1:0} className="reader-note-read" aria-label={'Edit note: '+(node.text.slice(0,60)||'Untitled')} aria-disabled={disabled||unsupportedFormatting(node)} onKeyDown={event=>{if(!disabled&&!unsupportedFormatting(node)&&['Enter',' '].includes(event.key)){event.preventDefault();setEditing(node.id);}}} onClick={()=>{if(!disabled&&!unsupportedFormatting(node))setEditing(node.id);}}><RichRead node={node} connected={false}/>{!node.text&&<span className="reader-note-placeholder">Write a thought…</span>}</div>}
  <ReadingCitation id={node.id}/><MediaContent nodeId={node.id} text={node.text} media={doc.tables.media} assets={assets}/>{unsupportedFormatting(node)&&<small>Open the full Notes view to work with this formatting.</small>}
 </article>)}</div>{notes.length>limit&&<button onClick={()=>setLimit(value=>value+60)}>Show more notes</button>}{error&&<p role="alert">{error}</p>}<p className="reader-notes-save-hint">Edits save automatically in your notes.</p>
 </div>;
}
