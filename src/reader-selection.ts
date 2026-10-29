export function selectedPassage(root:HTMLElement,unit:number,geometry?:HTMLElement){
 const selection=window.getSelection();if(!selection||selection.isCollapsed||selection.rangeCount!==1)return null;
 const range=selection.getRangeAt(0);if(!root.contains(range.startContainer)||!root.contains(range.endContainer))return null;
 const before=range.cloneRange();before.selectNodeContents(root);before.setEnd(range.startContainer,range.startOffset);const start=before.toString().length,quote=selection.toString(),length=range.toString().length;
 if(!quote.trim()||quote.length>8000)return null;
 const rects:{x:number;y:number;w:number;h:number}[]=[];
 if(geometry){const bounds=geometry.getBoundingClientRect();for(const r of [...range.getClientRects()]){const x=Math.max(bounds.left,r.left),y=Math.max(bounds.top,r.top),right=Math.min(bounds.right,r.right),bottom=Math.min(bounds.bottom,r.bottom);if(right>x&&bottom>y&&bounds.width&&bounds.height)rects.push({x:(x-bounds.left)/bounds.width,y:(y-bounds.top)/bounds.height,w:(right-x)/bounds.width,h:(bottom-y)/bounds.height});}}
 // A PDF selection without visible geometry cannot produce a usable highlight.
 if(geometry&&!rects.length)return null;
 const merged:typeof rects=[];for(const r of rects.sort((a,b)=>a.y-b.y||a.x-b.x)){const last=merged.at(-1);if(last&&Math.abs(last.y-r.y)<.002&&Math.abs(last.h-r.h)<.002&&r.x<=last.x+last.w+.003)last.w=Math.max(last.x+last.w,r.x+r.w)-last.x;else merged.push({...r});}
 return {unit,start,end:start+length,quote,rects:merged.slice(0,500).map(r=>Object.fromEntries(Object.entries(r).map(([key,value])=>[key,Math.round(value*10000)/10000])))};
}
export function textSegments(text:string,annotations:any[]){const bounds=new Set<number>([0,text.length]);for(const a of annotations){bounds.add(Math.min(text.length,a.start));bounds.add(Math.min(text.length,a.end));}const positions=[...bounds].sort((a,b)=>a-b);return positions.slice(0,-1).map((start,i)=>({start,text:text.slice(start,positions[i+1]),annotation:annotations.find(a=>a.start<=start&&a.end>=positions[i+1])}));}
