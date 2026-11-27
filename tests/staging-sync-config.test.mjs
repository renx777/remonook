import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {prepareStagingConfig} from '../scripts/staging-sync-config.mjs';
const example=JSON.parse(readFileSync('cloud/config.staging.example.json','utf8'));
function settings(){return {compatibility_date:'2026-10-24',compatibility_flags:['nodejs_compat'],migration_tag:'v1-sync-space',bindings:[{type:'ai',name:'AI'},{type:'d1',name:'DB',id:example.d1_databases[0].database_id},{type:'r2_bucket',name:'FILES',bucket_name:example.r2_buckets[0].bucket_name},{type:'service',name:'ARTICLE_CAPTURE',service:'remonook-article-capture-staging',environment:'production'},{type:'ratelimit',name:'ARTICLE_RATE_LIMITER',namespace_id:'1001',simple:{period:60,limit:10}},{type:'durable_object_namespace',name:'SYNC_SPACE',namespace_id:'existing-namespace',class_name:'SyncSpace'},{type:'plain_text',name:'AI_ENABLED',text:'true'},{type:'secret_text',name:'GOOGLE_TASKS_CLIENT_SECRET'}]};}
test('staging config retains live variables/secrets and current resources without writing variable values',()=>{
 const config=prepareStagingConfig(example,settings(),[{cron:'17 * * * *'}]);assert.equal(config.keep_vars,true);assert.equal(config.vars,undefined);assert.equal(config.name,'remo-sync-staging');assert.equal(config.durable_objects.bindings[0].class_name,'SyncSpace');assert.deepEqual(config.triggers.crons,['17 * * * *']);assert.equal(config.services[0].environment,'production');assert.ok(!JSON.stringify(config).includes('CLIENT_SECRET'));
});
test('different resources, missing/extra bindings, migration tags and production targets fail before deployment',()=>{
 const mutations=[s=>s.bindings.pop(),s=>s.bindings.push({type:'kv_namespace',name:'EXTRA'}),s=>s.bindings.find(b=>b.name==='DB').id='production-id',s=>s.bindings.find(b=>b.name==='FILES').bucket_name='production-bucket',s=>s.bindings.find(b=>b.name==='SYNC_SPACE').script_name='remo-sync',s=>s.migration_tag='unknown'];
 // Removing an actual resource, not an intentionally preserved secret.
 mutations[0]=s=>{s.bindings=s.bindings.filter(b=>b.name!=='SYNC_SPACE');};
 for(const mutate of mutations){const s=settings();mutate(s);assert.throws(()=>prepareStagingConfig(example,s,[]));}
 assert.throws(()=>prepareStagingConfig({...example,name:'remo-sync'},settings(),[]));
});
