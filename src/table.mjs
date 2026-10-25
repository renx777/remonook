export const tableText = (rows,layout={}) => '```remo-table\n'+JSON.stringify(Object.keys(layout).length?{rows,layout}:rows)+'\n```';
export function tableLayout(text){try{const data=JSON.parse(text.slice(14,-4));return data.layout||{};}catch{return {};}}
export function readTable(text){try{if(!text.startsWith('```remo-table\n'))return null;const data=JSON.parse(text.slice(14,-4)),rows=Array.isArray(data)?data:data.rows;return Array.isArray(rows)&&rows.length&&rows.length<=200&&rows.every(r=>Array.isArray(r)&&r.length===rows[0].length&&r.length<=26&&r.every(c=>typeof c==='string'))?rows:null;}catch{return null;}}
export function cellValue(rows,row,col,seen=new Set(),budget={left:10000}){
 if(--budget.left<0)throw Error('#LIMIT!');if(seen.size>100)throw Error('#LIMIT!');const key=row+','+col;if(seen.has(key))throw Error('#CYCLE!');if(!rows[row]||col<0||col>=rows[row].length)throw Error('#REF!');
 const raw=rows[row][col];if(!raw.startsWith('='))return raw.trim()===''?0:Number.isFinite(Number(raw))?Number(raw):raw;
 if(raw.includes('#REF!'))throw Error('#REF!');const next=new Set(seen).add(key);let pos=0,src=raw.slice(1).toUpperCase(),steps=0;
 const ws=()=>{while(/\s/.test(src[pos]||'~'))pos++;};
 const numeric=v=>{if(typeof v!=='number')throw Error('#VALUE!');return v;};
 const ref=()=>{ws();const m=/^[A-Z][1-9]\d*/.exec(src.slice(pos));if(!m)throw Error('#FORMULA!');pos+=m[0].length;return [Number(m[0].slice(1))-1,m[0].charCodeAt(0)-65];};
 const atom=()=>{if(++steps>1000)throw Error('#LIMIT!');ws();if(src[pos]==='+'||src[pos]==='-'){const sign=src[pos++];return atom()*(sign==='-'?-1:1);}if(src[pos]==='('){pos++;const v=expr();ws();if(src[pos++]!==')')throw Error('#FORMULA!');return v;}
 const fn=/^(SUM|AVERAGE|MIN|MAX|COUNT)\s*\(/.exec(src.slice(pos));if(fn){pos+=fn[0].length;let values=[];ws();if(src[pos]!==')')while(true){ws();if(/^[A-Z][1-9]\d*\s*:/.test(src.slice(pos))){const a=ref();ws();pos++;const b=ref();if(Math.abs(b[0]-a[0])*Math.abs(b[1]-a[1])>5200)throw Error('#LIMIT!');for(let r=Math.min(a[0],b[0]);r<=Math.max(a[0],b[0]);r++)for(let c=Math.min(a[1],b[1]);c<=Math.max(a[1],b[1]);c++)values.push(cellValue(rows,r,c,next,budget));}else values.push(expr());ws();if(src[pos]!==',')break;pos++;}if(src[pos++]!==')')throw Error('#FORMULA!');values=values.filter(v=>typeof v==='number');if(fn[1]==='COUNT')return values.length;if(fn[1]==='SUM')return values.reduce((a,b)=>a+b,0);if(!values.length)throw Error('#DIV/0!');return fn[1]==='AVERAGE'?values.reduce((a,b)=>a+b,0)/values.length:fn[1]==='MIN'?Math.min(...values):Math.max(...values);}
 if(/^[A-Z][1-9]/.test(src.slice(pos))){const [r,c]=ref();return numeric(cellValue(rows,r,c,next,budget));}const n=/^(?:\d+\.?\d*|\.\d+)/.exec(src.slice(pos));if(!n)throw Error('#FORMULA!');pos+=n[0].length;return Number(n[0]);};
 const term=()=>{let v=atom();ws();while(src[pos]==='*'||src[pos]==='/'){const op=src[pos++],b=atom();if(op==='/'&&b===0)throw Error('#DIV/0!');v=op==='*'?v*b:v/b;ws();}return v;};
 const expr=()=>{let v=term();ws();while(src[pos]==='+'||src[pos]==='-'){const op=src[pos++],b=term();v=op==='+'?v+b:v-b;ws();}return v;};const value=expr();ws();if(pos!==src.length||!Number.isFinite(value))throw Error('#FORMULA!');return value;
}
export function displayCell(rows,r,c){try{return String(cellValue(rows,r,c));}catch(e){return e.message;}}
export function deleteTableAxis(rows,layout,axis,at){
 if((axis==='row'?rows.length:rows[0].length)<=1)return {rows,layout};
 const next=(axis==='row'?rows.filter((_,r)=>r!==at):rows.map(row=>row.filter((_,c)=>c!==at))).map(row=>row.map(value=>!value.startsWith('=')?value:value.replace(/\b([A-Z])([1-9]\d*)\b/gi,(ref,col,num)=>{const n=axis==='row'?Number(num)-1:col.toUpperCase().charCodeAt(0)-65;return n===at?'#REF!':n<at?ref:axis==='row'?col+(Number(num)-1):String.fromCharCode(col.toUpperCase().charCodeAt(0)-1)+num;})));
 const key=axis==='row'?'heights':'widths',sizes=[...(layout[key]||[])];sizes.splice(at,1);return {rows:next,layout:{...layout,[key]:sizes}};
}
