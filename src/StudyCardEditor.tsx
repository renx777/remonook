import { useEffect, useRef, useState } from 'react';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import type { Node, Workspace } from './data';
import { withNodes } from './data';
import { bullet, index, flashcardSources } from './domain.mjs';
import { RemoCode, RemoMask, RemoColor, RemoHighlight, toEditor, fromEditor, RichRead, unsupportedFormatting } from './editor';
import { SelectionFormatting } from './SelectionFormatting';
import { configureMcq, mcqDefinition, mcqStudyOption } from './mcq.mjs';
import { Icon } from './icons';

function RichField({node,label,onChange,onReady}:{node:Node;label:string;onChange:(node:Node)=>void;onReady:(editor:Editor|null)=>void}) {
 const host=useRef<HTMLDivElement>(null), latest=useRef({node,onChange});latest.current={node,onChange};
 useEffect(()=>{
  const editor=new Editor({element:host.current!,extensions:[StarterKit.configure({heading:false,blockquote:false,bulletList:false,orderedList:false,listItem:false,codeBlock:false,code:false,horizontalRule:false,link:false}),RemoCode,RemoMask,RemoColor,RemoHighlight],content:toEditor(node),editable:!unsupportedFormatting(node),editorProps:{attributes:{'aria-label':label,role:'textbox','aria-multiline':'true'}},onUpdate:({editor})=>latest.current.onChange({...latest.current.node,...fromEditor(editor.getJSON())})});
  onReady(editor);editor.commands.focus('end');
  return()=>{onReady(null);editor.destroy();};
 },[node.id]);
 return <div ref={host} className="study-rich-field" />;
}

