// Build an ignored staging-only deployment config, or verify that its deployment
// retained the live bindings, plain variables, secret names and enabled features.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const account='e9a5c70b0fbe2e2d493fc21de0bbb40f',worker='remo-sync-staging';
const root=new URL('../',import.meta.url),configPath=new URL('cloud/config.staging.local.json',root),beforePath=new URL('cloud/staging-sync-before.local.json',root);
const vars=new Set(['plain_text','json']),privateTypes=new Set(['secret_text']);
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const stable=bindings=>bindings.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(canonical);
const cronList=s=>(s.schedules||s).map(x=>x.cron).sort();
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const api=async path=>{const token=process.env.CLOUDFLARE_API_TOKEN;if(!token)throw Error('CLOUDFLARE_API_TOKEN is required in the staging CI job.');const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+path,{headers:{Authorization:'Bearer '+token}});const j=await r.json();if(!r.ok||!j.success)throw Error('Staging Cloudflare API request failed: '+r.status);return j.result;};
const health=async()=>{const r=await fetch('https://remo-sync-staging.remo-978fb.workers.dev/health');if(!r.ok)throw Error('Staging sync health failed.');return r.json();};
export function prepareStagingConfig(example,settings,schedules){
 if(example.name!==worker)throw Error('Refusing a non-staging Worker.');
 const config=structuredClone(example);delete config.vars;config.keep_vars=true;
 const expected=new Map();
 for(const [key,type,id]of [['d1_databases','d1','binding'],['r2_buckets','r2_bucket','binding'],['services','service','binding'],['ratelimits','ratelimit','name']])for(const b of config[key]||[])expected.set(b[id],{type,b});
 for(const [key,type]of [['ai','ai'],['browser','browser']])if(config[key])expected.set(config[key].binding,{type,b:config[key]});
 for(const b of config.durable_objects?.bindings||[])expected.set(b.name,{type:'durable_object_namespace',b});
 const live=(settings.bindings||[]).filter(b=>!vars.has(b.type)&&!privateTypes.has(b.type));
 if(live.length!==expected.size)throw Error('Live staging has different binding names; review rather than overwrite.');
 for(const b of live){const e=expected.get(b.name);if(!e||e.type!==b.type)throw Error('Unexpected staging binding: '+b.name);
  if(b.type==='d1'&&b.id!==e.b.database_id)throw Error('Staging D1 differs.');
  if(b.type==='r2_bucket'&&b.bucket_name!==e.b.bucket_name)throw Error('Staging R2 differs.');
  if(b.type==='service'){if(b.service!==e.b.service)throw Error('Article capture service differs.');if(b.environment)e.b.environment=b.environment;}
  if(b.type==='ratelimit'&&(String(b.namespace_id)!==String(e.b.namespace_id)||(b.simple?.limit!==e.b.simple.limit||b.simple?.period!==e.b.simple.period)))throw Error('Staging rate limiter differs.');
  if(b.type==='durable_object_namespace'&&((b.class_name&&b.class_name!==e.b.class_name)||(b.script_name&&b.script_name!==worker)))throw Error('Staging Durable Object differs.');
 }
 if(settings.migration_tag&&!config.migrations?.some(m=>m.tag===settings.migration_tag))throw Error('Unknown live migration tag; do not create or replace a namespace.');
 if(settings.compatibility_date)config.compatibility_date=settings.compatibility_date;
 if(settings.compatibility_flags)config.compatibility_flags=settings.compatibility_flags;
 if(settings.limits)config.limits=settings.limits;
 config.triggers={crons:schedules.map(s=>s.cron)};
 return config;
}
function signature(settings){const b=settings.bindings||[];return {bindings:stable(b.filter(x=>!vars.has(x.type)&&!privateTypes.has(x.type))),varsDigest:digest(stable(b.filter(x=>vars.has(x.type)))),secrets:b.filter(x=>privateTypes.has(x.type)).map(x=>x.name).sort()};}
export async function run(mode){
 const settings=await api('/workers/scripts/'+worker+'/settings'),schedules=await api('/workers/scripts/'+worker+'/schedules'),h=await health();
 if(h.syncProtocol!==3||h.workdaysSchema!==2)throw Error('Unexpected staging protocol.');
 if(mode==='prepare'){
  const example=JSON.parse(await readFile(new URL('cloud/config.staging.example.json',root),'utf8'));
  const config=prepareStagingConfig(example,settings,schedules.schedules||schedules);
  await writeFile(configPath,JSON.stringify(config,null,2));await writeFile(beforePath,JSON.stringify({...signature(settings),health:h,crons:cronList(schedules)}));
  console.log('Prepared staging sync config; existing variables and secrets will be retained.');
 }else if(mode==='verify'){
  const before=JSON.parse(await readFile(beforePath,'utf8')),now=signature(settings);
  for(const key of ['bindings','varsDigest','secrets'])if(JSON.stringify(before[key])!==JSON.stringify(now[key]))throw Error('Staging '+key+' changed unexpectedly.');
  if(JSON.stringify(before.crons)!==JSON.stringify(cronList(schedules)))throw Error('Staging cleanup schedules changed.');
  for(const key of ['aiEnabled','aiAssist','aiImage','bookmarkReader','bookmarkCapture','bookStorage','bookReader','googleTasksConfigured','mcp','mcpOAuth'])if(h[key]!==before.health[key])throw Error('Staging capability changed: '+key);
  if(h.taskPlanning!==1)throw Error('Task planning validation is not deployed.');console.log('Staging sync verified:',JSON.stringify(h));
 }else throw Error('Use prepare or verify.');
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1])await run(process.argv[2]);
