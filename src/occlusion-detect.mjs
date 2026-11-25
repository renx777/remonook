// Automatic image occlusion: turn text found in a diagram (local OCR word boxes, in pixels) into
// occlusion regions labelled with that text. Words on one line are split where the gap is wide, so
// labels sitting side by side become separate regions. Pure, so it can be tested without OCR.
const letters=/\p{L}|\p{N}/u;
/** @param {{text:string,confidence:number,bbox:{x0:number,y0:number,x1:number,y1:number}}[][]} lines words grouped by OCR line
 *  @param {number} width @param {number} height image size in the same pixels
 *  @param {{x:number,y:number,w:number,h:number}[]} existing regions already drawn (fractions), skipped when overlapped
 *  @returns {{id:string,label:string,x:number,y:number,w:number,h:number}[]} */
export function labelRegions(lines,width,height,existing=[],{minConfidence=55,limit=100,uuid=()=>crypto.randomUUID()}={}){
 if(!(width>0&&height>0))return [];
 const groups=[];
 for(const line of lines){
  const words=(line||[]).filter(w=>w&&w.bbox&&String(w.text||'').trim()&&letters.test(w.text)&&(w.confidence??100)>=minConfidence).sort((a,b)=>a.bbox.x0-b.bbox.x0);
  let group=null;
  for(const w of words){
   const h=w.bbox.y1-w.bbox.y0;
   if(group&&w.bbox.x0-group.x1<=Math.max(h,group.h)*2){group.words.push(w);group.x1=Math.max(group.x1,w.bbox.x1);group.y0=Math.min(group.y0,w.bbox.y0);group.y1=Math.max(group.y1,w.bbox.y1);group.h=Math.max(group.h,h);}
   else{group={words:[w],x0:w.bbox.x0,x1:w.bbox.x1,y0:w.bbox.y0,y1:w.bbox.y1,h};groups.push(group);}
  }
 }
 // OCR can put pieces of one label on different lines (a pointer line crossing the word): join groups
 // that sit at the same height with a small gap.
 groups.sort((a,b)=>a.x0-b.x0);
 for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++){const a=groups[i],b=groups[j];if(!a||!b)continue;
  const vy=Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0),h=Math.max(a.h,b.h);
  if(vy>=Math.min(a.y1-a.y0,b.y1-b.y0)*.5&&b.x0-a.x1<=h*3&&b.x0>=a.x0){a.words.push(...b.words);a.x1=Math.max(a.x1,b.x1);a.y0=Math.min(a.y0,b.y0);a.y1=Math.max(a.y1,b.y1);a.h=h;groups[j]=null;j=i;}}
 for(let i=groups.length-1;i>=0;i--)if(!groups[i])groups.splice(i,1);
 groups.sort((a,b)=>a.y0-b.y0||a.x0-b.x0);
 const overlap=(a,b)=>{const ix=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)),iy=Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));return ix*iy/Math.min(a.w*a.h,b.w*b.h);};
 const out=[];
 for(const g of groups){
  const label=g.words.sort((a,b)=>a.bbox.x0-b.bbox.x0).map(w=>String(w.text).trim()).join(' ').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N})]+$/gu,'').trim();
  if(label.length<2)continue;
  // A little padding so the text is fully hidden; regions must be at least 1% of the image.
  const pad=Math.max(2,g.h*.25);
  let x=Math.max(0,(g.x0-pad)/width),y=Math.max(0,(g.y0-pad)/height),x2=Math.min(1,(g.x1+pad)/width),y2=Math.min(1,(g.y1+pad)/height);
  if(x2-x<.01)x2=Math.min(1,x+.01);if(y2-y<.01)y2=Math.min(1,y+.01);
  const r={id:uuid(),label:label.slice(0,300),x,y,w:x2-x,h:y2-y};
  if(r.w>.9&&r.h>.5)continue; // a whole page of text is not a label
  if([...existing,...out].some(e=>overlap(e,r)>.5))continue;
  out.push(r);if(existing.length+out.length>=limit)break;
 }
 return out;
}
