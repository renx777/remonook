export function searchRectangles(root:HTMLElement,geometry:HTMLElement,start:number,end:number){
 if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<=start)return [];
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),range=document.createRange();let offset=0,began=false,finished=false;let node:Node|null;
 while((node=walker.nextNode())){const length=node.textContent?.length||0;if(!began&&start<offset+length){range.setStart(node,start-offset);began=true;}if(began&&end<=offset+length){range.setEnd(node,end-offset);finished=true;break;}offset+=length;}
 if(!began||!finished)return [];const bounds=geometry.getBoundingClientRect();if(!bounds.width||!bounds.height)return [];
 return [...range.getClientRects()].filter(rect=>rect.width>0&&rect.height>0).map(rect=>({x:(rect.left-bounds.left)/bounds.width,y:(rect.top-bounds.top)/bounds.height,w:rect.width/bounds.width,h:rect.height/bounds.height}));
}
