// Bounded, offline launcher presentation. No network calls or workspace writes here.
import {bullet,index} from './domain.mjs';
import {displayText,notePath} from './relations.mjs';
import {contentDigest} from './content-digest.mjs';
import {calendarEvents,eventsOnDate,localDate,completeCalendarEvent,eventOnDate,validEventDate} from './calendar-events.mjs';
import {dashboard,updateWidget,timerDuration,timerRemaining,finishTimer} from './dashboard.mjs';
import {withNodes} from './workspace-nodes.mjs';

export function widgetLabel(value,limit){
 let text='',bytes=0;
 for(const char of String(value||'')){const n=new TextEncoder().encode(char).length;if(bytes+n>limit)break;text+=char;bytes+=n;}
 return text;
}
const digest=value=>contentDigest(JSON.stringify(value));
function isStudyContent(doc,node,byId){
 const seen=new Set();
 while(node&&!seen.has(node.id)){
  seen.add(node.id);
  if(node.kind==='QUESTION'||node.kind==='ANSWER'||doc.web?.mcqs?.[node.id]||doc.web?.occlusions?.[node.id])return true;
  node=byId.get(node.parentId);
 }
 return false;
}
export function widgetToday(doc,now=Date.now()){
 const date=localDate(new Date(now)),nodes=doc.tables.bullets,byId=new Map(nodes.map(n=>[n.id,n]));
 const journal=n=>{const seen=new Set();while(n&&!seen.has(n.id)){seen.add(n.id);if(n.journalDate===date||n.id==='journal-'+date)return true;n=byId.get(n.parentId);}return false;};
 const bullets=nodes.filter(n=>!n.mirrorSourceId&&!isStudyContent(doc,n,byId)&&displayText(n.text).trim()&&n.id!=='journal-'+date&&!n.journalDate&&(n.dueDate===date||journal(byId.get(n.parentId))));
 const result=eventsOnDate(calendarEvents(doc),date).map(e=>({id:'reminder:'+e.id,text:widgetLabel(e.title,200),time:e.time,done:e.completed.includes(date),date,fingerprint:digest([e.title,e.date,e.time,e.repeat,e.kind])}));
 for(const n of bullets){result.push({id:'bullet:'+n.id,text:widgetLabel(displayText(n.text),200),time:'',done:n.taskState==='DONE',date,fingerprint:digest([n.text,n.formatting,n.parentId,n.dueDate])});}
 return result.sort((a,b)=>Number(a.done)-Number(b.done)||(a.time||'99:99').localeCompare(b.time||'99:99')||a.id.localeCompare(b.id)).slice(0,8);
}
export function widgetFocus(doc,now=Date.now()){
 const widgets=Object.values(dashboard(doc).widgets).filter(w=>w.kind==='focus'&&!w.removed);
 const w=widgets.find(w=>w.timer?.running&&w.timer.endsAt>now)||widgets[0];
 if(!w)return null;
 return {id:w.id,duration:Math.ceil(w.timer?.duration||timerDuration(w,w.timer?.mode||'focus')),fingerprint:focusFingerprint(doc,w.id),running:!!w.timer?.running&&w.timer.endsAt>now,endsAt:w.timer?.endsAt||0,remaining:Math.ceil(timerRemaining(w,now)),label:widgetLabel(w.title||'Focus',80),cycle:w.timer?.cycle||'',mode:w.timer?.mode||'focus'};
}
export function widgetRhythm(doc,now=Date.now()){
 const dates=[];const date=new Date(now);date.setHours(12,0,0,0);
 for(let i=27;i>=0;i--){const d=new Date(date);d.setDate(d.getDate()-i);dates.push(localDate(d));}
 const counts=new Map(dates.map(d=>[d,0]));
 for(const log of doc.tables.review_logs){if(log.mode!=='SPACED'||log.reviewedAtEpochMillis>now)continue;const d=localDate(new Date(log.reviewedAtEpochMillis));if(counts.has(d))counts.set(d,Math.min(1000000,counts.get(d)+1));}
 const days=dates.map(d=>counts.get(d));return {days,total:days.reduce((a,b)=>a+b,0)};
}
/** A deterministic daily candidate. Related text comes only from the existing opt-in index. */
function resurfacePool(doc,now){
 const byId=new Map(doc.tables.bullets.map(n=>[n.id,n]));
 const nodes=doc.tables.bullets.filter(n=>!isStudyContent(doc,n,byId)&&n.kind==='NOTE'&&!n.mirrorSourceId&&!n.journalDate&&displayText(n.text).trim().length>15&&n.id!=='quick-capture-inbox'&&!n.id.startsWith('widget-'));
 const touched=n=>doc.web?.noteTimes?.[n.id]?.updatedAt||0;
 const older=nodes.filter(n=>touched(n)<now-86400000);
 const pool=(older.length?older:nodes).sort((a,b)=>touched(a)-touched(b)||a.id.localeCompare(b.id)).slice(0,60);
 const start=pool.length?parseInt(contentDigest(localDate(new Date(now))).slice(0,8),16)%pool.length:0;
 return {pool,byId,start};
}
export function resurfaceCandidate(doc,now=Date.now()){const {pool,start}=resurfacePool(doc,now);return pool[start]||null;}
export function widgetExtras(doc,now=Date.now()){return {today:widgetToday(doc,now),focus:widgetFocus(doc,now),rhythm:widgetRhythm(doc,now)};}
export function resurfacePresentation(doc,related,now=Date.now()){return resurfacePresentations(doc,related,now,1)[0]||null;}
function recovered(doc,intent,reason,now){
 const root='remonook-widget-actions',id='widget-action-'+intent.id.toLowerCase();
 let nodes=doc.tables.bullets;
 if(!nodes.some(n=>n.id===root))nodes=[...nodes,bullet(root,{text:'Recovered widget actions',position:Math.max(-1,...nodes.filter(n=>n.parentId===null).map(n=>n.position))+1})];
 if(!nodes.some(n=>n.id===id))nodes=[...nodes,bullet(id,{parentId:root,position:nodes.filter(n=>n.parentId===root).length,text:`Widget action preserved\n${reason}\n\n${intent.text}\nDate: ${intent.date}\nRecorded: ${new Date(intent.at).toISOString()}\nEvent: ${intent.id}`})];
 return {doc:withNodes(doc,nodes),notice:'A widget action was kept in “Recovered widget actions” because its source changed.',outcome:'recovered'};
}
export function applyWidgetCompletion(doc,intent,scope,now=Date.now()){
 if(!intent||intent.schema!==1||intent.type!=='complete'||intent.scope!==scope||typeof intent.id!=='string'||!(/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i).test(intent.id)||typeof intent.targetId!=='string'||!intent.targetId.match(/^(bullet|reminder):.+/)||intent.targetId.length>210||typeof intent.text!=='string'||new TextEncoder().encode(intent.text).length>200||!validEventDate(intent.date)||!(/^[a-f0-9]{64}$/).test(intent.fingerprint)||!Number.isSafeInteger(intent.at)||intent.at<0||intent.at>8640000000000000)throw Error('Invalid widget action. Its saved event remains on this device.');
 const receipt=intent.id.toLowerCase();
 if(doc.web?.widgetActionReceipts?.[receipt])return {doc,outcome:'duplicate'};
 let result={doc,outcome:'applied'};
 const old=widgetToday(doc,new Date(intent.date+'T12:00:00').getTime()).find(n=>n.id===intent.targetId);
 if(intent.at>now+300000||!old||old.fingerprint!==intent.fingerprint){result=recovered(doc,intent,'The source changed or is no longer dated for that day.',now);}
 else if(intent.targetId.startsWith('bullet:')){
  const id=intent.targetId.slice(7);
  result.doc=withNodes(doc,doc.tables.bullets.map(n=>n.id===id?{...n,taskState:'DONE'}:n));
 }else{
  const id=intent.targetId.slice(9),event=calendarEvents(doc).find(e=>e.id===id);
  if(event&&!event.completed.includes(intent.date)&&eventOnDate(event,intent.date))result.doc=completeCalendarEvent(doc,id,intent.date);
 }
 result.doc={...result.doc,web:{...result.doc.web,widgetActionReceipts:{...result.doc.web.widgetActionReceipts,[receipt]:{at:intent.at,targetId:intent.targetId,date:intent.date,outcome:result.outcome}}}};
 return result;
}
export function widgetFocusAction(doc,id,cycle,action,now=Date.now()){
 const widget=dashboard(doc).widgets[id];
 if(!widget||widget.removed||widget.kind!=='focus'||(widget.timer?.cycle||'')!==cycle)return doc;
 if(widget.timer?.running&&widget.timer.endsAt<=now)return widgetFocusAction(finishTimer(doc,id,now),id,cycle,action,now);
 const timer=widget.timer,mode=timer?.mode||'focus',duration=timer?.duration||timerDuration(widget,mode),remaining=timerRemaining(widget,now);
 if(action==='pause'&&timer?.running)return updateWidget(doc,id,{timer:{...timer,running:false,remaining,endsAt:0}});
 if(action==='end'&&timer)return updateWidget(doc,id,{timer:{...timer,running:false,remaining:0,endsAt:0}});
 if(action==='start'&&!timer?.running){const seconds=remaining||duration;return updateWidget(doc,id,{timer:{mode,running:true,remaining:seconds,duration,endsAt:now+seconds*1000,cycle:crypto.randomUUID()}});}
 return doc;
}

