import {spawnSync} from 'node:child_process';
const mode=process.argv[2];
if(!['staging','production'].includes(mode))throw Error('Choose staging or production explicitly.');
const env={...process.env,VITE_REMO_ENV:mode};
for(const args of [['node_modules/typescript/bin/tsc','--noEmit'],['node_modules/vite/bin/vite.js','build','--mode',mode],['scripts/build-offline.mjs']]){
 const result=spawnSync(process.execPath,args,{stdio:'inherit',env});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status||1);
}
