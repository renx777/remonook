import {spawnSync} from 'node:child_process';
import {copyFileSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
const mode=process.argv[2];
if(!['staging','production'].includes(mode))throw Error('Choose staging or production explicitly.');
const env={...process.env,VITE_REMO_ENV:mode};
for(const args of [['node_modules/typescript/bin/tsc','--noEmit'],['node_modules/vite/bin/vite.js','build','--mode',mode],['scripts/build-offline.mjs']]){
 const result=spawnSync(process.execPath,args,{stdio:'inherit',env});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status||1);
}
if(mode==='staging'){
  copyFileSync('cloud/staging-headers','dist/_headers');
  // Staging is an internal preview, not a public search result. Keep this
  // protection in the generated HTML even if the host ignores _headers.
  const html=readFileSync('dist/index.html','utf8');
  if(!html.includes('<head>'))throw Error('Staging HTML has no head tag.');
  writeFileSync('dist/index.html',html.replace('<head>','<head><meta name="robots" content="noindex, nofollow">'));
  writeFileSync('dist/robots.txt','User-agent: *\\nDisallow: /\\n'.replaceAll('\\n','\n'));
  rmSync('dist/sitemap.xml',{force:true});
}
