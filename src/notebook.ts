import {useEffect,useState} from 'react';
import './notebook-fonts.css';
import './notebook.css';

/* Notebook theme: per-device appearance (localStorage), never synced. Off by default; turning it off
   restores the normal look exactly, because every rule is scoped under .app.notebook. */
export type NotebookPaper='ruled'|'dotted'|'plain';
export type NotebookFont='caveat'|'kalam'|'patrick'|'neat';
export type NotebookInk='blue'|'black'|'graphite'|'green';
export type Notebook={on:boolean;paper:NotebookPaper;font:NotebookFont;ink:NotebookInk;margin:boolean};
export const NOTEBOOK_DEFAULT:Notebook={on:false,paper:'ruled',font:'caveat',ink:'blue',margin:true};
const KEY='remo-notebook';
/** Handwriting fonts (self-hosted, SIL OFL). `scale` keeps their visible size close to normal text. */
export const NOTEBOOK_FONTS:Record<NotebookFont,{label:string;family:string|null;scale:number;sample:string}>={
  caveat:{label:'Caveat',family:"Caveat, 'Segoe Print', cursive",scale:1.32,sample:'Quick pen'},
  kalam:{label:'Kalam',family:"Kalam, 'Segoe Print', cursive",scale:1,sample:'Neat, rounded · हिन्दी'},
  patrick:{label:'Patrick Hand',family:"'Patrick Hand', 'Segoe Print', cursive",scale:1.12,sample:'Clean print'},
  neat:{label:'Neat',family:null,scale:1,sample:'Your normal font'},
};
/** Ink colours: [on light paper, on dark paper]. */
export const NOTEBOOK_INKS:Record<NotebookInk,{label:string;light:string;dark:string}>={
  blue:{label:'Blue',light:'#23418c',dark:'#a8bdf5'},
  black:{label:'Black',light:'#1f1f22',dark:'#ecebe8'},
  graphite:{label:'Graphite',light:'#55565b',dark:'#c3c3c8'},
  green:{label:'Green',light:'#1f6b4a',dark:'#94d6b3'},
};
const valid=(v:any):Notebook=>{
  const n={...NOTEBOOK_DEFAULT,...(v&&typeof v==='object'?v:{})};
  return {on:n.on===true,paper:['ruled','dotted','plain'].includes(n.paper)?n.paper:'ruled',font:n.font in NOTEBOOK_FONTS?n.font:'caveat',ink:n.ink in NOTEBOOK_INKS?n.ink:'blue',margin:n.margin!==false};
};
export function readNotebook():Notebook{try{return valid(JSON.parse(localStorage.getItem(KEY)||'null'));}catch{return {...NOTEBOOK_DEFAULT};}}
export function useNotebook():[Notebook,(patch:Partial<Notebook>)=>void]{
  const [nb,setNb]=useState<Notebook>(readNotebook);
  useEffect(()=>{const sync=(e:StorageEvent)=>{if(e.key===KEY)setNb(readNotebook());};window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);},[]);
  const update=(patch:Partial<Notebook>)=>setNb(prev=>{const next=valid({...prev,...patch});try{localStorage.setItem(KEY,JSON.stringify(next));}catch{/* storage unavailable: keep for this session */}return next;});
  return [nb,update];
}
/** One ruled line: a little more than normal line spacing, so handwriting has room. */
export const notebookLine=(readingSize:number)=>Math.round(readingSize*1.8);

export type NotebookMetrics={base:number;dot:number;key:string};
/** Where text sits in a line of height `line`: the baseline (for the rule) and the middle of the lowercase letters (for the bullet). */
export function measureNotebook(family:string,px:number,line:number):NotebookMetrics|null{
  try{
    const ctx=document.createElement('canvas').getContext('2d');if(!ctx)return null;
    ctx.font=`${px}px ${family}`;
    const m=ctx.measureText('Hxgy'),asc=m.fontBoundingBoxAscent,desc=m.fontBoundingBoxDescent;
    if(!Number.isFinite(asc)||!Number.isFinite(desc)||asc<=0)return null;
    const base=(line-(asc+desc))/2+asc,x=ctx.measureText('x').actualBoundingBoxAscent||px*.45;
    return {base:Math.round(base*10)/10,dot:Math.round((base-x/2)*10)/10,key:`${family}|${px}|${line}`};
  }catch{return null;}
}
/** Metrics for the current settings, re-measured once the handwriting font has loaded. */
export function useNotebookMetrics(nb:Notebook,readingSize:number,normalFamily:string){
  const line=notebookLine(readingSize),font=NOTEBOOK_FONTS[nb.font],family=font.family||normalFamily,px=Math.round(readingSize*font.scale*10)/10;
  const [metrics,setMetrics]=useState<NotebookMetrics|null>(null);
  useEffect(()=>{
    if(!nb.on){setMetrics(null);return;}
    let live=true;const run=()=>{if(live)setMetrics(measureNotebook(family,px,line));};
    run();
    (document as any).fonts?.load?.(`${px}px ${family.split(',')[0]}`).then(run,run);
    return()=>{live=false;};
  },[nb.on,family,px,line]);
  return {line,px,family,metrics};
}
