import {marks as parseMarks,encode} from './domain.mjs';
import {readTable,tableText,tableMarkdown,parseClipboardGrid} from './table.mjs';

/* Markdown <-> bullets for AI apps (MCP).
   Inline: **bold**, _italic_ or *italic*, `code`, ==highlight==, <u>underline</u>, and
   <mark data-style="STYLE">text</mark> for every other stored style (colours, masks, rough
   annotations), so a read-modify-write round trip never loses formatting.
   Blocks: nested lists (- * + 1.), [ ] / [x] tasks, # headings (their content nests under them),
   paragraphs, > quotes, --- dividers, fenced code (```lang), ```mermaid diagrams, GFM tables. */
export const CODE_LANGUAGES=['plaintext','javascript','typescript','python','java','sql','json','html','css','bash','c','cpp','csharp','go','rust','yaml','markdown'];
const ESC='\\*_`=<>~[]#|',PH=0xE000; // escaped characters become private-use placeholders while parsing
const protect=s=>s.replace(/\\([\\*_`=<>~\[\]#|])/g,(_,c)=>String.fromCharCode(PH+ESC.indexOf(c)));
const restore=s=>s.replace(/[\uE000-\uE00F]/g,c=>ESC[c.charCodeAt(0)-PH]);
const LANG_ALIAS={js:'javascript',ts:'typescript',py:'python',sh:'bash',shell:'bash',zsh:'bash','c++':'cpp','c#':'csharp',cs:'csharp',yml:'yaml',md:'markdown',text:'plaintext',txt:'plaintext','':'plaintext'};

/** Inline Markdown to {text, formatting}. Throws on syntax RemoNook cannot store (strikethrough). */
export function parseInline(src){
  let text=protect(src),ms=[];
  if(/~~[^~]+~~/.test(text))throw unsupported('strikethrough (~~text~~)');
  const pass=(re,style,group=1)=>{
    const removed=[],added=[];let out='',last=0,m;re.lastIndex=0;
    while((m=re.exec(text))){
      const inner=m[group],open=m[0].indexOf(inner,style==='__mark'?m[0].indexOf('>')+1:0),close=m[0].length-open-inner.length;
      const inCode=(a,b)=>ms.some(x=>x.style==='CODE'&&a<x.end&&b>x.start),closeAt=m.index+open+inner.length;
      if(style!=='CODE'&&(inCode(m.index,m.index+open)||inCode(closeAt,closeAt+close)))continue;
      const body=style==='CODE'?inner.replace(/[\\*_`=<>~\[\]#|]/g,c=>String.fromCharCode(PH+ESC.indexOf(c))):inner; // code text is literal
      out+=text.slice(last,m.index)+body;const start=out.length-inner.length;
      added.push({start,end:start+inner.length,style:style==='__mark'?m[1]:style});
      removed.push([m.index,open],[m.index+open+inner.length,close]);last=m.index+m[0].length;
    }
    if(!removed.length)return;
    out+=text.slice(last);
    const map=p=>{let shift=0;for(const [at,len] of removed){if(p>at)shift+=Math.min(len,p-at);}return p-shift;};
    ms=ms.map(x=>({...x,start:map(x.start),end:map(x.end)})).concat(added);text=out;
  };
  pass(/`([^`\n]+)`/g,'CODE');
  for(let k=0;k<12&&/<mark data-style=/.test(text);k++)pass(/<mark data-style="([A-Za-z0-9_:.,-]+)">((?:(?!<mark data-style=)[\s\S])*?)<\/mark>/g,'__mark',2); // innermost first
  pass(/<u>([\s\S]*?)<\/u>/g,'UNDERLINE');
  pass(/\*\*(?!\s)([\s\S]+?)(?<!\s)\*\*/g,'BOLD');
  pass(/(?<![\p{L}\p{N}])__(?!\s)([\s\S]+?)(?<!\s)__(?![\p{L}\p{N}])/gu,'BOLD');
  pass(/==(?!\s)([\s\S]+?)(?<!\s)==/g,'HIGHLIGHT');
  pass(/(?<![\p{L}\p{N}_])_(?![\s_])([\s\S]+?)(?<![\s_])_(?![\p{L}\p{N}_])/gu,'ITALIC');
  pass(/(?<!\*)\*(?![\s*])([\s\S]+?)(?<![\s*])\*(?!\*)/g,'ITALIC');
  text=restore(text);
  const valid=parseMarks(encode(ms.filter(x=>x.end>x.start)),text.length);
  const bad=ms.filter(x=>x.end>x.start&&!valid.some(v=>v.start===x.start&&v.end===x.end&&v.style===x.style));
  if(bad.length)throw unsupported(`formatting style "${bad[0].style}"`);
  return {text,formatting:encode(valid.sort((a,b)=>a.start-b.start||a.end-b.end))};
}
const unsupported=what=>Object.assign(Error(`RemoNook cannot store ${what}. Rewrite that part without it.`),{status:400,code:'UNSUPPORTED_MARKDOWN'});

const escapeText=s=>s.replace(/\\/g,'\\\\').replace(/[*`]/g,'\\$&').replace(/=/g,(c,i,all)=>i===0||i===all.length-1||all[i-1]==='='||all[i+1]==='='?'\\=':c).replace(/~~/g,'\\~~').replace(/<(?=\/?(?:u|mark)\b)/g,'\\<').replace(/(^|[^\p{L}\p{N}_])_|_(?=$|[^\p{L}\p{N}_])/gu,m=>m.replace('_','\\_'));
const SIMPLE={BOLD:['**','**'],ITALIC:['*','*'],CODE:['`','`'],HIGHLIGHT:['==','=='],UNDERLINE:['<u>','</u>']};
const opener=(s,plain)=>plain&&SIMPLE[s]?SIMPLE[s][0]:`<mark data-style="${s}">`,closer=(s,plain)=>plain&&SIMPLE[s]?SIMPLE[s][1]:'</mark>';
/** {text, formatting} to inline Markdown with properly nested delimiters, so it parses back exactly. */
export function inlineMarkdown(text,formatting=''){
  const ms=parseMarks(formatting||'',text.length);if(!ms.length)return escapeText(text);
  const pretty=emit(text,ms,true);
  // Ambiguous edge cases (styles starting or ending on spaces, crossing ranges) fall back to the explicit form.
  try{const back=parseInline(pretty);if(back.text===text&&styleMap(text,back.formatting)===styleMap(text,formatting))return pretty;}catch{/* fall back */}
  return emit(text,ms,false);
}
const styleMap=(text,f)=>{const a=Array.from({length:text.length},()=>[]);for(const x of parseMarks(f||'',text.length))for(let i=x.start;i<x.end;i++)a[i].push(x.style);return a.map(s=>s.sort().join(',')).join('|');};
function emit(text,ms,friendly){
  const cuts=[...new Set([0,text.length,...ms.flatMap(m=>[m.start,m.end])])].sort((a,b)=>a-b);
  const stack=[];let out='';
  for(let i=0;i<cuts.length-1;i++){
    const a=cuts[i],b=cuts[i+1],active=ms.filter(m=>m.start<=a&&m.end>=b);
    const keys=new Set(active.map(m=>m.style));
    let keep=0;while(keep<stack.length&&keys.has(stack[keep].style))keep++;
    const closed=stack.splice(keep),reopened=new Set(closed.map(e=>e.m.style));for(const e of closed.reverse())out+=closer(e.m.style,e.plain);
    const open=new Set(stack.map(e=>e.m.style)),code=keys.has('CODE');
    // Longer-lasting styles open first (outer); code is always innermost. A style closed and reopened at the
    // same point (crossing ranges) uses the explicit <mark> form, so adjacent delimiters never run together.
    for(const m of active.filter(m=>!open.has(m.style)).sort((x,y)=>(x.style==='CODE')-(y.style==='CODE')||y.end-x.end||x.style.localeCompare(y.style))){const plain=friendly&&!reopened.has(m.style)&&!(m.style==='CODE'&&text.slice(m.start,m.end).includes('`'));out+=opener(m.style,plain);stack.push({m,plain});}
    out+=code&&!stack.find(e=>e.m.style==='CODE')?.plain===false&&!text.slice(a,b).includes('`')?text.slice(a,b):escapeText(text.slice(a,b));
  }
  for(const e of stack.reverse())out+=closer(e.m.style,e.plain);
  return out;
}

