import {hierarchy,tree} from 'd3-hierarchy';
import {displayText} from './relations.mjs';
import {mindmapStyle} from './mindmap-style.mjs';

/** Bounded, deterministic snapshot. No canvas, browser capture, or saved images. */
export function mindmapPreview(root,idx,styles={}){
 const limit=25,depthLimit=3,seen=new Set(),items=[{node:root,depth:0,children:[]}];
 seen.add(root.id);
 for(let i=0;i<items.length;i++){
  const item=items[i];
  // Always reveal the main branches, even when the note is folded in Notes.
  if(item.depth>=depthLimit||item.depth>0&&item.node.collapsed)continue;
  for(const child of idx.children.get(item.node.id)||[]){
   if(items.length>=limit)break;
   if(seen.has(child.id))continue;
   seen.add(child.id);const next={node:child,depth:item.depth+1,children:[]};item.children.push(next);items.push(next);
  }
 }
 const layout=tree().nodeSize([52,204])(hierarchy(items[0],d=>d.children)),points=layout.descendants();
 const minY=Math.min(...points.map(p=>p.x)),maxY=Math.max(...points.map(p=>p.x));
 const nodes=points.map(p=>({id:p.data.node.id,text:displayText(p.data.node.text)||'Untitled',x:p.y+18,y:p.x-minY+18,width:170,height:34,root:p.depth===0,style:mindmapStyle(styles[p.data.node.id])}));
 const byId=new Map(nodes.map(n=>[n.id,n]));
 const links=layout.links().flatMap(l=>{const source=byId.get(l.source.data.node.id),target=byId.get(l.target.data.node.id);return source&&target?[{source,target}]:[];});
 const truncated=items.some(i=>(i.depth>=depthLimit||items.length>=limit)&&!i.node.collapsed&&(idx.children.get(i.node.id)||[]).some(n=>!seen.has(n.id)));
 return {nodes,links,width:Math.max(...nodes.map(n=>n.x+n.width))+18,height:maxY-minY+70,truncated};
}
