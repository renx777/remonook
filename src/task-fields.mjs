// Optional canonical bullet fields. Missing/null means the legacy default; no startup rewrite.
export const TASK_DEFAULTS={scheduledDate:'',taskPlanning:'ACTIVE',taskPriority:0,taskDurationMinutes:0};
export const TASK_FIELDS=Object.keys(TASK_DEFAULTS);
export function validTaskField(key,value){
 if(value==null)return true;
 if(key==='scheduledDate'){
  if(value==='')return true;
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const stamp=Date.parse(value+'T00:00:00Z');return Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===value;
 }
 if(key==='taskPlanning')return ['ACTIVE','SOMEDAY','WAITING'].includes(value);
 if(key==='taskPriority')return Number.isInteger(value)&&value>=0&&value<=3;
 if(key==='taskDurationMinutes')return Number.isInteger(value)&&value>=0&&value<=1440;
 return false;
}
export function taskPlan(node){return Object.fromEntries(TASK_FIELDS.map(key=>[key,node[key]!=null&&validTaskField(key,node[key])?node[key]:TASK_DEFAULTS[key]]));}
