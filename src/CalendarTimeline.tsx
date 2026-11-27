import {useMemo,useRef,useState,useLayoutEffect} from 'react';
import type {Workspace} from './data';
import {timelineItems,timelineLayout,clockMinutes,clockTime,snapMinute,changeTimelineItem} from './calendar-timeline.mjs';
type Item={id:string;source:string;type:string;title:string;time:string;minutes:number};
export function CalendarTimeline({doc,date,disabled,onChange}:{doc:Workspace;date:string;disabled:boolean;onChange:(update:(doc:Workspace)=>Workspace)=>void}){
 const items=useMemo(()=>timelineLayout(timelineItems(doc,date)),[doc.tables.bullets,doc.web.calendarEvents,date]);
 const [error,setError]=useState(''),[editing,setEditing]=useState<Item|null>(null),[time,setTime]=useState('09:00'),[minutes,setMinutes]=useState('30'),[preview,setPreview]=useState<{id:string;value:number;resize:boolean}|null>(null);
 const scroll=useRef<HTMLDivElement>(null),positioned=useRef('');
 useLayoutEffect(()=>{if(!scroll.current||positioned.current===date)return;scroll.current.scrollTop=items.length?Math.max(0,Math.min(...items.map((i:any)=>i.start))-60):8*60;if(items.length)positioned.current=date;},[date,items.length]);
 const gesture=useRef<{item:Item;y:number;base:number;resize:boolean;value:number}|null>(null);
 const change=(item:Item,patch:{time?:string;minutes?:number})=>{try{onChange(d=>changeTimelineItem(d,item,patch));setError('');return true;}catch(e){setError(e instanceof Error?e.message:String(e));return false;}};
 const open=(item:Item)=>{setEditing(item);setTime(item.time);setMinutes(String(item.minutes||30));setError('');};
 const pointer=(item:Item,resize:boolean)=>({
  onPointerDown:(e:React.PointerEvent<HTMLButtonElement>)=>{if(disabled||e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);const base=resize?item.minutes||30:clockMinutes(item.time);gesture.current={item,y:e.clientY,base,resize,value:base};setPreview({id:item.id,value:base,resize});},
  onPointerMove:(e:React.PointerEvent<HTMLButtonElement>)=>{const g=gesture.current;if(!g)return;const v=g.resize?Math.max(5,Math.min(1440,Math.round((g.base+e.clientY-g.y)/5)*5)):snapMinute(g.base+e.clientY-g.y);g.value=v;setPreview({id:item.id,value:v,resize:g.resize});},
  onPointerUp:(e:React.PointerEvent<HTMLButtonElement>)=>{const g=gesture.current;gesture.current=null;setPreview(null);if(!g)return;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);if(g.value!==g.base)change(g.item,g.resize?{minutes:g.value}:{time:clockTime(g.value)});},
  onPointerCancel:()=>{gesture.current=null;setPreview(null);},onLostPointerCapture:()=>{gesture.current=null;setPreview(null);},
  onKeyDown:(e:React.KeyboardEvent<HTMLButtonElement>)=>{if(!['ArrowUp','ArrowDown'].includes(e.key)||disabled)return;e.preventDefault();const delta=(e.key==='ArrowUp'?-1:1)*(e.shiftKey?15:5);change(item,resize?{minutes:Math.max(5,Math.min(1440,(item.minutes||30)+delta))}:{time:clockTime(snapMinute(clockMinutes(item.time)+delta))});}
 });
 return <div className="calendar-timeline"><p className="timeline-help">Move with the grip or ↑/↓ keys. Shift changes 15 minutes. Edit times for precise control.</p>{error&&<p role="alert">{error}</p>}
 {editing&&<form className="timeline-editor" aria-label="Edit timeline item" onSubmit={e=>{e.preventDefault();if(!disabled&&change(editing,{time,...(editing.type==='task'?{minutes:Number(minutes)}:{})}))setEditing(null);}}><strong>{editing.title}</strong><label>Start time<input aria-label="Timeline start time" type="time" required value={time} onChange={e=>setTime(e.target.value)}/></label>{editing.type==='task'&&<label>Block minutes<input aria-label="Timeline block minutes" type="number" min="0" max="1440" required value={minutes} onChange={e=>setMinutes(e.target.value)}/></label>}<button disabled={disabled}>Save time</button><button type="button" onClick={()=>setEditing(null)}>Cancel</button></form>}
 <div ref={scroll} className="timeline-scroll" tabIndex={0} aria-label="Day timeline"><div className="timeline-axis" style={{minWidth:Math.max(240,...items.map((i:any)=>i.lanes*168+48))}}>
 {Array.from({length:24},(_,hour)=><div key={hour} className="timeline-hour" style={{top:hour*60}}><span>{String(hour).padStart(2,'0')}:00</span></div>)}
 <div className="timeline-events">{items.map((item:any)=>{const p=preview?.id===item.id?preview:null,start=p&&!p.resize?p.value:item.start,duration=p?.resize?p.value:item.minutes;return <article className={'timeline-block '+item.type+(item.done?' is-complete':'')} key={item.id} style={{top:start,height:Math.max(48,Math.min(1440-start,duration||48)),left:`${item.lane*100/item.lanes}%`,width:`${100/item.lanes}%`}}>
 <button className="timeline-move" aria-label={'Move '+item.title} title="Drag or use arrow keys to move" disabled={disabled} {...pointer(item,false)}>⠿</button><button className="timeline-title" onClick={()=>open(item)} aria-label={'Edit time for '+item.title}><span>{item.title}</span><small>{clockTime(start)}{item.type==='task'&&duration?' · '+duration+' min':''}{start+duration>1440?' · continues tomorrow':''}</small></button>
 {item.type==='task'&&<button className="timeline-resize" aria-label={'Resize '+item.title} title="Drag or use arrow keys to resize" disabled={disabled} {...pointer(item,true)}>↕</button>}</article>;})}</div>
 </div></div>{!items.length&&<p className="timeline-help">Set a start time in Tasks → Plan or add a timed reminder to see it here.</p>}
 </div>;
}