/** Markdown to flat items {depth, text, formatting, taskState, listType, codeLanguage, blockStyle}. */
export function parseMarkdown(md){
  const lines=String(md).replace(/\r\n?/g,'\n').split('\n'),items=[],headings=[];let listStack=[],i=0,last=null;
  const base=()=>headings.length;
  const push=(item)=>{items.push(item);last=item;return item;};
  const node=(depth,content,extra={})=>({depth,...parseInline(content),taskState:'NONE',listType:'NONE',codeLanguage:'',blockStyle:'paragraph',...extra});
  while(i<lines.length){
    const line=lines[i];
    const fence=/^(\s*)(```+|~~~+)\s*([\w#+.-]*)\s*$/.exec(line);
    if(fence){
      const close=fence[2],lang=fence[3].toLowerCase(),body=[];i++;
      while(i<lines.length&&!lines[i].trim().startsWith(close))body.push(lines[i++].replace(new RegExp('^'+fence[1]),''));
      i++;const code=body.join('\n'),depth=listDepth(fence[1].length);
      if(lang==='mermaid')push({depth:base()+depth,text:'```mermaid\n'+code+'\n```',formatting:'',taskState:'NONE',listType:'NONE',codeLanguage:'',blockStyle:'paragraph'});
      else push({depth:base()+depth,text:code,formatting:'',taskState:'NONE',listType:'NONE',codeLanguage:CODE_LANGUAGES.includes(lang)?lang:LANG_ALIAS[lang]||'plaintext',blockStyle:'paragraph'});
      continue;
    }
    if(/^\s*\|.*\|\s*$/.test(line)&&/^\s*\|[\s:|-]+\|\s*$/.test(lines[i+1]||'')){
      const rows=[];const indent=/^\s*/.exec(line)[0].length;
      while(i<lines.length&&/^\s*\|.*\|\s*$/.test(lines[i]))rows.push(lines[i++]);
      const grid=parseClipboardGrid(rows.join('\n'));const width=Math.max(...grid.map(r=>r.length));
      if(grid.length>200||width>26)throw unsupported('a table larger than 200 rows or 26 columns');
      const padded=grid.map(r=>Array.from({length:width},(_,c)=>restore(protect(r[c]??''))));
      push({depth:base()+listDepth(indent),text:tableText(padded,{header:true}),formatting:'',taskState:'NONE',listType:'NONE',codeLanguage:'',blockStyle:'paragraph'});continue;
    }
    i++;
    if(!line.trim()){listStack=listStack;last=null;continue;}
    const h=/^(#{1,6})\s+(.*)$/.exec(line);
    if(h){const level=h[1].length;while(headings.length&&headings.at(-1)>=level)headings.pop();const it=node(headings.length,h[2].replace(/\s+#+\s*$/,''));const ms=parseMarks(it.formatting,it.text.length);if(it.text&&!ms.some(m=>m.style==='BOLD'&&m.start===0&&m.end===it.text.length))it.formatting=encode([{start:0,end:it.text.length,style:'BOLD'},...ms]);push(it);headings.push(level);listStack=[];continue;}
    if(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)){push({depth:base(),text:'',formatting:'',taskState:'NONE',listType:'NONE',codeLanguage:'',blockStyle:'divider'});listStack=[];continue;}
    const li=/^(\s*)([-*+]|\d{1,9}[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/.exec(line);
    if(li){
      const indent=li[1].replace(/\t/g,'    ').length;
      while(listStack.length&&listStack.at(-1)>indent)listStack.pop();
      if(!listStack.length||listStack.at(-1)<indent)listStack.push(indent);
      push(node(base()+listStack.length-1,li[4],{taskState:li[3]===undefined?'NONE':li[3]===' '?'TODO':'DONE',listType:/\d/.test(li[2])?'ORDERED':'NONE'}));continue;
    }
    const quote=/^\s*>\s?(.*)$/.exec(line);
    const content=quote?quote[1]:line.trim();
    if(last&&!quote&&/^\s+/.test(line)&&!last.codeLanguage&&last.blockStyle!=='divider'&&!readTable(last.text)){ // continuation of the previous item
      const more=parseInline(content),offset=last.text.length+1;
      last.formatting=encode([...parseMarks(last.formatting,last.text.length),...parseMarks(more.formatting,more.text.length).map(m=>({...m,start:m.start+offset,end:m.end+offset}))]);last.text+='\n'+more.text;continue;
    }
    push(node(base()+(listStack.length&&/^\s+/.test(line)?listStack.length:0),content));
  }
  if(items.length>500)throw Object.assign(Error('At most 500 bullets can be written in one call. Split the content.'),{status:400});
  return items;
}
const listDepth=indent=>Math.floor(indent/2);

/** Bullets for parsed items, under `parentId`; depth 0 items are direct children. */
export function itemsToBullets(items,parentId,makeId,bullet){
  const out=[],stack=[];
  for(const it of items){
    const depth=Math.min(it.depth,stack.length);stack.length=depth;
    const parent=depth?stack[depth-1]:parentId,siblings=out.filter(n=>n.parentId===parent).length,id=makeId();
    out.push(bullet(id,{parentId:parent,position:siblings,text:it.text,formatting:it.formatting,taskState:it.taskState,listType:it.listType,codeLanguage:it.codeLanguage,...(it.blockStyle&&it.blockStyle!=='paragraph'?{blockStyle:it.blockStyle}:{})}));
    stack.push(id);
  }
  return out;
}

/** One bullet as Markdown (without list marker), used for read output and version-checked edits. */
export function bulletMarkdown(n){
  if(n.codeLanguage)return '```'+n.codeLanguage+'\n'+n.text+'\n```';
  if(n.blockStyle==='divider')return '---';
  const rows=readTable(n.text);if(rows)return tableMarkdown(rows);
  if(n.text.startsWith('```'))return n.text;
  return (n.taskState==='TODO'?'[ ] ':n.taskState==='DONE'?'[x] ':'')+inlineMarkdown(n.text,n.formatting);
}
/** A stable short version of a bullet's content and place; edits must quote the version they read. */
export function bulletVersion(n){
  const s=JSON.stringify([n.text,n.formatting,n.parentId,n.position,n.taskState,n.kind,n.listType,n.codeLanguage,n.blockStyle||'',n.dueDate,!!n.mindmap,!!n.collapsed]);
  let h=0x811c9dc5;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;}return h.toString(36);
}
/** A subtree as an outline: one line per bullet, ending with <!-- id=… v=… --> so edits can target it. */
export function outlineMarkdown(idx,rootId,{maxNodes=400,offset=0,maxDepth=20}={}){
  const lines=[];let index=0,emitted=0,more=false;
  const walk=(parent,depth)=>{for(const n of idx.children.get(parent)||[]){
    if(more)return;
    if(index++>=offset){
      if(emitted>=maxNodes){more=true;return;}emitted++;
      const body=bulletMarkdown(n).split('\n'),pad='  '.repeat(depth),marker=n.listType==='ORDERED'?'1.':'-',tag=` <!-- id=${n.id} v=${bulletVersion(n)}${n.kind!=='NOTE'?' kind='+n.kind:''}${n.mindmap?' mindmap':''} -->`;
      lines.push(`${pad}${marker} ${body[0]}${body.length===1?tag:''}`);
      for(const extra of body.slice(1))lines.push(`${pad}  ${extra}`);
      if(body.length>1)lines.push(`${pad} ${tag}`);
    }
    if(depth<maxDepth)walk(n.id,depth+1);
  }};
  walk(rootId,0);
  return {markdown:lines.join('\n'),count:emitted,next_offset:more?offset+emitted:null};
}
