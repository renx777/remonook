export function articleRange(root:HTMLElement,start:number,end:number){
 const range=document.createRange(),walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let position=0,node:Node|null,started=false;
 while(node=walker.nextNode()){const length=node.textContent?.length||0,next=position+length;if(!started&&start>=position&&start<next){range.setStart(node,start-position);started=true;}if(started&&end<=next){range.setEnd(node,end-position);return range;}position=next;}
 return null;
}
