export const REPEAT_MODES=['NONE','DAILY','WEEKLY','MONTHLY','YEARLY'];
export const dateValid=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const templates=new Map();let templateChars=0;
function rememberTemplate(raw,t){const frozen=Object.freeze(t);templates.set(raw,frozen);templateChars+=raw.length;while(templates.size>256||templateChars>524288){const key=templates.keys().next().value;templateChars-=key.length;templates.delete(key);}return frozen;}
export function repeatTemplate(raw){if(templates.has(raw))return templates.get(raw);try{if(typeof raw!=='string'||raw.length>64000)return null;const t=JSON.parse(raw);return t&&t.v===1&&typeof t.id==='string'&&/^[a-f0-9-]{36}$/.test(t.id)&&REPEAT_MODES.slice(1).includes(t.mode)&&dateValid(t.anchor)&&typeof t.text==='string'&&t.text.length<=64000&&typeof t.formatting==='string'&&t.formatting.length<=64000&&typeof t.context==='string'&&t.context.length<=1000&&typeof t.origin==='string'&&t.origin.length<=1000?rememberTemplate(raw,t):null;}catch{return null;}}
export function creationRow(raw){try{if(typeof raw!=='string'||raw.length>512000)return null;const record=JSON.parse(raw),n=record?.v===1?record.row:null;return n&&typeof n==='object'&&typeof n.id==='string'&&n.id.startsWith('rt:')&&typeof n.text==='string'&&typeof n.formatting==='string'&&n.taskRepeatSeed===undefined?n:null;}catch{return null;}}
export function stableCreation(value){return JSON.stringify({v:1,row:Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0))});}
// Ordinary session actors are uint32. Creation actors use a disjoint 52-bit range.
export function creationActor(id,raw){let h=14695981039346656037n;for(const c of id+'\n'+raw){h^=BigInt(c.codePointAt(0));h=BigInt.asUintN(64,h*1099511628211n);}return Number(h&((1n<<52n)-1n))+2**52;}
export function validateRepeatReceipts(value){
 if(value===undefined)return;if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid recurring task history');
 for(const [source,patterns] of Object.entries(value)){
  if(!patterns||typeof patterns!=='object'||Array.isArray(patterns))throw Error('Invalid recurring task history');
  for(const [pattern,r] of Object.entries(patterns))if(!r||r.source!==source||r.pattern!==pattern||typeof r.nextId!=='string'||!dateValid(r.date)||r.nextId!=='rt:'+pattern+':'+r.date)throw Error('Invalid recurring task history');
 }
}

// Unchanged row objects dominate ordinary typing. Cache only their private-field
// validation results, not another copy of their title/template contents.
const repeatRows=new WeakMap();
export function repeatFieldInfo(node){
 const prior=repeatRows.get(node);if(prior&&prior.raw===node.taskRepeatTemplate&&prior.seed===node.taskRepeatSeed&&prior.id===node.id)return prior;
 const t=repeatTemplate(node.taskRepeatTemplate),seed=creationRow(node.taskRepeatSeed);
 const info={raw:node.taskRepeatTemplate,seed:node.taskRepeatSeed,id:node.id,templateValid:node.taskRepeatTemplate==null||node.taskRepeatTemplate===''||!!t,seedValid:node.taskRepeatSeed==null||node.taskRepeatSeed===''||!!seed,seedId:seed?.id,pattern:t?.id,mode:t?.mode,origin:t?.origin};repeatRows.set(node,info);return info;
}
