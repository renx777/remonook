import {marks,encode,bullet} from './domain.mjs';
export const drawingFile=item=>/\.excalidraw\.png$/i.test(item?.credit||'');
export function replaceVisualRange(node,start,end,text){
 const delta=text.length-(end-start);
 return {...node,text:node.text.slice(0,start)+text+node.text.slice(end),formatting:encode(marks(node.formatting,node.text.length).flatMap(span=>{if(start<end&&span.start<=start&&span.end>=end)return [{...span,end:span.end+delta}];const result=[];if(span.start<start)result.push({...span,end:Math.min(start,span.end)});if(span.end>end)result.push({...span,start:Math.max(end,span.start)+delta,end:span.end+delta});return result;}))};
}
/** Preserve concurrent source edits as an additional diagram instead of overwriting. */
export function saveDiagram(nodes,target,source,uuid=()=>crypto.randomUUID()){
 if(!source.trim()||source.length>50000||source.includes('```'))throw Error('Use diagram source without Markdown fences, up to 50,000 characters.');
 const node=nodes.find(n=>n.id===target.id);if(!node)throw Error('This note is no longer available. Copy your diagram source to keep it.');
 const fence='```mermaid\n'+source.trim()+'\n```';
 let start=node.text.length,end=start,text=(node.text?'\n':'')+fence;
 if(target.original){
  const exact=node.text===target.base&&Number.isInteger(target.start)&&node.text.slice(target.start,target.start+target.original.length)===target.original;
  const index=exact?target.start:node.text.indexOf(target.original);
  if(index<0||(!exact&&node.text.indexOf(target.original,index+1)>=0)){return [...nodes,bullet(uuid(),{parentId:node.id,position:nodes.filter(n=>n.parentId===node.id).length,text:fence})];}
  start=index;end=start+target.original.length;text=fence;
 }
 return nodes.map(n=>n.id===node.id?{...replaceVisualRange(n,start,end,text),codeLanguage:'',blockStyle:n.blockStyle==='divider'?'paragraph':n.blockStyle}:n);
}

export function diagramLabels(source){
 const fields=[];
 for(const match of source.matchAll(/\b([A-Za-z_][\w-]*)\s*(\[\[?|\(\(?|\{)\s*("[^"\n]*"|[^\]\)\}\n]+?)\s*(\]\]?|\)\)?|\})/g)){
  const raw=match[3],start=match.index+match[0].indexOf(raw,match[1].length+match[2].length);
  fields.push({id:match[1]+'-'+fields.length,start,end:start+raw.length,value:raw.replace(/^"|"$/g,'').replaceAll('&quot;','"'),quoted:true});
 }
 if(!fields.length&&/^\s*(sequenceDiagram|timeline)/.test(source))for(const match of source.matchAll(/:\s*([^\n]+)/g)){const start=match.index+match[0].indexOf(match[1]);fields.push({id:'message-'+fields.length,start,end:start+match[1].length,value:match[1],quoted:false});}
 return fields.slice(0,24);
}
export function changeDiagramLabel(source,field,value){const plain=value.replace(/\r?\n/g,' '),text=field.quoted?'"'+plain.replaceAll('"','&quot;')+'"':plain;return source.slice(0,field.start)+text+source.slice(field.end);}
