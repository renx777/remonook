// Human time: parse "call mom tomorrow 6pm for 30m !high" and print dates the way people say them.
// Dates are local calendar dates as YYYY-MM-DD strings; arithmetic is done in UTC so time zones never shift a day.
const DAYS=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const SHORT_DAYS=['sun','mon','tue','wed','thu','fri','sat'];
const MONTHS=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const toUtc=d=>{const [y,m,day]=d.split('-').map(Number);return Date.UTC(y,m-1,day);};
const fromUtc=t=>new Date(t).toISOString().slice(0,10);
export const addDays=(date,n)=>fromUtc(toUtc(date)+n*864e5);
export const daysBetween=(from,to)=>Math.round((toUtc(to)-toUtc(from))/864e5);
const weekday=date=>new Date(toUtc(date)).getUTCDay();
const pad=n=>String(n).padStart(2,'0');
const valid=(y,m,d)=>{const t=Date.UTC(y,m-1,d),x=new Date(t);return x.getUTCFullYear()===y&&x.getUTCMonth()===m-1&&x.getUTCDate()===d;};
function dayIndex(word){const w=word.toLowerCase();let i=DAYS.indexOf(w);if(i<0)i=SHORT_DAYS.indexOf(w.slice(0,3));if(i<0||!(DAYS[i].startsWith(w)&&w.length>=3))return -1;return i;}
function nextWeekday(today,index,skipWeek=false){let diff=(index-weekday(today)+7)%7;if(diff===0)diff=7;if(skipWeek&&diff<7)diff+=7;return addDays(today,diff);}
function monthDay(today,month,day){const y=Number(today.slice(0,4));for(const year of [y,y+1])if(valid(year,month,day)){const d=`${year}-${pad(month)}-${pad(day)}`;if(d>=today||year===y+1)return d;}return '';}
const monthIndex=w=>{const i=MONTHS.indexOf(w.toLowerCase().slice(0,3));return i<0?-1:i+1;};
const DAY_WORD='(?:mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs(?:day)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)';
const MONTH_WORD='(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
// A date phrase; returns [date, matchedText] or null.
function readDate(text,today){
 const rules=[
  [/\b(?:the\s+)?day\s+after\s+tomorrow\b/i,()=>addDays(today,2)],
  [/\b(?:today|tonight|tod)\b/i,()=>today],
  [/\b(?:tomorrow|tmrw?|tmw)\b/i,()=>addDays(today,1)],
  [/\b(?:(?:this|on\s+the|at\s+the)\s+weekend\b|weekend(?=\s*$))/i,()=>{const w=weekday(today);return w===6?today:w===0?today:addDays(today,6-w);}],
  [/\bnext\s+week\b/i,()=>nextWeekday(today,1)],
  [/\bnext\s+month\b/i,()=>{const [y,m]=today.split('-').map(Number);return m===12?`${y+1}-01-01`:`${y}-${pad(m+1)}-01`;}],
  [/\bin\s+(\d{1,3})\s*(d|days?|w|weeks?)\b/i,m=>addDays(today,Number(m[1])*(/^w/i.test(m[2])?7:1))],
  [new RegExp(`\\bnext\\s+(${DAY_WORD})\\b`,'i'),m=>nextWeekday(today,dayIndex(m[1]),true)],
  [new RegExp(`\\b(?:on\\s+|this\\s+)?(${DAY_WORD})\\b`,'i'),m=>nextWeekday(today,dayIndex(m[1]))],
  [/\b(\d{4})-(\d{2})-(\d{2})\b/,m=>valid(+m[1],+m[2],+m[3])?m[0]:''],
  [new RegExp(`\\b(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_WORD})\\b`,'i'),m=>monthDay(today,monthIndex(m[2]),Number(m[1]))],
  [new RegExp(`\\b(?:on\\s+)?(${MONTH_WORD})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`,'i'),m=>monthDay(today,monthIndex(m[1]),Number(m[2]))],
 ];
 let best=null;
 for(const [re,fn]of rules){const m=text.match(re);if(!m)continue;const date=fn(m);if(date&&(!best||m.index<best.index))best={date,match:m[0],index:m.index};}
 return best;
}
const clock=(h,m,ap)=>{let hour=Number(h);const min=Number(m||0);if(min>59)return '';if(ap){const p=ap.toLowerCase()[0];if(hour<1||hour>12)return '';if(p==='p'&&hour<12)hour+=12;if(p==='a'&&hour===12)hour=0;}else if(hour>23)return '';return `${pad(hour)}:${pad(min)}`;};
const minutesOf=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
function readDuration(text){
 const m=text.match(/\bfor\s+(?:(\d{1,2})\s*(?:h|hrs?|hours?)\s*(?:(\d{1,2})\s*(?:m|mins?|minutes?)?)?|(\d{1,4})\s*(?:m|mins?|minutes?)|(\d(?:\.\d)?)\s*(?:h|hrs?|hours?))\b/i);
 if(!m)return null;const minutes=m[3]?Number(m[3]):m[4]?Math.round(Number(m[4])*60):Number(m[1])*60+Number(m[2]||0);
 return minutes>0&&minutes<=1440?{minutes,match:m[0],index:m.index}:null;
}
function readTime(text){
 const range=text.match(/\b(?:at\s+|from\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?\s*(?:-|–|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?\b/i);
 if(range&&(range[2]||range[3]||range[5]||range[6])){const endAp=range[6],startAp=range[3]||(endAp&&Number(range[1])<=Number(range[4])?endAp:'');const start=clock(range[1],range[2],startAp),end=clock(range[4],range[5],endAp);if(start&&end&&minutesOf(end)>minutesOf(start))return {time:start,minutes:minutesOf(end)-minutesOf(start),match:range[0],index:range.index};}
 const rules=[/\b(?:at\s+)?(\d{1,2}):(\d{2})\s*(am|pm|a\.m\.|p\.m\.)?(?![\d:])/i,/\b(?:at\s+)?(\d{1,2})()\s*(am|pm|a\.m\.|p\.m\.)(?![a-z])/i,/\bat\s+(\d{1,2})()()\b(?!\s*(?:-|:|\/|\d))/i,/\b(noon|midday|midnight)\b/i];
 for(const re of rules){const m=text.match(re);if(!m)continue;if(/noon|midday/i.test(m[1]))return {time:'12:00',match:m[0],index:m.index};if(/midnight/i.test(m[1]))return {time:'00:00',match:m[0],index:m.index};
  // "at 6" with no am/pm: read 1–7 as the afternoon, the way people mean it.
  let ap=m[3];if(!ap&&!m[2]&&Number(m[1])>=1&&Number(m[1])<=7)ap='pm';
  const time=clock(m[1],m[2],ap);if(time)return {time,match:m[0],index:m.index};}
 return null;
}
const PRIORITY=[[/(?:^|\s)(?:!high|!h|!!!|!3|p1)(?=\s|$)/i,3],[/(?:^|\s)(?:!medium|!med|!m|!!|!2|p2)(?=\s|$)/i,2],[/(?:^|\s)(?:!low|!l|!1|p3)(?=\s|$)/i,1]];
const BARE_PRIORITY=[[/\b(?:high|urgent)(?:\s+priority)?\b/i,3],[/\b(?:medium|med)(?:\s+priority)?\b/i,2],[/\blow(?:\s+priority)?\b/i,1]];
const REPEAT=[[/\b(?:every\s*day|daily)\b/i,'DAILY'],[/\b(?:every\s*week|weekly)\b/i,'WEEKLY'],[/\b(?:every\s*month|monthly)\b/i,'MONTHLY'],[/\b(?:every\s*year|yearly|annually)\b/i,'YEARLY']];
/**
 * Parse a quick task. With {bare:true} (the Plan box, where there is no title) "high" alone sets priority.
 * Returns {title, scheduledDate, dueDate, taskStartTime, taskBlockMinutes, taskPriority, taskRepeat, chips}.
 * Fields that were not typed are left out, so callers only change what the person asked for.
 */
export function parseQuickTask(input,today,{bare=false}={}){
 let text=` ${String(input||'')} `;const out={};const cut=m=>{text=text.replace(m,' ');};
 const due=text.match(/\b(?:due|by|deadline)\s+(.+?)(?=\s+(?:at|for|every|due|by)\b|\s+[!#]|\s*$)/i);
 if(due){const d=readDate(due[1],today);if(d){out.dueDate=d.date;cut(due[0].slice(0,due[0].indexOf(d.match)+d.match.length));}}
 for(const [re,value]of REPEAT){const m=text.match(re);if(m){out.taskRepeat=value;cut(m[0]);break;}}
 const dur=readDuration(text);if(dur){out.taskBlockMinutes=dur.minutes;cut(dur.match);}
 const time=readTime(text);if(time){out.taskStartTime=time.time;if(time.minutes)out.taskBlockMinutes=time.minutes;cut(time.match);}
 const date=readDate(text,today);if(date){out.scheduledDate=date.date;cut(date.match);}
 for(const [re,value]of [...PRIORITY,...(bare?BARE_PRIORITY:[])]){const m=text.match(re);if(m){out.taskPriority=value;cut(m[0]);break;}}
 if(out.taskStartTime&&!out.scheduledDate)out.scheduledDate=today;
 if(out.taskStartTime&&!out.taskBlockMinutes)out.taskBlockMinutes=30;
 if(out.taskBlockMinutes&&!out.taskStartTime)delete out.taskBlockMinutes;
 if(out.taskRepeat&&!out.scheduledDate)out.scheduledDate=today;
 out.title=text.replace(/\s+/g,' ').replace(/\s+([,.;:])/g,'$1').trim().replace(/^(?:at|on|for|to)\s+|\s+(?:at|on|for)$/gi,'').trim();
 out.chips=quickChips(out,today,input);
 return out;
}
export function quickChips(p,today,input=''){
 const chips=[];
 if(p.scheduledDate){const label=relativeDay(p.scheduledDate,today);chips.push({kind:p.taskStartTime?'time':'date',label:p.taskStartTime?`${label} ${p.taskStartTime}–${addMinutes(p.taskStartTime,p.taskBlockMinutes||30)}`:label});}
 if(p.dueDate)chips.push({kind:'deadline',label:deadlineLabel(p.dueDate,today)});
 if(p.taskRepeat)chips.push({kind:'repeat',label:'↻ '+{DAILY:'Daily',WEEKLY:'Weekly',MONTHLY:'Monthly',YEARLY:'Yearly'}[p.taskRepeat]});
 if(p.taskPriority)chips.push({kind:p.taskPriority===3?'high':'priority',label:['','Low','Medium','High'][p.taskPriority]});
 for(const tag of String(input).match(/(?:^|\s)#[\p{L}\p{N}_-]+/gu)||[])chips.push({kind:'tag',label:tag.trim().slice(1)});
 return chips;
}
export const addMinutes=(time,n)=>{const t=Math.min(1439,minutesOf(time)+Number(n||0));return `${pad(Math.floor(t/60))}:${pad(t%60)}`;};
const SHORT_MONTH=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const NAME=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
/** "Today", "Tomorrow", "Yesterday", "Friday" (this week), "Mon 7 Dec", "3 Jan 2027". Never an ISO date. */
export function relativeDay(date,today){
 if(!date)return '';const d=daysBetween(today,date);
 if(d===0)return 'Today';if(d===1)return 'Tomorrow';if(d===-1)return 'Yesterday';
 if(d>1&&d<7)return NAME[weekday(date)];
 const [y,m,day]=date.split('-').map(Number);
 return `${d>0&&d<60?NAME[weekday(date)].slice(0,3)+' ':''}${day} ${SHORT_MONTH[m-1]}${y!==Number(today.slice(0,4))?' '+y:''}`;
}
/** A deadline the way people say it: "Due today", "Due Friday", "2 days late". */
export function deadlineLabel(date,today){
 const d=daysBetween(today,date);
 if(d<0)return `${-d} day${d===-1?'':'s'} late`;
 return 'Due '+relativeDay(date,today).replace(/^(Today|Tomorrow)$/,s=>s.toLowerCase());
}
