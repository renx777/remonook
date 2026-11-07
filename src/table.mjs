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
 const key=axis==='row'?'heights':'widths',sizes=[...(layout[key]||[])];sizes.splice(at,1);const n=axis==='row'?rows.length:rows[0].length;
 return {rows:next,layout:remapLayout({...layout,[key]:sizes},axis,[...Array(n).keys()].map(i=>i<at?i:i===at?-1:i-1),n-1,false)};
}
/** Inserts one blank row or column before index `at` (use rows/cols length to append). Formulas and sizes follow their cells. */
export function insertTableAxis(rows,layout,axis,at){
 const size=axis==='row'?rows.length:rows[0].length;if(at<0||at>size)throw Error('Invalid table position');if(size>=(axis==='row'?200:26))return {rows,layout};
 const shiftRef=(ref,col,num)=>{const n=axis==='row'?Number(num)-1:col.toUpperCase().charCodeAt(0)-65;if(n<at)return ref;return axis==='row'?col+(Number(num)+1):String.fromCharCode(col.toUpperCase().charCodeAt(0)+1)+num;};
 const fix=value=>!value.startsWith('=')?value:value.replace(/\b([A-Z])([1-9]\d*)\b/gi,(ref,col,num)=>shiftRef(ref,col,num));
 const next=axis==='row'
  ?[...rows.slice(0,at).map(row=>row.map(fix)),rows[0].map(()=>''),...rows.slice(at).map(row=>row.map(fix))]
  :rows.map(row=>[...row.slice(0,at).map(fix),'',...row.slice(at).map(fix)]);
 const key=axis==='row'?'heights':'widths',sizes=[...(layout[key]||[])];if(sizes.length>at)sizes.splice(at,0,undefined);
 return {rows:next,layout:remapLayout({...layout,[key]:sizes.map(v=>v??(axis==='row'?36:160))},axis,[...Array(size).keys()].map(i=>i<at?i:i+1),size+1,false)};
}

/* ---------- Formatting and whole-axis edits (v2) ----------
 Layout may carry optional formatting. Colours are names, never hex, so every theme can render them.
   header, headerCol, striped: booleans; border: 'all'|'rows'|'outer'|'none'; borderColor: colour name
   rowStyle[r], colStyle[c]: {bg?, align?}; cells["r:c"]: {bg?, fg?, b?, i?, align?} */
