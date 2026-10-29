import {localDate,validEventDate} from './calendar-events.mjs';

export const WIDGET_LIMIT=16;
export const widgetCatalog=[
 {kind:'clock',title:'Clock',icon:'clock',description:'A little perspective on your day. Digital, analog, or split.',w:4,h:4},
 {kind:'focus',title:'Focus timer',icon:'timer',description:'Make space for deep work with focus sessions and restorative breaks.',w:4,h:5},
 {kind:'agenda',title:'Today',icon:'calendar',description:'Your note tasks and upcoming reminders, together at a glance.',w:4,h:7},
 {kind:'habits',title:'Habits',icon:'sprout',description:'Small steps, repeated. Track your habits through the week.',w:8,h:7},
 {kind:'capture',title:'Quick capture',icon:'pencil',description:'Catch a thought before it goes. Send it straight to your notes.',w:4,h:5},
 {kind:'googleTasks',title:'Google Tasks',icon:'check',description:'Your Google task lists, with room to plan and finish.',w:4,h:7},
 {kind:'quotes',title:'Quotes',icon:'quote',description:'Words worth keeping. Explore the classics and your own #quote notes.',w:6,h:6},
 {kind:'study',title:'Study snapshot',icon:'study',description:'See what is ready to review and keep your learning moving.',w:4,h:5},
];
export const dashboardCols={lg:12,md:8,sm:4};
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const safeId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(id)&&!['__proto__','constructor','prototype'].includes(id);
const integer=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;
const defaultSettings=kind=>kind==='clock'?{style:'digital',timezone:'local',hour12:false,seconds:true}:kind==='focus'?{focus:25,short:5,long:15}:kind==='quotes'?{source:'all'}:kind==='googleTasks'?{listId:''}:{};
export function defaultDashboard(){
 const widgets={};
 for(const [order,kind] of ['clock','focus','agenda','habits','capture'].entries()){
  const item=widgetCatalog.find(w=>w.kind===kind),id='default-'+kind;
  widgets[id]={id,kind,title:item.title,order,removed:false,settings:defaultSettings(kind)};
 }
 return {version:1,widgets,habits:{'habit-read':{id:'habit-read',title:'Read for 10 minutes',order:0,archived:false},'habit-break':{id:'habit-break',title:'Take a mindful break',order:1,archived:false}},checks:{},focusSessions:{}};
}
export function dashboard(doc){return doc.web.dashboard||defaultDashboard();}
export function visibleWidgets(value){return Object.values(value.widgets).filter(w=>!w.removed).sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));}
// Phone order is independent of desktop positions and evaluated against the latest document.
export function mobileWidgets(value){return visibleWidgets(value).sort((a,b)=>(a.settings.mobileOrder??a.order)-(b.settings.mobileOrder??b.order)||a.id.localeCompare(b.id));}
export function reorderMobileWidget(doc,id,target){return changeDashboard(doc,value=>{
 const ids=mobileWidgets(value).map(w=>w.id),from=ids.indexOf(id),to=ids.indexOf(target);if(from<0||to<0||from===to)return value;
 ids.splice(from,1);ids.splice(to,0,id);
 const widgets={...value.widgets};ids.forEach((key,order)=>{widgets[key]={...widgets[key],settings:{...widgets[key].settings,mobileOrder:order}};});
 return {...value,widgets};
});}
export function changeDashboard(doc,change){
 const value=change(dashboard(doc));validateDashboard(value);
 return {...doc,web:{...doc.web,dashboard:value}};
}
export function updateWidget(doc,id,patch){return changeDashboard(doc,value=>{
 const widget=value.widgets[id];if(!widget)return value;
 return {...value,widgets:{...value.widgets,[id]:{...widget,...patch,id,kind:widget.kind}}};
});}
export function addWidget(doc,kind,uuid=()=>crypto.randomUUID()){
 const item=widgetCatalog.find(w=>w.kind===kind);if(!item)throw Error('Choose a widget from the library.');
 return changeDashboard(doc,value=>{
  if(visibleWidgets(value).length>=WIDGET_LIMIT)throw Error('Your dashboard can hold up to 16 widgets.');
  const id=uuid(),order=Math.max(-1,...Object.values(value.widgets).map(w=>w.order))+1;
  return {...value,widgets:{...value.widgets,[id]:{id,kind,title:item.title,order,removed:false,settings:defaultSettings(kind)}}};
 });
}
export function widgetLayout(widgets,bp){
 const cols=dashboardCols[bp]||12;let x=0,y=0,rowHeight=0;
 return widgets.map(widget=>{
  const item=widgetCatalog.find(w=>w.kind===widget.kind),saved=widget.layouts?.[bp];
  const w=bp==='sm'?cols:Math.min(item.w,cols),h=item.h;
  if(x+w>cols){x=0;y+=rowHeight;rowHeight=0;}
  const fallback={x,y,w,h};x+=w;rowHeight=Math.max(rowHeight,h);
  return {i:widget.id,...(saved||fallback),minW:Math.min(3,cols),maxW:cols,minH:3,maxH:10};
 });
}
export function saveDashboardLayout(doc,bp,layout){
 if(!Object.hasOwn(dashboardCols,bp))throw Error('Unknown dashboard layout.');
 return changeDashboard(doc,value=>{
  const widgets={...value.widgets},ordered=[...layout].sort((a,b)=>a.y-b.y||a.x-b.x);
  for(const [order,item] of ordered.entries()){
   const old=widgets[item.i];if(!old||old.removed)continue;
   const bounds={x:Math.max(0,Math.min(dashboardCols[bp]-item.w,Math.round(item.x))),y:Math.max(0,Math.round(item.y)),w:Math.max(3,Math.min(dashboardCols[bp],Math.round(item.w))),h:Math.max(3,Math.min(10,Math.round(item.h)))};
   widgets[item.i]={...old,order,layouts:{...old.layouts,[bp]:bounds}};
  }
  return {...value,widgets};
 });
}
export function packWidgets(widgets,bp,sizes={}){
 const cols=dashboardCols[bp];let x=0,y=0,rowHeight=0;
 return widgets.map(widget=>{
  const item=widgetCatalog.find(w=>w.kind===widget.kind),size=sizes[widget.id]||widget.layouts?.[bp]||{w:bp==='sm'?cols:Math.min(item.w,cols),h:item.h};
  const w=Math.min(cols,size.w),h=size.h;
  if(x+w>cols){x=0;y+=rowHeight;rowHeight=0;}
  const result={i:widget.id,x,y,w,h};x+=w;rowHeight=Math.max(rowHeight,h);return result;
 });
}
export function shiftDay(day,amount){return new Date(Date.parse(day+'T00:00:00Z')+amount*86400000).toISOString().slice(0,10);}
export function habitStreak(value,id,today=localDate()){
 let day=value.checks[id+':'+today]?today:shiftDay(today,-1),count=0;
 while(count<3660&&value.checks[id+':'+day]){count++;day=shiftDay(day,-1);}
 return count;
}
export function toggleHabit(doc,id,day){
 if(!validEventDate(day)||day>localDate())throw Error('Choose today or an earlier day.');
 return changeDashboard(doc,value=>{
  if(!value.habits[id]||value.habits[id].archived)return value;
  const key=id+':'+day;
  return {...value,checks:{...value.checks,[key]:!value.checks[key]}};
 });
}
export function addHabit(doc,title,uuid=()=>crypto.randomUUID()){
 title=String(title).trim().slice(0,80);if(!title)throw Error('Give your habit a name.');
 return changeDashboard(doc,value=>{
  if(Object.values(value.habits).filter(h=>!h.archived).length>=32)throw Error('Track up to 32 active habits.');
  const id=uuid();return {...value,habits:{...value.habits,[id]:{id,title,order:Math.max(-1,...Object.values(value.habits).map(h=>h.order))+1,archived:false}}};
 });
}
export function timerDuration(widget,mode){return (widget.settings[mode]||({focus:25,short:5,long:15})[mode]||25)*60;}
export function timerRemaining(widget,now=Date.now()){
 const timer=widget.timer;
 return timer?.running?Math.min(timer.duration,Math.max(0,Math.ceil((timer.endsAt-now)/1000))):timer?.remaining??timerDuration(widget,timer?.mode||'focus');
}
export function finishTimer(doc,id,now=Date.now()){
 return changeDashboard(doc,value=>{
  const widget=value.widgets[id],timer=widget?.timer;
  if(!timer?.running||timer.endsAt>now)return value;
  const record=timer.mode==='focus'?{[timer.cycle]:{id:timer.cycle,endedAt:timer.endsAt,minutes:timer.duration/60}}:{};
  return {...value,focusSessions:{...value.focusSessions,...record},widgets:{...value.widgets,[id]:{...widget,timer:{...timer,running:false,remaining:0,endsAt:0}}}};
 });
}
export function validateDashboard(value){
 if(value===undefined)return;
 if(!plain(value)||value.version!==1||!plain(value.widgets)||!plain(value.habits)||!plain(value.checks)||!plain(value.focusSessions))throw Error('Invalid dashboard data.');
 if(Object.keys(value.widgets).length>500||Object.keys(value.habits).length>500||Object.keys(value.checks).length>100000||Object.keys(value.focusSessions).length>100000)throw Error('Dashboard data is too large.');
 for(const [id,w]of Object.entries(value.widgets)){
  if(!safeId(id)||!plain(w)||w.id!==id||!widgetCatalog.some(item=>item.kind===w.kind)||typeof w.title!=='string'||w.title.length>80||!Number.isFinite(w.order)||typeof w.removed!=='boolean'||!plain(w.settings))throw Error('Invalid dashboard widget.');
  if(w.settings.mobileOrder!==undefined&&(!integer(w.settings.mobileOrder,0,499)))throw Error('Invalid phone widget order.');
  if(w.settings.mobileExpanded!==undefined&&typeof w.settings.mobileExpanded!=='boolean')throw Error('Invalid phone widget size.');
  if(w.kind==='clock'&&(!['digital','analog','split'].includes(w.settings.style)||typeof w.settings.timezone!=='string'||w.settings.timezone.length>100||typeof w.settings.hour12!=='boolean'||typeof w.settings.seconds!=='boolean'))throw Error('Invalid clock settings.');
  if(w.kind==='clock'&&w.settings.timezone!=='local'){try{new Intl.DateTimeFormat('en',{timeZone:w.settings.timezone});}catch{throw Error('Invalid clock time zone.');}}
  if(w.kind==='googleTasks'&&(typeof w.settings.listId!=='string'||w.settings.listId.length>1024))throw Error('Invalid Google task list.');
  if(w.kind==='quotes'&&!['all','notes','library'].includes(w.settings.source))throw Error('Invalid quote source.');
  if(w.kind==='focus'&&(!integer(w.settings.focus,1,120)||!integer(w.settings.short,1,60)||!integer(w.settings.long,1,60)))throw Error('Invalid focus timer settings.');
  for(const [bp,l]of Object.entries(w.layouts||{}))if(!dashboardCols[bp]||!plain(l)||!integer(l.x,0,dashboardCols[bp]-1)||!integer(l.y,0,10000)||!integer(l.w,3,dashboardCols[bp])||!integer(l.h,3,10)||l.x+l.w>dashboardCols[bp])throw Error('Invalid widget layout.');
  const t=w.timer;if(t&&(!plain(t)||!['focus','short','long'].includes(t.mode)||typeof t.running!=='boolean'||!Number.isFinite(t.endsAt)||t.endsAt<0||!Number.isFinite(t.remaining)||t.remaining<0||t.remaining>7200||!Number.isFinite(t.duration)||t.duration<=0||t.duration>7200||!safeId(t.cycle)))throw Error('Invalid focus timer.');
 }
 for(const [id,h]of Object.entries(value.habits))if(!safeId(id)||!plain(h)||id!==h.id||typeof h.title!=='string'||!h.title.trim()||h.title.length>80||!Number.isFinite(h.order)||typeof h.archived!=='boolean')throw Error('Invalid habit.');
 for(const [key,checked]of Object.entries(value.checks)){const at=key.lastIndexOf(':');if(!safeId(key.slice(0,at))||!validEventDate(key.slice(at+1))||typeof checked!=='boolean')throw Error('Invalid habit check-in.');}
 for(const [id,s]of Object.entries(value.focusSessions))if(!safeId(id)||!plain(s)||s.id!==id||!Number.isFinite(s.endedAt)||s.endedAt<0||!Number.isFinite(s.minutes)||s.minutes<=0||s.minutes>120)throw Error('Invalid focus session.');
}
