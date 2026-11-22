// Meaning search maths shared by the app and tests. Vectors are unit length, stored as int8
// (value × 127), so similarity is a plain dot product divided by 127².
export const DIMS=1024;
const SCALE=127*127;
export function decodeVectors(b64,dims=DIMS){
 const bin=atob(b64),bytes=new Int8Array(bin.length);
 for(let i=0;i<bin.length;i++){const c=bin.charCodeAt(i);bytes[i]=c>127?c-256:c;}
 const out=[];for(let i=0;i+dims<=bytes.length;i+=dims)out.push(bytes.slice(i,i+dims));return out;
}
export function similarity(a,b){let s=0;for(let i=0;i<a.length;i++)s+=a[i]*b[i];return s/SCALE;}
/** Top matches for a vector. `entries` is an iterable of [id, Int8Array].
 * @param {Int8Array} vector @param {Iterable<[string, Int8Array]>} entries
 * @param {{limit?:number,min?:number,skip?:(id:string)=>boolean}} [options] */
export function nearest(vector,entries,{limit=10,min=0.45,skip=()=>false}={}){
 const hits=[];
 for(const [id,v] of entries){if(skip(id))continue;const score=similarity(vector,v);if(score<min)continue;
  if(hits.length<limit){hits.push({id,score});hits.sort((a,b)=>b.score-a.score);}
  else if(score>hits[hits.length-1].score){hits[hits.length-1]={id,score};hits.sort((a,b)=>b.score-a.score);}}
 return hits;
}
/** Pairs of near-identical items (for duplicate flashcards), highest similarity first. */
export function duplicatePairs(entries,{min=0.85,limit=200}={}){
 const list=[...entries],pairs=[];
 for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){const score=similarity(list[i][1],list[j][1]);if(score>=min)pairs.push({a:list[i][0],b:list[j][0],score});}
 return pairs.sort((x,y)=>y.score-x.score).slice(0,limit);
}
/** A stable, short fingerprint of the indexed text, so only changed notes are sent again. */
export function textHash(text){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(36)+':'+text.length;}
/** The text a bullet is indexed by, or '' when it is not worth indexing. */
export function meaningText(node,plain){
 if(!node||node.mirrorSourceId||node.codeLanguage||node.blockStyle==='divider')return '';
 const t=plain(node.text||'').replace(/\s+/g,' ').trim();
 return t.length>=4&&/\p{L}/u.test(t)?t.slice(0,800):'';
}
/** Groups texts into request batches within the server's limits. */
export function batches(items,{maxItems=48,maxBytes=24000}={}){
 const out=[];let cur=[],size=0;const enc=new TextEncoder();
 for(const it of items){const b=enc.encode(it.text).length;if(cur.length&&(cur.length>=maxItems||size+b>maxBytes)){out.push(cur);cur=[];size=0;}cur.push(it);size+=b;}
 if(cur.length)out.push(cur);return out;
}