export function StudyCardEditor({doc,id,disabled,onSave,onClose,startWithBullet=false}:{doc:Workspace;id:string;disabled:boolean;onSave:(doc:Workspace)=>void;onClose:()=>void;startWithBullet?:boolean}) {
 const card=doc.tables.cards.find(card=>card.id===id)!, idx=index(doc.tables.bullets), definition=mcqDefinition(doc,id,idx);
 const source=flashcardSources(doc.tables.bullets,doc.tables.decks.filter(deck=>doc.web.deckTypes?.[deck.rootId]!=='MCQ'),doc.tables.media).find(source=>source.id===id);
 const initial=idx.byId.get(id) as Node|undefined;
 const rows=definition ? definition.options.map((node:Node)=>({node,depth:0})) : source?.answerRows || [];
 const [originals]=useState(()=>new Map<string,Node>([...(initial?[[id,initial] as [string,Node]]:[]),...rows.map(({node}:any)=>[node.id,node] as [string,Node])]));
 const [draft,setDraft]=useState(()=>new Map(originals)), [active,setActive]=useState(id), [editor,setEditor]=useState<Editor|null>(null), [error,setError]=useState('');
 const [independent,setIndependent]=useState({question:card.question,answer:card.answer});
 const [correct,setCorrect]=useState(definition?.config.correctOptionId||''),[explanation,setExplanation]=useState(definition?.config.explanation||''),[shuffle,setShuffle]=useState(definition?.config.shuffle!==false);
 const [added,setAdded]=useState<string[]>([]);
 useEffect(()=>{if(startWithBullet && initial && !definition){const newId=crypto.randomUUID();setDraft(old=>new Map(old).set(newId,bullet(newId,{parentId:id,position:(idx.children.get(id)||[]).length})));setAdded([newId]);setActive(newId);}},[]);
 const update=(node:Node)=>setDraft(old=>new Map(old).set(node.id,node));
 const save=()=>{
  try {
   let next=doc;
   if(initial){
    for(const [nodeId,original] of originals) if(JSON.stringify(idx.byId.get(nodeId))!==JSON.stringify(original)) throw Error('This card changed while editing. Close and reopen the editor to use the latest copy.');
    const question=draft.get(id)!;
    if(!question.text.trim()&&!doc.tables.media.some(media=>media.bulletId===id))throw Error('Add question text or an image.');
    let nodes=doc.tables.bullets.map(node=>draft.get(node.id)||node) as Node[];
    for(const addedId of added)nodes.push(draft.get(addedId)!);
    if(definition && correct!==definition.config.correctOptionId && definition.options.some((node:Node)=>/\B@Answer\b/i.test(node.text))){
     nodes=nodes.map(node=>definition.options.some((option:Node)=>option.id===node.id)?{...mcqStudyOption(node),text:mcqStudyOption(node).text+(node.id===correct?' @Answer':'')}:node);
    }
    next=withNodes(doc,nodes);
    if(definition){
     const configured=configureMcq(next,id,{correctOptionId:correct,explanation,shuffle});
     next=withNodes(configured,configured.tables.bullets as Node[]);
     // MCQ answer changes invalidate feedback but leave the current queue and schedule intact.
     next={...next,tables:{...next.tables,study_sessions:next.tables.study_sessions.map(session=>{try{return JSON.parse(session.queueJson)[session.cursor]===id?{...session,revealed:0}:session;}catch{return session;}})}};
    }
   }else{
    if(!independent.question.trim()||!independent.answer.trim())throw Error('Add a question and answer.');
    next={...doc,tables:{...doc.tables,cards:doc.tables.cards.map(item=>item.id===id?{...item,...independent}:item)}};
   }
   onSave(next);onClose();
  }catch(error){setError(error instanceof Error?error.message:String(error));}
 };
 const field=(node:Node,label:string)=><div className="study-edit-field" key={node.id} data-node-id={node.id}><span className="field-label">{label}</span>{active===node.id?<RichField node={node} label={label} onChange={update} onReady={setEditor}/>:<button type="button" className="study-edit-preview" onClick={()=>setActive(node.id)}><RichRead node={node}/>{!node.text&&<span>Click to edit</span>}</button>}{unsupportedFormatting(node)&&<small>Unsupported formatting is preserved. Edit this field in Notes.</small>}</div>;
 return <section className="study-card-editor study-inline-editor" aria-labelledby="study-card-editor-title" onKeyDown={event=>{event.stopPropagation();if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();if(!disabled)save();}}}>
  <div className="dialog-head"><h2 id="study-card-editor-title">Editing {definition?'MCQ':'flashcard'}</h2><button className="icon-button" aria-label="Close study editor" onClick={onClose}><Icon name="close"/></button></div>
  <p className="dialog-muted">Changes update your notes and this card. Your study position and review schedule stay in place.</p>
  {initial?field(draft.get(id)!,'Question'):<label className="field-label">Question<textarea aria-label="Question" value={independent.question} onChange={event=>setIndependent({...independent,question:event.target.value})}/></label>}
  {initial?<div className="study-edit-answers">{[...rows.map(({node,depth}:any)=>({id:node.id,depth})),...added.map(id=>({id,depth:0}))].map(({id:nodeId,depth}:any,i:number)=><div key={nodeId} style={{marginLeft:Math.min(depth,6)*14}}>{definition&&<label className="study-edit-correct"><input type="radio" name="study-edit-correct" aria-label={`Correct option ${i+1}`} checked={correct===nodeId} onChange={()=>setCorrect(nodeId)}/>Correct answer</label>}{field(draft.get(nodeId)!,definition?`Option ${i+1}`:`Answer ${i+1}`)}</div>)}</div>:<label className="field-label">Answer<textarea aria-label="Answer" value={independent.answer} onChange={event=>setIndependent({...independent,answer:event.target.value})}/></label>}
  {initial&&!definition&&<button type="button" className="study-text-button" onClick={()=>{const newId=crypto.randomUUID();update(bullet(newId,{parentId:id,position:(idx.children.get(id)||[]).length+added.length}));setAdded([...added,newId]);setActive(newId);}}>+ Add answer bullet</button>}
  {definition&&<><label className="field-label">Explanation<textarea maxLength={10000} aria-label="MCQ explanation" value={explanation} onChange={event=>setExplanation(event.target.value)}/></label><label className="study-edit-correct"><input type="checkbox" checked={shuffle} onChange={event=>setShuffle(event.target.checked)}/>Shuffle options during study</label></>}
  {editor&&<SelectionFormatting editor={editor} disabled={disabled}/>}
  {error&&<p role="alert">{error}</p>}
  <div className="study-edit-footer"><button onClick={onClose}>Cancel</button><button className="study-primary" disabled={disabled} onClick={save}>Save changes</button></div>
 </section>;
}
