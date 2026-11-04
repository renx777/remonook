import {bullet,index} from './domain.mjs';
import {sourceId} from './relations.mjs';
import {configureMcq} from './mcq.mjs';
import {captureReadingHighlight,readingBook} from './reading.mjs';
import {validateAiResult,byteLength} from './ai-contract.mjs';
export function aiContext(nodes,id,selected=[]){
 const idx=index(nodes),root=sourceId(nodes,id),ids=new Set((selected.length>1?selected:[root]).map(id=>sourceId(nodes,id))),seen=new Set(),parts=[];
 const visit=(id,depth)=>{if(seen.has(id))return;seen.add(id);const n=idx.byId.get(id);if(!n)return;parts.push('  '.repeat(Math.min(depth,12))+n.text);if(selected.length<=1)for(const child of idx.children.get(id)||[])visit(child.id,depth+1);};
 for(const id of ids)visit(id,0);const context=parts.join('\n');if(byteLength(context)>6000)throw Error('Select fewer notes. AI assist accepts up to 6 KB of context.');return {id:root,context,sourceIds:[...seen]};
}
export const aiSourceCurrent=(doc,ai)=>ai.reader?!!readingBook(doc,ai.reader.hash):ai.sourceIds.every(id=>doc.tables.bullets.some(n=>n.id===id));
export const aiSourceChanged=(doc,ai)=>!ai.reader&&ai.sourceIds.some((id,i)=>doc.tables.bullets.find(n=>n.id===id)?.text!==ai.sourceTexts[i]);
export function insertAi(doc,draft){
 const ai=draft.ai;if(!ai?.complete)throw Error('Finish generating a preview first.');
 const insertion=draft.insertedId;if(!insertion)throw Error('Missing insertion identity.');if(doc.tables.bullets.some(n=>n.id===insertion))return doc;
 if(!aiSourceCurrent(doc,ai))throw Error('The source is no longer available. Your draft is kept for copying.');
 let target=draft.id,next=doc;
 if(ai.reader){const book=readingBook(doc,ai.reader.hash),captured=captureReadingHighlight(doc,book,ai.reader.selection,ai.reader.fingerprint,{color:'yellow'});next=captured.doc;target=captured.bulletId;}
 const parent=next.tables.bullets.find(n=>n.id===target);if(!parent)throw Error('This destination no longer exists.');
 const position=Math.max(-1,...next.tables.bullets.filter(n=>n.parentId===target).map(n=>n.position))+1;
 let nodes=next.tables.bullets.map(n=>n.id===target?{...n,collapsed:false}:n);
 if(['flashcards','mcqs'].includes(ai.operation)){
  const result=validateAiResult(ai.operation,{candidates:ai.candidates}),chosen=result.candidates.filter((_,i)=>ai.selected?.includes(i));if(!chosen.length)throw Error('Choose at least one study card.');
  const title=ai.title?.trim();if(!title||title.length>100)throw Error('Name the study set (up to 100 characters).');
  nodes.push(bullet(insertion,{text:title,parentId:target,position}));
  for(let i=0;i<chosen.length;i++){const c=chosen[i],id=insertion+'-q'+i;nodes.push(bullet(id,{text:c.question,kind:'QUESTION',parentId:insertion,position:i}));
   if(ai.operation==='flashcards')nodes.push(bullet(id+'-a',{text:c.answer,kind:'ANSWER',parentId:id,position:0}));else c.options.forEach((text,j)=>nodes.push(bullet(id+'-o'+j,{text,parentId:id,position:j})));}
  next={...next,tables:{...next.tables,bullets:nodes,decks:[...next.tables.decks,{rootId:insertion,createdAt:Date.now(),pinned:0,layout:'FLAT'}]},web:{...next.web,deckTypes:{...next.web.deckTypes,[insertion]:ai.operation==='mcqs'?'MCQ':'QA'}}};
  if(ai.operation==='mcqs')chosen.forEach((c,i)=>{const id=insertion+'-q'+i;next=configureMcq(next,id,{correctOptionId:id+'-o'+c.correct,explanation:c.explanation});});
 }else{if(!draft.answer.trim()||draft.answer.length>16000)throw Error('Enter an answer up to 16,000 characters.');nodes.push(bullet(insertion,{text:draft.answer,parentId:target,position,kind:ai.operation==='answer'?'ANSWER':'NOTE'}));next={...next,tables:{...next.tables,bullets:nodes}};}
 return next;
}
