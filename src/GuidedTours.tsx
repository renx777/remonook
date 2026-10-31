import {useEffect,useRef,useState} from 'react';
import type {Driver,DriveStep} from 'driver.js';
import {ImageDialog} from './ImageTools';
import {Icon} from './icons';
import {guideCatalog,guideSteps,readGuideProgress,writeGuideProgress} from './guided-tours.mjs';
import './guided-tours.css';
type GuideStep={title:string;description:string;target:string;prepare:string};
const storage=()=>{try{return window.localStorage;}catch{return null;}};
const loadDriver=async()=>{const [engine]=await Promise.all([import('driver.js'),import('driver.js/dist/driver.css')]);return engine;};
export function GuidedTours({open,onOpenChange,account,signedIn,onNavigate,onBulletMenu,onCloseMenus,load=loadDriver}:{open:boolean;onOpenChange:(open:boolean)=>void;account:string;signedIn:boolean;onNavigate:(tab:string)=>Promise<void>|void;onBulletMenu:()=>boolean;onCloseMenus:()=>void;load?:typeof loadDriver}){
 const [progress,setProgress]=useState<Record<string,string>>(()=>readGuideProgress(storage(),account)),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const current=useRef<Driver|null>(null),alive=useRef(true),generation=useRef(0),moving=useRef(false),origin=useRef<HTMLElement|null>(null),activeId=useRef(''),outcome=useRef('skipped'),plan=useRef<GuideStep[]>([]),status=useRef(progress),frame=useRef(0);
 const callbacks=useRef({onOpenChange,onNavigate,onBulletMenu,onCloseMenus});callbacks.current={onOpenChange,onNavigate,onBulletMenu,onCloseMenus};
 const remember=()=>{const next={...status.current,[activeId.current]:status.current[activeId.current]==='done'?'done':outcome.current};status.current=next;setProgress(next);if(!writeGuideProgress(storage(),account,next))setError('This browser could not remember guide progress. You can still replay every guide.');};
 const restore=()=>{const target=origin.current?.isConnected&&origin.current.getClientRects().length?origin.current:[...document.querySelectorAll<HTMLElement>('[data-guide-help]')].find(el=>el.getClientRects().length>0);target?.focus({preventScroll:true});};
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;cancelAnimationFrame(frame.current);current.current?.destroy();current.current=null;document.querySelector('[data-tour-active-bullet]')?.removeAttribute('data-tour-active-bullet');};},[]);
 const visible=(selector:string)=>[...document.querySelectorAll<HTMLElement>(selector)].find(el=>el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden');
 const wait=async(selector:string,token:number)=>{const until=Date.now()+4000;while(alive.current&&generation.current===token){const found=visible(selector);if(found)return found;if(Date.now()>until)throw Error('This part of the workspace is not available right now. Close any open editor and try the guide again.');await new Promise(resolve=>setTimeout(resolve,40));}throw Error('cancelled');};
 const prepare=async(step:GuideStep,token:number)=>{
  if(step.prepare==='reader')return wait(step.target,token);
  if(['notes','bookshelf','study','bullet'].includes(step.prepare)){
   callbacks.current.onCloseMenus();await callbacks.current.onNavigate(step.prepare==='bullet'?'notes':step.prepare);
   await wait(step.prepare==='bookshelf'?'.bookshelf':step.prepare==='study'?'.study-desk':'.outline-scroll',token);
   if(step.prepare==='bullet'&&!callbacks.current.onBulletMenu())throw Error('Add a note, then replay this guide to explore its actions.');
  }
  if(['bullet-menu','insert'].includes(step.prepare)){
   if(!visible('.outline-scroll')){await callbacks.current.onNavigate('notes');await wait('.outline-scroll',token);}
   if(!visible('[data-tour-active-bullet]')&&!callbacks.current.onBulletMenu())throw Error('Add a note, then replay this guide to explore its actions.');
   if(!visible('.bullet-actions-menu'))(await wait('[data-tour-active-bullet]',token)).click();
  }
  if(step.prepare==='bullet-menu'&&!visible(step.target)&&visible('.bullet-category-back'))visible('.bullet-category-back')?.click();
  if(step.prepare==='insert'){
   if(!visible('[data-tour="create-diagram"]'))(await wait('[data-tour="insert-category"]',token)).click();
  }
  return wait(step.target,token);
 };
 const end=(result='skipped',record=true)=>{const tour=current.current;current.current=null;generation.current++;moving.current=false;outcome.current=result;cancelAnimationFrame(frame.current);tour?.destroy();callbacks.current.onCloseMenus();document.querySelector('[data-tour-active-bullet]')?.removeAttribute('data-tour-active-bullet');if(alive.current){setLoading(false);if(record)remember();frame.current=requestAnimationFrame(restore);}};
 const go=async(index:number)=>{
  if(moving.current||!current.current)return;moving.current=true;const token=generation.current;
  try{await prepare(plan.current[index],token);if(alive.current&&generation.current===token)current.current?.drive(index);}catch(e){if(alive.current&&generation.current===token){end('skipped',false);setError((e as Error).message);callbacks.current.onOpenChange(true);}}finally{moving.current=false;}
 };
 const complete=()=>end('done');
 useEffect(()=>{
  const keyboard=(event:KeyboardEvent)=>{if(!current.current?.isActive())return;
   if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();end();return;}
   if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();const i=current.current.getActiveIndex()||0;if(event.key==='ArrowRight'){if(i===plan.current.length-1)complete();else void go(i+1);}else if(i>0)void go(i-1);return;}
   if(event.key==='Tab'){const wrapper=document.querySelector<HTMLElement>('.remo-tour'),buttons=[...(wrapper?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href]')||[])].filter(el=>el.getClientRects().length>0);if(buttons.length){const i=buttons.indexOf(document.activeElement as HTMLElement);event.preventDefault();event.stopImmediatePropagation();buttons[(i+(event.shiftKey?-1:1)+buttons.length)%buttons.length]?.focus();}}
  };
  const motion=window.matchMedia?.('(prefers-reduced-motion: reduce)'),reduce=()=>{if(current.current)current.current.setConfig({...current.current.getConfig(),animate:!motion?.matches,smoothScroll:false});};
  window.addEventListener('keydown',keyboard,true);motion?.addEventListener?.('change',reduce);
  return()=>{window.removeEventListener('keydown',keyboard,true);motion?.removeEventListener?.('change',reduce);};
 },[]);
 const close=()=>{if(current.current)end();else{generation.current++;setLoading(false);}onOpenChange(false);};
 const start=async(id:string)=>{
  if(document.querySelector('.book-reader[open]')&&id!=='reading'){setError('Return to the workspace to start study or visual walkthroughs.');return;}
  if(loading||current.current)return;setLoading(true);setError('');origin.current=document.activeElement as HTMLElement;activeId.current=id;outcome.current='skipped';const token=++generation.current;let loaded=false;
  try{const engine=await load();loaded=true;if(!alive.current||generation.current!==token)return;
   const reader=!!document.querySelector('.book-reader[open]'),pdf=!!document.querySelector('.book-reader [aria-label="Search and contents"]');
   if(id!=='reading'){await callbacks.current.onNavigate('notes');await wait('.outline-scroll',token);}
   plan.current=guideSteps(id,{reader,pdf,hasNotes:!!document.querySelector('.outline-row[data-node-id]'),signedIn});
   callbacks.current.onOpenChange(false);
   current.current=engine.driver({animate:!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,duration:180,smoothScroll:false,allowClose:true,allowKeyboardControl:false,disableActiveInteraction:true,overlayOpacity:.38,overlayClickBehavior:'none',stagePadding:7,stageRadius:10,popoverClass:'remo-tour',showProgress:true,progressText:'{{current}} of {{total}}',nextBtnText:'Next',prevBtnText:'Back',doneBtnText:'Finish',closeBtnLabel:'Skip walkthrough',onCloseClick:()=>end(),
    onPopoverRender:(popover)=>{const app=document.querySelector('.app');if(app){const style=getComputedStyle(app);for(const name of ['--bg','--panel','--text','--muted','--line','--accent','--soft'])popover.wrapper.style.setProperty(name,style.getPropertyValue(name));}popover.wrapper.setAttribute('aria-modal','true');cancelAnimationFrame(frame.current);frame.current=requestAnimationFrame(()=>{const reader=document.querySelector('.book-reader[open]'),overlay=document.querySelector('.driver-overlay');if(reader&&overlay&&!reader.contains(overlay))reader.append(overlay);popover.nextButton.focus({preventScroll:true});});},
    steps:plan.current.map((step,i):DriveStep=>({element:()=>visible(step.target)!,popover:{title:step.title,description:step.description,side:'bottom',align:'start',onNextClick:()=>void go(i+1),onPrevClick:()=>void go(i-1),onDoneClick:complete}})),
   });await go(0);
  }catch(e){if(alive.current&&generation.current===token){setError(loaded?(e as Error).message:'The walkthrough could not load. Check your connection and try again.');callbacks.current.onOpenChange(true);}}finally{if(alive.current&&generation.current===token)setLoading(false);}
 };
 if(!open)return null;const inReader=!!document.querySelector('.book-reader[open]');
 return <ImageDialog title="Show me how" className="guided-help" onClose={close}><p className="guided-intro">A few steps to find your way. Choose a guide and go at your own pace.</p><div className="guided-catalog">{guideCatalog.map((guide:any)=><button key={guide.id} disabled={loading||inReader&&guide.id!=='reading'} onClick={()=>void start(guide.id)}><span className="guided-icon"><Icon name={guide.icon} size={22}/></span><span><strong>{guide.title}</strong><small>{guide.detail}</small><em>{loading&&activeId.current===guide.id?'Opening…':progress[guide.id]==='done'?'Completed · Replay':progress[guide.id]==='skipped'?'Replay walkthrough':'Start walkthrough'}</em></span><Icon name="forward" size={17}/></button>)}</div>{error&&<p className="guided-error" role="alert">{error}</p>}<p className="guided-footnote">{inReader&&<>For study and visual walkthroughs, return to your workspace first. </>}Optional, always skippable. Walkthroughs open views and menus; your notes and study progress stay as they are. Guide progress is remembered in this browser.</p><a className="guided-link" href="/guides" target="_blank" rel="noopener noreferrer">Read the feature guides <Icon name="forward" size={14}/></a></ImageDialog>;
}
