const LIMIT=40;
const fold=value=>String(value||'').normalize('NFKD').replace(/\p{Diacritic}/gu,'').toLowerCase();
export function preparePaletteNotes(rows){return rows.filter(row=>row.text?.trim()).map(row=>({id:row.id,text:fold(row.text),title:fold(row.text.slice(0,240))}));}
// Linear subsequence matching on a bounded preview; never recurse through book-length notes.
function fuzzy(title,query){let at=0,first=-1,last=-1;for(const char of query){if(char===' ')continue;at=title.indexOf(char,at);if(at<0)return 0;if(first<0)first=at;last=at++;}return first<0?0:300-Math.min(150,last-first)-Math.min(100,first);}
export function searchPaletteNotes(rows,query,limit=LIMIT){
 const text=fold(query).trim(),tokens=text.split(/\s+/),matches=[];let total=0;
 for(const row of rows){let score=0;if(!text)score=1;else if(row.title===text)score=1000;else if(row.title.startsWith(text))score=950;else if(row.title.includes(text))score=900;else if(row.text.includes(text))score=800;else if(tokens.length>1&&tokens.every(token=>row.text.includes(token)))score=700;else if(text.length<=80)score=fuzzy(row.title,text);
  if(!score)continue;total++;const item={id:row.id,score};let lo=0,hi=matches.length;while(lo<hi){const mid=(lo+hi)>>>1;if(matches[mid].score>=score)lo=mid+1;else hi=mid;}if(lo<limit){matches.splice(lo,0,item);if(matches.length>limit)matches.pop();}
 }
 return{matches,total};
}
export function mergePaletteMatches(previous,next,limit=LIMIT){return{matches:[...previous.matches,...next.matches].sort((a,b)=>b.score-a.score).slice(0,limit),total:previous.total+next.total};}
