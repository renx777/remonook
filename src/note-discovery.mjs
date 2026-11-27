import {snapshotIndex} from './outline-snapshot.mjs';
import {noteTraits,traitBulletIds} from './traits-block.mjs';
import {noteLinks,sourceId,displayText} from './relations.mjs';
import {marks,encode} from './domain.mjs';
import {withNodes} from './workspace-nodes.mjs';
const aliasCache=new WeakMap();
export function aliasesFor(nodes,id){const doc={tables:{bullets:nodes}},idx=snapshotIndex(nodes);return [...new Set(noteTraits(doc,id,idx).filter(t=>/^(?:alias|aliases)$/iu.test(t.key)).flatMap(t=>t.value.split(/[,\n]/u)).map(t=>t.trim()).filter(Boolean))];}
export function aliasIndex(nodes){
 let result=aliasCache.get(nodes);if(result)return result;result=new Map();
 for(const n of nodes){if(n.mirrorSourceId)continue;const aliases=aliasesFor(nodes,n.id);if(aliases.length)result.set(n.id,[...new Set(aliases)]);}
 aliasCache.set(nodes,result);return result;
}
export function connectionResults(nodes,query,at){const aliases=aliasIndex(nodes),q=query.toLowerCase(),target=sourceId(nodes,at),hidden=traitBulletIds(nodes);return nodes.filter(n=>!n.mirrorSourceId&&n.id!==target&&!hidden.has(n.id)&&n.blockStyle!=='divider'&&n.text.trim()&&[n.text,...(aliases.get(n.id)||[])].some(t=>t.toLowerCase().includes(q))).sort((a,b)=>Number(b.text.toLowerCase().startsWith(q))-Number(a.text.toLowerCase().startsWith(q))||a.text.localeCompare(b.text)).slice(0,40);}
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const word=c=>!!c&&/[\p{L}\p{N}\p{M}_]/u.test(c);
export function mentionNames(nodes,id){const n=snapshotIndex(nodes).byId.get(sourceId(nodes,id));if(!n||/[\]\n|]/u.test(n.id))return [];return [...new Set([displayText(n.text).trim(),...aliasesFor(nodes,n.id)])].filter(t=>t.length>=2&&t.length<=200&&!/[\[\]\n\r|]/u.test(t)).sort((a,b)=>b.length-a.length);}
export function mentionsIn(node,names,target,hidden=new Set()){
 if(node.id===target||node.mirrorSourceId||node.codeLanguage||node.blockStyle==='divider'||hidden.has(node.id))return [];
 const text=node.text,ranges=[...noteLinks(text),...marks(node.formatting||'',text.length).filter(m=>m.style==='CODE'),...[...text.matchAll(/(?:https?:\/\/|www\.)\S+/giu)].map(m=>({start:m.index,end:m.index+m[0].length}))];const found=[];
 for(const name of names)for(const match of text.matchAll(new RegExp(escape(name),'giu'))){const start=match.index,end=start+match[0].length;
 const before=Array.from(text.slice(Math.max(0,start-2),start)).at(-1),after=Array.from(text.slice(end,end+2))[0];
 if(word(Array.from(match[0])[0])&&word(before)||word(Array.from(match[0]).at(-1))&&word(after)||ranges.some(r=>start<r.end&&end>r.start)||found.some(r=>start<r.end&&end>r.start))continue;
 found.push({id:node.id,start,end,label:match[0],text,formatting:node.formatting||'',target});if(found.length>=40)return found.sort((a,b)=>a.start-b.start);}
 return found.sort((a,b)=>a.start-b.start);
}
/** @param {any} nodes @param {string} id @param {{signal?:AbortSignal,limit?:number,yieldTask?:()=>Promise<any>}} options */
export async function unlinkedMentions(nodes,id,{signal=undefined,limit=40,yieldTask=()=>new Promise(r=>setTimeout(r,0))}={}){
 const target=sourceId(nodes,id),names=mentionNames(nodes,target),hidden=traitBulletIds(nodes),found=[];if(!names.length)return found;
 for(let i=0;i<nodes.length;i++){if(i%100===0){await yieldTask();if(signal?.aborted)throw new DOMException('Mention scan cancelled.','AbortError');}for(const hit of mentionsIn(nodes[i],names,target,hidden)){found.push(hit);if(found.length>=limit)return found;}}
 return found;
}
export function linkMention(doc,hit){
 const nodes=doc.tables.bullets,idx=snapshotIndex(nodes),n=idx.byId.get(hit.id),target=idx.byId.get(hit.target);
 if(!n||!target||target.mirrorSourceId||n.text!==hit.text||(n.formatting||'')!==hit.formatting||!mentionsIn(n,mentionNames(nodes,hit.target),hit.target,traitBulletIds(nodes)).some(m=>m.start===hit.start&&m.end===hit.end&&m.label===hit.label))throw Error('This passage changed. Review its current mention before linking.');
 const text=`[[${hit.label}|${hit.target}]]`,delta=text.length-(hit.end-hit.start);
 const shift=(p,end=false)=>p<=hit.start?p:p>=hit.end?p+delta:hit.start+(end?text.length:0);
 const formatting=encode(marks(n.formatting||'',n.text.length).map(m=>({...m,start:shift(m.start),end:shift(m.end,true)})).filter(m=>m.end>m.start));
 return withNodes(doc,nodes.map(x=>x.id===hit.id?{...x,text:n.text.slice(0,hit.start)+text+n.text.slice(hit.end),formatting}:x));
}
