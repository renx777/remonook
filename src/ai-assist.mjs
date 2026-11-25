import {bullet,index} from './domain.mjs';
import {sourceId} from './relations.mjs';
import {configureMcq} from './mcq.mjs';
import {captureReadingHighlight,readingBook} from './reading.mjs';
import {validateAiResult,byteLength,AI_STRUCTURE_OPERATIONS,structureRows,mermaidSource} from './ai-contract.mjs';
export function aiContext(nodes,id,selected=[]){
 const idx=index(nodes),root=sourceId(nodes,id),ids=new Set((selected.length>1?selected:[root]).map(id=>sourceId(nodes,id))),seen=new Set(),parts=[];
 const visit=(id,depth)=>{if(seen.has(id))return;seen.add(id);const n=idx.byId.get(id);if(!n)return;parts.push('  '.repeat(Math.min(depth,12))+n.text);if(selected.length<=1)for(const child of idx.children.get(id)||[])visit(child.id,depth+1);};
 for(const id of ids)visit(id,0);const context=parts.join('\n');if(byteLength(context)>6000)throw Error('Select fewer notes. AI assist accepts up to 6 KB of context.');return {id:root,context,sourceIds:[...seen]};
}
export const aiSourceCurrent=(doc,ai)=>ai.reader?!!readingBook(doc,ai.reader.hash):ai.sourceIds.every(id=>doc.tables.bullets.some(n=>n.id===id));
export const aiSourceChanged=(doc,ai)=>{if(ai.reader)return false;try{return aiContext(doc.tables.bullets,ai.sourceIds[0],ai.selectionIds||[]).context!==ai.context;}catch{return true;}};
export function insertAi(doc,draft){
 const ai=draft.ai;if(!ai?.complete)throw Error('Finish generating a preview first.');
 const insertion=draft.insertedId;if(!insertion)throw Error('Missing insertion identity.');if(doc.tables.bullets.some(n=>n.id===insertion))return doc;
 if(!aiSourceCurrent(doc,ai))throw Error('The source is no longer available. Your draft is kept for copying.');
 let target=draft.id,next=doc;
 if(ai.reader){const book=readingBook(doc,ai.reader.hash),existing=doc.web.readingHighlights?.['annotation-'+ai.reader.fingerprint],captured=captureReadingHighlight(doc,book,ai.reader.selection,ai.reader.fingerprint,{color:existing?.color||'yellow'});next=captured.doc;target=captured.bulletId;}
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
 }else if(AI_STRUCTURE_OPERATIONS.includes(ai.operation)){
  // The first new bullet carries the insertion identity, so retries and the saved-check work as for answers.
  if(ai.operation==='diagram'){const code=mermaidSource(draft.answer);if(!code)throw Error('Enter a valid Mermaid diagram (for example, starting with flowchart TD).');nodes.push(bullet(insertion,{text:'```mermaid\n'+code+'\n```',parentId:target,position}));}
  else{const rows=structureRows(draft.answer);if(!rows.length)throw Error('Add at least one line to insert.');if(rows.length>200)throw Error('Insert up to 200 lines at a time.');
   const parents=[target],counts=new Map();
   rows.forEach((row,i)=>{const id=i?insertion+'-'+i:insertion,parentId=parents[row.depth]||target,at=parentId===target?position+(counts.get(target)||0):counts.get(parentId)||0;counts.set(parentId,(counts.get(parentId)||0)+1);parents[row.depth+1]=id;parents.length=row.depth+2;nodes.push(bullet(id,{text:row.text,parentId,position:at}));});
   if(ai.operation==='mindmap')nodes=nodes.map(n=>n.id===target?{...n,mindmap:true}:n);}
  next={...next,tables:{...next.tables,bullets:nodes}};
 }else{if(!draft.answer.trim()||draft.answer.length>16000)throw Error('Enter an answer up to 16,000 characters.');nodes.push(bullet(insertion,{text:draft.answer,parentId:target,position,kind:ai.operation==='answer'?'ANSWER':'NOTE'}));next={...next,tables:{...next.tables,bullets:nodes}};}
 return next;
}

export function aiBulletTargets(nodes, ids, mode){
 const byId=index(nodes).byId;
 const chosen=new Set(ids);
 const roots=ids.filter(id=>mode==='image'||!chosen.has(byId.get(id)?.parentId));
 return [...new Set(roots.map(id=>sourceId(nodes,id)))].flatMap(id=>{
  const node=byId.get(id);
  if(!node||node.blockStyle==='divider'||mode==='answers'&&!node.text.trim())return [];
  return [{id,question:node.text}];
 });
}

export function insertBulkAnswers(doc, answers) {
 const sources=index(doc.tables.bullets).byId;
 for(const entry of answers){
  if(sources.has(entry.insertion))continue;
  if(sources.get(entry.id)?.text!==entry.question)throw Error('A question changed. Review the remaining answers before adding.');
 }
 return answers.reduce((next,{id,insertion,answer})=>insertAi(next,{
  id,insertedId:insertion,answer,ai:{operation:'answer',complete:true,sourceIds:[id]},
 }),doc);
}