export const TABLE_COLORS=['gray','brown','orange','yellow','green','blue','purple','pink','red'];
export const TABLE_BORDERS=['all','rows','outer','none'];
const colorName=v=>TABLE_COLORS.includes(v)?v:undefined;
const alignName=v=>['left','center','right'].includes(v)?v:undefined;
const clean=o=>{const out={};for(const [k,v] of Object.entries(o))if(v!==undefined&&v!==false&&v!=='')out[k]=v;return Object.keys(out).length?out:null;};
/** One cell's effective style: column, then row, then the cell itself. Unknown values are ignored. */
export function cellStyle(layout,r,c){
 const col=layout.colStyle?.[c]||{},row=layout.rowStyle?.[r]||{},cell=layout.cells?.[r+':'+c]||{};
 return {bg:colorName(cell.bg)||colorName(row.bg)||colorName(col.bg),fg:colorName(cell.fg),b:!!cell.b,i:!!cell.i,align:alignName(cell.align)||alignName(col.align)};
}
/** Merge a patch into each cell of a rectangle; null/undefined values remove that property. */
export function styleCells(layout,r0,c0,r1,c1,patch){
 const cells={...(layout.cells||{})};
 for(let r=Math.min(r0,r1);r<=Math.max(r0,r1);r++)for(let c=Math.min(c0,c1);c<=Math.max(c0,c1);c++){const k=r+':'+c,next=clean({...(cells[k]||{}),...Object.fromEntries(Object.entries(patch).map(([a,v])=>[a,v??undefined]))});if(next)cells[k]=next;else delete cells[k];}
 return {...layout,cells};
}
/** Style a whole row or column; also clears the same property from its cells so the choice is visible. */
export function styleAxis(layout,axis,i,patch){
 const key=axis==='row'?'rowStyle':'colStyle',list=[...(layout[key]||[])];while(list.length<=i)list.push(null);
 list[i]=clean({...(list[i]||{}),...Object.fromEntries(Object.entries(patch).map(([a,v])=>[a,v??undefined]))});
 const cells={...(layout.cells||{})};for(const k of Object.keys(cells)){const [r,c]=k.split(':').map(Number);if((axis==='row'?r:c)!==i)continue;const rest={...cells[k]};for(const a of Object.keys(patch))delete rest[a];const n=clean(rest);if(n)cells[k]=n;else delete cells[k];}
 return {...layout,[key]:list,cells};
}
const refPattern=/\b([A-Z])([1-9]\d*)\b/gi;
/** Rewrites formula references after rows or columns move; `map[old]` is the new index or -1 for deleted. */
function remapRefs(value,axis,map){return !value.startsWith('=')?value:value.replace(refPattern,(ref,col,num)=>{const n=axis==='row'?Number(num)-1:col.toUpperCase().charCodeAt(0)-65;if(n>=map.length)return ref;const to=map[n];if(to<0)return '#REF!';return axis==='row'?col+(to+1):String.fromCharCode(65+to)+num;});}
/** Moves layout entries (sizes and styles) of one axis by `map`, filling new slots with defaults. */
function remapLayout(layout,axis,map,length,sizes=true){
 const sizeKey=axis==='row'?'heights':'widths',styleKey=axis==='row'?'rowStyle':'colStyle',out={...layout},fill=axis==='row'?36:160;
 const move=(list,def)=>{if(!list?.length)return list;const next=Array(length).fill(undefined);list.forEach((v,i)=>{const to=map[i]??(i<length?i:-1);if(to>=0&&to<length)next[to]=v;});let end=next.length;if(def===undefined)while(end&&next[end-1]==null)end--;return next.slice(0,def===undefined?end:length).map(v=>v??def??null);};
 if(sizes&&layout[sizeKey]?.length)out[sizeKey]=move(layout[sizeKey],fill);
 if(layout[styleKey]?.length)out[styleKey]=move(layout[styleKey],undefined);
 if(layout.cells){const cells={};for(const [k,v] of Object.entries(layout.cells)){const [r,c]=k.split(':').map(Number),i=axis==='row'?r:c,to=map[i]??i;if(to<0||to>=length)continue;cells[axis==='row'?to+':'+c:r+':'+to]=v;}out.cells=cells;}
 return out;
}
/** Reorders rows or columns by `order` (new position -> old index); formulas and formatting follow their cells. */
export function reorderTableAxis(rows,layout,axis,order){
 const map=Array(order.length);order.forEach((old,i)=>{map[old]=i;});
 const next=axis==='row'?order.map(i=>rows[i].map(v=>remapRefs(v,'row',map))):rows.map(row=>order.map(i=>remapRefs(row[i],'column',map)));
 return {rows:next,layout:remapLayout(layout,axis,map,order.length)};
}
export function moveTableAxis(rows,layout,axis,from,to){const n=axis==='row'?rows.length:rows[0].length;if(to<0||to>=n||from===to)return {rows,layout};const order=[...Array(n).keys()];order.splice(to,0,...order.splice(from,1));return reorderTableAxis(rows,layout,axis,order);}
/** Sorts body rows by a column (text or number); a header row stays first. */
export function sortTableByColumn(rows,layout,col,desc=false){
 const start=layout.header?1:0,body=[...Array(rows.length).keys()].slice(start),value=r=>{const v=displayCell(rows,r,col);return v===''?null:Number.isFinite(Number(v))?Number(v):v.toLowerCase();};
 body.sort((a,b)=>{const x=value(a),y=value(b);if(x===null||y===null)return x===y?a-b:x===null?1:-1;const d=typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y),undefined,{numeric:true});return (desc?-d:d)||a-b;});
 return reorderTableAxis(rows,layout,'row',[...[...Array(start).keys()],...body]);
}
/** Copies a row or column (contents and formatting) to just after itself. */
export function duplicateTableAxis(rows,layout,axis,at){
 const ins=insertTableAxis(rows,layout,axis,at+1);if(ins.rows===rows)return ins;
 const next=ins.rows.map(row=>[...row]);let lay=ins.layout;
 if(axis==='row')next[at+1]=[...next[at]];else next.forEach(row=>{row[at+1]=row[at];});
 const key=axis==='row'?'rowStyle':'colStyle';if(lay[key]?.[at]){const list=[...lay[key]];while(list.length<=at+1)list.push(null);list[at+1]=list[at];lay={...lay,[key]:list};}
 if(lay.cells){const cells={...lay.cells};for(const [k,v] of Object.entries(lay.cells)){const [r,c]=k.split(':').map(Number);if(axis==='row'&&r===at)cells[(at+1)+':'+c]=v;if(axis==='column'&&c===at)cells[r+':'+(at+1)]=v;}lay={...lay,cells};}
 return {rows:next,layout:lay};
}
/** Writes a pasted grid starting at (r, c), growing the table up to its limits. */
export function pasteIntoTable(rows,r,c,grid){
 const height=Math.min(200,Math.max(rows.length,r+grid.length)),width=Math.min(26,Math.max(rows[0].length,c+Math.max(...grid.map(g=>g.length))));
 const next=Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>rows[i]?.[j]??''));
 grid.forEach((line,i)=>line.forEach((v,j)=>{if(r+i<height&&c+j<width)next[r+i][c+j]=String(v);}));
 return next;
}
/** Splits clipboard text from spreadsheets (tabs) or Markdown tables into a grid; null for plain text. */
export function parseClipboardGrid(text){
 const lines=text.replace(/\r\n?/g,'\n').replace(/\n$/,'').split('\n');
 if(lines.length>1&&lines.every(l=>/^\s*\|.*\|\s*$/.test(l))){const body=lines.filter(l=>!/^\s*\|[\s:|-]+\|\s*$/.test(l));return body.map(l=>l.trim().slice(1,-1).split('|').map(s=>s.trim()));}
 if(!text.includes('\t')&&lines.length<2)return null;
 return lines.map(l=>l.split('\t'));
}
export function tableMarkdown(rows){
 const esc=s=>s.replace(/\|/g,'\\|').replace(/\n/g,' ');const shown=rows.map((row,r)=>row.map((v,c)=>esc(v===''?'':displayCell(rows,r,c))));
 return [shown[0],shown[0].map(()=>'---'),...shown.slice(1)].map(r=>'| '+r.join(' | ')+' |').join('\n');
}
export function tableTSV(rows,r0=0,c0=0,r1=rows.length-1,c1=rows[0].length-1){const out=[];for(let r=Math.min(r0,r1);r<=Math.max(r0,r1);r++){const line=[];for(let c=Math.min(c0,c1);c<=Math.max(c0,c1);c++)line.push(rows[r][c]===''?'':displayCell(rows,r,c));out.push(line.join('\t'));}return out.join('\n');}
