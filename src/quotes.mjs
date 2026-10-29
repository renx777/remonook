import library from './quote-library.json' with {type:'json'};
import {marks} from './domain.mjs';
import {displayText,noteLinks} from './relations.mjs';

/** @typedef {{id:string,text:string,author:string,source:string,work:string,url:string,nodeId?:string}} Quote */
/** @type {Quote[]} */
export const quoteLibrary=library.map(quote=>({...quote,id:'library:'+quote.id,source:'library'}));
// Match the editor's standalone tag boundaries; linked labels and code are not tags.
export function noteQuotes(nodes){
 /** @type {Quote[]} */
 const result=[];
 for(const node of nodes){
  if(node.mirrorSourceId||node.codeLanguage||!node.text.toLowerCase().includes('#quote'))continue;
  const ignored=[...noteLinks(node.text),...marks(node.formatting||'',node.text.length).filter(mark=>mark.style==='CODE')];
  const tags=[...node.text.matchAll(/(?:^|(?<=\s))#quote(?![\p{L}\p{N}_-])/giu)].filter(tag=>!ignored.some(range=>tag.index>=range.start&&tag.index<range.end));
  if(!tags.length)continue;
  let text=node.text;
  for(const tag of tags.reverse())text=text.slice(0,tag.index)+text.slice(tag.index+tag[0].length);
  text=displayText(text).split('\n').map(line=>line.trim()).join('\n').trim();
  let author='';const attribution=/(?:^|\n)[—–]\s+([^\n]{1,100})$/.exec(text);
  if(attribution){author=attribution[1].trim();text=text.slice(0,attribution.index).trim();}
  if(text)result.push({id:'note:'+node.id,nodeId:node.id,text,author,source:'notes',work:'',url:''});
 }
 return result;
}
/** @param {Quote[]} notes */
export function quotePool(notes,source='all'){
 return source==='notes'?notes:source==='library'?quoteLibrary:[...quoteLibrary,...notes];
}
// Exclude the current quote when possible. Inject randomness for deterministic checks.
/** @param {Quote[]} pool @param {string|undefined} [currentId] */
export function chooseQuote(pool,currentId,random=Math.random){
 const choices=pool.filter(quote=>quote.id!==currentId);
 if(!choices.length)return pool[0]||null;
 return choices[Math.min(choices.length-1,Math.max(0,Math.floor(random()*choices.length)))];
}
