// Photo to notes or flashcards: shared by the Worker (prompt, validation) and the app (insertion).
// Gemma 4 on Workers AI reads the image; the person reviews and edits the result before it is added.
import {bullet} from './domain.mjs';
import {structureRows} from './ai-contract.mjs';

export const PHOTO_MODES=['notes','cards'];
export const PHOTO_LIMITS={bytes:4*1024*1024,cards:30,outline:16000};
const RULES='Use only what is visible in the image; do not add outside facts. Keep formulas, numbers and units exactly. If the image has no readable study content, return {"empty":true}.';
export function photoPrompt(mode){
 if(!PHOTO_MODES.includes(mode))throw Error('Choose notes or flashcards.');
 return mode==='notes'
  ?'Read this photo of study material (a textbook page, slide, handwritten notes or a diagram). Return only JSON {"title":"short title","outline":"the content as an indented outline, two spaces per level, one idea per line, headings as parent lines"}. '+RULES
  :'Read this photo of study material (a textbook page, slide, handwritten notes or a diagram). Return only JSON {"title":"short title","cards":[{"question":"...","answer":"..."}]} with 3 to 15 flashcards testing the most important facts, one fact per card, answers short. '+RULES;
}
const unfence=t=>String(t||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'').trim();
/** Parses and checks the model's reply; throws a readable error when it is unusable. */
export function validatePhotoResult(mode,reply){
 let v=reply;if(typeof v==='string'){try{v=JSON.parse(unfence(v));}catch{throw Error('The photo could not be read. Try a sharper, well-lit photo.');}}
 if(!v||typeof v!=='object')throw Error('The photo could not be read. Try a sharper, well-lit photo.');
 if(v.empty===true)throw Error('No study content was found in this photo.');
 const title=typeof v.title==='string'&&v.title.trim()?v.title.replace(/\s+/g,' ').trim().slice(0,100):'From photo';
 if(mode==='notes'){const outline=typeof v.outline==='string'?v.outline.replace(/\r/g,'').slice(0,PHOTO_LIMITS.outline):'';if(!structureRows(outline).length)throw Error('No notes could be read from this photo.');return {title,outline};}
 const cards=(Array.isArray(v.cards)?v.cards:[]).map(c=>({question:typeof c?.question==='string'?c.question.trim().slice(0,1000):'',answer:typeof c?.answer==='string'?c.answer.trim().slice(0,2000):''})).filter(c=>c.question&&c.answer).slice(0,PHOTO_LIMITS.cards);
 if(!cards.length)throw Error('No flashcards could be made from this photo.');
 return {title,cards};
}
/** Adds the reviewed result under `target` as one change: notes as nested bullets, cards as a new
 *  flashcard deck (a titled bullet with question and answer children). Returns the new document. */
export function insertPhotoResult(doc,target,result,insertion){
 const parent=doc.tables.bullets.find(n=>n.id===target);if(!parent)throw Error('This destination no longer exists.');
 if(doc.tables.bullets.some(n=>n.id===insertion))return doc;
 const position=Math.max(-1,...doc.tables.bullets.filter(n=>n.parentId===target).map(n=>n.position))+1;
 const title=String(result.title||'From photo').trim().slice(0,100)||'From photo';
 let nodes=doc.tables.bullets.map(n=>n.id===target?{...n,collapsed:false}:n);
 nodes.push(bullet(insertion,{text:title,parentId:target,position}));
 if(result.cards){
  const cards=result.cards.filter(c=>c.question?.trim()&&c.answer?.trim());if(!cards.length)throw Error('Choose at least one flashcard.');
  cards.forEach((c,i)=>{const id=insertion+'-q'+i;nodes.push(bullet(id,{text:c.question.trim(),kind:'QUESTION',parentId:insertion,position:i}),bullet(id+'-a',{text:c.answer.trim(),kind:'ANSWER',parentId:id,position:0}));});
  return {...doc,tables:{...doc.tables,bullets:nodes,decks:[...doc.tables.decks,{rootId:insertion,createdAt:Date.now(),pinned:0,layout:'FLAT'}]},web:{...doc.web,deckTypes:{...doc.web.deckTypes,[insertion]:'QA'}}};
 }
 const rows=structureRows(result.outline||'');if(!rows.length)throw Error('Add at least one line to insert.');if(rows.length>300)throw Error('Insert up to 300 lines at a time.');
 const parents=[insertion],counts=new Map();
 rows.forEach((row,i)=>{const id=insertion+'-'+i,parentId=parents[row.depth]||insertion,at=counts.get(parentId)||0;counts.set(parentId,at+1);parents[row.depth+1]=id;parents.length=row.depth+2;nodes.push(bullet(id,{text:row.text,parentId,position:at}));});
 return {...doc,tables:{...doc.tables,bullets:nodes}};
}
