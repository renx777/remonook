import { index, descendants } from './domain.mjs';

import {folderColors,folderLogos,folderAppearance,safeFolderImage} from './folder-designs.mjs';
export {folderColors} from './folder-designs.mjs';
export function validateStudyLibrary(web) {
 if(web.studyFolders!==undefined&&(!Array.isArray(web.studyFolders)||web.studyFolders.length>10000||web.studyFolders.some(f=>!f||typeof f.id!=='string'||f.id.length>200||typeof f.name!=='string'||!f.name.trim()||f.name.length>80||!folderColors.some(c=>c.id===f.color))||new Set(web.studyFolders.map(f=>f.id)).size!==web.studyFolders.length))throw Error('Invalid study folders');
 if(web.studyFolders?.some(f=>(f.logo!==undefined&&!folderLogos.some(l=>l.id===f.logo))||(f.image!==undefined&&(typeof f.image!=='string'||f.image!==safeFolderImage(f.image)))||(f.imagePosition!==undefined&&!['top','center','bottom'].includes(f.imagePosition))))throw Error('Invalid folder appearance');
 if(web.deckFolders!==undefined&&(!web.deckFolders||typeof web.deckFolders!=='object'||Array.isArray(web.deckFolders)||Object.values(web.deckFolders).some(id=>typeof id!=='string')))throw Error('Invalid deck folder assignments');
 if(web.studyExcludedCards!==undefined&&(!Array.isArray(web.studyExcludedCards)||web.studyExcludedCards.some(id=>typeof id!=='string')))throw Error('Invalid removed study cards');
}
/** @returns {{id:string,name:string,color:string,logo:string,image:string,imagePosition:string}[]} */
export function studyFolders(doc) {
 const seen=new Set();
 return (Array.isArray(doc.web.studyFolders)?doc.web.studyFolders:[]).filter(f=>f&&typeof f.id==='string'&&typeof f.name==='string'&&f.name.trim()&&!seen.has(f.id)&&seen.add(f.id)).map(f=>({...f,name:f.name.slice(0,80),...folderAppearance(f)}));
}
export function deckFolder(doc,id) {
 const value=doc.web.deckFolders?.[id];
 return studyFolders(doc).some(f=>f.id===value)?value:null;
}
export function saveStudyFolder(doc,value,uuid=()=>crypto.randomUUID()) {
 let {id,name}=value;
 name=String(name||'').trim().slice(0,80);
 if(!name)throw Error('Give your folder a name.');
 const folders=studyFolders(doc),prior=folders.find(f=>f.id===id);
 if(id&&!prior)throw Error('This folder no longer exists.');
 const folder={id:prior?.id||uuid(),name,...folderAppearance({...prior,...value})};
 return {...doc,web:{...doc.web,studyFolders:prior?folders.map(f=>f.id===id?folder:f):[...folders,folder]}};
}
export function moveStudyDeck(doc,id,folderId) {
 if(!doc.tables.decks.some(d=>d.rootId===id))throw Error('This deck no longer exists.');
 if(folderId&&!studyFolders(doc).some(f=>f.id===folderId))throw Error('This folder no longer exists.');
 const deckFolders={...doc.web.deckFolders};
 if(folderId)deckFolders[id]=folderId;else delete deckFolders[id];
 return {...doc,web:{...doc.web,deckFolders}};
}
export function deleteStudyFolder(doc,id) {
 return {...doc,web:{...doc.web,studyFolders:studyFolders(doc).filter(f=>f.id!==id),deckFolders:Object.fromEntries(Object.entries(doc.web.deckFolders||{}).filter(([,value])=>value!==id))}};
}
export function deckDeletionPlan(doc,id) {
 if(!doc.tables.decks.some(d=>d.rootId===id))throw Error('This deck no longer exists.');
 const branch=new Set(descendants(doc.tables.bullets,id)),roots=new Set(doc.tables.decks.map(d=>d.rootId)),idx=index(doc.tables.bullets),owned=new Set(),stack=[id];
 while(stack.length){const at=stack.pop();if(at!==id&&roots.has(at))continue;owned.add(at);for(const child of idx.children.get(at)||[])stack.push(child.id);}
 const cards=doc.tables.cards.filter(c=>owned.has(c.id)&&c.state==='ACTIVE');
 return {branch:[...branch],cardIds:[...owned],cardCount:cards.length,noteCount:branch.size,nestedDecks:doc.tables.decks.filter(d=>d.rootId!==id&&branch.has(d.rootId)).length,type:doc.web.deckTypes?.[id]==='MCQ'?'MCQ':Object.entries(doc.web.occlusions||{}).some(([key])=>owned.has(key))?'image':'flashcard'};
}
/** Removing a deck keeps source notes byte-for-byte. Exclusions prevent regeneration on later edits. */
export function deleteStudyDeck(doc,id,deleteNotes=false,now=Date.now(),uuid=()=>crypto.randomUUID()) {
 const plan=deckDeletionPlan(doc,id),branch=new Set(plan.branch),affected=new Set(deleteNotes?doc.tables.cards.filter(c=>branch.has(c.id)).map(c=>c.id):plan.cardIds),removedDecks=new Set(deleteNotes?doc.tables.decks.filter(d=>branch.has(d.rootId)).map(d=>d.rootId):[id]);
 const deckFolders=Object.fromEntries(Object.entries(doc.web.deckFolders||{}).filter(([key])=>!removedDecks.has(key))),excluded=new Set(doc.web.studyExcludedCards||[]);
 if(!deleteNotes)for(const key of affected)excluded.add(key);
 const trash=deleteNotes?[...doc.tables.trash,{id:uuid(),title:doc.tables.bullets.find(n=>n.id===id)?.text||'Study deck',deletedAt:now,nodeCount:plan.noteCount,payload:JSON.stringify({nodes:doc.tables.bullets.filter(n=>branch.has(n.id)),media:doc.tables.media.filter(m=>branch.has(m.bulletId)),decks:doc.tables.decks.filter(d=>branch.has(d.rootId)),studyDeckFolders:Object.fromEntries(Object.entries(doc.web.deckFolders||{}).filter(([key])=>removedDecks.has(key)))})}]:doc.tables.trash;
 return {...doc,web:{...doc.web,deckFolders,pinnedDecks:(doc.web.pinnedDecks||[]).filter(key=>!removedDecks.has(key)),studyExcludedCards:[...excluded]},tables:{...doc.tables,
  bullets:deleteNotes?doc.tables.bullets.filter(n=>!branch.has(n.id)):doc.tables.bullets,
  media:deleteNotes?doc.tables.media.filter(m=>!branch.has(m.bulletId)):doc.tables.media,
  decks:doc.tables.decks.filter(d=>!removedDecks.has(d.rootId)),trash,
  cards:doc.tables.cards.map(c=>affected.has(c.id)?{...c,state:'INACTIVE'}:c),
  study_sessions:doc.tables.study_sessions.filter(s=>!removedDecks.has(s.scope)&&!JSON.parse(s.queueJson).some(key=>affected.has(key))),
 }};
}
export function enableStudyBranch(doc,id) {
 const ids=new Set(descendants(doc.tables.bullets,id));
 return {...doc,web:{...doc.web,studyExcludedCards:(doc.web.studyExcludedCards||[]).filter(key=>!ids.has(key))}};
}
