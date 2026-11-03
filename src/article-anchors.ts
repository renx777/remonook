export function articleRange(root:HTMLElement,start:number,end:number){
 const range=document.createRange(),walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let position=0,node:Node|null,started=false;
 while(node=walker.nextNode()){const length=node.textContent?.length||0,next=position+length;if(!started&&start>=position&&start<next){range.setStart(node,start-position);started=true;}if(started&&end<=next){range.setEnd(node,end-position);return range;}position=next;}
 return null;
}
export function resolveQuote(text:string,anchor:{start:number;end:number;exact:string;prefix?:string;suffix?:string}){
 if(!anchor.exact)return null;
 if(text.slice(anchor.start,anchor.end)===anchor.exact)return {start:anchor.start,end:anchor.end};
 const matches=[];let at=-1;
 while((at=text.indexOf(anchor.exact,at+1))!==-1){if(anchor.prefix&&!text.slice(0,at).endsWith(anchor.prefix)||anchor.suffix&&!text.slice(at+anchor.exact.length).startsWith(anchor.suffix))continue;matches.push({start:at,end:at+anchor.exact.length});if(matches.length>1)return null;}
 return matches[0]||null;
}
