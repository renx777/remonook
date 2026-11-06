import {createContext,useContext,useEffect,useLayoutEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {readTable,tableText,tableLayout,displayCell,deleteTableAxis,insertTableAxis,duplicateTableAxis,moveTableAxis,sortTableByColumn,styleCells,styleAxis,cellStyle,pasteIntoTable,parseClipboardGrid,tableMarkdown,tableTSV,TABLE_COLORS,TABLE_BORDERS} from './table.mjs';
import './note-table.css';

export const TableContext=createContext<((id:string,text:string)=>void)|null>(null);

type Layout=Record<string,any>;
type Sel={r0:number;c0:number;r1:number;c1:number;kind:'cells'|'row'|'column'};
type Menu=null|{kind:'row'|'column';i:number}|{kind:'table'}|{kind:'bg'|'fg'|'border'};
type Pos={left:number;top:number;below:boolean};

const MAX_ROWS=200,MAX_COLS=26;
const letter=(c:number)=>String.fromCharCode(65+c);
const colorLabel=(c:string)=>c[0].toUpperCase()+c.slice(1);
const isTouch=()=>typeof window!=='undefined'&&!!window.matchMedia?.('(hover: none)').matches;

/** Fixed-position anchor so menus are never clipped by the table's horizontal scroller. */
function anchorPos(el:Element|null|undefined,width:number,height:number):Pos|null{
  if(!el||typeof window==='undefined')return null;
  const r=el.getBoundingClientRect(),vw=window.innerWidth||1024,vh=window.innerHeight||768;
  const below=r.bottom+height+8<=vh||r.top-height-8<0;
  return {left:Math.max(8,Math.min(r.left,vw-width-8)),top:below?r.bottom+6:r.top-height-6,below};
}

function Swatches({label,value,onPick,kind}:{label:string;value?:string;onPick:(c:string|null)=>void;kind:'bg'|'fg'|'border'}){
  return <div className="nt-swatches" role="group" aria-label={label}>
    <button type="button" className={`nt-swatch nt-swatch-none${!value?' is-on':''}`} aria-label={`${label}: default`} aria-pressed={!value} title="Default" onClick={()=>onPick(null)}/>
    {TABLE_COLORS.map(c=><button key={c} type="button" className={`nt-swatch nt-swatch-${kind}${value===c?' is-on':''}`} data-color={c} aria-label={`${label}: ${c}`} aria-pressed={value===c} title={colorLabel(c)} onClick={()=>onPick(c)}>{kind==='fg'?'A':null}</button>)}
  </div>;
}

export function NoteTable({id,text}:{id:string;text:string}){
  const rows:string[][]=readTable(text)!;
  const update=useContext(TableContext),editable=!!update;
  const [preview,setPreview]=useState<Layout|null>(null);
  const layout:Layout=preview||tableLayout(text);
  const nr=rows.length,nc=rows[0].length;
  const widths=rows[0].map((_,c)=>Math.max(70,Math.min(800,Number(layout.widths?.[c])||160)));
  const heights=rows.map((_,r)=>Math.max(36,Math.min(500,Number(layout.heights?.[r])||36)));
  const [edit,setEdit]=useState<string|null>(null);
  const [draft,setDraft]=useState<{key:string;value:string}|null>(null);
  const [sel,setSel]=useState<Sel|null>(null);
  const [menu,setMenu]=useState<Menu>(null);
  const [hover,setHover]=useState<{r:number;c:number}|null>(null);
  const [pos,setPos]=useState<Pos|null>(null);
  const [addCount,setAddCount]=useState(0);
  const root=useRef<HTMLDivElement>(null),floating=useRef<HTMLDivElement>(null);
  const dragSel=useRef<{r:number;c:number}|null>(null),longPress=useRef<number|undefined>(undefined),addDrag=useRef<any>(null),resizeDrag=useRef<any>(null);

  const persist=(next:string[][],lay:Layout=layout)=>update?.(id,tableText(next,lay));
  const setLayout=(lay:Layout)=>persist(rows,lay);
  const q=(sel:string)=>root.current?.querySelector<HTMLElement>(sel);
  const focusCell=(r:number,c:number)=>requestAnimationFrame(()=>q(`span[data-cell="${r}:${c}"]`)?.focus());
  const startEdit=(r:number,c:number,initial?:string)=>{if(!editable)return;setSel(null);setMenu(null);setEdit(`${r}:${c}`);setDraft(initial===undefined?null:{key:`${r}:${c}`,value:initial});};
  const selectCells=(r0:number,c0:number,r1=r0,c1=c0)=>{setEdit(null);setMenu(null);setSel({r0,c0,r1,c1,kind:'cells'});};
  const closeAll=()=>{setSel(null);setMenu(null);};

  // Floating UI follows its anchor while the page or table scrolls.
  const anchor=():Element|null=>{
    if(menu?.kind==='row')return q(`[data-grip="row:${menu.i}"]`)||null;
    if(menu?.kind==='column')return q(`[data-grip="column:${menu.i}"]`)||null;
    if(menu?.kind==='table')return q('.nt-corner')||null;
    if(sel)return q(`[data-td="${Math.min(sel.r0,sel.r1)}:${Math.min(sel.c0,sel.c1)}"]`)||null;
    return null;
  };
  const place=()=>{const f=floating.current,a=anchor();if(!f||!a){setPos(null);return;}
    if(sel&&!menu||menu&&['bg','fg','border'].includes(menu.kind)){ // format bar sits above the selection
      const r=a.getBoundingClientRect(),w=f.offsetWidth||360,h=f.offsetHeight||40,vw=window.innerWidth||1024;
      const top=r.top-h-8>=8?r.top-h-8:(q(`[data-td="${Math.max(sel!.r0,sel!.r1)}:${Math.min(sel!.c0,sel!.c1)}"]`)||a).getBoundingClientRect().bottom+8;
      setPos({left:Math.max(8,Math.min(r.left,vw-w-8)),top,below:top>r.top});return;}
    setPos(anchorPos(a,f.offsetWidth||240,f.offsetHeight||300));};
  useLayoutEffect(()=>{place();},[menu,sel,text]);
  useEffect(()=>{if(!menu&&!sel)return;const on=()=>place();window.addEventListener('scroll',on,true);window.addEventListener('resize',on);return ()=>{window.removeEventListener('scroll',on,true);window.removeEventListener('resize',on);};},[menu,sel]);
  // Clicking anywhere else dismisses the selection and menus.
  useEffect(()=>{if(!menu&&!sel)return;const down=(e:globalThis.PointerEvent)=>{const t=e.target as globalThis.Node;if(root.current?.contains(t))return;closeAll();};window.addEventListener('pointerdown',down,true);return ()=>window.removeEventListener('pointerdown',down,true);},[menu,sel]);
  useEffect(()=>()=>window.clearTimeout(longPress.current),[]);

  const inSel=(r:number,c:number)=>!!sel&&r>=Math.min(sel.r0,sel.r1)&&r<=Math.max(sel.r0,sel.r1)&&c>=Math.min(sel.c0,sel.c1)&&c<=Math.max(sel.c0,sel.c1);
  const selRect=sel&&{r0:Math.min(sel.r0,sel.r1),r1:Math.max(sel.r0,sel.r1),c0:Math.min(sel.c0,sel.c1),c1:Math.max(sel.c0,sel.c1)};

  // ---- edits ----
  const save=(r:number,c:number,value:string)=>{if(rows[r]?.[c]===value)return;const next=rows.map(row=>[...row]);next[r][c]=value;persist(next);};
  const clearSel=()=>{if(!selRect)return;const next=rows.map(row=>[...row]);for(let r=selRect.r0;r<=selRect.r1;r++)for(let c=selRect.c0;c<=selRect.c1;c++)next[r][c]='';persist(next);};
  const axisOp=(fn:()=>{rows:string[][];layout:Layout},after?:Sel|null)=>{const next=fn();persist(next.rows,next.layout);setMenu(null);setSel(after===undefined?null:after);};
  const insert=(axis:'row'|'column',at:number)=>axisOp(()=>insertTableAxis(rows,layout,axis,at));
  const add=(axis:'row'|'column',count:number)=>{const n=Math.min(count,axis==='row'?MAX_ROWS-nr:MAX_COLS-nc);if(n<1)return;let next={rows,layout};for(let k=0;k<n;k++)next=insertTableAxis(next.rows,next.layout,axis,axis==='row'?next.rows.length:next.rows[0].length);persist(next.rows,next.layout);};
  const formatSel=(patch:Record<string,any>)=>{if(!selRect)return;
    if(sel!.kind==='row'&&('bg' in patch))return setLayout(styleAxis(layout,'row',selRect.r0,patch));
    if(sel!.kind==='column'&&(('bg' in patch)||('align' in patch)))return setLayout(styleAxis(layout,'column',selRect.c0,patch));
    setLayout(styleCells(layout,selRect.r0,selRect.c0,selRect.r1,selRect.c1,patch));};
  const selStyle=selRect?cellStyle(layout,selRect.r0,selRect.c0):null;
  const copy=(s:string)=>{try{void navigator.clipboard?.writeText(s);}catch{/* clipboard unavailable */}};
  const pasteGrid=(r:number,c:number,data:string)=>{const grid=parseClipboardGrid(data);if(!grid)return false;persist(pasteIntoTable(rows,r,c,grid));selectCells(r,c,Math.min(MAX_ROWS-1,r+grid.length-1),Math.min(MAX_COLS-1,c+Math.max(...grid.map((g:string[])=>g.length))-1));return true;};

  // ---- keyboard ----
  const move=(r:number,c:number,dr:number,dc:number,extend=false)=>{
    let nr2=r+dr,nc2=c+dc;
    if(dc!==0&&(nc2<0||nc2>=nc)&&!extend){if(nc2>=nc){nc2=0;nr2++;}else{nc2=nc-1;nr2--;}}
    nr2=Math.max(0,Math.min(nr-1,nr2));nc2=Math.max(0,Math.min(nc-1,nc2));return [nr2,nc2];};
  const editKeys=(e:React.KeyboardEvent<HTMLInputElement>,r:number,c:number)=>{
    const input=e.currentTarget,commit=()=>save(r,c,input.value);
    const go=(r2:number,c2:number)=>{commit();setEdit(`${r2}:${c2}`);setDraft(null);};
    if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();if(r+1>=nr){commit();setEdit(null);focusCell(r,c);}else go(r+1,c);}
    else if(e.key==='Tab'){e.preventDefault();if(!e.shiftKey&&r===nr-1&&c===nc-1&&nr<MAX_ROWS){const next=rows.map(row=>[...row]);next[r][c]=input.value;const ins=insertTableAxis(next,layout,'row',nr);persist(ins.rows,ins.layout);setEdit(`${r+1}:0`);setDraft(null);return;}const [r2,c2]=move(r,c,0,e.shiftKey?-1:1);go(r2,c2);}
    else if(e.key==='ArrowUp'&&r>0){e.preventDefault();go(r-1,c);}
    else if(e.key==='ArrowDown'&&r<nr-1){e.preventDefault();go(r+1,c);}
    else if(e.key==='ArrowLeft'&&input.selectionStart===0&&input.selectionEnd===0&&c>0){e.preventDefault();go(r,c-1);}
    else if(e.key==='ArrowRight'&&input.selectionStart===input.value.length&&c<nc-1){e.preventDefault();go(r,c+1);}
    else if(e.key==='Escape'){e.preventDefault();commit();selectCells(r,c);focusCell(r,c);}
  };
  const cellKeys=(e:React.KeyboardEvent<HTMLElement>,r:number,c:number)=>{
    if(!editable)return;const mod=e.metaKey||e.ctrlKey;
    const arrows:Record<string,[number,number]>={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]};
    if(arrows[e.key]){e.preventDefault();if(e.shiftKey&&sel){const [r1,c1]=move(sel.r1,sel.c1,...arrows[e.key],true);setSel({...sel,r1,c1,kind:'cells'});return;}const [r2,c2]=move(r,c,...arrows[e.key],true);if(sel)selectCells(r2,c2);focusCell(r2,c2);return;}
    if(e.key==='Enter'||e.key==='F2'){e.preventDefault();startEdit(r,c);return;}
    if(e.key==='Escape'){e.preventDefault();if(menu)setMenu(null);else if(sel)setSel(null);else selectCells(r,c);return;}
    if((e.key==='Delete'||e.key==='Backspace')&&sel){e.preventDefault();clearSel();return;}
    if(mod&&e.key.toLowerCase()==='b'&&sel){e.preventDefault();formatSel({b:selStyle?.b?null:true});return;}
    if(mod&&e.key.toLowerCase()==='i'&&sel){e.preventDefault();formatSel({i:selStyle?.i?null:true});return;}
    if(mod&&e.key.toLowerCase()==='c'&&sel&&selRect){e.preventDefault();copy(tableTSV(rows,selRect.r0,selRect.c0,selRect.r1,selRect.c1));return;}
    if(mod&&e.key.toLowerCase()==='a'){e.preventDefault();selectCells(0,0,nr-1,nc-1);return;}
    if(!mod&&!e.altKey&&e.key.length===1){e.preventDefault();startEdit(r,c,e.key);}
  };

  // ---- pointer selection (drag across cells; long-press on touch) ----
  const cellDown=(e:React.PointerEvent,r:number,c:number)=>{
    if(!editable||e.button>0)return;
    if(e.shiftKey){e.preventDefault();const a=sel||{r0:r,c0:c};setEdit(null);setSel({r0:a.r0,c0:a.c0,r1:r,c1:c,kind:'cells'});return;}
    dragSel.current={r,c};
    if(e.pointerType==='touch'){window.clearTimeout(longPress.current);longPress.current=window.setTimeout(()=>{dragSel.current=null;selectCells(r,c);navigator.vibrate?.(10);},450);}
  };
  const cellEnter=(r:number,c:number)=>{setHover({r,c});const d=dragSel.current;if(d&&(d.r!==r||d.c!==c)){window.clearTimeout(longPress.current);setEdit(null);setSel({r0:d.r,c0:d.c,r1:r,c1:c,kind:'cells'});}};
  useEffect(()=>{const up=()=>{dragSel.current=null;window.clearTimeout(longPress.current);};window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up);return ()=>{window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);};},[]);

  // ---- grips ----
  const grip=(axis:'row'|'column',i:number)=>{
    const open=menu?.kind===axis&&(menu as any).i===i,label=`${axis} ${i+1} options`,shown=open||(hover&&(axis==='row'?hover.r===i:hover.c===i))||(sel&&sel.kind!==(axis==='row'?'column':'row')&&(axis==='row'?inSel(i,sel.c0):inSel(sel.r0,i)))||(edit&&Number(edit.split(':')[axis==='row'?0:1])===i);
    return <button type="button" className={`nt-grip nt-grip-${axis}${shown?' is-shown':''}${open?' is-open':''}`} data-grip={`${axis}:${i}`} aria-label={label} aria-haspopup="menu" aria-expanded={open} title={`${axis==='row'?'Row '+(i+1):'Column '+letter(i)}: click for options${axis==='row'?'':', drag to move'}`}
      onPointerDown={e=>{e.stopPropagation();}}
      onClick={e=>{e.stopPropagation();if(open){setMenu(null);setSel(null);return;}setEdit(null);setSel(axis==='row'?{r0:i,r1:i,c0:0,c1:nc-1,kind:'row'}:{r0:0,r1:nr-1,c0:i,c1:i,kind:'column'});setMenu({kind:axis,i});}}
      onKeyDown={e=>{if(!e.altKey)return;const d=axis==='row'?({ArrowUp:-1,ArrowDown:1} as any)[e.key]:({ArrowLeft:-1,ArrowRight:1} as any)[e.key];if(!d)return;e.preventDefault();axisOp(()=>moveTableAxis(rows,layout,axis,i,i+d));requestAnimationFrame(()=>q(`[data-grip="${axis}:${i+d}"]`)?.focus());}}>
      <svg viewBox="0 0 10 16" width="8" height="12" aria-hidden="true">{[3,8,13].flatMap(y=>[2.5,7.5].map(x=><circle key={x+'-'+y} cx={x} cy={y} r="1.3"/>))}</svg>
    </button>;
  };

  // ---- add bars ----
  const addBar=(axis:'row'|'column')=>{const full=axis==='row'?nr>=MAX_ROWS:nc>=MAX_COLS;return <button type="button" className={`nt-add nt-add-${axis}`} aria-label={`Add ${axis}`} title={`Click to add a ${axis}, drag to add several`} disabled={full}
    onClick={e=>{e.stopPropagation();if(addDrag.current?.dragged){addDrag.current=null;return;}add(axis,1);}}
    onPointerDown={e=>{e.stopPropagation();e.preventDefault();addDrag.current={start:axis==='row'?e.clientY:e.clientX,count:1,dragged:false};e.currentTarget.setPointerCapture?.(e.pointerId);}}
    onPointerMove={e=>{const d=addDrag.current;if(!d)return;const delta=(axis==='row'?e.clientY:e.clientX)-d.start;d.dragged=d.dragged||delta>8;d.count=Math.min(Math.max(1,Math.floor(delta/(axis==='row'?36:100))+1),axis==='row'?MAX_ROWS-nr:MAX_COLS-nc);setAddCount(d.dragged?d.count:0);}}
    onPointerUp={e=>{const d=addDrag.current;if(d?.dragged)add(axis,d.count);setAddCount(0);e.currentTarget.releasePointerCapture?.(e.pointerId);}}
    onPointerCancel={()=>{addDrag.current=null;setAddCount(0);}}><span aria-hidden="true">+</span>{addCount>0&&addDrag.current?.dragged&&<small>{addCount} {axis}{addCount>1?'s':''}</small>}</button>;};

  // ---- resize ----
  const resize=(kind:'widths'|'heights',i:number)=>{const min=kind==='widths'?70:36,max=kind==='widths'?800:500,clamp=(v:number)=>Math.max(min,Math.min(max,v));
    return <span role="separator" tabIndex={0} aria-orientation={kind==='widths'?'vertical':'horizontal'} aria-valuenow={(kind==='widths'?widths:heights)[i]} className={`nt-resize nt-resize-${kind}`} aria-label={`Resize ${kind==='widths'?'column '+letter(i):'row '+(i+1)}`} title="Drag to resize · double-click to reset"
      onPointerDown={e=>{e.preventDefault();e.stopPropagation();resizeDrag.current={pointer:e.pointerId,start:kind==='widths'?e.clientX:e.clientY,value:(kind==='widths'?widths:heights)[i]};e.currentTarget.setPointerCapture(e.pointerId);}}
      onPointerMove={e=>{const d=resizeDrag.current;if(d?.pointer!==e.pointerId)return;const values=[...(kind==='widths'?widths:heights)];values[i]=clamp(d.value+(kind==='widths'?e.clientX:e.clientY)-d.start);setPreview({...layout,widths,heights,[kind]:values});}}
      onPointerUp={e=>{const d=resizeDrag.current;if(d?.pointer!==e.pointerId)return;resizeDrag.current=null;const values=[...(kind==='widths'?widths:heights)];values[i]=clamp(d.value+(kind==='widths'?e.clientX:e.clientY)-d.start);setPreview(null);persist(rows,{...tableLayout(text),widths,heights,[kind]:values});}}
      onPointerCancel={()=>{resizeDrag.current=null;setPreview(null);}}
      onDoubleClick={e=>{e.stopPropagation();const values=[...(kind==='widths'?widths:heights)];values[i]=kind==='widths'?160:36;persist(rows,{...layout,widths,heights,[kind]:values});}}
      onKeyDown={e=>{const d=({ArrowLeft:-10,ArrowUp:-10,ArrowRight:10,ArrowDown:10} as any)[e.key];if(!d)return;e.preventDefault();e.stopPropagation();const values=[...(kind==='widths'?widths:heights)];values[i]=clamp(values[i]+d);persist(rows,{...layout,widths,heights,[kind]:values});}}/>;};

  // ---- floating panels ----
  const item=(label:ReactNode,run:()=>void,opts:{danger?:boolean;disabled?:boolean;aria?:string;hint?:string}={})=><button type="button" role="menuitem" className={`nt-item${opts.danger?' is-danger':''}`} aria-label={opts.aria} disabled={opts.disabled} onClick={e=>{e.stopPropagation();run();}}>{label}{opts.hint&&<kbd>{opts.hint}</kbd>}</button>;
  const axisMenu=(axis:'row'|'column',i:number)=>{const count=axis==='row'?nr:nc,full=count>=(axis==='row'?MAX_ROWS:MAX_COLS),style=(axis==='row'?layout.rowStyle:layout.colStyle)?.[i]||{},name=axis==='row'?'row':'column';
    return <>
      <div className="nt-menu-label">{axis==='row'?`Row ${i+1}`:`Column ${letter(i)}`}</div>
      <Swatches label={`${axis==='row'?'Row':'Column'} colour`} kind="bg" value={style.bg} onPick={bg=>setLayout(styleAxis(layout,axis,i,{bg}))}/>
      {axis==='column'&&<div className="nt-seg" role="group" aria-label="Column alignment">{(['left','center','right'] as const).map(a=><button key={a} type="button" aria-label={`Align ${a}`} aria-pressed={(style.align||'left')===a} className={(style.align||'left')===a?'is-on':''} onClick={()=>setLayout(styleAxis(layout,'column',i,{align:a==='left'?null:a}))}><AlignIcon a={a}/></button>)}</div>}
      <div className="nt-sep"/>
      {axis==='column'&&item(<><Ico d="M4 6h10M4 12h7M4 18h4M18 5v14M15 16l3 3 3-3"/>Sort ascending</>,()=>axisOp(()=>sortTableByColumn(rows,layout,i,false)))}
      {axis==='column'&&item(<><Ico d="M4 6h4M4 12h7M4 18h10M18 5v14M15 8l3-3 3 3"/>Sort descending</>,()=>axisOp(()=>sortTableByColumn(rows,layout,i,true)))}
      {axis==='column'&&<div className="nt-sep"/>}
      {item(<><Ico d={axis==='row'?'M12 19V5M5 12l7-7 7 7':'M19 12H5M12 5l-7 7 7 7'}/>Insert {name} {axis==='row'?'above':'left'}</>,()=>insert(axis,i),{disabled:full})}
      {item(<><Ico d={axis==='row'?'M12 5v14M5 12l7 7 7-7':'M5 12h14M12 5l7 7-7 7'}/>Insert {name} {axis==='row'?'below':'right'}</>,()=>insert(axis,i+1),{disabled:full})}
      {item(<><Ico d="M8 8h11v11H8zM5 16V5h11"/>Duplicate</>,()=>axisOp(()=>duplicateTableAxis(rows,layout,axis,i)),{disabled:full})}
      {item(<><Ico d={axis==='row'?'M12 19V5M7 10l5-5 5 5':'M19 12H5M10 7l-5 5 5 5'}/>Move {axis==='row'?'up':'left'}</>,()=>axisOp(()=>moveTableAxis(rows,layout,axis,i,i-1),axis==='row'?{r0:i-1,r1:i-1,c0:0,c1:nc-1,kind:'row'}:{r0:0,r1:nr-1,c0:i-1,c1:i-1,kind:'column'}),{disabled:i===0,hint:axis==='row'?'Alt ↑':'Alt ←'})}
      {item(<><Ico d={axis==='row'?'M12 5v14M7 14l5 5 5-5':'M5 12h14M14 7l5 5-5 5'}/>Move {axis==='row'?'down':'right'}</>,()=>axisOp(()=>moveTableAxis(rows,layout,axis,i,i+1),axis==='row'?{r0:i+1,r1:i+1,c0:0,c1:nc-1,kind:'row'}:{r0:0,r1:nr-1,c0:i+1,c1:i+1,kind:'column'}),{disabled:i===count-1,hint:axis==='row'?'Alt ↓':'Alt →'})}
      {item(<><Ico d="M5 7h14M10 11v6M14 11v6M6 7l1 12h10l1-12"/>Clear contents</>,()=>{const next=rows.map((row,r)=>row.map((v,c)=>(axis==='row'?r:c)===i?'':v));persist(next);setMenu(null);})}
      <div className="nt-sep"/>
      {item(<><Ico d="M6 6l12 12M18 6L6 18"/>Delete {name}</>,()=>axisOp(()=>deleteTableAxis(rows,layout,axis,i)),{danger:true,disabled:count<=1,aria:`Delete ${axis} ${i+1}`})}
    </>;};
  const tableMenu=()=><>
    <div className="nt-menu-label">Table</div>
    {([['header','Header row'],['headerCol','Header column'],['striped','Striped rows']] as const).map(([k,label])=><button key={k} type="button" role="menuitemcheckbox" aria-checked={!!layout[k]} className="nt-item nt-toggle" onClick={()=>setLayout({...layout,[k]:layout[k]?undefined:true})}>{label}<span className={`nt-switch${layout[k]?' is-on':''}`} aria-hidden="true"/></button>)}
    <div className="nt-sep"/>
    <div className="nt-menu-label">Borders</div>
    <div className="nt-borders" role="group" aria-label="Border style">{TABLE_BORDERS.map(b=><button key={b} type="button" aria-pressed={(layout.border||'all')===b} className={(layout.border||'all')===b?'is-on':''} onClick={()=>setLayout({...layout,border:b==='all'?undefined:b})}><BorderIcon b={b}/><span>{colorLabel(b)}</span></button>)}</div>
    <Swatches label="Border colour" kind="border" value={layout.borderColor} onPick={c=>setLayout({...layout,borderColor:c||undefined})}/>
    <div className="nt-sep"/>
    {item(<><Ico d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/>Fit columns to content</>,()=>{const fit=rows[0].map((_,c)=>Math.max(90,Math.min(420,Math.max(...rows.map((row,r)=>(row[c]===''?'':displayCell(rows,r,c)).length))*8+28)));setLayout({...layout,widths:fit});})}
    {item(<><Ico d="M9 4h10v12H9zM5 8v12h10"/>Copy as Markdown</>,()=>{copy(tableMarkdown(rows));setMenu(null);})}
    {item(<><Ico d="M4 4l16 16M9 5h10v10M5 9v10h10"/>Clear all formatting</>,()=>{const {widths:w,heights:h}=layout;setLayout({...(w?{widths:w}:{}),...(h?{heights:h}:{})});})}
  </>;
  const formatBar=()=>{const s=selStyle||{} as any,kindLabel=sel?.kind==='row'?'row':sel?.kind==='column'?'column':(selRect&&(selRect.r1>selRect.r0||selRect.c1>selRect.c0))?`${(selRect.r1-selRect.r0+1)*(selRect.c1-selRect.c0+1)} cells`:'cell';
    return <div className="nt-bar" role="toolbar" aria-label={`Format ${kindLabel}`}>
      <button type="button" className={`nt-bar-btn${menu?.kind==='bg'?' is-on':''}`} aria-label="Background colour" aria-expanded={menu?.kind==='bg'} onClick={()=>setMenu(menu?.kind==='bg'?null:{kind:'bg'})}><span className="nt-chip" data-color={s.bg||undefined}/><span className="nt-bar-text">Colour</span><Chevron/></button>
      <button type="button" className={`nt-bar-btn${menu?.kind==='fg'?' is-on':''}`} aria-label="Text colour" aria-expanded={menu?.kind==='fg'} onClick={()=>setMenu(menu?.kind==='fg'?null:{kind:'fg'})}><span className="nt-text-chip" data-color={s.fg||undefined}>A</span><Chevron/></button>
      <span className="nt-bar-sep"/>
      <button type="button" className={`nt-bar-btn${s.b?' is-on':''}`} aria-label="Bold" aria-pressed={!!s.b} title="Bold (Ctrl+B)" onClick={()=>formatSel({b:s.b?null:true})}><b>B</b></button>
      <button type="button" className={`nt-bar-btn${s.i?' is-on':''}`} aria-label="Italic" aria-pressed={!!s.i} title="Italic (Ctrl+I)" onClick={()=>formatSel({i:s.i?null:true})}><i style={{fontFamily:'Georgia,serif'}}>I</i></button>
      <span className="nt-bar-sep"/>
      {(['left','center','right'] as const).map(a=><button key={a} type="button" className={`nt-bar-btn${(s.align||'left')===a?' is-on':''}`} aria-label={`Align ${a}`} aria-pressed={(s.align||'left')===a} onClick={()=>formatSel({align:a==='left'?null:a})}><AlignIcon a={a}/></button>)}
      <span className="nt-bar-sep"/>
      <button type="button" className={`nt-bar-btn${menu?.kind==='border'?' is-on':''}`} aria-label="Table borders" aria-expanded={menu?.kind==='border'} title="Table borders" onClick={()=>setMenu(menu?.kind==='border'?null:{kind:'border'})}><BorderIcon b={layout.border||'all'}/></button>
      <button type="button" className="nt-bar-btn" aria-label="Clear cells" title="Clear contents (Delete)" onClick={clearSel}><Ico d="M5 7h14M10 11v6M14 11v6M6 7l1 12h10l1-12"/></button>
      {menu&&['bg','fg','border'].includes(menu.kind)&&<div className="nt-bar-pop">
        {menu.kind==='bg'&&<Swatches label="Background colour" kind="bg" value={s.bg} onPick={bg=>formatSel({bg})}/>}
        {menu.kind==='fg'&&<Swatches label="Text colour" kind="fg" value={s.fg} onPick={fg=>formatSel({fg})}/>}
        {menu.kind==='border'&&<><div className="nt-borders" role="group" aria-label="Border style">{TABLE_BORDERS.map(b=><button key={b} type="button" aria-pressed={(layout.border||'all')===b} className={(layout.border||'all')===b?'is-on':''} onClick={()=>setLayout({...layout,border:b==='all'?undefined:b})}><BorderIcon b={b}/><span>{colorLabel(b)}</span></button>)}</div><Swatches label="Border colour" kind="border" value={layout.borderColor} onPick={c=>setLayout({...layout,borderColor:c||undefined})}/></>}
      </div>}
    </div>;};

  const showLetters=editable&&!!edit&&((draft&&draft.key===edit?draft.value:rows[Number(edit.split(':')[0])]?.[Number(edit.split(':')[1])])||'').startsWith('=');
  const axisMenuOpen=menu&&(menu.kind==='row'||menu.kind==='column'||menu.kind==='table');
  const barOpen=!!sel&&!axisMenuOpen;
  const tableStyle={width:widths.reduce((a,b)=>a+b,0),tableLayout:'fixed'} as CSSProperties;

  return <div ref={root} className={`note-table nt${editable?' is-editable':''}${layout.striped?' is-striped':''}${sel?' has-selection':''}${showLetters?' show-letters':''}`} data-border={layout.border||'all'} data-border-color={layout.borderColor||undefined}
    onClick={e=>e.stopPropagation()} onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'&&menu){setMenu(null);}}}
    onPointerLeave={()=>setHover(null)}>
    {editable&&<button type="button" className={`nt-corner${menu?.kind==='table'?' is-open':''}`} aria-label="Table options" aria-haspopup="menu" aria-expanded={menu?.kind==='table'} title="Table options" onClick={e=>{e.stopPropagation();setSel(null);setMenu(menu?.kind==='table'?null:{kind:'table'});}}>
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4"/><path d="M1.5 6.5h13M6 6.5v7" stroke="currentColor" strokeWidth="1.4"/></svg></button>}
    <div className="nt-scroll">
      <div className="nt-frame">
        <table style={tableStyle}>
          <colgroup>{widths.map((w,c)=><col key={c} style={{width:w}}/>)}</colgroup>
          {showLetters&&<thead><tr>{rows[0].map((_,c)=><th key={c} scope="col">{letter(c)}</th>)}</tr></thead>}
          <tbody>{rows.map((row,r)=><tr key={r} style={{height:heights[r]}} className={layout.header&&r===0?'is-header':undefined}>{row.map((v,c)=>{
            const st=cellStyle(layout,r,c),key=`${r}:${c}`,editing=editable&&edit===key,head=(layout.header&&r===0)||(layout.headerCol&&c===0),selected=inSel(r,c);
            const edges=selected&&selRect?[r===selRect.r0&&'t',r===selRect.r1&&'b',c===selRect.c0&&'l',c===selRect.c1&&'r'].filter(Boolean).join(''):undefined;
            return <td key={c} data-td={key} style={{height:heights[r],textAlign:st.align}} data-bg={st.bg} data-fg={st.fg}
              className={[head&&'is-head',selected&&'is-selected',editing&&'is-editing',st.b&&'is-bold',st.i&&'is-italic'].filter(Boolean).join(' ')||undefined} data-edges={edges}
              onPointerDown={e=>cellDown(e,r,c)} onPointerEnter={()=>cellEnter(r,c)}>
              {editing?<input data-cell={key} aria-label={`Cell ${letter(c)}${r+1}`} defaultValue={draft?.key===key?draft.value:v} key={key+'|'+v} autoFocus
                onFocus={e=>{if(draft?.key===key){const n=e.currentTarget.value.length;e.currentTarget.setSelectionRange(n,n);}}}
                onChange={e=>{if(e.target.value.startsWith('=')!==(draft?.value||v).startsWith('='))setDraft({key,value:e.target.value});}}
                onBlur={e=>{const value=e.target.value;setEdit(cur=>cur===key?null:cur);setDraft(null);save(r,c,value);}}
                onKeyDown={e=>editKeys(e,r,c)}
                onPaste={e=>{const data=e.clipboardData?.getData('text/plain')||'';if(parseClipboardGrid(data)){e.preventDefault();setEdit(null);pasteGrid(r,c,data);}}}/>
              :<span data-cell={key} role={editable?'button':undefined} tabIndex={editable?0:undefined} aria-label={`Edit cell ${letter(c)}${r+1}`} title={v.startsWith('=')?v:undefined}
                onClick={e=>{if(!editable||e.shiftKey)return;if(isTouch()&&sel&&inSel(r,c))return;startEdit(r,c);}}
                onKeyDown={e=>cellKeys(e,r,c)}
                onPaste={e=>{const data=e.clipboardData?.getData('text/plain')||'';if(pasteGrid(r,c,data))e.preventDefault();else if(data){e.preventDefault();save(r,c,data);}}}
                onCopy={e=>{if(sel&&selRect){e.preventDefault();e.clipboardData.setData('text/plain',tableTSV(rows,selRect.r0,selRect.c0,selRect.r1,selRect.c1));}}}>{v===''?'':displayCell(rows,r,c)}</span>}
              {editable&&r===0&&grip('column',c)}
              {editable&&c===0&&grip('row',r)}
              {editable&&resize('widths',c)}
              {editable&&c===0&&resize('heights',r)}
            </td>;})}</tr>)}</tbody>
        </table>
        {editable&&addBar('column')}
        {editable&&addBar('row')}
      </div>
    </div>
    {(axisMenuOpen||barOpen)&&<div ref={floating} className={axisMenuOpen?'nt-menu':'nt-floating'} role={axisMenuOpen?'menu':undefined} aria-label={axisMenuOpen?(menu!.kind==='table'?'Table options':`${(menu as any).kind} ${(menu as any).i+1} menu`):undefined}
      style={{position:'fixed',left:pos?.left??-9999,top:pos?.top??-9999,visibility:pos?'visible':'hidden'}}
      onPointerDown={e=>{e.stopPropagation();if((e.target as HTMLElement).closest('button'))e.preventDefault();}}>
      {menu?.kind==='row'&&axisMenu('row',menu.i)}
      {menu?.kind==='column'&&axisMenu('column',menu.i)}
      {menu?.kind==='table'&&tableMenu()}
      {barOpen&&formatBar()}
    </div>}
  </div>;
}

