import {bullet} from './domain.mjs';
const colors=['yellow','green','blue','rose'];
export const HIGHLIGHT_COLORS=colors;
export const booksIn=doc=>Object.values(doc.web.readingBooks||{}).filter(b=>!b.deleted);
export const readingBook=(doc,hash)=>booksIn(doc).find(b=>b.hash===hash);
export function readingPosition(doc,book){const progress=doc.web.readingProgress?.[book.hash];let unit=progress?.base??book.position??0;while(progress?.units?.[unit]&&unit<10000)unit++;return unit;}
export const readingDoneToday=(doc,hash,day)=>Object.values(doc.web.readingProgress?.[hash]?.units||{}).includes(day);
export function markReading(doc,hash,unit,day){
 const book=readingBook(doc,hash);if(!book||!Number.isInteger(unit)||unit<0||unit>=10000||!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('Invalid reading position.');
 const old=doc.web.readingProgress?.[hash]||{base:book.position||0,units:{}};if(old.units[unit])return doc;
 const progress={...old,units:{...old.units,[unit]:day}},next={...doc,web:{...doc.web,readingProgress:{...doc.web.readingProgress,[hash]:progress}}};
 return {...next,web:{...next.web,readingBooks:{...next.web.readingBooks,[book.id]:{...book,position:readingPosition(next,book)}}}};
}
const allNoteIds=doc=>new Set([...doc.tables.bullets.map(n=>n.id),...(doc.tables.trash||[]).flatMap(t=>(t.nodes||[]).map(n=>n.id))]);
const available=(base,used)=>{let id=base,i=0;while(used.has(id))id=base+'-'+(++i);return id;};
const position=(nodes,parentId)=>Math.max(-1,...nodes.filter(n=>n.parentId===parentId).map(n=>n.position))+1;
export function captureReadingHighlight(doc,book,selection,fingerprint,{color='yellow',comment=''}={}){
 if(!readingBook(doc,book.hash)||!colors.includes(color)||!/^[a-f0-9]{64}$/.test(fingerprint))throw Error('This book is unavailable.');
 const {unit,start,end,quote,rects=[]}=selection;
 if(!Number.isInteger(unit)||unit<0||unit>=10000||!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<=start||end-start>8000||quote.length>8000||!quote.trim()||comment.length>4000||rects.length>500)throw Error('Select a shorter passage to highlight.');
 const id='annotation-'+fingerprint,existing=doc.web.readingHighlights?.[id];
 if(existing&&!existing.deleted&&doc.tables.bullets.some(n=>n.id===existing.bulletId)){
  let next=existing.color===color?doc:changeReadingHighlight(doc,id,{color});
  if(comment.trim())next={...next,tables:{...next.tables,bullets:[...next.tables.bullets,bullet('comment-'+crypto.randomUUID(),{parentId:existing.bulletId,position:position(next.tables.bullets,existing.bulletId),text:comment.trim()})]}};
  return {doc:next,id,bulletId:existing.bulletId};
 }
 if(Object.values(doc.web.readingHighlights||{}).filter(h=>!h.deleted&&h.bookHash===book.hash&&h.unit===unit).length>=200)throw Error('This page already has 200 highlights.');
 const nodes=[...doc.tables.bullets],used=allNoteIds(doc),priorRoot=doc.web.readingNoteRoots?.[book.hash];
 let rootId=priorRoot&&nodes.some(n=>n.id===priorRoot)?priorRoot:available('book-'+book.hash,used);
 if(!nodes.some(n=>n.id===rootId)){nodes.push(bullet(rootId,{text:book.title,parentId:null,position:position(nodes,null)}));used.add(rootId);}
 else{const at=nodes.findIndex(n=>n.id===rootId);nodes[at]={...nodes[at],collapsed:false};}
 const bulletId=available('quote-'+fingerprint,used);used.add(bulletId);
 nodes.push(bullet(bulletId,{parentId:rootId,position:position(nodes,rootId),text:quote.trim()}));
 if(comment.trim())nodes.push(bullet(available('comment-'+crypto.randomUUID(),used),{parentId:bulletId,position:0,text:comment.trim()}));
 const annotation={id,bookHash:book.hash,bookId:book.id,format:book.format,unit,start,end,quote,color,rects,bulletId,rootId,deleted:false};
 return {doc:{...doc,tables:{...doc.tables,bullets:nodes},web:{...doc.web,readingNoteRoots:{...doc.web.readingNoteRoots,[book.hash]:rootId},readingHighlights:{...doc.web.readingHighlights,[id]:annotation}}},id,bulletId};
}
export function changeReadingHighlight(doc,id,patch){const old=doc.web.readingHighlights?.[id];if(!old)return doc;return {...doc,web:{...doc.web,readingHighlights:{...doc.web.readingHighlights,[id]:{...old,...patch,id:old.id}}}};}
export const sourceLabel=(book,unit)=>book?.format==='pdf'?'Page '+(unit+1):'Passage '+(unit+1);
export function validateReading(web){
 const safeHash=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s),plain=o=>o&&typeof o==='object'&&!Array.isArray(o);
 if(web.readingProgress!==undefined){if(!plain(web.readingProgress)||Object.keys(web.readingProgress).length>1000)throw Error('Invalid reading progress.');for(const [hash,p]of Object.entries(web.readingProgress)){if(!safeHash(hash)||!plain(p)||!Number.isInteger(p.base)||p.base<0||p.base>10000||!plain(p.units)||Object.keys(p.units).length>10000)throw Error('Invalid reading progress.');for(const [unit,day]of Object.entries(p.units))if(!/^(0|[1-9]\d{0,3})$/.test(unit)||typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('Invalid reading day.');}}
 if(web.readingNoteRoots!==undefined){if(!plain(web.readingNoteRoots)||Object.keys(web.readingNoteRoots).length>1000)throw Error('Invalid book notes.');for(const [hash,id]of Object.entries(web.readingNoteRoots))if(!safeHash(hash)||typeof id!=='string'||id.length>200)throw Error('Invalid book notes.');}
 if(web.readingHighlights===undefined)return;
 if(!plain(web.readingHighlights)||Object.keys(web.readingHighlights).length>3000)throw Error('Too many reading highlights.');
 for(const [id,h]of Object.entries(web.readingHighlights)){
  if(!plain(h)||(h.format!==undefined&&!['pdf','epub'].includes(h.format))||h.id!==id||!/^annotation-[a-f0-9]{64}$/.test(id)||!safeHash(h.bookHash)||typeof h.bookId!=='string'||h.bookId.length>100||!Number.isInteger(h.unit)||h.unit<0||h.unit>=10000||!Number.isInteger(h.start)||!Number.isInteger(h.end)||h.start<0||h.end<=h.start||h.end-h.start>8000||typeof h.quote!=='string'||h.quote.length>8000||!colors.includes(h.color)||typeof h.deleted!=='boolean'||typeof h.bulletId!=='string'||h.bulletId.length>200||typeof h.rootId!=='string'||h.rootId.length>200||!Array.isArray(h.rects)||h.rects.length>500)throw Error('Invalid reading highlight.');
  for(const r of h.rects)if(!plain(r)||!['x','y','w','h'].every(k=>Number.isFinite(r[k])&&r[k]>=0&&r[k]<=1)||r.x+r.w>1.001||r.y+r.h>1.001)throw Error('Invalid highlight geometry.');
 }
}