export function focusFingerprint(doc,id){const w=dashboard(doc).widgets[id];return w&&w.kind==='focus'&&!w.removed?digest([w.id,w.settings,w.timer||null]):null;}
/** Parent links preserve causal order even when the clock moves backwards. */
export function orderWidgetActions(events){const pending=[...events].sort((a,b)=>(a.reviewedAt??a.at??0)-(b.reviewedAt??b.at??0)||String(a.id).localeCompare(String(b.id))),ordered=[];
 while(pending.length){let index=pending.findIndex(e=>!e.previousId||!pending.some(p=>p.id===e.previousId));if(index<0)index=0;ordered.push(pending.splice(index,1)[0]);}return ordered;}
function actionShape(intent,scope,type){if(!intent||intent.schema!==1||intent.type!==type||intent.scope!==scope||typeof intent.id!=='string'||!(/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i).test(intent.id)||!Number.isSafeInteger(intent.at)||intent.at<0||intent.at>8640000000000000)throw Error('Invalid widget action. Its original is retained on this device.');}
function actionReceipt(doc,intent,result,extra={}){return {...result,doc:{...result.doc,web:{...result.doc.web,widgetActionReceipts:{...result.doc.web.widgetActionReceipts,[intent.id.toLowerCase()]:{at:intent.at,type:intent.type,outcome:result.outcome,...extra}}}}};}
export function applyWidgetFocus(doc,intent,scope,now=Date.now()){
 actionShape(intent,scope,'focus');if(typeof intent.targetId!=='string'||!['start','pause','end'].includes(intent.action)||typeof intent.baseFingerprint!=='string'||!/^[a-f0-9]{64}$/.test(intent.baseFingerprint)||typeof intent.nextCycle!=='string'||intent.nextCycle.length>128)throw Error('Invalid focus action. Its original is retained.');
 if(doc.web.widgetActionReceipts?.[intent.id.toLowerCase()])return {doc,outcome:'duplicate'};
 const previous=intent.previousId&&doc.web.widgetActionReceipts?.[String(intent.previousId).toLowerCase()];
 const expected=intent.previousId?(previous?.outcome==='applied'?previous.postFingerprint:null):intent.baseFingerprint;
 if(intent.at>now+300000||!expected||focusFingerprint(doc,intent.targetId)!==expected)return actionReceipt(doc,intent,recovered(doc,{...intent,text:`Focus: ${intent.action}\nTimer: ${intent.targetId}`,date:localDate(new Date(intent.at))},'The focus session changed before this offline action could be applied.',now));
 let next=doc,w=dashboard(next).widgets[intent.targetId];
 if(w.timer?.running&&w.timer.endsAt<=intent.at){next=finishTimer(next,w.id,intent.at);w=dashboard(next).widgets[w.id];}
 const t=w.timer,mode=t?.mode||'focus',duration=t?.duration||timerDuration(w,mode),remaining=timerRemaining(w,intent.at);
 if(intent.action==='start'&&!t?.running){const seconds=remaining||duration;next=updateWidget(next,w.id,{timer:{mode,duration,running:true,remaining:seconds,endsAt:intent.at+seconds*1000,cycle:t&&remaining>0?t.cycle:intent.nextCycle}});}
 else if(intent.action==='pause'&&t?.running)next=updateWidget(next,w.id,{timer:{...t,running:false,remaining,endsAt:0}});
 else if(intent.action==='end'&&t)next=updateWidget(next,w.id,{timer:{...t,running:false,remaining:0,endsAt:0}});
 return actionReceipt(doc,intent,{doc:next,outcome:'applied'},{postFingerprint:focusFingerprint(next,intent.targetId)});
}
export function applyWidgetCapture(doc,intent,scope,now=Date.now()){
 actionShape(intent,scope,'capture');if(typeof intent.text!=='string'||!intent.text.trim()||new TextEncoder().encode(intent.text).length>8000)throw Error('Invalid capture. Its text is retained on this device.');
 if(doc.web.widgetActionReceipts?.[intent.id.toLowerCase()])return {doc,outcome:'duplicate'};
 // One stable ordinary note retains line breaks and makes retries idempotent.
 let nodes=doc.tables.bullets;const root='quick-capture-inbox',id='widget-capture-'+intent.id.toLowerCase();
 if(!nodes.some(n=>n.id===root))nodes=[...nodes,bullet(root,{text:'Inbox',position:Math.max(-1,...nodes.filter(n=>n.parentId===null).map(n=>n.position))+1})];
 if(!nodes.some(n=>n.id===id))nodes=[...nodes.map(n=>n.id===root?{...n,collapsed:false}:n),bullet(id,{parentId:root,text:intent.text,position:nodes.filter(n=>n.parentId===root).length})];
 return actionReceipt(doc,intent,{doc:withNodes(doc,nodes),outcome:'applied'});
}
export function resurfacePresentations(doc,related,now=Date.now(),limit=8){
 const {pool,byId,start}=resurfacePool(doc,now),idx=index(doc.tables.bullets);
 return Array.from({length:Math.min(limit,pool.length)},(_,i)=>{
  const node=pool[(start+i)%pool.length],hit=related(node.id).find(h=>byId.has(h.id)&&!isStudyContent(doc,byId.get(h.id),byId)),neighbour=hit&&byId.get(hit.id);
  return {id:node.id,text:widgetLabel(displayText(node.text),240),path:widgetLabel(node.parentId?notePath(doc.tables.bullets,node.parentId,idx):'My notes',120),relatedText:widgetLabel(neighbour?displayText(neighbour.text):'',160)};
 });
}