function Ico({d}:{d:string}){return <svg className="nt-ico" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;}
function Chevron(){return <svg viewBox="0 0 10 10" width="8" height="8" aria-hidden="true"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>;}
function AlignIcon({a}:{a:'left'|'center'|'right'}){const lines=a==='left'?['M4 6h16','M4 12h10','M4 18h13']:a==='center'?['M4 6h16','M7 12h10','M5.5 18h13']:['M4 6h16','M10 12h10','M7 18h13'];return <svg className="nt-ico" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">{lines.map(d=><path key={d} d={d} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>)}</svg>;}
function BorderIcon({b}:{b:string}){const outer=b==='all'||b==='outer',inner=b==='all',rows=b==='all'||b==='rows';return <svg className="nt-ico" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
  <rect x="3.5" y="4.5" width="17" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" opacity={outer?1:.25} strokeDasharray={outer?undefined:'2 2'}/>
  <path d="M3.5 9.5h17M3.5 14.5h17" stroke="currentColor" strokeWidth="1.4" opacity={rows?1:.25} strokeDasharray={rows?undefined:'2 2'}/>
  <path d="M12 4.5v15" stroke="currentColor" strokeWidth="1.4" opacity={inner?1:.25} strokeDasharray={inner?undefined:'2 2'}/></svg>;}
