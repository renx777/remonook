// Repair representations whose meaning is known. Preserve every changed value
// in recovery notes instead of silently trimming or throwing old fields away.
export function repairWorkdays(w) {
 if(w?.version!==2)return {value:w,recovered:[]};
 const value=structuredClone(w),recovered=[];
 for(const key of ['policies','allowances'])if(Object.hasOwn(value,key)){
  recovered.push({label:'Workdays legacy '+key,value:value[key]});delete value[key];
 }
 for(const [date,entry] of Object.entries(value.entries||{}))for(const kind of ['actual','plan']){
  const row=entry?.[kind];if(!row||typeof row!=='object')continue;
  const legacy=Object.fromEntries(['status','detail','updatedAt'].filter(k=>Object.hasOwn(row,k)).map(k=>[k,row[k]]));
  if(!Object.keys(legacy).length)continue;
  recovered.push({label:'Workdays '+date+' '+kind+' legacy values',value:legacy});
  // A legacy-only row has an unambiguous whole-day meaning. Existing v2 slots
  // always win; both representations remain available in recovery history.
  if(!row.am&&!row.pm&&['WFH','WFO','Leave'].includes(row.status)&&Number.isSafeInteger(row.updatedAt)&&row.updatedAt>=0){
   const slot={mode:row.status,updatedAt:row.updatedAt};
   const type=Object.values(value.leaveTypes||{}).find(t=>t.name===row.detail);
   if(row.status!=='Leave'||type){if(type&&row.status==='Leave')slot.leaveTypeId=type.id;row.am={...slot};row.pm={...slot};}
  }
  for(const key of Object.keys(legacy))delete row[key];
 }
 for(const [date,name] of Object.entries(value.holidays||{}))if(typeof name!=='string'||!name.trim()||name.length>160){
  recovered.push({label:'Workdays holiday '+date,value:name});
  value.holidays[date]=(typeof name==='string'?name.trim():typeof name==='number'?String(name):'Holiday').slice(0,160)||'Holiday';
 }
 return {value,recovered};
}
